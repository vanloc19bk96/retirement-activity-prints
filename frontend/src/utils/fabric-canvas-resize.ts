import { StaticCanvas, type Canvas, type StaticCanvas as FabricStaticCanvas } from 'fabric'

import type { CanvasLogicalSize } from '@/types/fabric-canvas-item.types'
import { CUSTOM_OBJECT_PROPS } from '@/utils/canvas-state-store'
import { remeasureAllFabricEditableTextOnCanvas, upgradeInteractiveTextToTextbox } from '@/utils/canvas-text'

type FabricCanvasSurface = Canvas | FabricStaticCanvas

type CanvasTargetArea = {
  left: number
  top: number
  width: number
  height: number
}

function isPositiveFiniteNumber(value: number): boolean {
  return Number.isFinite(value) && value > 0
}

function isValidTargetArea(value: CanvasTargetArea): boolean {
  return (
    Number.isFinite(value.left) &&
    Number.isFinite(value.top) &&
    isPositiveFiniteNumber(value.width) &&
    isPositiveFiniteNumber(value.height)
  )
}

function getObjectsBounds(
  canvas: FabricCanvasSurface,
): { left: number; top: number; width: number; height: number } | null {
  const objects = canvas.getObjects()
  if (objects.length === 0) return null

  let minLeft = Number.POSITIVE_INFINITY
  let minTop = Number.POSITIVE_INFINITY
  let maxRight = Number.NEGATIVE_INFINITY
  let maxBottom = Number.NEGATIVE_INFINITY

  for (const object of objects) {
    const bounds = object.getBoundingRect()
    if (
      !Number.isFinite(bounds.left) ||
      !Number.isFinite(bounds.top) ||
      !isPositiveFiniteNumber(bounds.width) ||
      !isPositiveFiniteNumber(bounds.height)
    ) {
      continue
    }

    minLeft = Math.min(minLeft, bounds.left)
    minTop = Math.min(minTop, bounds.top)
    maxRight = Math.max(maxRight, bounds.left + bounds.width)
    maxBottom = Math.max(maxBottom, bounds.top + bounds.height)
  }

  if (
    !Number.isFinite(minLeft) ||
    !Number.isFinite(minTop) ||
    !Number.isFinite(maxRight) ||
    !Number.isFinite(maxBottom)
  ) {
    return null
  }

  return { left: minLeft, top: minTop, width: maxRight - minLeft, height: maxBottom - minTop }
}

function moveAllObjectsBy(canvas: FabricCanvasSurface, deltaX: number, deltaY: number): void {
  if (deltaX === 0 && deltaY === 0) return
  for (const object of canvas.getObjects()) {
    object.set({
      left: (object.left ?? 0) + deltaX,
      top: (object.top ?? 0) + deltaY,
    })
    object.setCoords()
  }
}

function scaleAllObjectsFromOrigin(
  canvas: FabricCanvasSurface,
  scale: number,
  originX: number,
  originY: number,
): void {
  if (!isPositiveFiniteNumber(scale) || scale === 1) return
  for (const object of canvas.getObjects()) {
    object.set({
      left: originX + ((object.left ?? 0) - originX) * scale,
      top: originY + ((object.top ?? 0) - originY) * scale,
      scaleX: (object.scaleX ?? 1) * scale,
      scaleY: (object.scaleY ?? 1) * scale,
    })
    object.setCoords()
  }
}

