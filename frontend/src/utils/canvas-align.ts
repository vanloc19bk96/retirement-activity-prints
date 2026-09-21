import { ActiveSelection, Point, type Canvas, type FabricObject } from 'fabric'

import { isFabricActiveSelection } from '@/utils/fabric-active-selection'
import { getActiveSelectionTargets } from '@/utils/canvas-selection'

export type CanvasAlign =
  | 'left'
  | 'center'
  | 'right'
  | 'top'
  | 'middle'
  | 'bottom'

export type CanvasSpaceEvenly = 'space-horizontal' | 'space-vertical'
export type CanvasTidyUp = 'tidy-up'
export type CanvasAlignmentAction = CanvasAlign | CanvasSpaceEvenly | CanvasTidyUp

type AlignTarget = FabricObject & {
  getObjects?: () => FabricObject[]
}

type TargetBounds = {
  left: number
  top: number
  width: number
  height: number
}

type SelectionEntry = {
  target: FabricObject
  rect: TargetBounds
}

type CanvasSceneBounds = {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

function getTargetBoundingRect(target: FabricObject): TargetBounds {
  const rect = target.getBoundingRect()
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
}

function getSelectionBounds(rects: TargetBounds[]): {
  minLeft: number
  maxRight: number
  minTop: number
  maxBottom: number
  width: number
  height: number
} {
  const minLeft = Math.min(...rects.map((r) => r.left))
  const maxRight = Math.max(...rects.map((r) => r.left + r.width))
  const minTop = Math.min(...rects.map((r) => r.top))
  const maxBottom = Math.max(...rects.map((r) => r.top + r.height))

  return {
    minLeft,
    maxRight,
    minTop,
    maxBottom,
    width: maxRight - minLeft,
    height: maxBottom - minTop,
  }
}

function moveTargetByDelta(target: FabricObject, deltaX: number, deltaY: number): void {
  if (deltaX === 0 && deltaY === 0) return
  const center = target.getCenterPoint()
  target.setPositionByOrigin(new Point(center.x + deltaX, center.y + deltaY), 'center', 'center')
  target.setCoords()
}

function restoreActiveSelection(canvas: Canvas, targets: FabricObject[]): void {
  if (targets.length === 1) {
    canvas.setActiveObject(targets[0])
  } else {
    canvas.setActiveObject(new ActiveSelection(targets, { canvas }))
  }
  canvas.requestRenderAll()
}

function getCanvasSceneBounds(canvas: Canvas): CanvasSceneBounds {
  const viewportTransform = canvas.viewportTransform ?? [1, 0, 0, 1, 0, 0]
  const zoomX = viewportTransform[0] || 1
  const zoomY = viewportTransform[3] || 1
  const translateX = viewportTransform[4] || 0
  const translateY = viewportTransform[5] || 0
  const left = -translateX / zoomX
  const top = -translateY / zoomY
  const width = canvas.getWidth() / zoomX
  const height = canvas.getHeight() / zoomY

  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
  }
}

function getClampDeltaToCanvas(args: {
  selectionBounds: ReturnType<typeof getSelectionBounds>
  canvasBounds: CanvasSceneBounds
  axis: 'x' | 'y' | 'both'
}): { deltaX: number; deltaY: number } {
  const { selectionBounds, canvasBounds, axis } = args
  let deltaX = 0
  let deltaY = 0

  if (axis === 'x' || axis === 'both') {
    if (selectionBounds.width > canvasBounds.width) {
      deltaX = canvasBounds.left - selectionBounds.minLeft
    } else if (selectionBounds.minLeft < canvasBounds.left) {
      deltaX = canvasBounds.left - selectionBounds.minLeft
    } else if (selectionBounds.maxRight > canvasBounds.right) {
      deltaX = canvasBounds.right - selectionBounds.maxRight
    }
  }

  if (axis === 'y' || axis === 'both') {
    if (selectionBounds.height > canvasBounds.height) {
      deltaY = canvasBounds.top - selectionBounds.minTop
    } else if (selectionBounds.minTop < canvasBounds.top) {
      deltaY = canvasBounds.top - selectionBounds.minTop
    } else if (selectionBounds.maxBottom > canvasBounds.bottom) {
      deltaY = canvasBounds.bottom - selectionBounds.maxBottom
    }
  }

  return { deltaX, deltaY }
}

function clampTargetsToCanvas(
  canvas: Canvas,
  targets: FabricObject[],
  axis: 'x' | 'y' | 'both',
): void {
  if (targets.length === 0) return
  const selectionBounds = getSelectionBounds(targets.map((target) => getTargetBoundingRect(target)))
  const { deltaX, deltaY } = getClampDeltaToCanvas({
    selectionBounds,
    canvasBounds: getCanvasSceneBounds(canvas),
    axis,
  })
  if (deltaX === 0 && deltaY === 0) return

  for (const target of targets) {
    moveTargetByDelta(target, deltaX, deltaY)
  }
}

