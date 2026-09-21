/**
 * Freehand pencil using Fabric's drawing mode ({@link PencilBrush}).
 */
import type { Canvas, FabricObject } from 'fabric'
import { PencilBrush } from 'fabric'
import { getFabricCanvasHistoryManager } from '@/utils/fabric-canvas-history'

const PENCIL_STROKE = '#0f172a'
const PENCIL_WIDTH = 2

export type AttachFabricPencilToolOptions = {
  getIsActive: () => boolean
  /** Called when the user presses on the canvas while pencil mode is on (e.g. mark editor focus). */
  onInteractionStart?: () => void
}

export function attachFabricPencilTool(canvas: Canvas, options: AttachFabricPencilToolOptions): () => void {
  const prevDrawingMode = canvas.isDrawingMode
  const prevBrush = canvas.freeDrawingBrush
  const prevSkipTargetFind = canvas.skipTargetFind
  const prevSelection = canvas.selection
  const prevCursor = canvas.defaultCursor

  const brush = new PencilBrush(canvas)
  brush.color = PENCIL_STROKE
  brush.width = PENCIL_WIDTH
  brush.strokeLineCap = 'round'
  brush.strokeLineJoin = 'round'
  brush.straightLineKey = null

  const history = getFabricCanvasHistoryManager(canvas)
  history?.suspend()

  canvas.freeDrawingBrush = brush
  canvas.isDrawingMode = true
  canvas.defaultCursor = 'crosshair'
  canvas.skipTargetFind = true
  canvas.selection = false

  const onMouseDown = (): void => {
    if (!options.getIsActive() || !canvas.isDrawingMode) return
    options.onInteractionStart?.()
  }

  const onPathCreated = (evt: { path: FabricObject }): void => {
    evt.path.set({ strokeUniform: true, objectCaching: false })
    canvas.requestRenderAll()
    // Resume so the completed stroke is captured, then re-suspend for the next stroke.
    history?.resume()
    history?.recordSnapshot()
    history?.suspend()
  }

  canvas.on('mouse:down', onMouseDown)
  canvas.on('path:created', onPathCreated)

  return () => {
    canvas.off('mouse:down', onMouseDown)
    canvas.off('path:created', onPathCreated)
    history?.resume()
    canvas.isDrawingMode = prevDrawingMode
    canvas.freeDrawingBrush = prevBrush
    canvas.skipTargetFind = prevSkipTargetFind
    canvas.selection = prevSelection
    canvas.defaultCursor = prevCursor
  }
}
