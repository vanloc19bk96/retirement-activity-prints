import type { Canvas, FabricObject } from 'fabric'
import { isEventTargetInCurrentSelection } from '@/utils/fabric-selection'

const HOVER_BOUNDING_BOX_COLOR = '#3b82f6'
const HOVER_BOUNDING_BOX_WIDTH_PX = 2

function isLineShape(target: FabricObject): boolean {
  const customShapeType = (target as FabricObject & { customShapeType?: string }).customShapeType
  return target.type === 'line' || customShapeType === 'line'
}

export function shouldShowHoverBoundingBox(
  canvas: Canvas,
  target: FabricObject | null,
): target is FabricObject {
  if (!target) return false
  if (target.visible === false) return false
  // Line shapes use endpoint controls instead of a bounding box (Canva-style).
  if (isLineShape(target)) return false
  if (isEventTargetInCurrentSelection(canvas, target)) return false
  return true
}

export function drawFabricHoverBoundingBox(
  ctx: CanvasRenderingContext2D,
  canvas: Canvas,
  target: FabricObject,
): void {
  const vpt = canvas.viewportTransform
  if (!vpt) return

  const coords = target.getCoords()
  if (coords.length < 4) return

  const zoomX = Math.abs(vpt[0]) || 1
  const zoomY = Math.abs(vpt[3]) || zoomX
  const strokeWidth = HOVER_BOUNDING_BOX_WIDTH_PX / Math.max(zoomX, zoomY)

  ctx.save()
  ctx.transform(vpt[0], vpt[1], vpt[2], vpt[3], vpt[4], vpt[5])
  ctx.strokeStyle = HOVER_BOUNDING_BOX_COLOR
  ctx.lineWidth = strokeWidth
  ctx.setLineDash([])
  ctx.lineJoin = 'miter'
  ctx.beginPath()
  ctx.moveTo(coords[0].x, coords[0].y)
  for (let i = 1; i < coords.length; i += 1) {
    ctx.lineTo(coords[i].x, coords[i].y)
  }
  ctx.closePath()
  ctx.stroke()
  ctx.restore()
}
