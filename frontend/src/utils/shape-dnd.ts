import { beginDndDragCursor } from '@/utils/dnd-cursor'

export type DroppedShapePayload = {
  shapeType: ShapeType
  label: string
}

export type ShapeType =
  | 'rectangle'
  | 'circle'
  | 'triangle'
  | 'star'
  | 'heart'
  | 'pentagon'
  | 'hexagon'
  | 'octagon'
  | 'line'
  | 'arrow'
  | 'cloud'
  | 'diamond'
  | 'star6'
  | 'ellipse'
  | 'trapezoid'
  | 'parallelogram'
  | 'cross'
  | 'crescent'
  | 'heptagon'
  | 'nonagon'
  | 'decagon'
  | 'star4'
  | 'star8'
  | 'rhombus'
  | 'kite'
  | 'chevron'
  | 'rightTriangle'
  | 'semicircle'
  | 'quarterCircle'
  | 'ring'
  | 'arc'
  | 'sector'
  | 'plus'
  | 'xShape'

export const SHAPE_DND_MIME = 'application/x-book-editor-shape'

export function setShapeDragData(dataTransfer: DataTransfer, payload: DroppedShapePayload): void {
  beginDndDragCursor()
  dataTransfer.effectAllowed = 'copy'
  dataTransfer.setData(SHAPE_DND_MIME, JSON.stringify(payload))
  // Keep plain text empty so image drop handlers don't interpret labels as URLs.
  dataTransfer.setData('text/plain', '')
}

export function getDroppedShapePayload(dataTransfer: DataTransfer): DroppedShapePayload | null {
  const raw = dataTransfer.getData(SHAPE_DND_MIME)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<DroppedShapePayload>
    if (typeof parsed?.shapeType !== 'string') return null
    if (typeof parsed?.label !== 'string' || parsed.label.length === 0) return null
    return { shapeType: parsed.shapeType as ShapeType, label: parsed.label }
  } catch {
    return null
  }
}

