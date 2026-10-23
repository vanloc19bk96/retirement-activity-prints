import { useCallback, useEffect, useRef } from 'react'
import type { Canvas, FabricObject } from 'fabric'

import { drawFabricHoverBoundingBox, shouldShowHoverBoundingBox } from '@/utils/fabric-canvas-hover-box'

/**
 * Outlines one object on the canvas while the user points at it from a side panel (a layer row,
 * a check result), the same outline hovering the object itself shows.
 */
export function useCanvasObjectHighlight(canvas: Canvas | null): (object: FabricObject | null) => void {
  const highlightedRef = useRef<FabricObject | null>(null)

  useEffect(() => {
    if (!canvas) return
    const draw = (opt: { ctx?: CanvasRenderingContext2D }): void => {
      const target = highlightedRef.current
      if (!opt.ctx || !target || !canvas.getObjects().includes(target)) return
      if (shouldShowHoverBoundingBox(canvas, target)) drawFabricHoverBoundingBox(opt.ctx, canvas, target)
    }
    canvas.on('after:render', draw)
    return () => {
      canvas.off('after:render', draw)
      if (highlightedRef.current) {
        highlightedRef.current = null
        canvas.requestRenderAll()
      }
    }
  }, [canvas])

  return useCallback(
    (object: FabricObject | null): void => {
      if (highlightedRef.current === object) return
      highlightedRef.current = object
      canvas?.requestRenderAll()
    },
    [canvas],
  )
}
