import { ActiveSelection, util, type Canvas, type FabricObject } from 'fabric'

import { getActiveSelectionTargets } from '@/utils/canvas-selection'
import { normalizePastedTextObjects } from '@/utils/canvas-text'

const PASTE_OFFSET_BASE_PX = 16

type SerializedClipboardItem = {
  object: Record<string, unknown>
}

let serializedClipboard: SerializedClipboardItem[] | null = null
let pasteGeneration = 0

export function hasCanvasClipboard(): boolean {
  return serializedClipboard !== null && serializedClipboard.length > 0
}

export function copyActiveSelection(canvas: Canvas): void {
  const targets = getActiveSelectionTargets(canvas)
  if (targets.length === 0) return

  const serializedItems: SerializedClipboardItem[] = targets.map((target) => ({
    object: target.toObject() as Record<string, unknown>,
  }))

  if (serializedItems.length === 0) return
  pasteGeneration = 0
  serializedClipboard = serializedItems
}

function applyPasteOffset(target: FabricObject, step: number): void {
  const delta = PASTE_OFFSET_BASE_PX * step
  const left = typeof target.left === 'number' ? target.left : 0
  const top = typeof target.top === 'number' ? target.top : 0
  target.set({ left: left + delta, top: top + delta })
}

function readObjectsCenterPoint(objects: FabricObject[]): { x: number; y: number } | null {
  if (objects.length === 0) return null

  let minLeft = Number.POSITIVE_INFINITY
  let minTop = Number.POSITIVE_INFINITY
  let maxRight = Number.NEGATIVE_INFINITY
  let maxBottom = Number.NEGATIVE_INFINITY

  for (const obj of objects) {
    const rect = obj.getBoundingRect()
    if (!rect) continue

    const left = rect.left ?? 0
    const top = rect.top ?? 0
    const width = rect.width ?? 0
    const height = rect.height ?? 0

    minLeft = Math.min(minLeft, left)
    minTop = Math.min(minTop, top)
    maxRight = Math.max(maxRight, left + width)
    maxBottom = Math.max(maxBottom, top + height)
  }

  if (!Number.isFinite(minLeft) || !Number.isFinite(minTop)) return null
  return {
    x: (minLeft + maxRight) / 2,
    y: (minTop + maxBottom) / 2,
  }
}

function alignObjectsCenterToPoint(objects: FabricObject[], point: { x: number; y: number }): void {
  const center = readObjectsCenterPoint(objects)
  if (!center) return

  const deltaX = point.x - center.x
  const deltaY = point.y - center.y

  for (const obj of objects) {
    const left = typeof obj.left === 'number' ? obj.left : 0
    const top = typeof obj.top === 'number' ? obj.top : 0
    obj.set({ left: left + deltaX, top: top + deltaY })
  }
}

async function pasteFromClipboardInternal(
  canvas: Canvas,
  options: { alignCenterToCanvasPoint?: { x: number; y: number } },
): Promise<void> {
  if (!serializedClipboard?.length) return

  pasteGeneration += 1
  const step = pasteGeneration
  const snapshot = JSON.parse(JSON.stringify(serializedClipboard)) as SerializedClipboardItem[]

  try {
    const serializedObjects = snapshot.map((item) => item.object)
    const enlivened = (await util.enlivenObjects(serializedObjects)) as FabricObject[]
    const nextObjects = enlivened.filter(Boolean)
    if (nextObjects.length === 0) return

    await normalizePastedTextObjects(nextObjects)

    if (options.alignCenterToCanvasPoint) {
      alignObjectsCenterToPoint(nextObjects, options.alignCenterToCanvasPoint)
    }

    for (const obj of nextObjects) {
      applyPasteOffset(obj, step)
      canvas.add(obj)
    }

    if (nextObjects.length === 1) {
      canvas.setActiveObject(nextObjects[0])
    } else {
      canvas.setActiveObject(new ActiveSelection(nextObjects, { canvas }))
    }

    canvas.requestRenderAll()
  } catch (error) {
    console.error('pasteFromClipboard failed', error)
  }
}

export function pasteFromClipboard(canvas: Canvas): void {
  void pasteFromClipboardInternal(canvas, {})
}

export function pasteFromClipboardAtClientPoint(canvas: Canvas, clientX: number, clientY: number): void {
  if (!serializedClipboard?.length) return

  const rect = (canvas as any).upperCanvasEl?.getBoundingClientRect?.()
  if (!rect) return

  const localPoint = { x: clientX - rect.left, y: clientY - rect.top }
  const viewportTransform = canvas.viewportTransform ?? [1, 0, 0, 1, 0, 0]
  const inverseViewportTransform = util.invertTransform(viewportTransform)
  const pointer = util.transformPoint(localPoint, inverseViewportTransform)

  void pasteFromClipboardInternal(canvas, { alignCenterToCanvasPoint: { x: pointer.x, y: pointer.y } })
}
