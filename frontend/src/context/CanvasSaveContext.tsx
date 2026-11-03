import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { useToast } from '@/hooks/use-toast'
import { useCanvasSaves } from '@/hooks/use-canvas-saves'
import type { SaveCanvasesRequest } from '@/types/canvases.types'
import type { AiGeneratedImage } from '@/types/projects.types'
import { describeNothingToSave, findUnplacedImages } from '@/utils/ai-image-history'
import { CANVAS_LIVE_EVENT } from '@/utils/canvas-events'
import { FABRIC_HISTORY_CHANGED_EVENT } from '@/utils/fabric-canvas-history'

const SKIP_UNSAVED_WARNING_ONCE_KEY = 'skip_unsaved_warning_once'

type CanvasesPayloadGetter = () => SaveCanvasesRequest
/** Gets the payload the server just stored, which may be older than what the editor now shows. */
type AfterSaveCallback = (savedPayload: SaveCanvasesRequest) => void
type HasUnsavedCheckGetter = () => boolean
/** Images the canvases use; null while the project has not loaded. */
type PlacedImageUrlsGetter = () => ReadonlySet<string> | null
type GeneratedImagesGetter = () => readonly AiGeneratedImage[]

const UNSAVED_REFRESH_DEBOUNCE_MS = 150
/** An unsaved change is saved this long after it was made, even while the user keeps editing. */
const AUTO_SAVE_DELAY_MS = 4000
/** After a failed auto-save, wait this long before trying again. */
const AUTO_SAVE_RETRY_MS = 30000
/** An auto-save that found nothing it may save yet (a project still loading, an undo landing) retries sooner. */
const AUTO_SAVE_NOT_READY_RETRY_MS = AUTO_SAVE_DELAY_MS

/** Thrown by a payload getter when there is nothing it may save (no pages, project not loaded). */
export class CanvasPayloadUnavailableError extends Error {}

interface SaveCanvasesOptions {
  /** Skip success toast (e.g. auto-save after settings apply). Errors still toast. */
  quiet?: boolean
  /**
   * An auto-save: quiet, silent while the project cannot be saved yet (still loading, a page
   * mid-restore), and a failed save toasts once until a save succeeds again.
   */
  auto?: boolean
  /** POST even when no canvas is dirty (e.g. persist page-count prune after new project). */
  persistIfClean?: boolean
}

interface CanvasSaveContextValue {
  isSaving: boolean
  hasUnsavedChanges: boolean
  error: string | null
  lastSavedAt: Date | null
  saveCanvases: (options?: SaveCanvasesOptions) => Promise<void>
  registerCanvasesPayloadGetter: (getter: CanvasesPayloadGetter) => void
  registerAfterSaveCallback: (callback: AfterSaveCallback) => void
  registerHasUnsavedCheckGetter: (getter: HasUnsavedCheckGetter) => void
  registerPlacedImageUrlsGetter: (getter: PlacedImageUrlsGetter) => void
  registerGeneratedImagesGetter: (getter: GeneratedImagesGetter) => void
  getPlacedImageUrls: PlacedImageUrlsGetter
  refreshHasUnsavedChanges: () => void
}

const CanvasSaveContext = createContext<CanvasSaveContextValue | null>(null)

interface CanvasSaveProviderProps {
  children: ReactNode
}