function getAlignDeltas(args: {
  canvas: Canvas
  targetRect: { left: number; top: number; width: number; height: number }
  align: CanvasAlign
}): { deltaX: number; deltaY: number } {
  const canvasBounds = getCanvasSceneBounds(args.canvas)

  const desiredLeft =
    args.align === 'left'
      ? canvasBounds.left
      : args.align === 'center'
        ? canvasBounds.left + (canvasBounds.width - args.targetRect.width) / 2
        : args.align === 'right'
          ? canvasBounds.right - args.targetRect.width
          : args.targetRect.left

  const desiredTop =
    args.align === 'top'
      ? canvasBounds.top
      : args.align === 'middle'
        ? canvasBounds.top + (canvasBounds.height - args.targetRect.height) / 2
        : args.align === 'bottom'
          ? canvasBounds.bottom - args.targetRect.height
          : args.targetRect.top

  return {
    deltaX: desiredLeft - args.targetRect.left,
    deltaY: desiredTop - args.targetRect.top,
  }
}

function getRelativeAlignDeltas(args: {
  rect: { left: number; top: number; width: number; height: number }
  align: CanvasAlign
  minLeft: number
  maxRight: number
  minTop: number
  maxBottom: number
  centerX: number
  centerY: number
}): { deltaX: number; deltaY: number } {
  const { rect, align, minLeft, maxRight, minTop, maxBottom, centerX, centerY } = args
  let deltaX = 0
  let deltaY = 0

  if (align === 'left') deltaX = minLeft - rect.left
  else if (align === 'right') deltaX = maxRight - rect.width - rect.left
  else if (align === 'center') deltaX = centerX - rect.width / 2 - rect.left

  if (align === 'top') deltaY = minTop - rect.top
  else if (align === 'bottom') deltaY = maxBottom - rect.height - rect.top
  else if (align === 'middle') deltaY = centerY - rect.height / 2 - rect.top

  return { deltaX, deltaY }
}

/**
 * Align each selected object to the union bounds of the selection (not the canvas).
 * Discards ActiveSelection so positions are updated in the canvas plane, then re-selects.
 */
function alignMultipleObjectsRelativeToEachOther(canvas: Canvas, align: CanvasAlign): void {
  const targets = getActiveSelectionTargets(canvas)
  if (targets.length < 2) return

  canvas.discardActiveObject()

  const rects = targets.map((obj) => getTargetBoundingRect(obj))
  const { minLeft, maxRight, minTop, maxBottom } = getSelectionBounds(rects)
  const centerX = (minLeft + maxRight) / 2
  const centerY = (minTop + maxBottom) / 2

  for (let i = 0; i < targets.length; i++) {
    const obj = targets[i]
    const rect = rects[i]
    const { deltaX, deltaY } = getRelativeAlignDeltas({
      rect,
      align,
      minLeft,
      maxRight,
      minTop,
      maxBottom,
      centerX,
      centerY,
    })
    moveTargetByDelta(obj, deltaX, deltaY)
  }

  restoreActiveSelection(canvas, targets)
}

function getSelectionEntries(targets: FabricObject[]): SelectionEntry[] {
  return targets.map((target) => ({ target, rect: getTargetBoundingRect(target) }))
}

function distributeEntriesEvenly(args: {
  entries: SelectionEntry[]
  bounds: ReturnType<typeof getSelectionBounds>
  direction: CanvasSpaceEvenly
  alignCrossAxis?: boolean
}): void {
  const { entries, bounds, direction, alignCrossAxis = false } = args
  if (direction === 'space-horizontal') {
    const sorted = [...entries].sort((a, b) => a.rect.left - b.rect.left || a.rect.top - b.rect.top)
    const totalWidth = sorted.reduce((sum, entry) => sum + entry.rect.width, 0)
    // Allow negative gap when widths overlap the selection span so the rightmost edge
    // stays at maxRight; Math.max(0, …) used to expand past bounds and push objects off-canvas.
    const gap = (bounds.width - totalWidth) / (sorted.length - 1)
    const targetCenterY = bounds.minTop + bounds.height / 2
    let nextLeft = bounds.minLeft

    for (const entry of sorted) {
      const deltaY = alignCrossAxis ? targetCenterY - (entry.rect.top + entry.rect.height / 2) : 0
      moveTargetByDelta(entry.target, nextLeft - entry.rect.left, deltaY)
      nextLeft += entry.rect.width + gap
    }
  } else {
    const sorted = [...entries].sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left)
    const totalHeight = sorted.reduce((sum, entry) => sum + entry.rect.height, 0)
    const gap = (bounds.height - totalHeight) / (sorted.length - 1)
    const targetCenterX = bounds.minLeft + bounds.width / 2
    let nextTop = bounds.minTop

    for (const entry of sorted) {
      const deltaX = alignCrossAxis ? targetCenterX - (entry.rect.left + entry.rect.width / 2) : 0
      moveTargetByDelta(entry.target, deltaX, nextTop - entry.rect.top)
      nextTop += entry.rect.height + gap
    }
  }
}

