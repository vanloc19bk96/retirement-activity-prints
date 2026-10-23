import { Canvas, Control, controlsUtils, FabricObject, InteractiveFabricObject, util } from 'fabric'
import { applyFabricTightTextVerticalMetrics } from '@/utils/fabric-text-vertical-metrics'
import { cropFromLeft, cropFromRight, cropFromTop, cropFromBottom } from './canvas-image-crop'
import {
  createLineEndpointControls,
  LINE_SHAPE_HIDDEN_CONTROLS,
} from './fabric-line-controls'
import {
  clearSelectionOnOtherCanvases,
  registerCanvasForExclusiveSelection,
} from './canvas-selection'

const SELECTION_BLUE = '#3b82f6'
const SELECTION_BLUE_SOFT = 'rgba(59, 130, 246, 0.08)'
const SELECTION_BORDER_SCALE_FACTOR = 2

const HANDLE_SHADOW_COLOR = 'rgba(0, 0, 0, 0.2)'
const HANDLE_SHADOW_BLUR = 4
const HANDLE_SHADOW_OFFSET_Y = 2
const BORDER_SHADOW_COLOR = 'rgba(0, 0, 0, 0.15)'

const SIDE_RESIZE_HANDLE_WIDTH = 6
const SIDE_RESIZE_HANDLE_HEIGHT = 24
const SIDE_RESIZE_HANDLE_BORDER_OFFSET = SELECTION_BORDER_SCALE_FACTOR / 2
const TEXT_RESIZE_HANDLE_HITBOX_HEIGHT = 12

const CORNER_SIZE = 10
const CORNER_SHADOW_COLOR = 'rgba(0, 0, 0, 0.32)'
const CORNER_SHADOW_BLUR = 8
const CORNER_SHADOW_OFFSET_Y = 2
/** Pixels outward from mid-right edge; smaller = rotate handle sits closer to the bounding box. */
const ROTATE_HANDLE_OFFSET_X = 28

/**
 * `CanvasSelectionFloatingToolbar` is centered on the selection top; estimated half-width in
 * canvas pixels for overlap tests (buttons + padding + shadow).
 */
const FLOATING_TOOLBAR_OCCLUSION_HALF_WIDTH = 150

/** If the rotate handle sits at or above this offset from the AABB top edge, it can sit under the toolbar. */
const FLOATING_TOOLBAR_TOP_SLOP = 28

/** Two-way CSS resize cursors, indexed by on-screen handle direction in 45° steps (mod 180°). */
const BIDIRECTIONAL_RESIZE_CURSORS = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'] as const

function getSelectionTopCenterInCanvasPixels(target: FabricObject): {
  minY: number
  centerX: number
} | null {
  const vpt = target.canvas?.viewportTransform
  if (!vpt) return null

  const coords = target.getCoords()
  if (coords.length === 0) return null

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

  return { minY, centerX: (minX + maxX) / 2 }
}

function isRotateHandleObscuredByFloatingToolbar(
  target: FabricObject,
  topMetrics: { minY: number; centerX: number },
): boolean {
  const mtr = target.oCoords?.mtr as { x?: number; y?: number } | undefined
  if (!mtr || typeof mtr.x !== 'number' || typeof mtr.y !== 'number') return false

  const { minY, centerX } = topMetrics
  const overlapsToolbarColumn =
    Math.abs(mtr.x - centerX) <= FLOATING_TOOLBAR_OCCLUSION_HALF_WIDTH
  const nearSelectionTop = mtr.y <= minY + FLOATING_TOOLBAR_TOP_SLOP

  return overlapsToolbarColumn && nearSelectionTop
}

/**
 * Resize cursor for a handle at (x, y) in the object's unit box, rotated with the object.
 * Fabric 7 derives the cursor from the center→handle vector, so on wide/tall objects a corner
 * reads as almost horizontal/vertical; here every corner is a 45° diagonal in the object's own
 * frame. Two-way cursors also avoid `se-resize` & co. drawing non-diagonal on some OS/browsers.
 */
