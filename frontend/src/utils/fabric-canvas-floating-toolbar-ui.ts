import type { Canvas } from 'fabric'
import type { CanvasSelectionFloatingToolbarPosition } from '@/components/layout/CanvasSelectionFloatingToolbar'
import {
  canUngroupActiveSelection,
  getActiveSelectionTargets,
} from '@/utils/canvas-selection'

export function getCanvasSelectionFloatingToolbarPosition(
  canvas: Canvas,
): CanvasSelectionFloatingToolbarPosition | null {
  const activeObject = canvas.getActiveObject()
  if (!activeObject || activeObject.visible === false) return null

  activeObject.setCoords()
  const coords = activeObject.getCoords()
  if (coords.length === 0) return null

  const vpt = canvas.viewportTransform
  if (!vpt) return null

  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY

  for (const point of coords) {
    const x = point.x * vpt[0] + point.y * vpt[2] + vpt[4]
    const y = point.x * vpt[1] + point.y * vpt[3] + vpt[5]
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX)) {
    return null
  }

  return {
    left: (minX + maxX) / 2,
    top: minY,
  }
}

export function getCanvasSelectionGroupingCapabilities(
  canvas: Canvas,
  isLocked: boolean,
): { canGroup: boolean; canUngroup: boolean } {
  const canUngroup = !isLocked && canUngroupActiveSelection(canvas)

  return {
    canGroup: !canUngroup && !isLocked && getActiveSelectionTargets(canvas).length > 1,
    canUngroup,
  }
}
