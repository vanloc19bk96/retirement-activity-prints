import type { MutableRefObject } from 'react'
import type { Canvas, FabricObject } from 'fabric'

import type { CanvasSelectionInfo } from '@/utils/fabric-selection'
import {
  getCanvasSelectionSnapshot,
  isEventTargetInCurrentSelection,
} from '@/utils/fabric-selection'
import { clampImageMaxScale, clampCoverImagePosition } from '@/utils/canvas-image'
import {
  applyFabricAlignmentSnapAndGuides,
  drawFabricAlignmentGuides,
  getFabricAlignmentGuidesOnly,
  type FabricAlignmentGuideState,
} from '@/utils/fabric-alignment-guides'
import {
  drawFabricHoverBoundingBox,
  shouldShowHoverBoundingBox,
} from '@/utils/fabric-canvas-hover-box'
import {
  patchFloatingToolbarForObjectInteraction,
  patchFloatingToolbarForSelectionCleared,
  patchFloatingToolbarForSelectionSnapshot,
} from '@/utils/fabric-canvas-toolbar-patches'
import { keepLucideIconStrokeWidthStableOnScale } from '@/utils/lucide-icon-stroke-width'
import { isFabricSceneBboxTransformAction } from '@/utils/fabric-interaction-guards'
import type { FabricCanvasCoverFitApi } from '@/hooks/canvas-editor/use-fabric-canvas-cover-fit'
import type { SelectionFloatingToolbarStateApi } from '@/hooks/canvas-editor/use-fabric-canvas-selection-toolbar-state'
import type { useFabricSelectionContextMenu } from '@/hooks/use-fabric-selection-context-menu'

/** Screen pixels: snap + show guides when edges/centers align within this distance. */
const ALIGNMENT_SNAP_THRESHOLD_PX = 6

export type FabricCanvasInteractionRuntime = {
  alignmentGuideState: FabricAlignmentGuideState | null
  hoveredObject: FabricObject | null
  isObjectInteractionActive: boolean
}

type CallbackRefs = {
  onActiveCanvasChangeRef: MutableRefObject<((canvasIndex: number) => void) | undefined>
  onHasSelectionChangeRef: MutableRefObject<((hasSelection: boolean) => void) | null>
  onSelectionInfoChangeRef: MutableRefObject<((info: CanvasSelectionInfo) => void) | null>
  onIsSelectionLockedChangeRef: MutableRefObject<
    ((canvasIndex: number, isLocked: boolean) => void) | undefined
  >
  selectionContextMenuRef: MutableRefObject<ReturnType<typeof useFabricSelectionContextMenu>>
}

type BuildFabricCanvasInteractionHandlersOptions = {
  canvas: Canvas
  canvasIndex: number
  runtime: FabricCanvasInteractionRuntime
  zoomRef: MutableRefObject<number>
  refs: CallbackRefs
  toolbarState: SelectionFloatingToolbarStateApi
  coverFit: FabricCanvasCoverFitApi
}

export type FabricCanvasInteractionHandlers = {
  emitHasSelection: () => void
  handleAfterRender: (opt: { ctx?: CanvasRenderingContext2D }) => void
  handleCanvasMouseMove: (event: { target?: unknown }) => void
  handleCanvasMouseDown: (opt: { e: Event; target?: unknown }) => void
  handleCanvasMouseUp: () => void
  handleWindowMouseUp: () => void
  handleObjectScaling: (event: { target?: unknown }) => void
  handleObjectResizing: (event: { target?: unknown }) => void
  handleObjectRotating: (event: { target?: unknown }) => void
  handleObjectModified: (event: { target?: unknown }) => void
  handleObjectMoving: (event: { target?: unknown }) => void
  handleSelectionCleared: () => void
  clearHoverBoundingBox: () => void
}

/**
 * Builds all canvas interaction handlers (selection/object/mouse + rendering overlays)
 * that share the same mutable interaction `runtime`. Text handlers are built separately
 * because they have no dependency on alignment guides / hover state.
 */