export function CanvasSaveProvider({ children }: CanvasSaveProviderProps): JSX.Element {
  const { toast } = useToast()
  const { isSaving, error, saveCanvases } = useCanvasSaves()
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  const payloadGetterRef = useRef<CanvasesPayloadGetter | null>(null)
  const afterSaveCallbackRef = useRef<AfterSaveCallback | null>(null)
  const hasUnsavedCheckGetterRef = useRef<HasUnsavedCheckGetter | null>(null)
  const placedImageUrlsGetterRef = useRef<PlacedImageUrlsGetter | null>(null)
  const generatedImagesGetterRef = useRef<GeneratedImagesGetter | null>(null)
  const unsavedRefreshTimerRef = useRef<number | null>(null)

  /** Saves run one at a time: two in flight could land on the server out of order. */
  const saveChainRef = useRef<Promise<void>>(Promise.resolve())
  const pendingSaveCountRef = useRef(0)
  const autoSaveTimerRef = useRef<number | null>(null)
  /** The last auto-save failed and told the user; the next failures stay quiet until one succeeds. */
  const autoSaveFailureShownRef = useRef(false)
  /** Set once the save function exists; the timer calls it through this ref. */
  const autoSaveRef = useRef<() => void>(() => undefined)

  const registerCanvasesPayloadGetter = useCallback((getter: CanvasesPayloadGetter) => {
    payloadGetterRef.current = getter
  }, [])

  const registerAfterSaveCallback = useCallback((callback: AfterSaveCallback) => {
    afterSaveCallbackRef.current = callback
  }, [])

  const registerPlacedImageUrlsGetter = useCallback((getter: PlacedImageUrlsGetter) => {
    placedImageUrlsGetterRef.current = getter
  }, [])

  const registerGeneratedImagesGetter = useCallback((getter: GeneratedImagesGetter) => {
    generatedImagesGetterRef.current = getter
  }, [])

  const getPlacedImageUrls = useCallback((): ReadonlySet<string> | null => {
    return placedImageUrlsGetterRef.current?.() ?? null
  }, [])

  const countUnplacedImages = useCallback((): number => {
    const placedUrls = getPlacedImageUrls()
    return placedUrls ? findUnplacedImages(generatedImagesGetterRef.current?.() ?? [], placedUrls).length : 0
  }, [getPlacedImageUrls])

  /** Save on its own a little after the first unsaved change; later changes ride along. */
  const scheduleAutoSave = useCallback((delayMs: number = AUTO_SAVE_DELAY_MS) => {
    if (autoSaveTimerRef.current != null) return
    autoSaveTimerRef.current = window.setTimeout(() => {
      autoSaveTimerRef.current = null
      autoSaveRef.current()
    }, delayMs)
  }, [])

  const syncHasUnsavedChanges = useCallback(() => {
    const getter = hasUnsavedCheckGetterRef.current
    if (!getter) {
      setHasUnsavedChanges(false)
      return
    }

    let hasChanges = false
    try {
      hasChanges = getter()
    } catch {
      hasChanges = false
    }
    setHasUnsavedChanges(hasChanges)
    if (hasChanges) scheduleAutoSave()
  }, [scheduleAutoSave])

  const refreshHasUnsavedChanges = useCallback(() => {
    if (unsavedRefreshTimerRef.current != null) {
      window.clearTimeout(unsavedRefreshTimerRef.current)
    }

    unsavedRefreshTimerRef.current = window.setTimeout(() => {
      unsavedRefreshTimerRef.current = null
      syncHasUnsavedChanges()
    }, UNSAVED_REFRESH_DEBOUNCE_MS)
  }, [syncHasUnsavedChanges])

  const registerHasUnsavedCheckGetter = useCallback(
    (getter: HasUnsavedCheckGetter) => {
      hasUnsavedCheckGetterRef.current = getter
      syncHasUnsavedChanges()
    },
    [syncHasUnsavedChanges],
  )

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent): void => {
      const skipWarningOnce = sessionStorage.getItem(SKIP_UNSAVED_WARNING_ONCE_KEY) === '1'
      if (skipWarningOnce) {
        sessionStorage.removeItem(SKIP_UNSAVED_WARNING_ONCE_KEY)
        return
      }

      // Leaving now would cancel a save still on its way to the server.
      if (pendingSaveCountRef.current > 0) {
        event.preventDefault()
        event.returnValue = ''
        return
      }
      const hasUnsavedCheck = hasUnsavedCheckGetterRef.current
      if (!hasUnsavedCheck) return

      try {
        // The unsaved check also counts a change to the page count; it builds no payload.
        if (!hasUnsavedCheck()) return
      } catch {
        // If we cannot compute dirty state, prefer warning the user.
        event.preventDefault()
        event.returnValue = ''
        return
      }

      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [])

  useEffect(() => {
    const handleCanvasChange = (): void => {
      refreshHasUnsavedChanges()
    }

    window.addEventListener(CANVAS_LIVE_EVENT, handleCanvasChange)
    // Toolbar changes (a color, a font) and a finished pen path fire no Fabric event, only an undo step.
    window.addEventListener(FABRIC_HISTORY_CHANGED_EVENT, handleCanvasChange)
    return () => {
      window.removeEventListener(CANVAS_LIVE_EVENT, handleCanvasChange)
      window.removeEventListener(FABRIC_HISTORY_CHANGED_EVENT, handleCanvasChange)
      if (unsavedRefreshTimerRef.current != null) {
        window.clearTimeout(unsavedRefreshTimerRef.current)
        unsavedRefreshTimerRef.current = null
      }
      if (autoSaveTimerRef.current != null) {
        window.clearTimeout(autoSaveTimerRef.current)
        autoSaveTimerRef.current = null
      }
    }
  }, [refreshHasUnsavedChanges])

  const runSave = useCallback(async (options?: SaveCanvasesOptions) => {
    const payloadGetter = payloadGetterRef.current
    if (!payloadGetter) {
      throw new Error('Canvas payload is not ready')
    }

    let payload: SaveCanvasesRequest
    try {
      payload = payloadGetter()
    } catch (caught) {
      // Nothing may be saved right now (loading, a page mid-restore): the auto-save tries again later.
      if (!options?.auto) {
        const message = caught instanceof Error ? caught.message : 'Failed to save canvases'
        toast({ title: 'Save failed', description: message })
      }
      throw caught
    }

    if (payload.canvases.length === 0 && !options?.persistIfClean && !hasUnsavedCheckGetterRef.current?.()) {
      syncHasUnsavedChanges()
      // Manual save with nothing dirty previously returned silently — users saw no feedback.
      if (!options?.quiet && !options?.auto) {
        toast(describeNothingToSave(countUnplacedImages()))
      }
      return
    }

    try {
      await saveCanvases(payload)
      setLastSavedAt(new Date())
      autoSaveFailureShownRef.current = false
      if (!options?.quiet && !options?.auto) {
        toast({
          title: 'Canvases saved',
        })
      }

      afterSaveCallbackRef.current?.(payload)
      syncHasUnsavedChanges()
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Failed to save canvases'
      if (!options?.auto || !autoSaveFailureShownRef.current) {
        toast({
          title: options?.auto ? 'Auto-save failed' : 'Save failed',
          description: options?.auto ? `Your changes are kept; it tries again shortly. (${message})` : message,
        })
      }
      if (options?.auto) autoSaveFailureShownRef.current = true
      throw caught
    }
  }, [countUnplacedImages, saveCanvases, syncHasUnsavedChanges, toast])

  const saveAllCanvases = useCallback(
    (options?: SaveCanvasesOptions): Promise<void> => {
      pendingSaveCountRef.current += 1
      // The payload is built when this save's turn comes, so it holds every edit made meanwhile.
      const run = saveChainRef.current.then(() => runSave(options))
      saveChainRef.current = run.catch(() => undefined)
      return run.finally(() => {
        pendingSaveCountRef.current -= 1
      })
    },
    [runSave],
  )

  useEffect(() => {
    autoSaveRef.current = () => {
      // A save already queued will carry these changes.
      if (pendingSaveCountRef.current > 0) {
        scheduleAutoSave()
        return
      }
      if (!hasUnsavedCheckGetterRef.current?.()) return
      saveAllCanvases({ auto: true }).catch((caught) => {
        scheduleAutoSave(caught instanceof CanvasPayloadUnavailableError ? AUTO_SAVE_NOT_READY_RETRY_MS : AUTO_SAVE_RETRY_MS)
      })
    }
  }, [saveAllCanvases, scheduleAutoSave])

  const value = useMemo<CanvasSaveContextValue>(
    () => ({
      isSaving,
      hasUnsavedChanges,
      error,
      lastSavedAt,
      saveCanvases: saveAllCanvases,
      registerCanvasesPayloadGetter,
      registerAfterSaveCallback,
      registerHasUnsavedCheckGetter,
      registerPlacedImageUrlsGetter,
      registerGeneratedImagesGetter,
      getPlacedImageUrls,
      refreshHasUnsavedChanges,
    }),
    [
      error,
      getPlacedImageUrls,
      hasUnsavedChanges,
      isSaving,
      lastSavedAt,
      refreshHasUnsavedChanges,
      registerAfterSaveCallback,
      registerCanvasesPayloadGetter,
      registerHasUnsavedCheckGetter,
      registerGeneratedImagesGetter,
      registerPlacedImageUrlsGetter,
      saveAllCanvases,
    ],
  )

  return <CanvasSaveContext.Provider value={value}>{children}</CanvasSaveContext.Provider>
}

export function useCanvasSave(): CanvasSaveContextValue {
  const context = useContext(CanvasSaveContext)
  if (!context) {
    throw new Error('useCanvasSave must be used within CanvasSaveProvider')
  }
  return context
}

