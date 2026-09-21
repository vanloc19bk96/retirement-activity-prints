import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react'
import { useEffect, useRef } from 'react'
import { Canvas } from 'fabric'

import type { CanvasLogicalSize } from '@/types/fabric-canvas-item.types'
import type { CanvasSelectionInfo } from '@/utils/fabric-selection'
import { applyFabricSelectionStyle } from '@/utils/fabric-selection-style'
import type { CanvasStateStore } from '@/utils/canvas-state-store'
import { createFabricCanvasHistoryManager } from '@/utils/fabric-canvas-history'
import { scaleAndClampCanvasObjects } from '@/utils/fabric-canvas-resize'
import { resolveInteriorPageSafeArea } from '@/utils/canvas-template'
import { dispatchCanvasLive } from '@/utils/canvas-events'
import { attachEraserAutoBakeListener } from '@/utils/fabric-eraser-bake'
import { rehydrateEraserMetadata } from '@/utils/eraser-rehydrate'
import { remapBookCoverImageClipsOnCanvasResize } from '@/utils/book-cover-image-resize'
import type { MarginGuide } from '@/types/canvas-settings.types'
import type { BookCoverDimensions, BookCoverZones } from '@/types/book-cover.types'
import { buildFabricCanvasTextEventHandlers } from '@/utils/fabric-canvas-text-event-handlers'
import {
  buildFabricCanvasInteractionHandlers,
  type FabricCanvasInteractionRuntime,
} from '@/utils/fabric-canvas-interaction-handlers'
import type { FabricCanvasCoverFitApi } from './use-fabric-canvas-cover-fit'
import type { SelectionFloatingToolbarStateApi } from './use-fabric-canvas-selection-toolbar-state'
import type { useFabricSelectionContextMenu } from '@/hooks/use-fabric-selection-context-menu'

type CallbackRefs = {
  fabricCanvasRef: MutableRefObject<Canvas | null>
  canvasMountRef: RefObject<HTMLDivElement | null>
  previousLogicalSizeRef: MutableRefObject<CanvasLogicalSize>
  latestCanvasIndexRef: MutableRefObject<number>
  zoomRef: MutableRefObject<number>
  canvasStateStoreRef: MutableRefObject<CanvasStateStore | undefined>
  onCanvasReadyRef: MutableRefObject<
    ((canvasIndex: number, canvas: Canvas | null) => void) | undefined
  >
  onActiveCanvasChangeRef: MutableRefObject<((canvasIndex: number) => void) | undefined>
  onHasSelectionChangeRef: MutableRefObject<((hasSelection: boolean) => void) | null>
  onSelectionInfoChangeRef: MutableRefObject<((info: CanvasSelectionInfo) => void) | null>
  onIsSelectionLockedChangeRef: MutableRefObject<
    ((canvasIndex: number, isLocked: boolean) => void) | undefined
  >
  selectionContextMenuRef: MutableRefObject<ReturnType<typeof useFabricSelectionContextMenu>>
}

type UseFabricCanvasLifecycleOptions = {
  isActive: boolean
  id: string | undefined
  baseWidth: number
  baseHeight: number
  canvasIndex: number
  isBookCover: boolean
  bookCoverZones: BookCoverZones | null
  bookCoverDimensions: BookCoverDimensions | null
  marginGuide: MarginGuide
  isLeftPage: boolean
  showGridRef: MutableRefObject<boolean>
  refs: CallbackRefs
  toolbarState: SelectionFloatingToolbarStateApi
  coverFit: FabricCanvasCoverFitApi
  /** Signal that a brand-new Fabric surface is mounted (for dependent effects to re-attach). */
  setFabricSurfaceEpoch: Dispatch<SetStateAction<number>>
  setIsRestorePending: Dispatch<SetStateAction<boolean>>
}