function fitAllObjectsWithinArea(canvas: FabricCanvasSurface, targetArea: CanvasTargetArea): void {
  let bounds = getObjectsBounds(canvas)
  if (!bounds) return

  // Allow scaling up as well: after a page size change with a different aspect ratio,
  // uniform resize can leave extra whitespace in one direction. We maximize usage of
  // the target area while preserving relative object layout (uniform scale).
  const fitRatio = Math.min(targetArea.width / bounds.width, targetArea.height / bounds.height)
  if (isPositiveFiniteNumber(fitRatio) && Math.abs(fitRatio - 1) > 0.0001) {
    scaleAllObjectsFromOrigin(canvas, fitRatio, bounds.left, bounds.top)
    bounds = getObjectsBounds(canvas)
    if (!bounds) return
  }

  const currentCenterX = bounds.left + bounds.width / 2
  const currentCenterY = bounds.top + bounds.height / 2
  const targetCenterX = targetArea.left + targetArea.width / 2
  const targetCenterY = targetArea.top + targetArea.height / 2
  moveAllObjectsBy(canvas, targetCenterX - currentCenterX, targetCenterY - currentCenterY)

  bounds = getObjectsBounds(canvas)
  if (!bounds) return

  let offsetX = 0
  let offsetY = 0
  if (bounds.left < targetArea.left) offsetX = targetArea.left - bounds.left
  if (bounds.top < targetArea.top) offsetY = targetArea.top - bounds.top
  if (bounds.left + bounds.width > targetArea.left + targetArea.width) {
    offsetX -= bounds.left + bounds.width - (targetArea.left + targetArea.width)
  }
  if (bounds.top + bounds.height > targetArea.top + targetArea.height) {
    offsetY -= bounds.top + bounds.height - (targetArea.top + targetArea.height)
  }
  moveAllObjectsBy(canvas, offsetX, offsetY)
}

/**
 * Rescale all canvas objects proportionally when the canvas logical dimensions
 * change, keeping relative positions intact, then ensure everything fits
 * within the target safe area (with an optional inset margin so content
 * doesn't sit flush against the edges).
 */
export function scaleAndClampCanvasObjects(
  canvas: FabricCanvasSurface,
  previousSize: CanvasLogicalSize,
  nextSize: CanvasLogicalSize,
  options: { targetArea?: CanvasTargetArea; insetMargin?: number; skipFitWithinArea?: boolean } = {},
): void {
  if (previousSize.width <= 0 || previousSize.height <= 0) return
  if (nextSize.width <= 0 || nextSize.height <= 0) return

  const uniformRatio = Math.min(
    nextSize.width / previousSize.width,
    nextSize.height / previousSize.height,
  )

  if (isPositiveFiniteNumber(uniformRatio) && uniformRatio !== 1) {
    scaleAllObjectsFromOrigin(canvas, uniformRatio, 0, 0)
  }

  const defaultArea: CanvasTargetArea = { left: 0, top: 0, width: nextSize.width, height: nextSize.height }
  let targetArea = options.targetArea && isValidTargetArea(options.targetArea) ? options.targetArea : defaultArea

  const inset = options.insetMargin ?? 0
  if (inset > 0) {
    const insetArea: CanvasTargetArea = {
      left: targetArea.left + inset,
      top: targetArea.top + inset,
      width: targetArea.width - inset * 2,
      height: targetArea.height - inset * 2,
    }
    if (isValidTargetArea(insetArea)) targetArea = insetArea
  }

  if (!options.skipFitWithinArea) {
    fitAllObjectsWithinArea(canvas, targetArea)
  }
}

/**
 * Rescale a serialized Fabric canvas snapshot when page logical dimensions change.
 * Used for off-screen pages so export/thumbnails stay print-ready without mounting Fabric.
 */
export async function scaleSerializedCanvasJsonForPageResize(
  canvasJson: object,
  previousSize: CanvasLogicalSize,
  nextSize: CanvasLogicalSize,
  options: { targetArea?: CanvasTargetArea; insetMargin?: number; skipFitWithinArea?: boolean } = {},
): Promise<object> {
  if (typeof document === 'undefined') return canvasJson
  if (previousSize.width <= 0 || previousSize.height <= 0) return canvasJson
  if (nextSize.width <= 0 || nextSize.height <= 0) return canvasJson
  if (previousSize.width === nextSize.width && previousSize.height === nextSize.height) {
    return canvasJson
  }

  const element = document.createElement('canvas')
  const canvas = new StaticCanvas(element, {
    width: previousSize.width,
    height: previousSize.height,
    backgroundColor: '#ffffff',
  })

  try {
    await canvas.loadFromJSON(canvasJson)
    await upgradeInteractiveTextToTextbox(canvas as Canvas)
    scaleAndClampCanvasObjects(canvas, previousSize, nextSize, options)
    canvas.setDimensions({ width: nextSize.width, height: nextSize.height })
    remeasureAllFabricEditableTextOnCanvas(canvas)
    return canvas.toObject(CUSTOM_OBJECT_PROPS as unknown as string[])
  } catch {
    return canvasJson
  } finally {
    void canvas.dispose()
  }
}