function distributeMultipleObjectsEvenly(canvas: Canvas, direction: CanvasSpaceEvenly): void {
  const targets = getActiveSelectionTargets(canvas)
  if (targets.length < 3) return

  const entries = getSelectionEntries(targets)
  const bounds = getSelectionBounds(entries.map((entry) => entry.rect))
  canvas.discardActiveObject()

  distributeEntriesEvenly({ entries, bounds, direction })
  clampTargetsToCanvas(canvas, targets, direction === 'space-horizontal' ? 'x' : 'y')

  restoreActiveSelection(canvas, targets)
}

function getDominantSpaceDirection(entries: SelectionEntry[]): CanvasSpaceEvenly {
  const centerXs = entries.map((entry) => entry.rect.left + entry.rect.width / 2)
  const centerYs = entries.map((entry) => entry.rect.top + entry.rect.height / 2)
  const centerSpreadX = Math.max(...centerXs) - Math.min(...centerXs)
  const centerSpreadY = Math.max(...centerYs) - Math.min(...centerYs)

  return centerSpreadX >= centerSpreadY ? 'space-horizontal' : 'space-vertical'
}

function tidyUpMultipleObjects(canvas: Canvas): void {
  const targets = getActiveSelectionTargets(canvas)
  if (targets.length < 3) return

  const entries = getSelectionEntries(targets)
  const bounds = getSelectionBounds(entries.map((entry) => entry.rect))
  const direction = getDominantSpaceDirection(entries)

  canvas.discardActiveObject()

  distributeEntriesEvenly({
    entries,
    bounds,
    direction,
    alignCrossAxis: true,
  })
  clampTargetsToCanvas(canvas, targets, 'both')

  restoreActiveSelection(canvas, targets)
}

export function alignActiveToCanvas(canvas: Canvas, align: CanvasAlignmentAction): void {
  if (align === 'space-horizontal' || align === 'space-vertical') {
    distributeMultipleObjectsEvenly(canvas, align)
    return
  }

  if (align === 'tidy-up') {
    tidyUpMultipleObjects(canvas)
    return
  }

  const target = canvas.getActiveObject() as AlignTarget | null
  if (!target) return

  if (isFabricActiveSelection(target)) {
    const objects = (target.getObjects?.() ?? []) as FabricObject[]
    if (objects.length >= 2) {
      alignMultipleObjectsRelativeToEachOther(canvas, align)
      return
    }
  }

  const targetRect = getTargetBoundingRect(target)
  const { deltaX, deltaY } = getAlignDeltas({ canvas, targetRect, align })
  if (deltaX === 0 && deltaY === 0) return

  // ActiveSelection with a single object: move the wrapper like before.
  if (isFabricActiveSelection(target)) {
    target.set({
      left: (target.left ?? 0) + deltaX,
      top: (target.top ?? 0) + deltaY,
    })

    for (const obj of target.getObjects() ?? []) {
      obj.setCoords()
    }
    target.setCoords()
    canvas.requestRenderAll()
    return
  }

  target.set({
    left: (target.left ?? 0) + deltaX,
    top: (target.top ?? 0) + deltaY,
  })
  target.setCoords()
  canvas.requestRenderAll()
}

/**
 * Nudge the current selection by canvas-space deltas (e.g. arrow keys).
 * Skips when any editable text object is in inline editing mode.
 */
export function nudgeActiveSelection(canvas: Canvas, deltaX: number, deltaY: number): void {
  if (deltaX === 0 && deltaY === 0) return

  const active = canvas.getActiveObject() as AlignTarget | null
  if (!active) return

  const targets = getActiveSelectionTargets(canvas)
  if (targets.length === 0) return

  for (const t of targets) {
    if ((t as { isEditing?: boolean }).isEditing) return
  }

  const multi =
    isFabricActiveSelection(active) && (active.getObjects?.().length ?? 0) > 1

  if (multi) {
    canvas.discardActiveObject()
    for (const target of targets) {
      moveTargetByDelta(target, deltaX, deltaY)
    }
    restoreActiveSelection(canvas, targets)
    return
  }

  active.set({
    left: (active.left ?? 0) + deltaX,
    top: (active.top ?? 0) + deltaY,
  })
  if (isFabricActiveSelection(active)) {
    for (const obj of active.getObjects() ?? []) {
      obj.setCoords()
    }
  }
  active.setCoords()
  canvas.requestRenderAll()
}