function attachCanvasEventListeners(
  canvas: Canvas,
  interaction: ReturnType<typeof buildFabricCanvasInteractionHandlers>,
  textHandlers: ReturnType<typeof buildFabricCanvasTextEventHandlers>,
): () => void {
  canvas.on('selection:created', interaction.emitHasSelection)
  canvas.on('selection:updated', interaction.emitHasSelection)
  canvas.on('object:scaling', interaction.handleObjectScaling)
  canvas.on('object:resizing', interaction.handleObjectResizing)
  canvas.on('object:rotating', interaction.handleObjectRotating)
  canvas.on('object:modified', interaction.handleObjectModified)
  canvas.on('object:moving', interaction.handleObjectMoving)
  canvas.on('after:render', interaction.handleAfterRender)
  canvas.on('mouse:up', interaction.handleCanvasMouseUp)
  canvas.on('mouse:move', interaction.handleCanvasMouseMove)
  canvas.on('mouse:out', interaction.clearHoverBoundingBox)
  canvas.on('selection:cleared', interaction.handleSelectionCleared)
  canvas.on('mouse:down', interaction.handleCanvasMouseDown)
  canvas.on('text:changed', textHandlers.handleTextChanged)
  canvas.on('text:editing:entered', textHandlers.handleTextEditingEntered)
  canvas.on('text:editing:exited', textHandlers.handleTextEditingExited)
  window.addEventListener('mouseup', interaction.handleWindowMouseUp)

  return () => {
    canvas.off('selection:created', interaction.emitHasSelection)
    canvas.off('selection:updated', interaction.emitHasSelection)
    canvas.off('object:scaling', interaction.handleObjectScaling)
    canvas.off('object:resizing', interaction.handleObjectResizing)
    canvas.off('object:rotating', interaction.handleObjectRotating)
    canvas.off('object:modified', interaction.handleObjectModified)
    canvas.off('object:moving', interaction.handleObjectMoving)
    canvas.off('after:render', interaction.handleAfterRender)
    canvas.off('mouse:up', interaction.handleCanvasMouseUp)
    canvas.off('mouse:move', interaction.handleCanvasMouseMove)
    canvas.off('mouse:out', interaction.clearHoverBoundingBox)
    canvas.off('selection:cleared', interaction.handleSelectionCleared)
    canvas.off('mouse:down', interaction.handleCanvasMouseDown)
    canvas.off('text:changed', textHandlers.handleTextChanged)
    canvas.off('text:editing:entered', textHandlers.handleTextEditingEntered)
    canvas.off('text:editing:exited', textHandlers.handleTextEditingExited)
    window.removeEventListener('mouseup', interaction.handleWindowMouseUp)
  }
}

// Canvas 2D disables ClearType for rotated text, falling back to grayscale AA.
// A 2x backing buffer gives enough resolution for sharp rotated labels.
const MIN_CANVAS_RETINA_SCALING = 2

function resolveFabricCanvasBackgroundColor(
  isBookCover: boolean,
  showGrid: boolean,
): string {
  if (isBookCover) return 'rgba(255,255,255,0)'
  return showGrid ? 'rgba(255,255,255,0)' : '#ffffff'
}

function createFabricCanvasSurface(
  mount: HTMLDivElement,
  id: string,
  width: number,
  height: number,
  backgroundColor: string,
  zoom: number,
): Canvas {
  const element = document.createElement('canvas')
  element.id = id
  mount.appendChild(element)

  const canvas = new Canvas(element, {
    width,
    height,
    selection: true,
    preserveObjectStacking: true,
    backgroundColor,
  })

  const nativeGetRetinaScaling = canvas.getRetinaScaling.bind(canvas)
  if (nativeGetRetinaScaling() < MIN_CANVAS_RETINA_SCALING) {
    canvas.getRetinaScaling = () => MIN_CANVAS_RETINA_SCALING
    canvas.setDimensions({ width, height })
  }

  const renderingContext =
    (canvas as Canvas & { contextContainer?: CanvasRenderingContext2D }).contextContainer ??
    element.getContext('2d')
  if (renderingContext) {
    renderingContext.imageSmoothingEnabled = true
    renderingContext.imageSmoothingQuality = 'high'
  }

  canvas.setViewportTransform([zoom, 0, 0, zoom, 0, 0])
  applyFabricSelectionStyle(canvas)
  return canvas
}

/**
 * Owns the Fabric Canvas lifecycle: DOM node creation, Fabric instantiation,
 * persisted state restore, full event handler wiring and cleanup (including
 * saving canvas state for the current slot on unmount).
 */