function getRotatedResizeCursor(
  fabricObject: InteractiveFabricObject,
  x: number,
  y: number,
): string {
  const localDeg = util.radiansToDegrees(
    Math.atan2(fabricObject.flipY ? -y : y, fabricObject.flipX ? -x : x),
  )
  const vpt = fabricObject.canvas?.viewportTransform
  const viewportDeg = vpt ? util.radiansToDegrees(Math.atan2(vpt[1], vpt[0])) : 0
  const deg = localDeg + fabricObject.getTotalAngle() + viewportDeg
  const index = Math.round((((deg % 180) + 180) % 180) / 45) % 4
  return BIDIRECTIONAL_RESIZE_CURSORS[index]
}

const rotatedCornerCursorStyleHandler: NonNullable<Control['cursorStyleHandler']> = (
  eventData,
  control,
  fabricObject,
  coord,
) => {
  // Fabric's handler still decides lock state (`not-allowed`); only the direction is replaced.
  const fabricCursor = controlsUtils.scaleCursorStyleHandler(
    eventData,
    control,
    fabricObject as FabricObject,
    coord,
  )
  if (fabricCursor === 'not-allowed') return fabricCursor
  return getRotatedResizeCursor(fabricObject, control.x, control.y)
}

function renderCornerResizeControl(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number
): void {
  ctx.save()

  ctx.beginPath()
  ctx.arc(left, top, CORNER_SIZE / 2, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.shadowColor = CORNER_SHADOW_COLOR
  ctx.shadowBlur = CORNER_SHADOW_BLUR
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = CORNER_SHADOW_OFFSET_Y
  ctx.fill()

  ctx.restore()
}

function renderRotationControl(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  _styleOverride: unknown,
  fabricObject: FabricObject
): void {
  const objWithState = fabricObject as FabricObject & { isRotationActive?: boolean }

  ctx.save()

  const size = 20
  const radius = size / 2 - 3
  const centerX = left
  const centerY = top

  ctx.beginPath()
  ctx.arc(centerX, centerY, size / 2 + 1, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.shadowColor = HANDLE_SHADOW_COLOR
  ctx.shadowBlur = HANDLE_SHADOW_BLUR
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = HANDLE_SHADOW_OFFSET_Y
  ctx.fill()

  ctx.shadowColor = 'transparent'

  ctx.beginPath()
  ctx.arc(centerX, centerY, radius, -Math.PI / 2, Math.PI * 1.25, false)
  ctx.strokeStyle = SELECTION_BLUE
  ctx.lineWidth = 2.5
  ctx.lineCap = 'round'
  ctx.stroke()

  if (!objWithState.isRotationActive) {
    ctx.restore()
    return
  }

  const angle = ((fabricObject.angle ?? 0) + 360) % 360
  const label = `${Math.round(angle)}°`

  ctx.font = '12px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  ctx.fillStyle = SELECTION_BLUE
  ctx.textBaseline = 'middle'

  const textMetrics = ctx.measureText(label)
  const textPaddingX = 6
  const textWidth = textMetrics.width + textPaddingX * 2
  const textHeight = 16

  const labelX = centerX + radius + 10
  const labelY = centerY

  ctx.beginPath()
  ctx.roundRect(labelX, labelY - textHeight / 2, textWidth, textHeight, textHeight / 2)
  ctx.fillStyle = '#ffffff'
  ctx.shadowColor = HANDLE_SHADOW_COLOR
  ctx.shadowBlur = HANDLE_SHADOW_BLUR
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = HANDLE_SHADOW_OFFSET_Y
  ctx.fill()

  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0

  ctx.fillStyle = SELECTION_BLUE
  ctx.fillText(label, labelX + textPaddingX, labelY)

  ctx.restore()
}

function renderHorizontalResizeControl(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  _styleOverride: unknown,
  fabricObject: FabricObject
): void {
  ctx.save()

  const width = SIDE_RESIZE_HANDLE_WIDTH
  const height = SIDE_RESIZE_HANDLE_HEIGHT
  const borderRadius = width / 2

  ctx.translate(left, top)
  ctx.rotate(util.degreesToRadians(fabricObject.angle || 0))

  const x = -width / 2
  const y = -height / 2

  ctx.beginPath()
  ctx.roundRect(x, y, width, height, borderRadius)
  ctx.fillStyle = '#ffffff'
  ctx.shadowColor = CORNER_SHADOW_COLOR
  ctx.shadowBlur = CORNER_SHADOW_BLUR
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = CORNER_SHADOW_OFFSET_Y
  ctx.fill()

  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0

  ctx.restore()
}

function renderVerticalResizeControl(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  _styleOverride: unknown,
  fabricObject: FabricObject
): void {
  ctx.save()

  const width = 24
  const height = 6
  const borderRadius = height / 2

  ctx.translate(left, top)
  ctx.rotate(util.degreesToRadians(fabricObject.angle || 0))

  const x = -width / 2
  const y = -height / 2

  ctx.beginPath()
  ctx.roundRect(x, y, width, height, borderRadius)
  ctx.fillStyle = '#ffffff'
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)'
  ctx.shadowBlur = 5
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 0
  ctx.fill()

  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0

  ctx.strokeStyle = BORDER_SHADOW_COLOR
  ctx.lineWidth = 1
  ctx.stroke()

  ctx.restore()
}

function applyObjectControls(target: FabricObject): void {
  const controls = target.controls
  if (!controls) return

  const isImageObject = target.type === 'image'
  const isTextObject =
    target.type === 'i-text' || target.type === 'text' || target.type === 'textbox'

  const isShapeObject =
    target.type === 'rect' ||
    target.type === 'circle' ||
    target.type === 'triangle' ||
    target.type === 'polygon' ||
    target.type === 'path' ||
    target.type === 'ellipse'

  const objWithCustomType = target as FabricObject & { customShapeType?: string }
  const customShapeType = objWithCustomType.customShapeType
  const isLineShape = target.type === 'line' || customShapeType === 'line'
  const isArrowShape = customShapeType === 'arrow'

  target.set({
    borderColor: SELECTION_BLUE,
    borderScaleFactor: SELECTION_BORDER_SCALE_FACTOR,
    borderOpacityWhenMoving: 0.8,
    cornerColor: '#ffffff',
    cornerStrokeColor: 'transparent',
    cornerStyle: 'circle',
    cornerSize: CORNER_SIZE,
    transparentCorners: false,
    padding: 0,
    hoverCursor: 'pointer',
    moveCursor: 'move',
    lockScalingFlip: true,
  })

  // Corner handles: custom draw + diagonal cursor that rotates with the object
  // (fixed nwse/nesw are screen-axis cursors and feel wrong on rotated objects, e.g. template images at 90°).
  for (const control of [controls.tl, controls.tr, controls.bl, controls.br]) {
    if (!control) continue
    control.cursorStyleHandler = rotatedCornerCursorStyleHandler
    control.render = renderCornerResizeControl
  }

  if (isLineShape) {
    const lineEndpointControls = createLineEndpointControls({
      render: renderCornerResizeControl,
    })
    controls.p1 = lineEndpointControls.p1
    controls.p2 = lineEndpointControls.p2
    target.set({
      hasBorders: false,
    })
    target.setControlsVisibility({ ...LINE_SHAPE_HIDDEN_CONTROLS })
  }

  if (isArrowShape) {
    target.setControlsVisibility({
      mt: false,
      mb: false,
      ml: false,
      mr: false,
    })
  }

  const isShapeWithPillControls = isShapeObject && !isLineShape && !isArrowShape

  if (isShapeWithPillControls) {
    controls.ml = new Control({
      x: -0.5,
      y: 0,
      offsetX: -SIDE_RESIZE_HANDLE_BORDER_OFFSET,
      offsetY: 0,
      actionHandler: controlsUtils.scalingXOrSkewingY,
      cursorStyleHandler: controlsUtils.scaleSkewCursorStyleHandler,
      actionName: 'scaling',
      render: renderHorizontalResizeControl,
      sizeX: SIDE_RESIZE_HANDLE_WIDTH,
      sizeY: SIDE_RESIZE_HANDLE_HEIGHT,
    })

    controls.mr = new Control({
      x: 0.5,
      y: 0,
      offsetX: SIDE_RESIZE_HANDLE_BORDER_OFFSET,
      offsetY: 0,
      actionHandler: controlsUtils.scalingXOrSkewingY,
      cursorStyleHandler: controlsUtils.scaleSkewCursorStyleHandler,
      actionName: 'scaling',
      render: renderHorizontalResizeControl,
      sizeX: SIDE_RESIZE_HANDLE_WIDTH,
      sizeY: SIDE_RESIZE_HANDLE_HEIGHT,
    })

    controls.mt = new Control({
      x: 0,
      y: -0.5,
      offsetX: 0,
      offsetY: 0,
      actionHandler: controlsUtils.scalingYOrSkewingX,
      cursorStyleHandler: controlsUtils.scaleSkewCursorStyleHandler,
      actionName: 'scaling',
      render: renderVerticalResizeControl,
      sizeX: 24,
      sizeY: 6,
    })

    controls.mb = new Control({
      x: 0,
      y: 0.5,
      offsetX: 0,
      offsetY: 0,
      actionHandler: controlsUtils.scalingYOrSkewingX,
      cursorStyleHandler: controlsUtils.scaleSkewCursorStyleHandler,
      actionName: 'scaling',
      render: renderVerticalResizeControl,
      sizeX: 24,
      sizeY: 6,
    })
  }

  if (isImageObject) {
    controls.ml = new Control({
      x: -0.5,
      y: 0,
      offsetX: -SIDE_RESIZE_HANDLE_BORDER_OFFSET,
      offsetY: 0,
      actionHandler: cropFromLeft,
      cursorStyleHandler: controlsUtils.scaleCursorStyleHandler,
      actionName: 'cropping',
      render: renderHorizontalResizeControl,
      sizeX: SIDE_RESIZE_HANDLE_WIDTH,
      sizeY: SIDE_RESIZE_HANDLE_HEIGHT,
    })

    controls.mr = new Control({
      x: 0.5,
      y: 0,
      offsetX: SIDE_RESIZE_HANDLE_BORDER_OFFSET,
      offsetY: 0,
      actionHandler: cropFromRight,
      cursorStyleHandler: controlsUtils.scaleCursorStyleHandler,
      actionName: 'cropping',
      render: renderHorizontalResizeControl,
      sizeX: SIDE_RESIZE_HANDLE_WIDTH,
      sizeY: SIDE_RESIZE_HANDLE_HEIGHT,
    })

    controls.mt = new Control({
      x: 0,
      y: -0.5,
      offsetX: 0,
      offsetY: 0,
      actionHandler: cropFromTop,
      cursorStyleHandler: controlsUtils.scaleCursorStyleHandler,
      actionName: 'cropping',
      render: renderVerticalResizeControl,
      sizeX: 24,
      sizeY: 6,
    })

    controls.mb = new Control({
      x: 0,
      y: 0.5,
      offsetX: 0,
      offsetY: 0,
      actionHandler: cropFromBottom,
      cursorStyleHandler: controlsUtils.scaleCursorStyleHandler,
      actionName: 'cropping',
      render: renderVerticalResizeControl,
      sizeX: 24,
      sizeY: 6,
    })
  }

  if (isTextObject) {
    const textWidthCursorStyleHandler: Control['cursorStyleHandler'] = (_eventData, control, obj) =>
      getRotatedResizeCursor(obj, control.x, control.y)

    target.setControlsVisibility({
      mt: false,
      mb: false,
    })

    controls.ml = new Control({
      x: -0.5,
      y: 0,
      offsetX: -SIDE_RESIZE_HANDLE_BORDER_OFFSET,
      offsetY: 0,
      actionHandler: controlsUtils.changeWidth,
      cursorStyleHandler: textWidthCursorStyleHandler,
      actionName: 'resizing',
      render: renderHorizontalResizeControl,
      sizeX: SIDE_RESIZE_HANDLE_WIDTH,
      // Keep the grab area narrow so the bottom corners stay reachable as diagonal resize targets.
      sizeY: TEXT_RESIZE_HANDLE_HITBOX_HEIGHT,
    })

    controls.mr = new Control({
      x: 0.5,
      y: 0,
      offsetX: SIDE_RESIZE_HANDLE_BORDER_OFFSET,
      offsetY: 0,
      actionHandler: controlsUtils.changeWidth,
      cursorStyleHandler: textWidthCursorStyleHandler,
      actionName: 'resizing',
      render: renderHorizontalResizeControl,
      sizeX: SIDE_RESIZE_HANDLE_WIDTH,
      // Keep the grab area narrow so the bottom corners stay reachable as diagonal resize targets.
      sizeY: TEXT_RESIZE_HANDLE_HITBOX_HEIGHT,
    })
  }

  let rotateHandleOnLeft = false
  const existingMtr = controls.mtr
  if (target.canvas && existingMtr) {
    existingMtr.x = 0.5
    existingMtr.y = 0
    existingMtr.offsetX = ROTATE_HANDLE_OFFSET_X
    existingMtr.offsetY = 0
    target.setCoords()
    const topMetrics = getSelectionTopCenterInCanvasPixels(target)
    if (topMetrics) {
      rotateHandleOnLeft = isRotateHandleObscuredByFloatingToolbar(target, topMetrics)
    }
  }

  controls.mtr = new Control({
    x: rotateHandleOnLeft ? -0.5 : 0.5,
    y: 0,
    offsetX: rotateHandleOnLeft ? -ROTATE_HANDLE_OFFSET_X : ROTATE_HANDLE_OFFSET_X,
    offsetY: 0,
    actionHandler: controlsUtils.rotationWithSnapping,
    cursorStyleHandler: () => 'grab',
    actionName: 'rotate',
    withConnection: false,
    render: renderRotationControl,
  })
}

export function applyFabricSelectionStyle(canvas: Canvas): void {
  applyFabricTightTextVerticalMetrics()

  const unregisterCanvas = registerCanvasForExclusiveSelection(canvas)
  const rawDispose = canvas.dispose.bind(canvas)
  canvas.dispose = ((...args: unknown[]) => {
    unregisterCanvas()
    return rawDispose(...(args as []))
  }) as typeof canvas.dispose

  // Fabric uses an offscreen hidden textarea for text editing.
  // By default it appends to `document.body` and calls `.focus()`,
  // which can cause the window scrollbar to appear/disappear while selecting text objects.
  // We attach it to the canvas wrapper instead to avoid affecting the page scroll.
  const canvasElement = canvas.getElement?.() as HTMLCanvasElement | null
  const hiddenTextareaContainer = canvasElement?.parentElement ?? null

  FabricObject.prototype.set({
    borderColor: SELECTION_BLUE,
    borderScaleFactor: SELECTION_BORDER_SCALE_FACTOR,
    borderOpacityWhenMoving: 0.8,
    cornerColor: '#ffffff',
    cornerStrokeColor: 'transparent',
    cornerStyle: 'circle',
    cornerSize: CORNER_SIZE,
    transparentCorners: false,
    padding: 0,
    hoverCursor: 'pointer',
    moveCursor: 'move',
    lockScalingFlip: true,
  })

  canvas.set({
    selectionColor: SELECTION_BLUE_SOFT,
    selectionBorderColor: SELECTION_BLUE,
    selectionLineWidth: 1,
  })

  const isTextObject = (obj: FabricObject): boolean => {
    return obj.type === 'i-text' || obj.type === 'text' || obj.type === 'textbox'
  }

  const stabilizeTextarea = (textarea: HTMLTextAreaElement): void => {
    textarea.style.position = 'fixed'
    textarea.style.top = '0px'
    textarea.style.left = '0px'
    textarea.style.width = '1px'
    textarea.style.height = '1px'
    textarea.style.opacity = '0'
    textarea.style.overflow = 'hidden'
    textarea.style.zIndex = '-1'
    textarea.style.pointerEvents = 'none'
    textarea.setAttribute('data-fabric-hiddentextarea', 'true')
  }

  const applyHiddenTextareaContainer = (obj: FabricObject): void => {
    if (!hiddenTextareaContainer) return
    if (!isTextObject(obj)) return

    // `hiddenTextareaContainer` exists on Fabric's IText/ITextKeyBehavior,
    // but FabricObject is not typed with that property.
    ;(obj as unknown as { hiddenTextareaContainer?: HTMLElement | null }).hiddenTextareaContainer =
      hiddenTextareaContainer

    // If the textarea is already created, keep it stable in the viewport.
    // That prevents focus-driven auto-scroll from causing layout shifts.
    const hiddenTextarea = (obj as unknown as { hiddenTextarea?: HTMLTextAreaElement | null })
      .hiddenTextarea
    if (hiddenTextarea) {
      stabilizeTextarea(hiddenTextarea)
    }
  }

  const applyToExistingObjects = (): void => {
    for (const obj of canvas.getObjects()) {
      applyObjectControls(obj)
      applyHiddenTextareaContainer(obj)
    }
  }

  const clearRotationState = (): void => {
    const active = canvas.getActiveObject() as (FabricObject & { isRotationActive?: boolean }) | null
    if (active && active.isRotationActive) {
      active.isRotationActive = false
      canvas.requestRenderAll()
    }
  }

  applyToExistingObjects()
  canvas.requestRenderAll()

  // Prevent browser scroll/pan gesture during pointer interactions on the canvas.
  const upperCanvasEl = (canvas as any).upperCanvasEl as HTMLCanvasElement | undefined
  const lowerCanvasEl = (canvas as any).lowerCanvasEl as HTMLCanvasElement | undefined
  if (upperCanvasEl) {
    upperCanvasEl.style.touchAction = 'none'
    upperCanvasEl.style.userSelect = 'none'
  }
  if (lowerCanvasEl) {
    lowerCanvasEl.style.touchAction = 'none'
    lowerCanvasEl.style.userSelect = 'none'
  }

  canvas.on('object:added', (event) => {
    const target = event.target
    if (!target) return
    applyObjectControls(target as FabricObject)
    applyHiddenTextareaContainer(target as FabricObject)
    canvas.requestRenderAll()
  })

  canvas.on('object:rotating', (event) => {
    const target = event.target as (FabricObject & { isRotationActive?: boolean }) | undefined
    if (!target) return
    target.isRotationActive = true
    canvas.requestRenderAll()
  })

  canvas.on('object:modified', (opt) => {
    if (opt.action !== 'rotate') return
    const target = opt.target
    if (!target || target !== canvas.getActiveObject()) return
    applyObjectControls(target)
    target.setCoords()
    canvas.requestRenderAll()
  })

  canvas.on('selection:created', () => {
    clearSelectionOnOtherCanvases(canvas)
    const active = canvas.getActiveObject()
    if (active) applyObjectControls(active as FabricObject)
    canvas.requestRenderAll()
  })

  canvas.on('selection:updated', () => {
    clearSelectionOnOtherCanvases(canvas)
    const active = canvas.getActiveObject()
    if (active) applyObjectControls(active as FabricObject)
    canvas.requestRenderAll()
  })

  canvas.on('selection:cleared', () => {
    clearRotationState()
  })

  canvas.on('mouse:up', () => {
    const active = canvas.getActiveObject() as (FabricObject & { isRotationActive?: boolean }) | null
    const wasRotating = Boolean(active?.isRotationActive)
    clearRotationState()
    // Re-run control layout so the rotate handle flips left/right for the final angle (toolbar occlusion).
    if (wasRotating && active) {
      applyObjectControls(active)
      active.setCoords()
      canvas.requestRenderAll()
    }
  })

  ;(canvas as any).on('editing:entered', (event: any) => {
    const target = event?.target as unknown as { hiddenTextarea?: HTMLTextAreaElement | null } | undefined
    const hiddenTextarea = target?.hiddenTextarea
    if (!hiddenTextarea) return

    stabilizeTextarea(hiddenTextarea)
  })

  ;(canvas as any).on('text:editing:entered', (event: any) => {
    const target = event?.target as unknown as { hiddenTextarea?: HTMLTextAreaElement | null } | undefined
    const hiddenTextarea = target?.hiddenTextarea
    if (!hiddenTextarea) return

    stabilizeTextarea(hiddenTextarea)
  })

  ;(canvas as any).on('text:editing:exited', (event: any) => {
    const target = event?.target as FabricObject | undefined
    if (!target) return

    // Fabric may leave text controls hidden after inline editing;
    // re-apply our custom control set so corner/side handles stay visible.
    applyObjectControls(target)
    target.setCoords()
    canvas.requestRenderAll()
  })

  // Watch for dynamically created textareas and stabilize them immediately.
  // Fabric creates the textarea when entering edit mode, and its default
  // positioning can cause layout shifts before our event handlers run.
  if (hiddenTextareaContainer) {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLTextAreaElement) {
            stabilizeTextarea(node)
          }
        }
      }
    })
    observer.observe(hiddenTextareaContainer, { childList: true, subtree: true })
  }
}
