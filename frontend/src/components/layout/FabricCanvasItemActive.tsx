import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Canvas } from 'fabric'
import type { MutableRefObject, RefObject } from 'react'

import { clampZoom } from './ZoomControl'
import { CanvasGridOverlay } from './CanvasGridOverlay'
import { FabricCanvasOverlays } from './FabricCanvasOverlays'
import { FabricCanvasSelectionControls } from './FabricCanvasSelectionControls'

import { useCanvasSettings } from '@/context/CanvasSettingsContext'
import { useCanvasPenTool } from '@/context/CanvasPenToolContext'
import { useEditorZoom, useEditorZoomRef } from '@/context/EditorZoomContext'
import { useFabricSelectionContextMenu } from '@/hooks/use-fabric-selection-context-menu'
import { useFabricCanvasCallbackRefs } from '@/hooks/canvas-editor/use-fabric-canvas-callback-refs'
import { useFabricCanvasSelectionToolbarState } from '@/hooks/canvas-editor/use-fabric-canvas-selection-toolbar-state'
import { useFabricCanvasCoverFit } from '@/hooks/canvas-editor/use-fabric-canvas-cover-fit'
import { useFabricCanvasSelectionToolbarActions } from '@/hooks/canvas-editor/use-fabric-canvas-selection-toolbar-actions'
import { useFabricCanvasZoomSync } from '@/hooks/canvas-editor/use-fabric-canvas-zoom-sync'
import { useFabricCanvasPenTools } from '@/hooks/canvas-editor/use-fabric-canvas-pen-tools'
import { useFabricCanvasDropHandlers } from '@/hooks/canvas-editor/use-fabric-canvas-drop-handlers'
import { useFabricCanvasLifecycle } from '@/hooks/canvas-editor/use-fabric-canvas-lifecycle'
import { resolveInteriorIsLeftPage } from '@/utils/canvas-template'

import {
  getCanvasSelectionFloatingToolbarPosition,
  getCanvasSelectionGroupingCapabilities,
} from '@/utils/fabric-canvas-floating-toolbar-ui'
import { getCanvasSelectionSnapshot } from '@/utils/fabric-selection'

import type {
  CanvasLogicalSize,
  FabricCanvasItemProps,
} from '@/types/fabric-canvas-item.types'

export type FabricCanvasItemActiveProps = FabricCanvasItemProps & {
  baseWidth: number
  baseHeight: number
  containerRef: RefObject<HTMLDivElement | null>
  canvasMountRef: RefObject<HTMLDivElement | null>
  fabricCanvasRef: MutableRefObject<Canvas | null>
  isIntersectingRef: MutableRefObject<boolean>
}

