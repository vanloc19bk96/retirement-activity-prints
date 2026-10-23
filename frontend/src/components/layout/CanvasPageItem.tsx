import { memo, useRef } from 'react'
import type { Canvas } from 'fabric'

import { CanvasLoadingOverlay } from './CanvasLoadingOverlay'
import { FabricCanvasItemActive } from './FabricCanvasItemActive'

import { useEditorZoomRef } from '@/context/EditorZoomContext'
import { useFabricCanvasVisibility } from '@/hooks/canvas-editor/use-fabric-canvas-visibility'
import { useFabricCanvasZoomSync } from '@/hooks/canvas-editor/use-fabric-canvas-zoom-sync'
import { EDITOR_CANVAS_SIZE_STYLE } from '@/constants/editor-zoom-css'

import type { FabricCanvasItemProps } from '@/types/fabric-canvas-item.types'

export const MAX_EDITOR_INTERIOR_PAGES = 1000

export const CanvasPageItem = memo(function CanvasPageItem({
  width,
  height,
  id,
  isBookCover = false,
  canvasIndex = 0,
  canvasStateStore,
  ...activeProps
}: FabricCanvasItemProps): JSX.Element {
  const baseWidth = width ?? 800
  const baseHeight = height ?? 600

  const containerRef = useRef<HTMLDivElement>(null)
  const canvasMountRef = useRef<HTMLDivElement>(null)
  const fabricCanvasRef = useRef<Canvas | null>(null)
  const zoomRef = useEditorZoomRef()

  const syncFabricDimensionsToZoom = useFabricCanvasZoomSync({
    fabricCanvasRef,
    baseWidth,
    baseHeight,
    zoomRef,
  })

  const { isActive, isIntersectingRef } = useFabricCanvasVisibility({
    containerRef,
    fabricCanvasRef,
    isBookCover,
    onVisibleSyncDimensions: syncFabricDimensionsToZoom,
  })

  const hasPersistedCanvas = Boolean(canvasStateStore?.has(canvasIndex))
  const showQueuedRestoreOverlay = !isBookCover && !isActive && hasPersistedCanvas

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label="Canvas"
      className="canvas-paper relative bg-white outline-none focus:outline-none"
      style={EDITOR_CANVAS_SIZE_STYLE}
    >
      <div
        ref={canvasMountRef}
        className="relative z-[1]"
        style={EDITOR_CANVAS_SIZE_STYLE}
      />
      {showQueuedRestoreOverlay ? <CanvasLoadingOverlay /> : null}
      {isActive ? (
        <FabricCanvasItemActive
          {...activeProps}
          id={id}
          isBookCover={isBookCover}
          canvasIndex={canvasIndex}
          canvasStateStore={canvasStateStore}
          baseWidth={baseWidth}
          baseHeight={baseHeight}
          containerRef={containerRef}
          canvasMountRef={canvasMountRef}
          fabricCanvasRef={fabricCanvasRef}
          isIntersectingRef={isIntersectingRef}
        />
      ) : null}
    </div>
  )
})
