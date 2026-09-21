import { useState, useRef, useLayoutEffect, useEffect, useCallback, useMemo, memo } from 'react'
import { Loader2 } from 'lucide-react'
import { PageRow } from './PageRow'
import { CanvasPageItem, MAX_EDITOR_INTERIOR_PAGES } from './CanvasPageItem'
import { clampZoom, DEFAULT_ZOOM } from './ZoomControl'
import { Toolbar } from './Toolbar'
import {
  DeletePageDialogHost,
  type DeletePageDialogHostHandle,
} from './DeletePageDialogHost'
import { ResetInteriorDialog } from './ResetInteriorDialog'
import { useCanvasEditor } from '@/hooks/canvas-editor/use-canvas-editor'
import { useCanvasSettings } from '@/context/CanvasSettingsContext'
import { EditorScrollRootProvider } from '@/context/EditorScrollContext'
import { resizeStoredInteriorCanvasesForPageDimensions } from '@/utils/resize-stored-interior-canvases-for-page-dimensions'
import { useToast } from '@/hooks/use-toast'
import { MainFooter } from './MainFooter'
import {
  CanvasStateStore,
  collectReferencedFontFamiliesFromFabricCanvasJson,
  mergeReferencedSupabaseImagePublicUrlsFromManyCanvases,
  prepareCanvasJsonForPersistence,
} from '@/utils/canvas-state-store'
import { ensureFontFamilyLoaded } from '@/utils/font-loader'
import { CANVAS_LIVE_EVENT } from '@/utils/canvas-events'
import { useCanvasSave } from '@/context/CanvasSaveContext'
import { useCanvasPenTool } from '@/context/CanvasPenToolContext'
import { useCanvasExport } from '@/context/CanvasExportContext'
import { createCanvasExportSource } from '@/utils/canvas-export-source'
import { useAuthContext } from '@/context/AuthContext'
import { useEditorMode } from '@/context/EditorModeContext'
import { EditorZoomProvider } from '@/context/EditorZoomContext'
import { buildEditorZoomContainerStyle } from '@/constants/editor-zoom-css'
import { useBook } from '@/context/BookContext'
import { isUserOnStarterPlan } from '@/utils/user-plan'
import { canvasesApi } from '@/api/canvases.api'
import { usePageThumbnailsController } from '@/context/PageThumbnailsContext'
import {
  createCanvasThumbnailObjectUrl,
  createSerializedCanvasThumbnailObjectUrl,
} from '@/utils/canvas-thumbnail'
import {
  CANVAS_THUMBNAIL_INVALIDATED_EVENT,
  dispatchCanvasThumbnailInvalidated,
  type CanvasThumbnailInvalidatedEventDetail,
} from '@/utils/canvas-thumbnail-events'
import {
  SCROLL_TO_EDITOR_PAGE_EVENT,
  type ScrollToEditorPageEventDetail,
} from '@/utils/editor-page-navigation'
import { onEditorInsertPages, onEditorRemovePages } from '@/utils/editor-page-events'
import { onCreateNewProject } from '@/utils/new-project-events'
import {
  onStudioArrangeSolutions,
  onStudioWritePage,
  onStudioGenerationDone,
} from '@/utils/studio/studio-events'
import {
  invertPageOrder,
  resolveStudioSolutionPageOrder,
  shiftStudioPageJsonX,
  type StudioSolutionPlacement,
} from '@/utils/studio/studio-solution-placement'
import { resolveStudioMarginForPage } from '@/utils/studio/studio-margin'
import { util, type Canvas } from 'fabric'
import {
  remeasureAllFabricEditableTextOnCanvas,
  upgradeInteractiveTextToTextbox,
} from '@/utils/canvas-text'

const CONTENT_PADDING = 24
// Higher = smaller per-notch zoom step (~5% at deltaY≈100; was ~18% at 500).
const WHEEL_ZOOM_SPEED = 2000
const THUMBNAIL_UPDATE_DEBOUNCE_MS = 350
const THUMBNAIL_CACHE_LIMIT = 160
const THUMBNAIL_REQUEST_CONCURRENCY = 2
const THUMBNAIL_LIVE_EVENTS = ['object:added', 'object:modified', 'object:removed', 'text:changed'] as const
const CANVAS_HYDRATION_SETTLE_MS = 600

function createInteriorPageSlotKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `page-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

/** Minimal Fabric snapshot used for pages whose canvas is not mounted yet. */
const EMPTY_FABRIC_CANVAS_SNAPSHOT: object = { objects: [] }

type ZoomAnchor = { mouseX: number; mouseY: number }

/** DOM-anchored zoom: page headers do not scale, so uniform scroll math drifts by page index. */
type PageRootZoomAnchor = {
  pageRootEl: HTMLElement
  clientX: number
  clientY: number
  offsetXInPage: number
  offsetYInPage: number
  pageWidthBefore: number
  pageHeightBefore: number
}

function findEditorPageRootFromPoint(clientX: number, clientY: number): HTMLElement | null {
  const stack = document.elementsFromPoint(clientX, clientY)
  for (const node of stack) {
    if (!(node instanceof HTMLElement)) continue
    const root = node.closest('[data-editor-page-root]')
    if (root instanceof HTMLElement) return root
  }
  return null
}

function findMostVisibleInteriorPageIndex(scrollEl: HTMLElement): number | null {
  const scrollRect = scrollEl.getBoundingClientRect()
  const viewportCenterY = scrollRect.top + scrollRect.height / 2
  const pageRoots = scrollEl.querySelectorAll<HTMLElement>('[data-editor-page-root][data-page-index]')
  let bestPageIndex: number | null = null
  let bestScore = Number.NEGATIVE_INFINITY

  for (const pageRoot of pageRoots) {
    const rawPageIndex = pageRoot.dataset.pageIndex
    if (rawPageIndex == null) continue

    const pageIndex = Number.parseInt(rawPageIndex, 10)
    if (!Number.isFinite(pageIndex)) continue

    const pageRect = pageRoot.getBoundingClientRect()
    const visibleTop = Math.max(pageRect.top, scrollRect.top)
    const visibleBottom = Math.min(pageRect.bottom, scrollRect.bottom)
    const visibleHeight = Math.max(0, visibleBottom - visibleTop)
    if (visibleHeight <= 0) continue

    const pageCenterY = pageRect.top + pageRect.height / 2
    const distanceFromViewportCenter = Math.abs(pageCenterY - viewportCenterY)
    const score = visibleHeight * 100_000 - distanceFromViewportCenter
    if (score <= bestScore) continue

    bestScore = score
    bestPageIndex = pageIndex
  }

  return bestPageIndex
}

function clampPageIndex(pageIndex: number, pageCount: number): number {
  if (pageCount <= 0) return 0
  return Math.min(pageCount - 1, Math.max(0, pageIndex))
}

function getSortedThumbnailCacheKeys(nextUpdatedIndex: number, keys: string[]): number[] {
  return keys
    .map((key) => Number.parseInt(key, 10))
    .filter((key) => Number.isFinite(key))
    .sort((a, b) => {
      const distance = Math.abs(a - nextUpdatedIndex) - Math.abs(b - nextUpdatedIndex)
      return distance === 0 ? a - b : distance
    })
}

function remapThumbnailUrlsForInsertedPage(
  previousUrls: Record<number, string>,
  insertedAfterPageIndex: number,
): Record<number, string> {
  const nextUrls: Record<number, string> = {}
  for (const [rawIndex, url] of Object.entries(previousUrls)) {
    const pageIndex = Number.parseInt(rawIndex, 10)
    if (!Number.isFinite(pageIndex)) continue
    const nextIndex = pageIndex > insertedAfterPageIndex ? pageIndex + 1 : pageIndex
    nextUrls[nextIndex] = url
  }
  return nextUrls
}

function remapThumbnailUrlsForDeletedPage(
  previousUrls: Record<number, string>,
  deletedPageIndex: number,
): Record<number, string> {
  const nextUrls: Record<number, string> = {}
  for (const [rawIndex, url] of Object.entries(previousUrls)) {
    const pageIndex = Number.parseInt(rawIndex, 10)
    if (!Number.isFinite(pageIndex) || pageIndex === deletedPageIndex) continue
    const nextIndex = pageIndex > deletedPageIndex ? pageIndex - 1 : pageIndex
    nextUrls[nextIndex] = url
  }
  return nextUrls
}

function swapThumbnailUrls(
  previousUrls: Record<number, string>,
  pageIndexA: number,
  pageIndexB: number,
): Record<number, string> {
  const nextUrls = { ...previousUrls }
  const urlA = nextUrls[pageIndexA]
  const urlB = nextUrls[pageIndexB]

  if (urlA !== undefined) nextUrls[pageIndexB] = urlA
  else delete nextUrls[pageIndexB]

  if (urlB !== undefined) nextUrls[pageIndexA] = urlB
  else delete nextUrls[pageIndexA]

  return nextUrls
}

/** Carry thumbnails along a page reorder (`order[newIndex] = oldIndex`). */
function permuteThumbnailUrls(
  previousUrls: Record<number, string>,
  order: number[],
): Record<number, string> {
  const newIndexOf = invertPageOrder(order)
  const nextUrls: Record<number, string> = {}
  for (const [rawIndex, url] of Object.entries(previousUrls)) {
    const pageIndex = Number.parseInt(rawIndex, 10)
    if (!Number.isFinite(pageIndex)) continue
    nextUrls[newIndexOf[pageIndex] ?? pageIndex] = url
  }
  return nextUrls
}

function revokeThumbnailUrl(url: string | undefined): void {
  if (!url || !url.startsWith('blob:')) return
  URL.revokeObjectURL(url)
}

function revokeRemovedThumbnailUrls(previousUrls: Record<number, string>, nextUrls: Record<number, string>): void {
  const nextValueSet = new Set(Object.values(nextUrls))
  for (const url of Object.values(previousUrls)) {
    if (nextValueSet.has(url)) continue
    revokeThumbnailUrl(url)
  }
}
type MainContentProps = {
  onOpenAlignmentPanel?: () => void
  canvasStateStore: CanvasStateStore
}

export const MainContent = memo(function MainContent({ onOpenAlignmentPanel, canvasStateStore }: MainContentProps): JSX.Element {
  const [zoomLevel, setZoomLevel] = useState(DEFAULT_ZOOM)
  const [showCanvasGrid, setShowCanvasGrid] = useState(false)
  const { isInteriorMode, setIsInteriorMode } = useEditorMode()
  const [bookCoverGuideOpacity, setBookCoverGuideOpacity] = useState(1)
  const [isResetInteriorDialogOpen, setIsResetInteriorDialogOpen] = useState(false)
  const deletePageDialogRef = useRef<DeletePageDialogHostHandle>(null)
  const [activePageIndex, setActivePageIndex] = useState(0)
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<number, string>>({})
  const [interiorPageSlotKeys, setInteriorPageSlotKeys] = useState<string[]>(() =>
    Array.from({ length: 1 }, () => createInteriorPageSlotKey()),
  )
  const [saveResumeToken, setSaveResumeToken] = useState(0)
  /**
   * Cancels in-flight studio live writes when a newer write targets the same
   * page, or when pages insert/shift (React remount lags behind the store).
   * Without this, interleaved clear/enliven/add stacks puzzle + answer-key glyphs.
   */
  const studioWriteGenerationRef = useRef(new Map<number, number>())
  const scrollRef = useRef<HTMLDivElement>(null)
  const scrollTargetIndexRef = useRef<number | null>(null)
  const scrollTargetElementRef = useRef<HTMLDivElement | null>(null)
  const scrollRestoreTopRef = useRef<number | null>(null)
  const scrollMetricsRef = useRef({
    scrollLeft: 0,
    scrollTop: 0,
    scrollWidth: 0,
    scrollHeight: 0,
    clientWidth: 0,
    clientHeight: 0,
  })
  const shouldResumeStoreSaveRef = useRef(false)
  const shouldPersistNewProjectRef = useRef(false)
  const prevZoomRef = useRef(DEFAULT_ZOOM)
  const zoomLevelRef = useRef(zoomLevel)
  const zoomAnchorRef = useRef<ZoomAnchor | null>(null)
  const zoomPageRootAnchorRef = useRef<PageRootZoomAnchor | null>(null)
  const lastPointerInScrollRef = useRef<{ clientX: number; clientY: number } | null>(null)
  const activeViewportPageIndexRef = useRef<number | null>(null)
  const {
    settings,
    pageDimensions,
    marginGuide,
    setPageCount,
    bookCoverDimensions,
    bookCoverZones,
    isProjectSettingsLoading,
  } = useCanvasSettings()
  /** Sync page count for multi-insert in one tick (React settings.pageCount lags). */
  const interiorPageCountRef = useRef(settings.pageCount)
  const thumbnailUrlsRef = useRef(thumbnailUrls)
  const thumbnailEpochRef = useRef(0)
  const thumbnailRevisionByIndexRef = useRef(new Map<number, number>())
  const thumbnailLiveCleanupByIndexRef = useRef(new Map<number, () => void>())
  const thumbnailUpdateTimersRef = useRef(new Map<number, number>())
  const thumbnailCanvasByIndexRef = useRef(new Map<number, Canvas>())
  const thumbnailGenerationInFlightRef = useRef(new Set<number>())
  const thumbnailRequestQueueRef = useRef(new Set<number>())
  const thumbnailRequestActiveCountRef = useRef(0)
  const thumbnailQueueGenerationRef = useRef(0)
  const editor = useCanvasEditor({
    fitDroppedImagesToPage: settings.fitDroppedImagesToPage,
    bookCoverZones,
    bookCoverDimensions,
  })
  const { isEraseToolActive, eraseBrushSize, setEraseBrushSize } = useCanvasPenTool()

  /** Prefer store JSON while Fabric is still applying preload (avoids saving empty `toObject()`). */
  const getCanvasJsonForPersistence = useCallback(
    (pageIndex: number): object | null => {
      const live = editor.exportCanvasDataByIndex(pageIndex)
      const serialized = canvasStateStore.getSerialized(pageIndex)
      let canvasJson = canvasStateStore.isFabricLiveTrusted(pageIndex)
        ? (live ?? serialized)
        : (serialized ?? live)
      return canvasJson ? prepareCanvasJsonForPersistence(canvasJson) : null
    },
    [canvasStateStore, editor.exportCanvasDataByIndex],
  )

  const { toast } = useToast()
  const { setBookId } = useBook()
  const {
    registerCanvasesPayloadGetter,
    registerAfterSaveCallback,
    registerHasUnsavedCheckGetter,
    refreshHasUnsavedChanges,
    saveCanvases,
  } = useCanvasSave()
  const { registerExportSourceFactory } = useCanvasExport()
  const { user } = useAuthContext()
  const [isCanvasesLoading, setIsCanvasesLoading] = useState(true)
  const [isCanvasHydrationSettled, setIsCanvasHydrationSettled] = useState(false)
  const [canvasLoadCycle, setCanvasLoadCycle] = useState(0)

  const isStarterPlanLocked = isUserOnStarterPlan(user)
  const interiorPageWidth = pageDimensions.widthPixels
  const interiorPageHeight = pageDimensions.heightPixels

  useEffect(() => {
    thumbnailUrlsRef.current = thumbnailUrls
  }, [thumbnailUrls])

  const updateThumbnailUrls = useCallback(
    (updater: (previous: Record<number, string>) => Record<number, string>): void => {
      setThumbnailUrls((previous) => {
        const next = updater(previous)
        revokeRemovedThumbnailUrls(previous, next)
        // Keep ref in lockstep with state so sync remap/insert paths never restore
        // a revoked blob URL after invalidate (useEffect sync is one frame too late).
        thumbnailUrlsRef.current = next
        return next
      })
    },
    [],
  )

  const rememberThumbnailUrl = useCallback((pageIndex: number, objectUrl: string): void => {
    updateThumbnailUrls((prev) => {
      const next = { ...prev, [pageIndex]: objectUrl }
      const keys = Object.keys(next)

      if (keys.length <= THUMBNAIL_CACHE_LIMIT) return next

      const keep = new Set(getSortedThumbnailCacheKeys(pageIndex, keys).slice(0, THUMBNAIL_CACHE_LIMIT))
      const compacted: Record<number, string> = {}
      for (const key of keep) {
        const value = next[key]
        if (value) compacted[key] = value
      }
      return compacted
    })
  }, [updateThumbnailUrls])

  const clearThumbnailCache = useCallback((): void => {
    thumbnailEpochRef.current += 1
    thumbnailQueueGenerationRef.current += 1
    thumbnailRevisionByIndexRef.current.clear()
    thumbnailGenerationInFlightRef.current.clear()
    thumbnailRequestQueueRef.current.clear()

    for (const timerId of thumbnailUpdateTimersRef.current.values()) {
      window.clearTimeout(timerId)
    }
    thumbnailUpdateTimersRef.current.clear()
    updateThumbnailUrls(() => ({}))
  }, [updateThumbnailUrls])

  const resetThumbnailRuntimeState = useCallback((): void => {
    // Invalidate in-flight work + pending timers without detaching live Fabric
    // listeners. Shifted pages re-register via lifecycle when their index changes.
    thumbnailEpochRef.current += 1
    thumbnailQueueGenerationRef.current += 1
    thumbnailRevisionByIndexRef.current.clear()
    thumbnailGenerationInFlightRef.current.clear()
    thumbnailRequestQueueRef.current.clear()

    for (const timerId of thumbnailUpdateTimersRef.current.values()) {
      window.clearTimeout(timerId)
    }
    thumbnailUpdateTimersRef.current.clear()
  }, [])

  const scheduleLiveThumbnailUpdate = useCallback(
    (pageIndex: number, canvas: Canvas, delay = THUMBNAIL_UPDATE_DEBOUNCE_MS): void => {
      if (pageIndex < 0) return

      const previousTimer = thumbnailUpdateTimersRef.current.get(pageIndex)
      if (previousTimer !== undefined) {
        window.clearTimeout(previousTimer)
      }

      const epoch = thumbnailEpochRef.current
      const revision = thumbnailRevisionByIndexRef.current.get(pageIndex) ?? 0
      const timerId = window.setTimeout(() => {
        thumbnailUpdateTimersRef.current.delete(pageIndex)
        if (thumbnailEpochRef.current !== epoch) return
        if ((thumbnailRevisionByIndexRef.current.get(pageIndex) ?? 0) !== revision) return

        const liveCanvas = thumbnailCanvasByIndexRef.current.get(pageIndex) ?? canvas
        const fabricCanvas = liveCanvas as Canvas & { disposed?: boolean }
        if (fabricCanvas?.disposed) return

        // A stale live canvas must not overwrite a freshly committed store entry.
        const canvasJson = getCanvasJsonForPersistence(pageIndex)
        if (canvasJson) {
          canvasStateStore.setSerialized(pageIndex, canvasJson)
        }

        // Prefer the live Fabric surface (same pixels as FabricCanvasItem) so thumbnails match
        // after loadFromJSON; serialized StaticCanvas can render before remote images finish loading.
        void createCanvasThumbnailObjectUrl(liveCanvas).then((liveObjectUrl) => {
          if (thumbnailEpochRef.current !== epoch) return
          if ((thumbnailRevisionByIndexRef.current.get(pageIndex) ?? 0) !== revision) return
          if (liveObjectUrl) {
            rememberThumbnailUrl(pageIndex, liveObjectUrl)
            return
          }

          if (!canvasJson) return

          void createSerializedCanvasThumbnailObjectUrl({
            canvasJson,
            width: interiorPageWidth,
            height: interiorPageHeight,
          }).then((objectUrl) => {
            if (thumbnailEpochRef.current !== epoch) return
            if ((thumbnailRevisionByIndexRef.current.get(pageIndex) ?? 0) !== revision) return
            if (objectUrl) rememberThumbnailUrl(pageIndex, objectUrl)
          })

          requestAnimationFrame(() => {
            if (thumbnailEpochRef.current !== epoch) return
            if ((thumbnailRevisionByIndexRef.current.get(pageIndex) ?? 0) !== revision) return
            const retryCanvas = thumbnailCanvasByIndexRef.current.get(pageIndex)
            const retryTarget = retryCanvas as Canvas & { disposed?: boolean }
            if (!retryCanvas || retryTarget.disposed) return
            void createCanvasThumbnailObjectUrl(retryCanvas).then((retryObjectUrl) => {
              if (thumbnailEpochRef.current !== epoch) return
              if ((thumbnailRevisionByIndexRef.current.get(pageIndex) ?? 0) !== revision) return
              if (retryObjectUrl) rememberThumbnailUrl(pageIndex, retryObjectUrl)
            })
          })
        })
      }, delay)

      thumbnailUpdateTimersRef.current.set(pageIndex, timerId)
    },
    [
      canvasStateStore,
      getCanvasJsonForPersistence,
      interiorPageHeight,
      interiorPageWidth,
      rememberThumbnailUrl,
    ],
  )

  const detachThumbnailListeners = useCallback((pageIndex: number): void => {
    const cleanup = thumbnailLiveCleanupByIndexRef.current.get(pageIndex)
    if (!cleanup) return
    cleanup()
    thumbnailLiveCleanupByIndexRef.current.delete(pageIndex)
  }, [])

  const handleCanvasReady = useCallback(
    (canvasIndex: number, canvas: Canvas | null): void => {
      editor.pageRow.onCanvasReady(canvasIndex, canvas)

      detachThumbnailListeners(canvasIndex)
      thumbnailCanvasByIndexRef.current.delete(canvasIndex)

      if (!canvas) {
        const pending = thumbnailUpdateTimersRef.current.get(canvasIndex)
        if (pending !== undefined) {
          window.clearTimeout(pending)
          thumbnailUpdateTimersRef.current.delete(canvasIndex)
        }
        return
      }

      const handleCanvasEdit = (): void => {
        refreshHasUnsavedChanges()
        if (canvasIndex < 0) return
        scheduleLiveThumbnailUpdate(canvasIndex, canvas)
      }

      for (const eventName of THUMBNAIL_LIVE_EVENTS) {
        canvas.on(eventName, handleCanvasEdit)
      }

      thumbnailLiveCleanupByIndexRef.current.set(canvasIndex, () => {
        for (const eventName of THUMBNAIL_LIVE_EVENTS) {
          canvas.off(eventName, handleCanvasEdit)
        }
      })

      if (canvasIndex < 0) return

      thumbnailCanvasByIndexRef.current.set(canvasIndex, canvas)
      scheduleLiveThumbnailUpdate(canvasIndex, canvas, 120)
    },
    [
      detachThumbnailListeners,
      editor.pageRow.onCanvasReady,
      refreshHasUnsavedChanges,
      scheduleLiveThumbnailUpdate,
    ],
  )

  const handleActiveCanvasChange = useCallback(
    (canvasIndex: number): void => {
      if (canvasIndex >= 0) {
        setActivePageIndex(clampPageIndex(canvasIndex, settings.pageCount))
      }
      editor.pageRow.onActiveCanvasChange(canvasIndex)
    },
    [editor.pageRow.onActiveCanvasChange, settings.pageCount],
  )

  const scrollEditorToPageIndex = useCallback((targetIndex: number): boolean => {
    const scrollEl = scrollRef.current
    if (!scrollEl) return false

    const targetEl =
      scrollTargetElementRef.current ??
      scrollEl.querySelector<HTMLElement>(
        `[data-editor-page-root][data-page-index="${targetIndex}"]`,
      )
    if (!targetEl) return false

    const restoredTop = scrollRestoreTopRef.current
    if (restoredTop !== null) {
      scrollEl.scrollTop = restoredTop
      scrollRestoreTopRef.current = null
    }

    const scrollRect = scrollEl.getBoundingClientRect()
    const targetRect = targetEl.getBoundingClientRect()
    const nextTop = targetRect.top - scrollRect.top + scrollEl.scrollTop - CONTENT_PADDING
    scrollEl.scrollTo({ top: Math.max(0, nextTop), behavior: 'smooth' })

    scrollTargetIndexRef.current = null
    scrollTargetElementRef.current = null
    return true
  }, [])

  const navigateToEditorPage = useCallback(
    (pageIndex: number): void => {
      const targetIndex = Math.max(0, Math.trunc(pageIndex))

      scrollTargetIndexRef.current = targetIndex
      activeViewportPageIndexRef.current = targetIndex
      setActivePageIndex(targetIndex)

      if (!isInteriorMode) {
        setIsInteriorMode(true)
      }

      editor.pageRow.onActiveCanvasChange(targetIndex)

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          scrollEditorToPageIndex(targetIndex)
        })
      })
    },
    [editor.pageRow.onActiveCanvasChange, isInteriorMode, scrollEditorToPageIndex],
  )

  useEffect(() => {
    setActivePageIndex((prev) => clampPageIndex(prev, settings.pageCount))
  }, [settings.pageCount])

  useEffect(() => {
    return () => {
      for (const cleanup of thumbnailLiveCleanupByIndexRef.current.values()) {
        cleanup()
      }
      thumbnailLiveCleanupByIndexRef.current.clear()
      for (const timerId of thumbnailUpdateTimersRef.current.values()) {
        window.clearTimeout(timerId)
      }
      thumbnailUpdateTimersRef.current.clear()
      thumbnailCanvasByIndexRef.current.clear()
      thumbnailGenerationInFlightRef.current.clear()
      thumbnailRevisionByIndexRef.current.clear()
      thumbnailRequestQueueRef.current.clear()
      thumbnailQueueGenerationRef.current += 1
      for (const url of Object.values(thumbnailUrlsRef.current)) {
        revokeThumbnailUrl(url)
      }
    }
  }, [])

  useEffect(() => {
    const handleThumbnailInvalidated = (event: Event): void => {
      const detail = (event as CustomEvent<CanvasThumbnailInvalidatedEventDetail>).detail
      const canvasIndex = detail?.canvasIndex
      if (typeof canvasIndex !== 'number' || canvasIndex < 0) return

      thumbnailRevisionByIndexRef.current.set(
        canvasIndex,
        (thumbnailRevisionByIndexRef.current.get(canvasIndex) ?? 0) + 1,
      )
      thumbnailGenerationInFlightRef.current.delete(canvasIndex)
      updateThumbnailUrls((prev) => {
        if (!prev[canvasIndex]) return prev
        const next = { ...prev }
        delete next[canvasIndex]
        return next
      })

      const canvas = thumbnailCanvasByIndexRef.current.get(canvasIndex)
      if (canvas) {
        scheduleLiveThumbnailUpdate(canvasIndex, canvas, 0)
        return
      }

      // Persist unmounted page JSON so the thumbnail can be produced on demand.
      // The virtualized rail requests only visible pages through the bounded queue.
      const canvasJson = getCanvasJsonForPersistence(canvasIndex)
      if (!canvasJson) return
      canvasStateStore.setSerialized(canvasIndex, canvasJson)
    }

    window.addEventListener(CANVAS_THUMBNAIL_INVALIDATED_EVENT, handleThumbnailInvalidated)
    return () => {
      window.removeEventListener(CANVAS_THUMBNAIL_INVALIDATED_EVENT, handleThumbnailInvalidated)
    }
  }, [
    canvasStateStore,
    getCanvasJsonForPersistence,
    scheduleLiveThumbnailUpdate,
    updateThumbnailUrls,
  ])

  const syncActiveCanvasToVisiblePage = useCallback((): void => {
    if (!isInteriorMode || isCanvasesLoading || isProjectSettingsLoading) return

    const scrollEl = scrollRef.current
    if (!scrollEl) return

    const visiblePageIndex = findMostVisibleInteriorPageIndex(scrollEl)
    if (visiblePageIndex == null) return
    if (activeViewportPageIndexRef.current === visiblePageIndex) return

    activeViewportPageIndexRef.current = visiblePageIndex
    handleActiveCanvasChange(visiblePageIndex)
  }, [handleActiveCanvasChange, isCanvasesLoading, isInteriorMode, isProjectSettingsLoading])

  const syncEditorInteriorCanvasesToStore = useCallback((): void => {
    for (let pageIndex = 0; pageIndex < settings.pageCount; pageIndex += 1) {
      const canvasData = getCanvasJsonForPersistence(pageIndex)
      if (!canvasData) continue
      canvasStateStore.setSerialized(pageIndex, canvasData)
    }
  }, [canvasStateStore, getCanvasJsonForPersistence, settings.pageCount])

  const trackedPageDimensionsRef = useRef(pageDimensions)
  const isPageDimensionsResizeReadyRef = useRef(false)
  const pageDimensionsResizeTaskRef = useRef(0)

  useEffect(() => {
    if (isCanvasesLoading || isProjectSettingsLoading) {
      trackedPageDimensionsRef.current = pageDimensions
      return
    }

    const previous = trackedPageDimensionsRef.current
    const next = pageDimensions

    if (!isPageDimensionsResizeReadyRef.current) {
      isPageDimensionsResizeReadyRef.current = true
      trackedPageDimensionsRef.current = next
      return
    }

    if (
      previous.widthPixels === next.widthPixels &&
      previous.heightPixels === next.heightPixels
    ) {
      return
    }

    const taskId = pageDimensionsResizeTaskRef.current + 1
    pageDimensionsResizeTaskRef.current = taskId
    trackedPageDimensionsRef.current = next

    syncEditorInteriorCanvasesToStore()
    canvasStateStore.suspendSave()
    canvasStateStore.markAllInteriorFabricLiveUntrusted(settings.pageCount)

    void (async () => {
      try {
        await resizeStoredInteriorCanvasesForPageDimensions({
          pageCount: settings.pageCount,
          previousPageDimensions: previous,
          nextPageDimensions: next,
          marginGuide,
          getCanvasJson: (pageIndex) => {
            const canvasJson = canvasStateStore.getSerialized(pageIndex)
            return canvasJson && typeof canvasJson === 'object'
              ? (canvasJson as Record<string, unknown>)
              : null
          },
          getAuthoringLogicalSize: (pageIndex) =>
            canvasStateStore.getAuthoringLogicalSize(pageIndex),
          setCanvasJson: (pageIndex, canvasJson) => {
            canvasStateStore.setSerialized(pageIndex, canvasJson)
          },
          setAuthoringLogicalSize: (pageIndex, size) => {
            canvasStateStore.setAuthoringLogicalSize(pageIndex, size)
          },
        })
        if (pageDimensionsResizeTaskRef.current !== taskId) return
        clearThumbnailCache()
        updateThumbnailUrls(() => ({}))
      } finally {
        if (pageDimensionsResizeTaskRef.current !== taskId) return
        canvasStateStore.resumeSave()
        // Apply settings resizes pages and dirties canvases — persist them so the
        // Save yellow indicator does not stay on after settings are applied.
        try {
          await saveCanvases({ quiet: true })
        } catch {
          // Error toast already shown by saveCanvases
        }
      }
    })()
  }, [
    canvasStateStore,
    clearThumbnailCache,
    isCanvasesLoading,
    isProjectSettingsLoading,
    marginGuide,
    pageDimensions,
    saveCanvases,
    settings.pageCount,
    syncEditorInteriorCanvasesToStore,
    updateThumbnailUrls,
  ])

  useEffect(() => {
    if (!shouldResumeStoreSaveRef.current) return
    canvasStateStore.resumeSave()
    shouldResumeStoreSaveRef.current = false
  }, [canvasStateStore, settings.pageCount, saveResumeToken])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const updateMetrics = (): void => {
      scrollMetricsRef.current = {
        scrollLeft: el.scrollLeft,
        scrollTop: el.scrollTop,
        scrollWidth: el.scrollWidth,
        scrollHeight: el.scrollHeight,
        clientWidth: el.clientWidth,
        clientHeight: el.clientHeight,
      }
    }

    const handleScroll = (): void => {
      updateMetrics()
      syncActiveCanvasToVisiblePage()
    }

    updateMetrics()
    syncActiveCanvasToVisiblePage()
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', handleScroll)
    }
  }, [syncActiveCanvasToVisiblePage])

  const exportCanvasesPayload = useCallback(() => {
    const pageCount = settings.pageCount
    if (pageCount < 1) throw new Error('No pages to save')

    const canvases: Array<{
      page_index: number
      canvas_type: 'interior' | 'cover'
      canvas_data: Record<string, unknown>
    }> = []

    const snapshotCanvasJsons: unknown[] = []

    for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
      const canvasData = getCanvasJsonForPersistence(pageIndex)

      if (!canvasData) {
        throw new Error(`Interior canvas not ready (page_index=${pageIndex})`)
      }

      snapshotCanvasJsons.push(canvasData)

      if (!canvasStateStore.isDirty(pageIndex, canvasData)) continue

      canvases.push({
        page_index: pageIndex,
        canvas_type: 'interior' as const,
        canvas_data: canvasData as Record<string, unknown>,
      })
    }

    // Book cover canvas: Fabric uses `canvasIndex=-1` and we store it as `page_index=0`.
    const effectiveCoverCanvasData = getCanvasJsonForPersistence(-1)

    if (!effectiveCoverCanvasData) throw new Error('Book cover canvas not ready')

    snapshotCanvasJsons.push(effectiveCoverCanvasData)

    if (canvasStateStore.isDirty(-1, effectiveCoverCanvasData)) {
      canvases.push({
        page_index: 0,
        canvas_type: 'cover' as const,
        canvas_data: effectiveCoverCanvasData as Record<string, unknown>,
      })
    }

    const referenced_supabase_image_public_urls =
      mergeReferencedSupabaseImagePublicUrlsFromManyCanvases(snapshotCanvasJsons)

    return {
      canvases,
      interior_page_count: settings.pageCount,
      referenced_supabase_image_public_urls,
    }
  }, [canvasStateStore, getCanvasJsonForPersistence, settings.pageCount])

  useEffect(() => {
    registerCanvasesPayloadGetter(exportCanvasesPayload)
  }, [exportCanvasesPayload, registerCanvasesPayloadGetter])

  useEffect(() => {
    if (!shouldPersistNewProjectRef.current) return
    if (settings.pageCount !== 1) return

    shouldPersistNewProjectRef.current = false

    void (async () => {
      try {
        await saveCanvases({ quiet: true, persistIfClean: true })
        toast({
          title: 'New project created',
          description: 'Cover and all pages were cleared and saved.',
        })
      } catch {
        toast({
          title: 'New project created (unsaved)',
          description: 'Cover and all pages were cleared. Click Save in the sidebar to persist.',
        })
      }
    })()
  }, [saveCanvases, saveResumeToken, settings.pageCount, toast])

  const checkHasUnsavedChanges = useCallback((): boolean => {
    if (isCanvasesLoading || isProjectSettingsLoading || !isCanvasHydrationSettled) {
      return false
    }

    try {
      return exportCanvasesPayload().canvases.length > 0
    } catch {
      return false
    }
  }, [
    exportCanvasesPayload,
    isCanvasesLoading,
    isCanvasHydrationSettled,
    isProjectSettingsLoading,
  ])

  useEffect(() => {
    registerHasUnsavedCheckGetter(checkHasUnsavedChanges)
  }, [checkHasUnsavedChanges, registerHasUnsavedCheckGetter])

  useEffect(() => {
    if (isCanvasesLoading || isProjectSettingsLoading) return

    const hydrationCycle = canvasLoadCycle
    const pageCountAtHydration = settings.pageCount
    let settleTimer: number | null = null
    let cancelled = false
    let isSettled = false

    const settleCanvasBaselines = (): void => {
      if (cancelled || isSettled || hydrationCycle !== canvasLoadCycle) return
      isSettled = true

      for (let pageIndex = 0; pageIndex < pageCountAtHydration; pageIndex += 1) {
        const canvasData = getCanvasJsonForPersistence(pageIndex)
        if (canvasData) {
          canvasStateStore.markSavedAndTrackFabricReconcile(pageIndex, canvasData)
        }
      }

      const coverData = getCanvasJsonForPersistence(-1)
      if (coverData) {
        canvasStateStore.markSavedAndTrackFabricReconcile(-1, coverData)
      }

      setIsCanvasHydrationSettled(true)
      refreshHasUnsavedChanges()
      window.removeEventListener(CANVAS_LIVE_EVENT, handleCanvasLive)
    }

    const scheduleSettle = (): void => {
      if (isSettled) return
      if (settleTimer != null) {
        window.clearTimeout(settleTimer)
      }
      settleTimer = window.setTimeout(settleCanvasBaselines, CANVAS_HYDRATION_SETTLE_MS)
    }

    const handleCanvasLive = (): void => {
      scheduleSettle()
    }

    window.addEventListener(CANVAS_LIVE_EVENT, handleCanvasLive)
    scheduleSettle()

    return () => {
      cancelled = true
      window.removeEventListener(CANVAS_LIVE_EVENT, handleCanvasLive)
      if (settleTimer != null) {
        window.clearTimeout(settleTimer)
      }
    }
  }, [
    canvasLoadCycle,
    canvasStateStore,
    getCanvasJsonForPersistence,
    isCanvasesLoading,
    isProjectSettingsLoading,
    refreshHasUnsavedChanges,
  ])

  useEffect(() => {
    registerExportSourceFactory((request) => {
      const resolveInteriorItem = async (pageIndex: number) => {
        // Same trust rules as save — never export a mid-restore live surface.
        const canvasData = getCanvasJsonForPersistence(pageIndex)
        if (!canvasData) {
          throw new Error(`Interior canvas not ready (page_index=${pageIndex})`)
        }

        return {
          page_index: pageIndex,
          canvas_type: 'interior' as const,
          canvas_data: canvasData as Record<string, unknown>,
        }
      }

      const resolveCoverItem = async () => {
        const coverCanvasData = getCanvasJsonForPersistence(-1)
        if (!coverCanvasData) {
          throw new Error('Book cover canvas not ready')
        }

        return {
          page_index: 0,
          canvas_type: 'cover' as const,
          canvas_data: coverCanvasData as Record<string, unknown>,
        }
      }

      return Promise.resolve(
        createCanvasExportSource({
          request,
          pageCount: settings.pageCount,
          resolvePage: async (slot) => {
            if (slot.canvas_type === 'cover') return resolveCoverItem()
            return resolveInteriorItem(slot.page_index)
          },
        }),
      )
    })
  }, [getCanvasJsonForPersistence, registerExportSourceFactory, settings.pageCount])

  useEffect(() => {
    const handleAfterSave = (): void => {
      for (let pageIndex = 0; pageIndex < settings.pageCount; pageIndex += 1) {
        const canvasData = getCanvasJsonForPersistence(pageIndex)
        if (canvasData) {
          canvasStateStore.markSavedAndTrackFabricReconcile(pageIndex, canvasData)
        }
      }

      const coverData = getCanvasJsonForPersistence(-1)
      if (coverData) {
        canvasStateStore.markSavedAndTrackFabricReconcile(-1, coverData)
      }
    }

    registerAfterSaveCallback(handleAfterSave)
  }, [
    canvasStateStore,
    getCanvasJsonForPersistence,
    registerAfterSaveCallback,
    settings.pageCount,
  ])

  useEffect(() => {
    if (isProjectSettingsLoading) return

    let cancelled = false

    async function loadCanvases(): Promise<void> {
      setIsCanvasesLoading(true)
      setIsCanvasHydrationSettled(false)
      setCanvasLoadCycle((cycle) => cycle + 1)

      try {
        const result = await canvasesApi.getCanvases()
        if (cancelled) return

        setBookId(result.project_id)
        canvasStateStore.clear()
        clearThumbnailCache()

        const interiorCanvases = result.canvases.filter((c) => c.canvas_type === 'interior')
        const interiorPageCount =
          interiorCanvases.length > 0
            ? Math.max(...interiorCanvases.map((c) => c.page_index)) + 1
            : 1

        setPageCount(interiorPageCount)
        setInteriorPageSlotKeys(
          Array.from({ length: interiorPageCount }, () => createInteriorPageSlotKey()),
        )

        for (const canvas of interiorCanvases) {
          canvasStateStore.preload(canvas.page_index, canvas.canvas_data, {
            width: pageDimensions.widthPixels,
            height: pageDimensions.heightPixels,
          })
        }

        const coverCanvas = result.canvases.find((c) => c.canvas_type === 'cover')
        if (coverCanvas) {
          canvasStateStore.preload(-1, coverCanvas.canvas_data)
        }
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : 'Failed to load canvases'
        toast({
          title: 'Load failed',
          description: message,
        })
      } finally {
        if (cancelled) return
        setIsCanvasesLoading(false)
      }
    }

    void loadCanvases()

    return () => {
      cancelled = true
    }
  }, [canvasStateStore, clearThumbnailCache, isProjectSettingsLoading, setBookId, setPageCount, toast])

  useEffect(() => {
    interiorPageCountRef.current = settings.pageCount
  }, [settings.pageCount])

  useEffect(() => {
    if (settings.pageCount >= 1) return
    setPageCount(1)
    setInteriorPageSlotKeys([createInteriorPageSlotKey()])
  }, [settings.pageCount, setPageCount])

  useEffect(() => {
    setInteriorPageSlotKeys((previousKeys) => {
      if (previousKeys.length >= settings.pageCount) return previousKeys
      const nextKeys = [...previousKeys]
      while (nextKeys.length < settings.pageCount) {
        nextKeys.push(createInteriorPageSlotKey())
      }
      return nextKeys
    })
  }, [settings.pageCount])

  const handleConfirmDelete = (deletedIndex: number): void => {
    if (settings.pageCount <= 1) {
      const emptyInterior = EMPTY_FABRIC_CANVAS_SNAPSHOT as Record<string, unknown>

      shouldResumeStoreSaveRef.current = true
      canvasStateStore.suspendSave()
      editor.clearInteriorCanvasesOnly()
      canvasStateStore.resetInteriorPagesToSingleEmpty(emptyInterior)
      setInteriorPageSlotKeys((prev) => {
        const next = [...prev]
        next[deletedIndex] = createInteriorPageSlotKey()
        return next
      })
      setSaveResumeToken((t) => t + 1)
      clearThumbnailCache()
      handleActiveCanvasChange(deletedIndex)
      return
    }
    const nextPageCount = interiorPageCountRef.current - 1

    shouldResumeStoreSaveRef.current = true
    canvasStateStore.suspendSave()
    syncEditorInteriorCanvasesToStore()
    canvasStateStore.deletePageAndShiftSerialized(deletedIndex, nextPageCount)

    const targetIndex = Math.max(0, deletedIndex - 1)
    scrollTargetIndexRef.current = targetIndex
    resetThumbnailRuntimeState()
    updateThumbnailUrls((prev) => remapThumbnailUrlsForDeletedPage(prev, deletedIndex))
    handleActiveCanvasChange(targetIndex)
    setInteriorPageSlotKeys((prev) => prev.filter((_, i) => i !== deletedIndex))
    setSaveResumeToken((t) => t + 1)
    interiorPageCountRef.current = nextPageCount
    setPageCount(nextPageCount)
  }

  const handleAddPage = useCallback(
    (pageIndex: number): void => {
      const currentPageCount = interiorPageCountRef.current
      if (currentPageCount >= MAX_EDITOR_INTERIOR_PAGES) {
        toast({
          title: 'Page limit reached',
          description: `You can have at most ${MAX_EDITOR_INTERIOR_PAGES} pages in this book.`,
        })
        return
      }

      const nextPageCount = currentPageCount + 1

      shouldResumeStoreSaveRef.current = true
      canvasStateStore.suspendSave()
      syncEditorInteriorCanvasesToStore()
      canvasStateStore.insertPageAndShiftSerialized(pageIndex, nextPageCount)

      const insertedPageIndex = pageIndex + 1
      scrollRestoreTopRef.current = scrollRef.current?.scrollTop ?? null
      scrollTargetIndexRef.current = insertedPageIndex
      handleActiveCanvasChange(insertedPageIndex)
      resetThumbnailRuntimeState()
      updateThumbnailUrls((prev) => remapThumbnailUrlsForInsertedPage(prev, pageIndex))
      setInteriorPageSlotKeys((prev) => {
        const next = [...prev]
        next.splice(insertedPageIndex, 0, createInteriorPageSlotKey())
        return next
      })
      setSaveResumeToken((t) => t + 1)
      interiorPageCountRef.current = nextPageCount
      setPageCount(nextPageCount)
    },
    [
      canvasStateStore,
      handleActiveCanvasChange,
      setPageCount,
      syncEditorInteriorCanvasesToStore,
      toast,
      updateThumbnailUrls,
    ],
  )

  const handleInsertPages = useCallback(
    (afterPageIndex: number, count: number): void => {
      if (count <= 0) return
      const currentPageCount = interiorPageCountRef.current
      if (currentPageCount + count > MAX_EDITOR_INTERIOR_PAGES) {
        toast({
          title: 'Page limit reached',
          description: `You can have at most ${MAX_EDITOR_INTERIOR_PAGES} pages in this book.`,
        })
        return
      }

      shouldResumeStoreSaveRef.current = true
      canvasStateStore.suspendSave()
      syncEditorInteriorCanvasesToStore()

      let pageCount = currentPageCount
      for (let i = 0; i < count; i += 1) {
        pageCount += 1
        canvasStateStore.insertPageAndShiftSerialized(afterPageIndex + i, pageCount)
      }

      const firstInserted = afterPageIndex + 1
      // Invalidate live studio writes at/after the insert — index→canvas mapping
      // is stale until slot keys remount; continuing would stack onto the wrong page.
      for (const [pageIndex, generation] of studioWriteGenerationRef.current) {
        if (pageIndex >= firstInserted) {
          studioWriteGenerationRef.current.set(pageIndex, generation + 1)
        }
      }
      // Keep viewport still during insert; studio:generation-done scrolls to the new game.
      scrollRestoreTopRef.current = scrollRef.current?.scrollTop ?? null
      scrollTargetIndexRef.current = null
      resetThumbnailRuntimeState()

      // Remap from React state (not a lagged ref) so a prior invalidate that cleared a
      // URL is not undone by restoring a revoked blob into the cache.
      updateThumbnailUrls((prev) => {
        let thumbnails = prev
        for (let i = 0; i < count; i += 1) {
          thumbnails = remapThumbnailUrlsForInsertedPage(thumbnails, afterPageIndex + i)
        }
        return thumbnails
      })

      setInteriorPageSlotKeys((prev) => {
        const next = [...prev]
        const keys = Array.from({ length: count }, () => createInteriorPageSlotKey())
        next.splice(firstInserted, 0, ...keys)
        return next
      })
      setSaveResumeToken((t) => t + 1)
      interiorPageCountRef.current = pageCount
      setPageCount(pageCount)
    },
    [
      canvasStateStore,
      resetThumbnailRuntimeState,
      setPageCount,
      syncEditorInteriorCanvasesToStore,
      toast,
      updateThumbnailUrls,
    ],
  )

  /** Trim unused bulk-preallocated blanks without jumping the viewport. */
  const handleRemovePages = useCallback(
    (startPageIndex: number, count: number): void => {
      if (count <= 0) return
      const currentPageCount = interiorPageCountRef.current
      if (startPageIndex < 0 || startPageIndex >= currentPageCount) return
      const removable = Math.min(count, currentPageCount - startPageIndex)
      if (removable <= 0) return
      // Keep at least one interior page.
      const maxRemovable = Math.max(0, currentPageCount - 1)
      const toRemove = Math.min(removable, maxRemovable)
      if (toRemove <= 0) return

      shouldResumeStoreSaveRef.current = true
      canvasStateStore.suspendSave()
      syncEditorInteriorCanvasesToStore()

      let pageCount = currentPageCount
      for (let i = 0; i < toRemove; i += 1) {
        pageCount -= 1
        canvasStateStore.deletePageAndShiftSerialized(startPageIndex, pageCount)
      }

      for (const [pageIndex, generation] of studioWriteGenerationRef.current) {
        if (pageIndex >= startPageIndex) {
          studioWriteGenerationRef.current.set(pageIndex, generation + 1)
        }
      }

      scrollRestoreTopRef.current = scrollRef.current?.scrollTop ?? null
      scrollTargetIndexRef.current = null
      resetThumbnailRuntimeState()

      updateThumbnailUrls((prev) => {
        let thumbnails = prev
        for (let i = 0; i < toRemove; i += 1) {
          thumbnails = remapThumbnailUrlsForDeletedPage(thumbnails, startPageIndex)
        }
        return thumbnails
      })

      setInteriorPageSlotKeys((prev) => {
        const next = [...prev]
        next.splice(startPageIndex, toRemove)
        return next
      })
      setSaveResumeToken((t) => t + 1)
      interiorPageCountRef.current = pageCount
      setPageCount(pageCount)
      setActivePageIndex((prev) => clampPageIndex(prev, pageCount))
    },
    [
      canvasStateStore,
      resetThumbnailRuntimeState,
      setPageCount,
      syncEditorInteriorCanvasesToStore,
      updateThumbnailUrls,
    ],
  )

  const handleRemovePage = useCallback((pageIndex: number): void => {
    deletePageDialogRef.current?.requestDelete(pageIndex)
  }, [])

  const handleMovePage = useCallback(
    (pageIndex: number, direction: 'up' | 'down'): void => {
      const targetIndex = direction === 'up' ? pageIndex - 1 : pageIndex + 1
      if (targetIndex < 0 || targetIndex >= settings.pageCount) return
      if (pageIndex === targetIndex) return

      shouldResumeStoreSaveRef.current = true
      canvasStateStore.suspendSave()
      syncEditorInteriorCanvasesToStore()
      canvasStateStore.swapPagesSerialized(pageIndex, targetIndex)

      scrollTargetIndexRef.current = targetIndex
      resetThumbnailRuntimeState()
      updateThumbnailUrls((prev) => swapThumbnailUrls(prev, pageIndex, targetIndex))
      handleActiveCanvasChange(targetIndex)
      setInteriorPageSlotKeys((prev) => {
        const next = [...prev]
        const keyA = next[pageIndex]
        const keyB = next[targetIndex]
        if (keyA === undefined || keyB === undefined) return prev
        next[pageIndex] = keyB
        next[targetIndex] = keyA
        return next
      })
      setSaveResumeToken((t) => t + 1)
    },
    [
      canvasStateStore,
      handleActiveCanvasChange,
      resetThumbnailRuntimeState,
      settings.pageCount,
      syncEditorInteriorCanvasesToStore,
      updateThumbnailUrls,
    ],
  )

  const handleMovePageUp = useCallback(
    (pageIndex: number): void => {
      handleMovePage(pageIndex, 'up')
    },
    [handleMovePage],
  )

  const handleMovePageDown = useCallback(
    (pageIndex: number): void => {
      handleMovePage(pageIndex, 'down')
    },
    [handleMovePage],
  )

  /**
   * Move studio solution pages to `placement` in one reorder. Moved rows keep
   * their slot keys, so they remount at the new index and restore from the store.
   * Returns the order applied (`order[newIndex] = oldIndex`) and the new indices
   * of pages that moved, or null when the book is already arranged.
   */
  const arrangeStudioSolutionPages = useCallback(
    (placement: StudioSolutionPlacement): { order: number[]; moved: Set<number> } | null => {
      syncEditorInteriorCanvasesToStore()
      const order = resolveStudioSolutionPageOrder(
        canvasStateStore,
        interiorPageCountRef.current,
        placement,
      )
      if (!order) return null

      // Remount cleanups must not save old canvases over the reordered snapshots.
      // The resume effect undoes one suspension per commit, so never stack two.
      if (!shouldResumeStoreSaveRef.current) {
        shouldResumeStoreSaveRef.current = true
        canvasStateStore.suspendSave()
      }
      canvasStateStore.reorderPagesSerialized(order)
      const moved = new Set<number>()
      order.forEach((oldIndex, newIndex) => {
        if (oldIndex !== newIndex) moved.add(newIndex)
      })

      // Verso <-> recto swaps the gutter side; studio sheets follow their new safe area.
      const marginArgs = { pageWidth: interiorPageWidth, pageHeight: interiorPageHeight, marginGuide }
      const remirrored = new Set<number>()
      for (const newIndex of moved) {
        const oldIndex = order[newIndex]!
        if (oldIndex % 2 === newIndex % 2) continue
        const canvasJson = canvasStateStore.getSerialized(newIndex)
        if (!canvasJson) continue
        const dx =
          resolveStudioMarginForPage({ pageIndex: newIndex, ...marginArgs }).left -
          resolveStudioMarginForPage({ pageIndex: oldIndex, ...marginArgs }).left
        const shifted = shiftStudioPageJsonX(canvasJson, dx)
        if (shifted === canvasJson) continue
        canvasStateStore.setSerialized(newIndex, shifted)
        remirrored.add(newIndex)
      }

      // In-flight studio live writes target the pre-reorder index -> canvas mapping.
      for (const pageIndex of moved) {
        studioWriteGenerationRef.current.set(
          pageIndex,
          (studioWriteGenerationRef.current.get(pageIndex) ?? 0) + 1,
        )
      }

      resetThumbnailRuntimeState()
      updateThumbnailUrls((prev) => {
        const next = permuteThumbnailUrls(prev, order)
        for (const pageIndex of remirrored) delete next[pageIndex]
        return next
      })
      setInteriorPageSlotKeys((prev) => [
        ...order.map((oldIndex) => prev[oldIndex] ?? createInteriorPageSlotKey()),
        ...prev.slice(order.length),
      ])
      setSaveResumeToken((t) => t + 1)
      refreshHasUnsavedChanges()
      return { order, moved }
    },
    [
      canvasStateStore,
      interiorPageHeight,
      interiorPageWidth,
      marginGuide,
      refreshHasUnsavedChanges,
      resetThumbnailRuntimeState,
      syncEditorInteriorCanvasesToStore,
      updateThumbnailUrls,
    ],
  )

  const handleClearCoverCanvasOnly = useCallback((): void => {
    shouldResumeStoreSaveRef.current = true
    canvasStateStore.suspendSave()
    editor.clearCoverCanvasOnly()
    const coverData = editor.exportCanvasDataByIndex(-1) ?? EMPTY_FABRIC_CANVAS_SNAPSHOT
    canvasStateStore.setSerialized(-1, coverData)
    setSaveResumeToken((t) => t + 1)
    clearThumbnailCache()
  }, [canvasStateStore, clearThumbnailCache, editor.clearCoverCanvasOnly, editor.exportCanvasDataByIndex])

  const handleRequestResetInteriorToSinglePage = useCallback((): void => {
    setIsResetInteriorDialogOpen(true)
  }, [])

  const handleConfirmResetInteriorToSinglePage = useCallback((): void => {
    setIsResetInteriorDialogOpen(false)

    const emptyInterior = EMPTY_FABRIC_CANVAS_SNAPSHOT as Record<string, unknown>

    shouldResumeStoreSaveRef.current = true
    canvasStateStore.suspendSave()
    editor.clearInteriorCanvasesOnly()
    canvasStateStore.resetInteriorPagesToSingleEmpty(emptyInterior)
    setInteriorPageSlotKeys([createInteriorPageSlotKey()])
    setSaveResumeToken((t) => t + 1)
    clearThumbnailCache()
    setPageCount(1)

    toast({
      title: 'Removed Successfully (unsaved)',
      description: 'Click Save in the sidebar to persist',
    })
  }, [
    canvasStateStore,
    clearThumbnailCache,
    editor.clearInteriorCanvasesOnly,
    setPageCount,
    toast,
  ])

  const handleCreateNewProject = useCallback((): void => {
    const emptyCanvas = EMPTY_FABRIC_CANVAS_SNAPSHOT as Record<string, unknown>

    shouldResumeStoreSaveRef.current = true
    shouldPersistNewProjectRef.current = true
    canvasStateStore.suspendSave()
    editor.clearAllCanvases()
    canvasStateStore.resetInteriorPagesToSingleEmpty(emptyCanvas)
    canvasStateStore.setSerialized(-1, emptyCanvas)
    setInteriorPageSlotKeys([createInteriorPageSlotKey()])
    interiorPageCountRef.current = 1
    setSaveResumeToken((t) => t + 1)
    clearThumbnailCache()
    setPageCount(1)
    setIsInteriorMode(true)
  }, [
    canvasStateStore,
    clearThumbnailCache,
    editor.clearAllCanvases,
    setIsInteriorMode,
    setPageCount,
  ])

  useEffect(() => onCreateNewProject(handleCreateNewProject), [handleCreateNewProject])

  const handlePageRef = useCallback((pageIndex: number, el: HTMLDivElement | null): void => {
    if (pageIndex === scrollTargetIndexRef.current) {
      scrollTargetElementRef.current = el
    }
  }, [])

  const handleToggleInteriorMode = useCallback(
    (next: boolean): void => {
      const isSwitchingToBookCoverMode = next === false
      if (isStarterPlanLocked && isSwitchingToBookCoverMode) {
        toast({
          title: 'Standard required',
          description: 'Book Cover mode is available for Standard plan only.',
        })
        return
      }
      setIsInteriorMode(next)
    },
    [isStarterPlanLocked, toast],
  )

  useEffect(() => {
    if (!isStarterPlanLocked) return
    if (isInteriorMode) return
    setIsInteriorMode(true)
  }, [isStarterPlanLocked, isInteriorMode])

  useEffect(() => {
    if (!isStarterPlanLocked) return
    if (!showCanvasGrid) return
    setShowCanvasGrid(false)
  }, [isStarterPlanLocked, showCanvasGrid])

  useEffect(() => {
    clearThumbnailCache()
  }, [clearThumbnailCache, interiorPageHeight, interiorPageWidth])

  const handleSelectThumbnailPage = useCallback(
    (pageIndex: number): void => {
      navigateToEditorPage(clampPageIndex(pageIndex, settings.pageCount))
    },
    [navigateToEditorPage, settings.pageCount],
  )

  const handleAddPageAfterLast = useCallback((): void => {
    handleAddPage(Math.max(0, settings.pageCount - 1))
  }, [handleAddPage, settings.pageCount])

  const processThumbnailRequestQueue = useCallback((): void => {
    while (thumbnailRequestActiveCountRef.current < THUMBNAIL_REQUEST_CONCURRENCY) {
      const nextPageIndex = thumbnailRequestQueueRef.current.values().next().value
      if (typeof nextPageIndex !== 'number') return
      thumbnailRequestQueueRef.current.delete(nextPageIndex)

      if (nextPageIndex < 0 || nextPageIndex >= settings.pageCount) {
        continue
      }
      if (thumbnailUrlsRef.current[nextPageIndex]) {
        continue
      }
      if (thumbnailGenerationInFlightRef.current.has(nextPageIndex)) {
        continue
      }

      const canvasJson = getCanvasJsonForPersistence(nextPageIndex)
      if (!canvasJson) {
        continue
      }

      const epoch = thumbnailEpochRef.current
      const revision = thumbnailRevisionByIndexRef.current.get(nextPageIndex) ?? 0
      const queueGeneration = thumbnailQueueGenerationRef.current
      thumbnailGenerationInFlightRef.current.add(nextPageIndex)
      thumbnailRequestActiveCountRef.current += 1

      void createSerializedCanvasThumbnailObjectUrl({
        canvasJson,
        width: interiorPageWidth,
        height: interiorPageHeight,
      })
        .then((objectUrl) => {
          if (!objectUrl) return
          if (thumbnailQueueGenerationRef.current !== queueGeneration) return
          if (thumbnailEpochRef.current !== epoch) return
          if ((thumbnailRevisionByIndexRef.current.get(nextPageIndex) ?? 0) !== revision) return
          rememberThumbnailUrl(nextPageIndex, objectUrl)
        })
        .finally(() => {
          thumbnailGenerationInFlightRef.current.delete(nextPageIndex)
          thumbnailRequestActiveCountRef.current = Math.max(0, thumbnailRequestActiveCountRef.current - 1)
          processThumbnailRequestQueue()
        })
    }
  }, [
    getCanvasJsonForPersistence,
    interiorPageHeight,
    interiorPageWidth,
    rememberThumbnailUrl,
    settings.pageCount,
  ])
  const handleRequestThumbnail = useCallback(
    (pageIndex: number): void => {
      if (pageIndex < 0 || pageIndex >= settings.pageCount) return
      if (thumbnailUrlsRef.current[pageIndex]) return
      if (thumbnailGenerationInFlightRef.current.has(pageIndex)) return
      thumbnailRequestQueueRef.current.add(pageIndex)
      processThumbnailRequestQueue()
    },
    [processThumbnailRequestQueue, settings.pageCount],
  )

  const pageThumbnailsController = useMemo(
    () => ({
      isVisible: isInteriorMode,
      isLoading: isProjectSettingsLoading || isCanvasesLoading,
      pageCount: settings.pageCount,
      pageKeys: interiorPageSlotKeys,
      activePageIndex,
      pageWidth: interiorPageWidth,
      pageHeight: interiorPageHeight,
      thumbnailUrls,
      onSelectPage: handleSelectThumbnailPage,
      onAddPageAfterLast: handleAddPageAfterLast,
      onRequestThumbnail: handleRequestThumbnail,
    }),
    [
      activePageIndex,
      handleAddPageAfterLast,
      handleRequestThumbnail,
      handleSelectThumbnailPage,
      interiorPageHeight,
      interiorPageWidth,
      interiorPageSlotKeys,
      isCanvasesLoading,
      isInteriorMode,
      isProjectSettingsLoading,
      settings.pageCount,
      thumbnailUrls,
    ],
  )

  usePageThumbnailsController(pageThumbnailsController)

  useEffect(() => {
    return onEditorInsertPages(({ afterPageIndex, count }) => {
      handleInsertPages(afterPageIndex, count)
    })
  }, [handleInsertPages])

  useEffect(() => {
    return onEditorRemovePages(({ startPageIndex, count }) => {
      handleRemovePages(startPageIndex, count)
    })
  }, [handleRemovePages])

  useEffect(() => {
    return onStudioWritePage(({ pageIndex, objects, mode, syncLive }) => {
      // Bulk writes persist to the store only; live canvases restore on generation-done.
      if (syncLive === false) return

      const live = editor.getCanvasByIndex(pageIndex)
      if (!live) return

      const generation = (studioWriteGenerationRef.current.get(pageIndex) ?? 0) + 1
      studioWriteGenerationRef.current.set(pageIndex, generation)
      const isCurrentWrite = (): boolean =>
        studioWriteGenerationRef.current.get(pageIndex) === generation &&
        editor.getCanvasByIndex(pageIndex) === live

      void (async () => {
        try {
          const fonts = collectReferencedFontFamiliesFromFabricCanvasJson({ objects })
          await Promise.all(fonts.map((fontFamily) => ensureFontFamilyLoaded(fontFamily)))
          // Superseded by a newer write, or page insert remounted this row.
          if (!isCurrentWrite()) return
          if (mode === 'replace') {
            live.clear()
          }
          const enlivened = await util.enlivenObjects(objects as never[])
          if (!isCurrentWrite()) return
          for (const obj of enlivened) {
            if (obj) live.add(obj as never)
          }
          await upgradeInteractiveTextToTextbox(live)
          if (!isCurrentWrite()) return
          remeasureAllFabricEditableTextOnCanvas(live)
          live.requestRenderAll()
          canvasStateStore.markFabricLiveTrusted(pageIndex)
          refreshHasUnsavedChanges()
          // Bulk inserts cancel pending live-thumb timers via resetThumbnailRuntimeState;
          // refresh only after objects are actually on the canvas.
          if (pageIndex >= 0) {
            scheduleLiveThumbnailUpdate(pageIndex, live, 0)
          }
        } catch (error) {
          console.error('studio write page failed', error)
        }
      })()
    })
  }, [canvasStateStore, editor, refreshHasUnsavedChanges, scheduleLiveThumbnailUpdate])

  const solutionsAtEndRef = useRef(settings.solutionsAtEnd)
  solutionsAtEndRef.current = settings.solutionsAtEnd

  useEffect(() => {
    return onStudioArrangeSolutions(({ placement }) => {
      if (!arrangeStudioSolutionPages(placement)) return
      // Like a trim/bleed Apply: persist the settings side effect right away.
      void saveCanvases({ quiet: true }).catch(() => {
        // Error toast already shown by saveCanvases
      })
    })
  }, [arrangeStudioSolutionPages, saveCanvases])

  useEffect(() => {
    return onStudioGenerationDone((detail) => {
      let pageIndices = detail.pageIndices
      let movedPageIndices = new Set<number>()
      // Generators always write the key right after its game; regroup once the run is done.
      const arranged = solutionsAtEndRef.current ? arrangeStudioSolutionPages('end') : null
      if (arranged) {
        const newIndexOf = invertPageOrder(arranged.order)
        pageIndices = pageIndices.map((pageIndex) => newIndexOf[pageIndex] ?? pageIndex)
        movedPageIndices = arranged.moved
        // Their permuted thumbnails predate the generate; the rail re-requests missing ones.
        updateThumbnailUrls((prev) => {
          const next = { ...prev }
          for (const pageIndex of pageIndices) {
            if (movedPageIndices.has(pageIndex)) delete next[pageIndex]
          }
          return next
        })
      }

      for (const pageIndex of pageIndices) {
        if (pageIndex < 0) continue
        // Moved rows remount at their new index and restore from the store.
        if (movedPageIndices.has(pageIndex)) continue

        if (detail.restoreLiveFromStore) {
          const live = editor.getCanvasByIndex(pageIndex)
          if (live && canvasStateStore.has(pageIndex)) {
            const generation = (studioWriteGenerationRef.current.get(pageIndex) ?? 0) + 1
            studioWriteGenerationRef.current.set(pageIndex, generation)
            void canvasStateStore.restore(pageIndex, live).then((restored) => {
              if (studioWriteGenerationRef.current.get(pageIndex) !== generation) return
              if (editor.getCanvasByIndex(pageIndex) !== live) return
              if (restored) {
                canvasStateStore.markFabricLiveTrusted(pageIndex)
                live.requestRenderAll()
                scheduleLiveThumbnailUpdate(pageIndex, live, 0)
              }
              dispatchCanvasThumbnailInvalidated(pageIndex)
            })
            continue
          }
        }

        // Final pass: clear stale thumbs for every written page and regenerate.
        // Page 0 often keeps a pre-generate empty blob URL that blocks rail requests.
        dispatchCanvasThumbnailInvalidated(pageIndex)
      }
      refreshHasUnsavedChanges()

      const firstPageIndex = pageIndices.find((pageIndex) => pageIndex >= 0)
      if (firstPageIndex != null) {
        // Drop insert-time restore so we land on the new game, not the prior viewport.
        scrollRestoreTopRef.current = null
        navigateToEditorPage(firstPageIndex)
      }
    })
  }, [
    arrangeStudioSolutionPages,
    canvasStateStore,
    editor,
    navigateToEditorPage,
    refreshHasUnsavedChanges,
    scheduleLiveThumbnailUpdate,
    updateThumbnailUrls,
  ])

  useEffect(() => {
    const handleScrollToEditorPage = (event: Event): void => {
      const pageIndex = (event as CustomEvent<ScrollToEditorPageEventDetail>).detail?.pageIndex
      if (typeof pageIndex !== 'number' || pageIndex < 0) return
      navigateToEditorPage(pageIndex)
    }

    window.addEventListener(SCROLL_TO_EDITOR_PAGE_EVENT, handleScrollToEditorPage)
    return () => {
      window.removeEventListener(SCROLL_TO_EDITOR_PAGE_EVENT, handleScrollToEditorPage)
    }
  }, [navigateToEditorPage])

  useEffect(() => {
    const targetIndex = scrollTargetIndexRef.current
    if (targetIndex != null) {
      scrollEditorToPageIndex(targetIndex)
      return
    }
    // Page insert/remove remounts rows — restore prior scroll unless a navigate target is set.
    const restoredTop = scrollRestoreTopRef.current
    const scrollEl = scrollRef.current
    if (restoredTop === null || !scrollEl) return
    scrollEl.scrollTop = restoredTop
    scrollRestoreTopRef.current = null
  }, [scrollEditorToPageIndex, settings.pageCount])

  const coverPageWidth = bookCoverDimensions.fullWidthPixels
  const coverPageHeight = bookCoverDimensions.fullHeightPixels

  const activePageWidth = isInteriorMode ? interiorPageWidth : coverPageWidth
  const activePageHeight = isInteriorMode ? interiorPageHeight : coverPageHeight

  const zoomedPageWidth = Math.round(activePageWidth * clampZoom(zoomLevel))
  const zoomedPageHeight = Math.round(activePageHeight * clampZoom(zoomLevel))
  const minContentWidth = zoomedPageWidth + CONTENT_PADDING * 2
  const minContentHeight = zoomedPageHeight + CONTENT_PADDING * 2

  useEffect(() => {
    zoomLevelRef.current = zoomLevel
  }, [zoomLevel])

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const oldZoom = prevZoomRef.current
    prevZoomRef.current = zoomLevel
    if (oldZoom === zoomLevel) return

    const ratio = zoomLevel / oldZoom
    const anchor = zoomAnchorRef.current
    zoomAnchorRef.current = null
    const pageRootAnchor = zoomPageRootAnchorRef.current
    zoomPageRootAnchorRef.current = null

    const oldScroll = scrollMetricsRef.current
    const oldMaxScrollLeft = Math.max(0, oldScroll.scrollWidth - oldScroll.clientWidth)
    const oldMaxScrollTop = Math.max(0, oldScroll.scrollHeight - oldScroll.clientHeight)
    const newMaxScrollLeft = Math.max(0, el.scrollWidth - el.clientWidth)
    const newMaxScrollTop = Math.max(0, el.scrollHeight - el.clientHeight)

    // When zoom out while the user is already near the bottom (e.g. canvas 10),
    // keeping the viewport center can shift the visible page up by ~1 row.
    // Neo the scroll to top/bottom edges in those cases.
    const isNearLeft = oldScroll.scrollLeft <= CONTENT_PADDING
    const isNearRight = oldMaxScrollLeft - oldScroll.scrollLeft <= CONTENT_PADDING
    const isNearTop = oldScroll.scrollTop <= CONTENT_PADDING
    const isNearBottom = oldMaxScrollTop - oldScroll.scrollTop <= CONTENT_PADDING

    const clamp = (value: number, min: number, max: number): number =>
      Math.max(min, Math.min(max, value))

    if (
      pageRootAnchor &&
      pageRootAnchor.pageRootEl.isConnected &&
      pageRootAnchor.pageHeightBefore > 0 &&
      pageRootAnchor.pageWidthBefore > 0
    ) {
      const pr = pageRootAnchor.pageRootEl.getBoundingClientRect()
      const scaleY = pr.height / pageRootAnchor.pageHeightBefore
      const scaleX = pr.width / pageRootAnchor.pageWidthBefore
      const newOffsetY = pageRootAnchor.offsetYInPage * scaleY
      const newOffsetX = pageRootAnchor.offsetXInPage * scaleX
      el.scrollLeft = clamp(
        el.scrollLeft + pr.left + newOffsetX - pageRootAnchor.clientX,
        0,
        newMaxScrollLeft,
      )
      el.scrollTop = clamp(
        el.scrollTop + pr.top + newOffsetY - pageRootAnchor.clientY,
        0,
        newMaxScrollTop,
      )
    } else if (anchor) {
      el.scrollLeft = clamp((oldScroll.scrollLeft + anchor.mouseX) * ratio - anchor.mouseX, 0, newMaxScrollLeft)
      el.scrollTop = clamp((oldScroll.scrollTop + anchor.mouseY) * ratio - anchor.mouseY, 0, newMaxScrollTop)
    } else {
      const centerX = el.clientWidth / 2
      const centerY = el.clientHeight / 2

      const nextScrollLeft = isNearLeft
        ? 0
        : isNearRight
          ? newMaxScrollLeft
          : (oldScroll.scrollLeft + centerX) * ratio - centerX
      const nextScrollTop = isNearTop
        ? 0
        : isNearBottom
          ? newMaxScrollTop
          : (oldScroll.scrollTop + centerY) * ratio - centerY

      el.scrollLeft = clamp(nextScrollLeft, 0, newMaxScrollLeft)
      el.scrollTop = clamp(nextScrollTop, 0, newMaxScrollTop)
    }

    // Keep metrics in sync in case the next zoom happens without an intervening scroll event.
    scrollMetricsRef.current = {
      scrollLeft: el.scrollLeft,
      scrollTop: el.scrollTop,
      scrollWidth: el.scrollWidth,
      scrollHeight: el.scrollHeight,
      clientWidth: el.clientWidth,
      clientHeight: el.clientHeight,
    }
  }, [zoomLevel])

  useEffect(() => {
    const scrollEl = scrollRef.current

    const handleWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey) return
      event.preventDefault()

      const deltaY = event.deltaY ?? 0
      const zoomFactor = Math.exp(-deltaY / WHEEL_ZOOM_SPEED)
      const nextZoom = clampZoom(zoomLevelRef.current * zoomFactor)
      if (nextZoom === zoomLevelRef.current) return

      if (scrollEl) {
        const rect = scrollEl.getBoundingClientRect()
        const mouseX = event.clientX - rect.left
        const mouseY = event.clientY - rect.top
        const isInsideScroll =
          mouseX >= 0 && mouseY >= 0 && mouseX <= rect.width && mouseY <= rect.height

        if (isInsideScroll) {
          const pageRoot = findEditorPageRootFromPoint(event.clientX, event.clientY)
          if (pageRoot) {
            const pr = pageRoot.getBoundingClientRect()
            zoomPageRootAnchorRef.current = {
              pageRootEl: pageRoot,
              clientX: event.clientX,
              clientY: event.clientY,
              offsetXInPage: event.clientX - pr.left,
              offsetYInPage: event.clientY - pr.top,
              pageWidthBefore: pr.width,
              pageHeightBefore: pr.height,
            }
            zoomAnchorRef.current = null
          } else {
            zoomPageRootAnchorRef.current = null
            zoomAnchorRef.current = { mouseX, mouseY }
          }
        }
      }

      setZoomLevel(nextZoom)
    }

    window.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      window.removeEventListener('wheel', handleWheel)
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null
      if (target) {
        const tagName = target.tagName.toLowerCase()
        const isEditableInput =
          tagName === 'input' || tagName === 'textarea' || target.isContentEditable
        if (isEditableInput) return
      }

      const isMod = event.ctrlKey || event.metaKey
      const key = event.key.toLowerCase()

      if (isMod && key === 'z' && !event.shiftKey) {
        event.preventDefault()
        editor.history.undoActiveCanvas()
        return
      }

      if (isMod && ((key === 'z' && event.shiftKey) || key === 'y')) {
        event.preventDefault()
        editor.history.redoActiveCanvas()
        return
      }

      if (isMod && key === 'v') {
        event.preventDefault()
        editor.toolbar.onPasteSelection()
        return
      }

      if (!editor.toolbar.hasSelection) return

      if (isMod && key === 'c') {
        event.preventDefault()
        editor.toolbar.onCopySelection()
        return
      }

      if (isMod && event.shiftKey && key === 'g') {
        event.preventDefault()
        editor.toolbar.onUngroupSelection()
        return
      }

      if (isMod && key === 'g') {
        event.preventDefault()
        editor.toolbar.onGroupSelection()
        return
      }

      const nudgeStep = event.shiftKey ? 10 : 1
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        editor.toolbar.onNudgeSelection(-nudgeStep, 0)
        return
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        editor.toolbar.onNudgeSelection(nudgeStep, 0)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        editor.toolbar.onNudgeSelection(0, -nudgeStep)
        return
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        editor.toolbar.onNudgeSelection(0, nudgeStep)
        return
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        editor.toolbar.onDeleteSelection()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [editor.toolbar, editor.history])

  const handleZoomChange = useCallback((level: number): void => {
    const clamped = clampZoom(level)
    if (clamped === zoomLevelRef.current) return
    const scrollEl = scrollRef.current
    const p = lastPointerInScrollRef.current
    if (scrollEl && p && isInteriorMode) {
      const sr = scrollEl.getBoundingClientRect()
      const inside =
        p.clientX >= sr.left &&
        p.clientX <= sr.right &&
        p.clientY >= sr.top &&
        p.clientY <= sr.bottom
      if (inside) {
        const pageRoot = findEditorPageRootFromPoint(p.clientX, p.clientY)
        if (pageRoot) {
          const pr = pageRoot.getBoundingClientRect()
          zoomPageRootAnchorRef.current = {
            pageRootEl: pageRoot,
            clientX: p.clientX,
            clientY: p.clientY,
            offsetXInPage: p.clientX - pr.left,
            offsetYInPage: p.clientY - pr.top,
            pageWidthBefore: pr.width,
            pageHeightBefore: pr.height,
          }
          zoomAnchorRef.current = null
        }
      }
    }
    setZoomLevel(clamped)
  }, [isInteriorMode])

  const interiorZoomContainerStyle = useMemo(
    () =>
      buildEditorZoomContainerStyle({
        zoomLevel,
        pageWidth: interiorPageWidth,
        pageHeight: interiorPageHeight,
      }),
    [interiorPageHeight, interiorPageWidth, zoomLevel],
  )

  const coverZoomContainerStyle = useMemo(
    () =>
      buildEditorZoomContainerStyle({
        zoomLevel,
        pageWidth: coverPageWidth,
        pageHeight: coverPageHeight,
      }),
    [coverPageHeight, coverPageWidth, zoomLevel],
  )

  return (
    <EditorZoomProvider zoomLevel={zoomLevel}>
      <main className="relative flex min-w-0 flex-1 flex-col bg-muted/30">
      <Toolbar
        hasSelection={editor.toolbar.hasSelection}
        isSelectionLocked={editor.toolbar.isSelectionLocked}
        isImageSelection={editor.toolbar.isImageSelection}
        isEraseToolActive={isEraseToolActive}
        eraseBrushSize={eraseBrushSize}
        onEraseBrushSizeChange={setEraseBrushSize}
        isBookCoverMode={!isInteriorMode}
        bookCoverGuideOpacity={bookCoverGuideOpacity}
        onBookCoverGuideOpacityChange={setBookCoverGuideOpacity}
        textSelection={editor.toolbar.textSelection}
        shapeSelection={editor.toolbar.shapeSelection}
        onBringToFrontSelection={editor.toolbar.onBringToFrontSelection}
        onSendToBackSelection={editor.toolbar.onSendToBackSelection}
        onFontFamilyChange={editor.toolbar.onFontFamilyChange}
        onFontSizeChange={editor.toolbar.onFontSizeChange}
        onTextColorChange={editor.toolbar.onTextColorChange}
        onToggleTextStyle={editor.toolbar.onToggleTextStyle}
        onStrokeWidthChange={editor.toolbar.onStrokeWidthChange}
        onBorderStyleChange={editor.toolbar.onBorderStyleChange}
        onStrokeColorChange={editor.toolbar.onStrokeColorChange}
        onFillColorChange={editor.toolbar.onFillColorChange}
        onCornerRadiusChange={editor.toolbar.onCornerRadiusChange}
        onOpenAlignmentPanel={onOpenAlignmentPanel}
      />
      <div
        ref={scrollRef}
        className="isolate min-h-0 flex-1 overflow-auto bg-muted pt-6 pb-6 dark:bg-zinc-800"
        onPointerMove={(event) => {
          const el = scrollRef.current
          if (!el) return
          const r = el.getBoundingClientRect()
          if (
            event.clientX >= r.left &&
            event.clientX <= r.right &&
            event.clientY >= r.top &&
            event.clientY <= r.bottom
          ) {
            lastPointerInScrollRef.current = { clientX: event.clientX, clientY: event.clientY }
          }
        }}
      >
        {(isProjectSettingsLoading || isCanvasesLoading) && (
          <div
            className="flex min-h-[280px] flex-col items-center justify-center gap-3 px-6 text-muted-foreground"
            aria-live="polite"
            aria-busy="true"
          >
            <Loader2 className="size-6 animate-spin" aria-hidden />
            <span className="text-sm font-medium">Loading canvases…</span>
          </div>
        )}

        {!isProjectSettingsLoading && !isCanvasesLoading && (
          <EditorScrollRootProvider scrollRootRef={scrollRef}>
            {/* Interior mode canvas pages */}
            <div
              className={isInteriorMode ? 'flex flex-col items-center gap-6 px-6' : 'hidden'}
              style={
                isInteriorMode
                  ? {
                      ...interiorZoomContainerStyle,
                      minWidth: minContentWidth,
                      minHeight: minContentHeight,
                      paddingTop: CONTENT_PADDING,
                      paddingBottom: CONTENT_PADDING,
                    }
                  : undefined
              }
            >
              {Array.from({ length: settings.pageCount }).map((_, index) => (
                <PageRow
                  key={interiorPageSlotKeys[index] ?? `interior-page-fallback-${index}`}
                  index={index}
                  pageWidth={interiorPageWidth}
                  pageHeight={interiorPageHeight}
                  pageCount={settings.pageCount}
                  onCanvasReady={handleCanvasReady}
                  onActiveCanvasChange={handleActiveCanvasChange}
                  onIsSelectionLockedChange={editor.pageRow.onIsSelectionLockedChange}
                  onHasSelectionChange={editor.pageRow.onHasSelectionChange}
                  onSelectionInfoChange={editor.pageRow.onSelectionInfoChange}
                  onAddPage={handleAddPage}
                  onMoveUp={handleMovePageUp}
                  onMoveDown={handleMovePageDown}
                  onRemove={handleRemovePage}
                  onRef={handlePageRef}
                  canvasStateStore={canvasStateStore}
                  showCanvasGrid={showCanvasGrid}
                />
              ))}
            </div>

            {/* Book cover mode canvas */}
            <div
              data-editor-page-root
              className={isInteriorMode ? 'hidden' : 'flex flex-col items-center gap-6 px-6'}
              style={
                isInteriorMode
                  ? undefined
                  : {
                      ...coverZoomContainerStyle,
                      minWidth: Math.round(coverPageWidth * clampZoom(zoomLevel)) + CONTENT_PADDING * 2,
                      minHeight: Math.round(coverPageHeight * clampZoom(zoomLevel)) + CONTENT_PADDING * 2,
                      paddingTop: CONTENT_PADDING,
                      paddingBottom: CONTENT_PADDING,
                    }
              }
            >
              <CanvasPageItem
                width={coverPageWidth}
                height={coverPageHeight}
                id="canvas-book-cover"
                totalPages={1}
                canvasIndex={-1}
                isBookCover
                bookCoverGuideOpacity={bookCoverGuideOpacity}
                onCanvasReady={handleCanvasReady}
                onActiveCanvasChange={handleActiveCanvasChange}
                onIsSelectionLockedChange={editor.pageRow.onIsSelectionLockedChange}
                onHasSelectionChange={(hasSelection) => editor.pageRow.onHasSelectionChange(-1, hasSelection)}
                onSelectionInfoChange={(info) => editor.pageRow.onSelectionInfoChange(-1, info)}
                canvasStateStore={canvasStateStore}
                showGrid={showCanvasGrid}
              />
            </div>
          </EditorScrollRootProvider>
        )}
      </div>
      <MainFooter
        isInteriorMode={isInteriorMode}
        onToggleInteriorMode={handleToggleInteriorMode}
        isStarterPlanLocked={isStarterPlanLocked}
        zoomLevel={zoomLevel}
        onZoomChange={handleZoomChange}
        totalPages={isInteriorMode ? settings.pageCount : 1}
        onRemoveCanvas={
          isCanvasesLoading
            ? undefined
            : isInteriorMode
              ? handleRequestResetInteriorToSinglePage
              : handleClearCoverCanvasOnly
        }
        showCanvasGrid={showCanvasGrid}
        onShowCanvasGridChange={setShowCanvasGrid}
      />

      {isInteriorMode && (
        <DeletePageDialogHost ref={deletePageDialogRef} onConfirmDelete={handleConfirmDelete} />
      )}

      <ResetInteriorDialog
        isOpen={isResetInteriorDialogOpen}
        onOpenChange={setIsResetInteriorDialogOpen}
        onConfirm={handleConfirmResetInteriorToSinglePage}
      />
    </main>
    </EditorZoomProvider>
  )
})