export function useFabricCanvasLifecycle({
  isActive,
  id,
  baseWidth,
  baseHeight,
  canvasIndex,
  isBookCover,
  bookCoverZones,
  bookCoverDimensions,
  marginGuide,
  isLeftPage,
  showGridRef,
  refs,
  toolbarState,
  coverFit,
  setFabricSurfaceEpoch,
  setIsRestorePending,
}: UseFabricCanvasLifecycleOptions): void {
  const marginGuideRef = useRef(marginGuide)
  marginGuideRef.current = marginGuide

  const {
    fabricCanvasRef,
    canvasMountRef,
    previousLogicalSizeRef,
    latestCanvasIndexRef,
    zoomRef,
    canvasStateStoreRef,
    onCanvasReadyRef,
    onHasSelectionChangeRef,
  } = refs

  useEffect(() => {
    if (!isActive || !id) return
    const mount = canvasMountRef.current
    if (!mount) return

    const previousLogicalSize = previousLogicalSizeRef.current
    previousLogicalSizeRef.current = { width: baseWidth, height: baseHeight }

    const registeredCanvasIndex = canvasIndex
    const canvasBackgroundColor = resolveFabricCanvasBackgroundColor(
      isBookCover,
      showGridRef.current,
    )

    const currentZoom = zoomRef.current
    const initWidth = Math.round(baseWidth * currentZoom)
    const initHeight = Math.round(baseHeight * currentZoom)

    const canvas = createFabricCanvasSurface(
      mount,
      id,
      initWidth,
      initHeight,
      canvasBackgroundColor,
      currentZoom,
    )

    fabricCanvasRef.current = canvas
    setFabricSurfaceEpoch((n) => n + 1)
    onCanvasReadyRef.current?.(canvasIndex, canvas)

    const detachEraserAutoBake = attachEraserAutoBakeListener(canvas)

    // History listens to Fabric events; created here and started AFTER restore completes
    // so loadFromJSON doesn't seed the undo stack with restore-internal events.
    const history = createFabricCanvasHistoryManager(canvas)

    let restoreSettled = true
    let restoreCancelled = false
    let restoreSucceeded = false

    const ensureCanvasBackground = (): void => {
      canvas.backgroundColor = resolveFabricCanvasBackgroundColor(
        isBookCover,
        showGridRef.current,
      )
      canvas.requestRenderAll()
    }

    const notifyCanvasLive = (): void => {
      if (canvasIndex < 0 || restoreCancelled) return
      dispatchCanvasLive(canvasIndex)
    }

    const store = canvasStateStoreRef.current
    if (store?.has(canvasIndex)) {
      store.markFabricLiveUntrusted(canvasIndex)
      restoreSettled = false
      void store.restore(canvasIndex, canvas).then((restored) => {
        restoreSucceeded = restored
      }).finally(() => {
        if (restoreCancelled) return

        const nextSize = { width: baseWidth, height: baseHeight }
        const hasLogicalSizeChanged =
          previousLogicalSize.width !== nextSize.width ||
          previousLogicalSize.height !== nextSize.height
        const authoringSize = store.getAuthoringLogicalSize(canvasIndex)
        const sourceSize = authoringSize ?? previousLogicalSize
        // Only rescale when this mount follows an in-session page resize. Backend
        // snapshots are already authored at the current logical size; comparing
        // preload authoring metadata to nextSize must not trigger a bogus clamp.
        const shouldRescaleForResize = hasLogicalSizeChanged

        if (restoreSucceeded && shouldRescaleForResize) {
          const targetArea =
            !isBookCover
              ? resolveInteriorPageSafeArea({
                  canvasSize: nextSize,
                  marginGuide: marginGuideRef.current,
                  isLeftPage,
                })
              : null
          scaleAndClampCanvasObjects(canvas, sourceSize, nextSize, {
            targetArea: targetArea ?? undefined,
            insetMargin: targetArea ? 8 : 0,
            skipFitWithinArea: isBookCover,
          })
          if (isBookCover && bookCoverZones && bookCoverDimensions) {
            remapBookCoverImageClipsOnCanvasResize(
              canvas,
              bookCoverZones,
              bookCoverDimensions,
              sourceSize,
              nextSize,
            )
          }
          store.setAuthoringLogicalSize(canvasIndex, nextSize)
        }
        restoreSettled = true
        if (restoreSucceeded) {
          store.markFabricLiveTrusted(canvasIndex)
          store.reconcileFabricBaselineIfPending(canvasIndex, canvas)
          rehydrateEraserMetadata(canvas)
          ensureCanvasBackground()
          setIsRestorePending(false)
          history.start()
          notifyCanvasLive()
        } else {
          setIsRestorePending(false)
          history.start()
          notifyCanvasLive()
        }
      })
    } else {
      store?.markFabricLiveTrusted(canvasIndex)
      rehydrateEraserMetadata(canvas)
      history.start()
      notifyCanvasLive()
    }

    const runtime: FabricCanvasInteractionRuntime = {
      alignmentGuideState: null,
      hoveredObject: null,
      isObjectInteractionActive: false,
    }

    const interaction = buildFabricCanvasInteractionHandlers({
      canvas,
      canvasIndex,
      runtime,
      zoomRef,
      refs,
      toolbarState,
      coverFit,
    })

    const textHandlers = buildFabricCanvasTextEventHandlers({
      canvas,
      onSelectionStateChanged: interaction.emitHasSelection,
    })

    const detachListeners = attachCanvasEventListeners(canvas, interaction, textHandlers)
    interaction.emitHasSelection()

    return () => {
      restoreCancelled = true
      if (restoreSettled) {
        const store = canvasStateStoreRef.current
        const pageIndex = latestCanvasIndexRef.current
        store?.save(pageIndex, canvas)
      }
      // Drop live-trust on dispose so a remounting canvas cannot win over a
      // committed store snapshot while loadFromJSON is still in flight.
      canvasStateStoreRef.current?.markFabricLiveUntrusted(latestCanvasIndexRef.current)
      history.dispose()
      detachListeners()
      detachEraserAutoBake()
      onCanvasReadyRef.current?.(registeredCanvasIndex, null)
      onHasSelectionChangeRef.current?.(false)
      fabricCanvasRef.current = null
      try {
        canvas.dispose()
      } catch {
        // Dispose may partially fail if DOM was already modified
      }
      while (mount.firstChild) {
        mount.removeChild(mount.firstChild)
      }
    }
    // marginGuide is read via marginGuideRef so page-count inserts do not
    // dispose/recreate every interior canvas when only the guide object identity
    // changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, id, baseWidth, baseHeight, canvasIndex, isBookCover, bookCoverZones, bookCoverDimensions, isLeftPage])
}