export function buildFabricCanvasInteractionHandlers({
  canvas,
  canvasIndex,
  runtime,
  zoomRef,
  refs,
  toolbarState,
  coverFit,
}: BuildFabricCanvasInteractionHandlersOptions): FabricCanvasInteractionHandlers {
  const {
    onActiveCanvasChangeRef,
    onHasSelectionChangeRef,
    onSelectionInfoChangeRef,
    onIsSelectionLockedChangeRef,
    selectionContextMenuRef,
  } = refs
  const { patch: patchToolbarState } = toolbarState

  const emitHasSelection = (): void => {
    const snapshot = getCanvasSelectionSnapshot(canvas)
    if (snapshot.hasSelection) onActiveCanvasChangeRef.current?.(canvasIndex)
    onHasSelectionChangeRef.current?.(snapshot.hasSelection)
    onSelectionInfoChangeRef.current?.(snapshot.selectionInfo)
    onIsSelectionLockedChangeRef.current?.(canvasIndex, snapshot.isLocked)
    patchFloatingToolbarForSelectionSnapshot(canvas, snapshot, patchToolbarState, {
      isObjectInteractionActive: runtime.isObjectInteractionActive,
    })
  }

  const hideSelectionFloatingToolbarDuringObjectInteraction = (): void => {
    const snapshot = getCanvasSelectionSnapshot(canvas)
    runtime.isObjectInteractionActive = true
    selectionContextMenuRef.current.close()
    patchFloatingToolbarForObjectInteraction(snapshot, patchToolbarState)
  }

  const finishObjectInteraction = (): void => {
    if (!runtime.isObjectInteractionActive) return
    runtime.isObjectInteractionActive = false
    emitHasSelection()
  }

  const clearAlignmentGuides = (): void => {
    if (!runtime.alignmentGuideState) return
    runtime.alignmentGuideState = null
    canvas.requestRenderAll()
  }

  const setHoveredObject = (target: FabricObject | null): void => {
    const nextHoveredObject = shouldShowHoverBoundingBox(canvas, target) ? target : null
    if (runtime.hoveredObject === nextHoveredObject) return
    runtime.hoveredObject = nextHoveredObject
    canvas.requestRenderAll()
  }

  const clearHoverBoundingBox = (): void => {
    setHoveredObject(null)
  }

  const refreshAlignmentGuidesForTarget = (target: FabricObject): void => {
    runtime.alignmentGuideState = getFabricAlignmentGuidesOnly(canvas, target, {
      thresholdPx: ALIGNMENT_SNAP_THRESHOLD_PX,
      zoom: zoomRef.current,
    })
    canvas.requestRenderAll()
  }

  const handleAfterRender = (opt: { ctx?: CanvasRenderingContext2D }): void => {
    if (!opt.ctx) return
    if (runtime.alignmentGuideState) {
      drawFabricAlignmentGuides(opt.ctx, canvas, runtime.alignmentGuideState)
    }
    if (runtime.hoveredObject && shouldShowHoverBoundingBox(canvas, runtime.hoveredObject)) {
      drawFabricHoverBoundingBox(opt.ctx, canvas, runtime.hoveredObject)
    }
  }

  const handleCanvasMouseMove = (event: { target?: unknown }): void => {
    setHoveredObject((event.target as FabricObject | undefined) ?? null)

    const currentTransform = (
      canvas as unknown as {
        _currentTransform: { action?: string; target: FabricObject } | null
      }
    )._currentTransform
    if (
      currentTransform &&
      isFabricSceneBboxTransformAction(currentTransform.action) &&
      isEventTargetInCurrentSelection(canvas, currentTransform.target)
    ) {
      refreshAlignmentGuidesForTarget(currentTransform.target)
    }
  }

  const handleObjectScaling = (event: { target?: unknown }): void => {
    clearHoverBoundingBox()
    clampImageMaxScale(event.target)
    clampCoverImagePosition(event.target)
    keepLucideIconStrokeWidthStableOnScale(event.target)
    if (!isEventTargetInCurrentSelection(canvas, event.target)) return
    hideSelectionFloatingToolbarDuringObjectInteraction()
    const target = event.target as FabricObject | undefined
    if (target) refreshAlignmentGuidesForTarget(target)
    emitHasSelection()
  }

  const handleObjectResizing = (event: { target?: unknown }): void => {
    clearHoverBoundingBox()
    if (!isEventTargetInCurrentSelection(canvas, event.target)) return
    hideSelectionFloatingToolbarDuringObjectInteraction()
    const target = event.target as FabricObject | undefined
    if (target) refreshAlignmentGuidesForTarget(target)
    emitHasSelection()
  }

  const handleObjectRotating = (event: { target?: unknown }): void => {
    clearHoverBoundingBox()
    if (!isEventTargetInCurrentSelection(canvas, event.target)) return
    hideSelectionFloatingToolbarDuringObjectInteraction()
  }

  const handleObjectModified = (event: { target?: unknown }): void => {
    clearAlignmentGuides()
    if (!isEventTargetInCurrentSelection(canvas, event.target)) return
    runtime.isObjectInteractionActive = false
    emitHasSelection()
  }

  const handleObjectMoving = (event: { target?: unknown }): void => {
    clearHoverBoundingBox()
    const target = event.target as FabricObject | undefined
    if (!target) return
    if (!isEventTargetInCurrentSelection(canvas, target)) return
    hideSelectionFloatingToolbarDuringObjectInteraction()
    const guides = applyFabricAlignmentSnapAndGuides(canvas, target, {
      thresholdPx: ALIGNMENT_SNAP_THRESHOLD_PX,
      zoom: zoomRef.current,
    })
    runtime.alignmentGuideState = guides
    clampCoverImagePosition(event.target)
    canvas.requestRenderAll()
  }

  const handleSelectionCleared = (): void => {
    clearAlignmentGuides()
    selectionContextMenuRef.current.close()
    patchFloatingToolbarForSelectionCleared(patchToolbarState)
    coverFit.resetCapabilities()
    onHasSelectionChangeRef.current?.(false)
    onSelectionInfoChangeRef.current?.({
      hasSelection: false,
      selectionCount: 0,
      isText: false,
      isImage: false,
      isShape: false,
      isLucideIconSelection: false,
    })
    onIsSelectionLockedChangeRef.current?.(canvasIndex, false)
  }

  const handleCanvasMouseDown = (opt: { e: Event; target?: unknown }): void => {
    clearHoverBoundingBox()
    onActiveCanvasChangeRef.current?.(canvasIndex)

    const nativeEvent = opt.e
    if (!(nativeEvent instanceof MouseEvent) || nativeEvent.button !== 2) return
    const snapshot = getCanvasSelectionSnapshot(canvas)
    nativeEvent.preventDefault()
    nativeEvent.stopPropagation()
    if (!snapshot.hasSelection) {
      coverFit.resetCapabilities()
      selectionContextMenuRef.current.openAt(nativeEvent.clientX, nativeEvent.clientY, {
        canCopy: false,
        canDelete: false,
      })
      return
    }

    if (!isEventTargetInCurrentSelection(canvas, opt.target)) return

    coverFit.updateCapabilitiesFromSnapshot(snapshot)
    selectionContextMenuRef.current.openAt(nativeEvent.clientX, nativeEvent.clientY, {
      canCopy: true,
      canDelete: !snapshot.isLocked,
    })
  }

  const handleCanvasMouseUp = (): void => {
    clearAlignmentGuides()
    finishObjectInteraction()
  }

  const handleWindowMouseUp = (): void => {
    clearAlignmentGuides()
    finishObjectInteraction()
  }

  return {
    emitHasSelection,
    handleAfterRender,
    handleCanvasMouseMove,
    handleCanvasMouseDown,
    handleCanvasMouseUp,
    handleWindowMouseUp,
    handleObjectScaling,
    handleObjectResizing,
    handleObjectRotating,
    handleObjectModified,
    handleObjectMoving,
    handleSelectionCleared,
    clearHoverBoundingBox,
  }
}
