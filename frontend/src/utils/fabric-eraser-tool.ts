import type { Canvas, FabricObject, Path } from 'fabric'
import { PencilBrush } from 'fabric'

import type { EraserBakedImage } from '@/types/eraser-types'
import { getFabricCanvasHistoryManager } from '@/utils/fabric-canvas-history'
import {
  appendEraserStrokeToImage,
  buildEraserStrokeRecord,
  pickTopImageUnderEraserPath,
} from '@/utils/fabric-eraser-bake'

type AttachFabricEraserToolOptions = {
  getIsActive: () => boolean
  getBrushSize: () => number
  onInteractionStart?: () => void
}

const MIN_BRUSH_PIXEL_WIDTH = 2
const CURSOR_STROKE_WIDTH = 1.5
const CURSOR_HOTSPOT_PADDING = 4
const ERASER_BRUSH_PREVIEW_FILL = 'rgba(244, 63, 94, 0.35)'
const ERASER_CURSOR_FILL = 'rgba(13,107,99,0.12)'
const ERASER_CURSOR_STROKE = '#0D6B63'

function ensureObjectId(target: FabricObject): string {
  const objectWithId = target as FabricObject & { objectId?: string }
  if (typeof objectWithId.objectId === 'string' && objectWithId.objectId.length > 0) {
    return objectWithId.objectId
  }
  const nextId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `obj-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  objectWithId.objectId = nextId
  return nextId
}

function computeBrushPixelWidth(canvas: Canvas, requestedWidth: number): number {
  const zoom = Math.max(canvas.getZoom(), 0.001)
  return Math.max(MIN_BRUSH_PIXEL_WIDTH, requestedWidth / zoom)
}

function createEraserCursor(brushPixelWidth: number): string {
  const diameter = Math.max(brushPixelWidth, MIN_BRUSH_PIXEL_WIDTH)
  const radius = diameter / 2
  const hotspot = Math.ceil(radius + CURSOR_HOTSPOT_PADDING)
  const viewportSize = hotspot * 2
  const circleCenter = viewportSize / 2
  const circleRadius = Math.max(0, radius - CURSOR_STROKE_WIDTH / 2)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${viewportSize}" height="${viewportSize}" viewBox="0 0 ${viewportSize} ${viewportSize}"><circle cx="${circleCenter}" cy="${circleCenter}" r="${circleRadius}" fill="${ERASER_CURSOR_FILL}" stroke="${ERASER_CURSOR_STROKE}" stroke-width="${CURSOR_STROKE_WIDTH}"/></svg>`
  const encodedSvg = encodeURIComponent(svg)
  return `url("data:image/svg+xml;utf8,${encodedSvg}") ${hotspot} ${hotspot}, crosshair`
}

export function attachFabricEraserTool(
  canvas: Canvas,
  options: AttachFabricEraserToolOptions,
): () => void {
  const prevDrawingMode = canvas.isDrawingMode
  const prevBrush = canvas.freeDrawingBrush
  const prevFreeDrawingCursor = canvas.freeDrawingCursor
  const prevSkipTargetFind = canvas.skipTargetFind
  const prevSelection = canvas.selection
  const prevCursor = canvas.defaultCursor
  const history = getFabricCanvasHistoryManager(canvas)
  const objectInteractionState = new Map<
    FabricObject,
    { selectable: boolean; evented: boolean }
  >()

  const brush = new PencilBrush(canvas)
  brush.color = ERASER_BRUSH_PREVIEW_FILL
  brush.width = computeBrushPixelWidth(canvas, options.getBrushSize())
  brush.strokeLineCap = 'round'
  brush.strokeLineJoin = 'round'
  brush.straightLineKey = null

  const syncEraserBrushAndCursor = (): void => {
    const brushPixelWidth = computeBrushPixelWidth(canvas, options.getBrushSize())
    brush.width = brushPixelWidth
    const zoom = Math.max(canvas.getZoom(), 0.001)
    const cursorScreenDiameter = Math.max(brushPixelWidth * zoom, MIN_BRUSH_PIXEL_WIDTH)
    canvas.freeDrawingCursor = createEraserCursor(cursorScreenDiameter)
  }

  syncEraserBrushAndCursor()
  canvas.freeDrawingBrush = brush
  canvas.isDrawingMode = true
  canvas.defaultCursor = 'default'
  canvas.skipTargetFind = true
  canvas.selection = false
  canvas.discardActiveObject()

  const disableObjectInteraction = (target: FabricObject): void => {
    if (!objectInteractionState.has(target)) {
      objectInteractionState.set(target, {
        selectable: target.selectable ?? true,
        evented: target.evented ?? true,
      })
    }
    target.selectable = false
    target.evented = false
  }

  for (const obj of canvas.getObjects()) {
    disableObjectInteraction(obj)
  }

  const onObjectAdded = (event: { target?: FabricObject }): void => {
    if (!options.getIsActive()) return
    const target = event.target
    if (!target) return
    disableObjectInteraction(target)
  }

  const onMouseDown = (): void => {
    if (!options.getIsActive()) return
    options.onInteractionStart?.()
    syncEraserBrushAndCursor()
    history?.suspend()
  }

  const onMouseMove = (): void => {
    if (!options.getIsActive()) return
    syncEraserBrushAndCursor()
  }

  let lastZoom = canvas.getZoom()
  const onAfterRender = (): void => {
    if (!options.getIsActive()) return
    const currentZoom = canvas.getZoom()
    if (currentZoom === lastZoom) return
    lastZoom = currentZoom
    syncEraserBrushAndCursor()
  }

  const onPathCreated = (event: { path: FabricObject }): void => {
    const createdPath = event.path as Path
    try {
      const linkedImage = pickTopImageUnderEraserPath(canvas, createdPath)
      if (!linkedImage) return

      ensureObjectId(linkedImage)
      const record = buildEraserStrokeRecord(linkedImage, createdPath)
      const existing = linkedImage.eraserStrokes ?? []
      linkedImage.eraserStrokes = [...existing, record]
      appendEraserStrokeToImage(linkedImage as EraserBakedImage, record)
    } finally {
      canvas.remove(createdPath)
      canvas.requestRenderAll()
      history?.resume()
      history?.recordSnapshot()
    }
  }

  canvas.on('mouse:down', onMouseDown)
  canvas.on('mouse:move', onMouseMove)
  canvas.on('path:created', onPathCreated)
  canvas.on('after:render', onAfterRender)
  canvas.on('object:added', onObjectAdded)
  canvas.requestRenderAll()

  return () => {
    canvas.off('mouse:down', onMouseDown)
    canvas.off('mouse:move', onMouseMove)
    canvas.off('path:created', onPathCreated)
    canvas.off('after:render', onAfterRender)
    canvas.off('object:added', onObjectAdded)
    history?.resume()
    canvas.isDrawingMode = prevDrawingMode
    canvas.freeDrawingBrush = prevBrush
    canvas.freeDrawingCursor = prevFreeDrawingCursor
    canvas.skipTargetFind = prevSkipTargetFind
    canvas.selection = prevSelection
    canvas.defaultCursor = prevCursor
    for (const [obj, state] of objectInteractionState.entries()) {
      obj.selectable = state.selectable
      obj.evented = state.evented
    }
    canvas.requestRenderAll()
  }
}