export function FabricCanvasItemActive({
  baseWidth,
  baseHeight,
  id,
  isLoading = false,
  isBookCover = false,
  bookCoverGuideOpacity = 1,
  canvasIndex = 0,
  onHasSelectionChange,
  onSelectionInfoChange,
  onCanvasReady,
  onActiveCanvasChange,
  onIsSelectionLockedChange,
  canvasStateStore,
  showGrid = false,
  containerRef,
  canvasMountRef,
  fabricCanvasRef,
  isIntersectingRef,
}: FabricCanvasItemActiveProps): JSX.Element {
  const { settings, marginGuide, bookCoverDimensions, bookCoverZones, projectBookInfo } =
    useCanvasSettings()
  const zoom = clampZoom(useEditorZoom())
  const zoomRef = useEditorZoomRef()
  const isLeftPage = resolveInteriorIsLeftPage(canvasIndex)
  const displayWidth = Math.round(baseWidth * zoom)
  const displayHeight = Math.round(baseHeight * zoom)

  const previousLogicalSizeRef = useRef<CanvasLogicalSize>({
    width: baseWidth,
    height: baseHeight,
  })
  const latestCanvasIndexRef = useRef(canvasIndex)
  latestCanvasIndexRef.current = canvasIndex
  const showGridRef = useRef(showGrid)
  showGridRef.current = showGrid
  const canvasStateStoreRef = useRef(canvasStateStore)
  canvasStateStoreRef.current = canvasStateStore

  const callbackRefs = useFabricCanvasCallbackRefs({
    onHasSelectionChange,
    onSelectionInfoChange,
    onCanvasReady,
    onActiveCanvasChange,
    onIsSelectionLockedChange,
  })

  const { isPenToolActive, isPencilToolActive, isEraseToolActive, eraseBrushSize } = useCanvasPenTool()
  const isPenToolActiveRef = useRef(isPenToolActive)
  isPenToolActiveRef.current = isPenToolActive
  const isPencilToolActiveRef = useRef(isPencilToolActive)
  isPencilToolActiveRef.current = isPencilToolActive
  const isEraseToolActiveRef = useRef(isEraseToolActive)
  isEraseToolActiveRef.current = isEraseToolActive
  const eraseBrushSizeRef = useRef(eraseBrushSize)
  eraseBrushSizeRef.current = eraseBrushSize

  const selectionContextMenu = useFabricSelectionContextMenu(fabricCanvasRef)
  const selectionContextMenuRef = useRef(selectionContextMenu)
  selectionContextMenuRef.current = selectionContextMenu

  const [isRestorePending, setIsRestorePending] = useState(false)
  const [fabricSurfaceEpoch, setFabricSurfaceEpoch] = useState(0)

  const toolbarState = useFabricCanvasSelectionToolbarState()

  const coverFit = useFabricCanvasCoverFit({
    fabricCanvasRef,
    selectionContextMenuRef,
    isBookCover,
    bookCoverZones,
    bookCoverDimensions,
  })

  const syncFabricDimensionsToZoom = useFabricCanvasZoomSync({
    fabricCanvasRef,
    baseWidth,
    baseHeight,
    zoomRef,
  })

  const toolbarActions = useFabricCanvasSelectionToolbarActions({
    refs: {
      fabricCanvasRef,
      selectionContextMenuRef,
      latestCanvasIndexRef,
      onActiveCanvasChangeRef: callbackRefs.onActiveCanvasChangeRef,
      onHasSelectionChangeRef: callbackRefs.onHasSelectionChangeRef,
      onSelectionInfoChangeRef: callbackRefs.onSelectionInfoChangeRef,
      onIsSelectionLockedChangeRef: callbackRefs.onIsSelectionLockedChangeRef,
    },
    toolbarState,
    coverFit,
  })

  useLayoutEffect(() => {
    if (canvasStateStore?.has(canvasIndex)) {
      setIsRestorePending(true)
    } else {
      setIsRestorePending(false)
    }
  }, [canvasIndex, canvasStateStore])

  useFabricCanvasLifecycle({
    isActive: true,
    id,
    baseWidth,
    baseHeight,
    canvasIndex,
    isBookCover,
    bookCoverZones: isBookCover ? bookCoverZones : null,
    bookCoverDimensions: isBookCover ? bookCoverDimensions : null,
    marginGuide,
    isLeftPage,
    showGridRef,
    refs: {
      fabricCanvasRef,
      canvasMountRef,
      previousLogicalSizeRef,
      latestCanvasIndexRef,
      zoomRef,
      canvasStateStoreRef,
      onCanvasReadyRef: callbackRefs.onCanvasReadyRef,
      onActiveCanvasChangeRef: callbackRefs.onActiveCanvasChangeRef,
      onHasSelectionChangeRef: callbackRefs.onHasSelectionChangeRef,
      onSelectionInfoChangeRef: callbackRefs.onSelectionInfoChangeRef,
      onIsSelectionLockedChangeRef: callbackRefs.onIsSelectionLockedChangeRef,
      selectionContextMenuRef,
    },
    toolbarState,
    coverFit,
    setFabricSurfaceEpoch,
    setIsRestorePending,
  })

  useFabricCanvasPenTools({
    fabricCanvasRef,
    latestCanvasIndexRef,
    onActiveCanvasChangeRef: callbackRefs.onActiveCanvasChangeRef,
    isActive: true,
    isPenToolActive,
    isPencilToolActive,
    isEraseToolActive,
    isPenToolActiveRef,
    isPencilToolActiveRef,
    isEraseToolActiveRef,
    eraseBrushSizeRef,
    fabricSurfaceEpoch,
  })

  useLayoutEffect(() => {
    if (!isBookCover && !isIntersectingRef.current) return
    syncFabricDimensionsToZoom()
    const canvas = fabricCanvasRef.current
    if (!canvas) return
    const snapshot = getCanvasSelectionSnapshot(canvas)
    const groupingCapabilities = snapshot.hasSelection
      ? getCanvasSelectionGroupingCapabilities(canvas, snapshot.isLocked)
      : { canGroup: false, canUngroup: false }
    toolbarState.patch({
      position: snapshot.hasSelection ? getCanvasSelectionFloatingToolbarPosition(canvas) : null,
      canDelete: snapshot.hasSelection && !snapshot.isLocked,
      canGroup: groupingCapabilities.canGroup,
      canUngroup: groupingCapabilities.canUngroup,
      isLocked: snapshot.hasSelection && snapshot.isLocked,
      isTextSelection: snapshot.hasSelection && snapshot.selectionInfo.isText,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, displayWidth, displayHeight, isBookCover, syncFabricDimensionsToZoom])

  useEffect(() => {
    if (!isBookCover && !isIntersectingRef.current) return
    syncFabricDimensionsToZoom()
  }, [isBookCover, isIntersectingRef, syncFabricDimensionsToZoom])

  useEffect(() => {
    if (isBookCover) return
    const canvas = fabricCanvasRef.current
    if (!canvas) return
    canvas.backgroundColor = showGrid ? 'rgba(255,255,255,0)' : '#ffffff'
    canvas.requestRenderAll()
  }, [isBookCover, showGrid, fabricSurfaceEpoch, fabricCanvasRef])

  const dropHandlers = useFabricCanvasDropHandlers({
    fabricCanvasRef,
    canvasIndex,
    baseWidth,
    baseHeight,
    onActiveCanvasChangeRef: callbackRefs.onActiveCanvasChangeRef,
    syncFabricDimensionsToZoom,
    bookCover: {
      isBookCoverCanvas: isBookCover,
      shouldFitBookCoverDroppedImage: isBookCover && settings.fitDroppedImagesToPage,
      bookCoverZones,
      bookCoverDimensions,
    },
  })

  const {
    isDropTargetActive,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  } = dropHandlers

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const onDragEnter = (event: DragEvent): void => {
      handleDragEnter(event as unknown as React.DragEvent<HTMLDivElement>)
    }
    const onDragOver = (event: DragEvent): void => {
      handleDragOver(event as unknown as React.DragEvent<HTMLDivElement>)
    }
    const onDragLeave = (event: DragEvent): void => {
      handleDragLeave(event as unknown as React.DragEvent<HTMLDivElement>)
    }
    const onDrop = (event: DragEvent): void => {
      void handleDrop(event as unknown as React.DragEvent<HTMLDivElement>)
    }

    container.addEventListener('dragenter', onDragEnter, true)
    container.addEventListener('dragover', onDragOver, true)
    container.addEventListener('dragleave', onDragLeave, true)
    container.addEventListener('drop', onDrop, true)

    return () => {
      container.removeEventListener('dragenter', onDragEnter, true)
      container.removeEventListener('dragover', onDragOver, true)
      container.removeEventListener('dragleave', onDragLeave, true)
      container.removeEventListener('drop', onDrop, true)
    }
  }, [containerRef, handleDragEnter, handleDragOver, handleDragLeave, handleDrop])

  return (
    <>
      {showGrid && <CanvasGridOverlay zoom={zoom} />}
      <FabricCanvasOverlays
        isBookCover={isBookCover}
        isLeftPage={isLeftPage}
        zoom={zoom}
        showVisualGuide={settings.showVisualGuide}
        marginGuide={marginGuide}
        bookCoverDimensions={bookCoverDimensions}
        bookCoverZones={bookCoverZones}
        bookCoverGuideOpacity={bookCoverGuideOpacity}
        bookCoverPageCount={projectBookInfo.pageCount}
        bookCoverInfo={projectBookInfo}
        isDropTargetActive={isDropTargetActive}
        isLoading={isLoading}
        isRestorePending={isRestorePending}
      />
      <FabricCanvasSelectionControls
        toolbarState={toolbarState.state}
        toolbarActions={toolbarActions}
        coverFit={coverFit}
        selectionContextMenu={selectionContextMenu}
      />
    </>
  )
}
