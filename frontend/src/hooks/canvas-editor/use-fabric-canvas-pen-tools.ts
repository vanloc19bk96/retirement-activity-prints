import type { MutableRefObject, RefObject } from 'react'
import { useEffect } from 'react'
import type { Canvas } from 'fabric'

import { attachFabricEraserTool } from '@/utils/fabric-eraser-tool'
import { attachFabricPenTool } from '@/utils/fabric-pen-tool'
import { attachFabricPencilTool } from '@/utils/fabric-pencil-tool'

type UseFabricCanvasPenToolsOptions = {
  fabricCanvasRef: RefObject<Canvas | null>
  latestCanvasIndexRef: MutableRefObject<number>
  onActiveCanvasChangeRef: MutableRefObject<((canvasIndex: number) => void) | undefined>
  isActive: boolean
  isPenToolActive: boolean
  isPencilToolActive: boolean
  isEraseToolActive: boolean
  isPenToolActiveRef: MutableRefObject<boolean>
  isPencilToolActiveRef: MutableRefObject<boolean>
  isEraseToolActiveRef: MutableRefObject<boolean>
  eraseBrushSizeRef: MutableRefObject<number>
  /** Increments whenever a new Fabric surface is mounted; re-attach on change. */
  fabricSurfaceEpoch: number
}

/**
 * Wires pen/pencil tool lifecycles onto the Fabric canvas. Re-attaches on
 * tool toggle and when a fresh Fabric surface is mounted.
 */
export function useFabricCanvasPenTools({
  fabricCanvasRef,
  latestCanvasIndexRef,
  onActiveCanvasChangeRef,
  isActive,
  isPenToolActive,
  isPencilToolActive,
  isEraseToolActive,
  isPenToolActiveRef,
  isPencilToolActiveRef,
  isEraseToolActiveRef,
  eraseBrushSizeRef,
  fabricSurfaceEpoch,
}: UseFabricCanvasPenToolsOptions): void {
  useEffect(() => {
    if (!isActive) return
    const canvas = fabricCanvasRef.current
    if (!canvas) return

    let detachPen: (() => void) | undefined
    let detachPencil: (() => void) | undefined
    let detachEraser: (() => void) | undefined

    if (isPenToolActive) {
      canvas.discardActiveObject()
      canvas.defaultCursor = 'crosshair'
      canvas.skipTargetFind = true
      canvas.selection = false
      detachPen = attachFabricPenTool(canvas, {
        getIsActive: () => isPenToolActiveRef.current,
        onInteractionStart: () =>
          onActiveCanvasChangeRef.current?.(latestCanvasIndexRef.current),
      })
    } else if (isPencilToolActive) {
      canvas.discardActiveObject()
      detachPencil = attachFabricPencilTool(canvas, {
        getIsActive: () => isPencilToolActiveRef.current,
        onInteractionStart: () =>
          onActiveCanvasChangeRef.current?.(latestCanvasIndexRef.current),
      })
    } else if (isEraseToolActive) {
      canvas.discardActiveObject()
      detachEraser = attachFabricEraserTool(canvas, {
        getIsActive: () => isEraseToolActiveRef.current,
        getBrushSize: () => eraseBrushSizeRef.current,
        onInteractionStart: () =>
          onActiveCanvasChangeRef.current?.(latestCanvasIndexRef.current),
      })
    } else {
      canvas.defaultCursor = 'default'
      canvas.skipTargetFind = false
      canvas.selection = true
    }

    return () => {
      detachPen?.()
      detachPencil?.()
      detachEraser?.()
      const live = fabricCanvasRef.current
      if (live) {
        live.defaultCursor = 'default'
        live.skipTargetFind = false
        live.selection = true
      }
    }
  }, [
    fabricCanvasRef,
    isActive,
    isPenToolActive,
    isPencilToolActive,
    isEraseToolActive,
    isPenToolActiveRef,
    isPencilToolActiveRef,
    isEraseToolActiveRef,
    eraseBrushSizeRef,
    latestCanvasIndexRef,
    onActiveCanvasChangeRef,
    fabricSurfaceEpoch,
  ])
}
