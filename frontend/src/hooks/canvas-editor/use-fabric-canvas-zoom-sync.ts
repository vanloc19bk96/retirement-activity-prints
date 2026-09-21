import type { MutableRefObject, RefObject } from 'react'
import { useCallback, useEffect, useRef } from 'react'
import type { Canvas } from 'fabric'

type UseFabricCanvasZoomSyncOptions = {
  fabricCanvasRef: RefObject<Canvas | null>
  baseWidth: number
  baseHeight: number
  zoomRef: MutableRefObject<number>
}

const EDITABLE_TEXT_OBJECT_TYPES = new Set(['textbox', 'i-text', 'text'])

// Delay before running the expensive snap + crispness pass. Coalesces the rapid
// zoom ticks fired while dragging the slider / scrolling so they cost one pass.
const CRISPNESS_SETTLE_DELAY_MS = 120

function walkNestedFabricObjects(objects: unknown[], visit: (obj: { type?: string; set?: (props: Record<string, unknown>) => void }) => void): void {
  for (const raw of objects) {
    const obj = raw as { type?: string; getObjects?: () => unknown[]; set?: (props: Record<string, unknown>) => void }
    const children = typeof obj.getObjects === 'function' ? obj.getObjects() : undefined
    if (children && children.length > 0) walkNestedFabricObjects(children, visit)
    visit(obj)
  }
}

/** Force vector text rendering so editable text stays crisp at any zoom. */
function applyCanvasCrispness(canvas: Canvas): void {
  walkNestedFabricObjects(canvas.getObjects(), (obj) => {
    if (!obj.type || !EDITABLE_TEXT_OBJECT_TYPES.has(obj.type)) return
    obj.set?.({ objectCaching: false, noScaleCache: true })
  })

  canvas.requestRenderAll()
}

/**
 * Returns a stable callback that keeps Fabric's canvas dimensions and viewport
 * transform aligned with the current zoom. The cheap resize runs immediately for
 * smooth zooming; the expensive snap + crispness pass is debounced so dragging
 * the zoom across many canvases stays smooth. No-ops when nothing would change.
 */
export function useFabricCanvasZoomSync({
  fabricCanvasRef,
  baseWidth,
  baseHeight,
  zoomRef,
}: UseFabricCanvasZoomSyncOptions): () => void {
  const crispnessTimerRef = useRef<number | null>(null)

  const scheduleCrispnessPass = useCallback((): void => {
    if (crispnessTimerRef.current !== null) {
      window.clearTimeout(crispnessTimerRef.current)
    }
    crispnessTimerRef.current = window.setTimeout(() => {
      crispnessTimerRef.current = null
      const canvas = fabricCanvasRef.current
      if (canvas) applyCanvasCrispness(canvas)
    }, CRISPNESS_SETTLE_DELAY_MS)
  }, [fabricCanvasRef])

  useEffect(() => {
    return () => {
      if (crispnessTimerRef.current !== null) window.clearTimeout(crispnessTimerRef.current)
    }
  }, [])

  return useCallback((): void => {
    const canvas = fabricCanvasRef.current
    if (!canvas) return
    const z = zoomRef.current
    const dw = Math.round(baseWidth * z)
    const dh = Math.round(baseHeight * z)

    if (
      canvas.getWidth() === dw &&
      canvas.getHeight() === dh &&
      Math.abs(canvas.getZoom() - z) < 0.001
    ) {
      return
    }

    canvas.setDimensions({ width: dw, height: dh })
    canvas.setViewportTransform([z, 0, 0, z, 0, 0])
    canvas.requestRenderAll()

    // Defer the expensive snap + crispness walk until zoom settles.
    scheduleCrispnessPass()
  }, [baseHeight, baseWidth, fabricCanvasRef, zoomRef, scheduleCrispnessPass])
}
