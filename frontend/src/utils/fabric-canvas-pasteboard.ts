import type { Canvas, FabricObject, StaticCanvas, TMat2D } from 'fabric'

/**
 * Canva-style pasteboard: the live Fabric surface is larger than the page by this
 * many screen pixels on every side. Page content is clipped to the page rect, but
 * selection borders/handles of objects hanging off the page stay visible.
 */
export const CANVAS_PASTEBOARD_PADDING_PX = 96

/** Room kept around the active object's box so corner handles and the rotate control are not cut. */
const CONTROL_OVERHANG_PX = 48

/** Lifts the page above its neighbours while its selection spills into the pasteboard. */
const EXPANDED_PAGE_Z_INDEX = '120'

type PasteboardCanvas = Canvas & {
  _renderBackground: (ctx: CanvasRenderingContext2D) => void
  _renderObjects: (ctx: CanvasRenderingContext2D, objects: FabricObject[]) => void
}

const paddingByCanvas = new WeakMap<StaticCanvas, number>()

export function getCanvasPasteboardPadding(canvas: StaticCanvas): number {
  return paddingByCanvas.get(canvas) ?? 0
}

/** Surface size (screen px) for a page of `baseWidth`×`baseHeight` at `zoom`. */
export function getPasteboardCanvasDimensions(
  baseWidth: number,
  baseHeight: number,
  zoom: number,
  padding = CANVAS_PASTEBOARD_PADDING_PX,
): { width: number; height: number } {
  return {
    width: Math.round(baseWidth * zoom) + padding * 2,
    height: Math.round(baseHeight * zoom) + padding * 2,
  }
}

export function getPasteboardViewportTransform(
  zoom: number,
  padding = CANVAS_PASTEBOARD_PADDING_PX,
): TMat2D {
  return [zoom, 0, 0, zoom, padding, padding]
}

/** Logical page size (scene units), excluding the pasteboard margin. */
export function getCanvasPageLogicalSize(canvas: StaticCanvas): { width: number; height: number } {
  const padding = getCanvasPasteboardPadding(canvas)
  const vpt = canvas.viewportTransform
  const zoomX = Math.abs(vpt?.[0] ?? canvas.getZoom()) || 1
  const zoomY = Math.abs(vpt?.[3] ?? zoomX) || 1
  return {
    width: (canvas.getWidth() - padding * 2) / zoomX,
    height: (canvas.getHeight() - padding * 2) / zoomY,
  }
}

function clipContextToRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  ctx.beginPath()
  ctx.rect(x, y, width, height)
  ctx.clip()
}

function patchPageClippedRendering(canvas: PasteboardCanvas): void {
  const renderBackground = canvas._renderBackground.bind(canvas)
  const renderObjects = canvas._renderObjects.bind(canvas)

  // Background is painted before the viewport transform is applied.
  canvas._renderBackground = (ctx) => {
    const vpt = canvas.viewportTransform
    const page = getCanvasPageLogicalSize(canvas)
    ctx.save()
    clipContextToRect(ctx, vpt[4], vpt[5], page.width * vpt[0], page.height * vpt[3])
    renderBackground(ctx)
    ctx.restore()
  }

  // Objects are painted in scene space; controls are drawn afterwards, outside this clip.
  canvas._renderObjects = (ctx, objects) => {
    const page = getCanvasPageLogicalSize(canvas)
    ctx.save()
    clipContextToRect(ctx, 0, 0, page.width, page.height)
    renderObjects(ctx, objects)
    ctx.restore()
  }
}

type ScreenRect = { left: number; top: number; right: number; bottom: number }

function getActiveObjectScreenRect(canvas: Canvas): ScreenRect | null {
  const activeObject = canvas.getActiveObject()
  if (!activeObject || activeObject.visible === false) return null

  const coords = activeObject.getCoords()
  if (coords.length === 0) return null

  const vpt = canvas.viewportTransform
  const rect: ScreenRect = {
    left: Number.POSITIVE_INFINITY,
    top: Number.POSITIVE_INFINITY,
    right: Number.NEGATIVE_INFINITY,
    bottom: Number.NEGATIVE_INFINITY,
  }
  for (const point of coords) {
    const x = point.x * vpt[0] + point.y * vpt[2] + vpt[4]
    const y = point.x * vpt[1] + point.y * vpt[3] + vpt[5]
    rect.left = Math.min(rect.left, x)
    rect.top = Math.min(rect.top, y)
    rect.right = Math.max(rect.right, x)
    rect.bottom = Math.max(rect.bottom, y)
  }
  return Number.isFinite(rect.left) && Number.isFinite(rect.top) ? rect : null
}

/**
 * Visible + hit-testable region of the surface: the page, grown to cover the active
 * object's controls. Everything else stays clipped so the pasteboard never swallows
 * clicks meant for neighbouring pages.
 */
function resolvePasteboardInsets(canvas: Canvas, padding: number): [number, number, number, number] {
  const width = canvas.getWidth()
  const height = canvas.getHeight()
  const pageInsets: [number, number, number, number] = [padding, padding, padding, padding]

  const objectRect = getActiveObjectScreenRect(canvas)
  if (!objectRect) return pageInsets

  const clamp = (value: number, max: number): number => Math.min(Math.max(Math.round(value), 0), max)
  const top = clamp(Math.min(padding, objectRect.top - CONTROL_OVERHANG_PX), padding)
  const left = clamp(Math.min(padding, objectRect.left - CONTROL_OVERHANG_PX), padding)
  const right = clamp(Math.min(padding, width - objectRect.right - CONTROL_OVERHANG_PX), padding)
  const bottom = clamp(Math.min(padding, height - objectRect.bottom - CONTROL_OVERHANG_PX), padding)
  return [top, right, bottom, left]
}

/**
 * Turns a freshly created editor canvas (already sized/transformed with the
 * pasteboard helpers above) into a pasteboard surface. `pageElement` is the page
 * box whose stacking order is raised while controls spill outside it.
 */
export function installCanvasPasteboard(
  canvas: Canvas,
  pageElement: HTMLElement | null,
  padding = CANVAS_PASTEBOARD_PADDING_PX,
): () => void {
  paddingByCanvas.set(canvas, padding)
  patchPageClippedRendering(canvas as PasteboardCanvas)

  const wrapper = canvas.wrapperEl
  wrapper.style.position = 'absolute'
  wrapper.style.left = `${-padding}px`
  wrapper.style.top = `${-padding}px`

  let appliedClip = ''
  const syncClip = (): void => {
    const insets = resolvePasteboardInsets(canvas, padding)
    const clip = `inset(${insets.map((value) => `${value}px`).join(' ')})`
    if (clip === appliedClip) return
    appliedClip = clip
    wrapper.style.clipPath = clip
    const isExpanded = insets.some((value) => value < padding)
    if (pageElement) pageElement.style.zIndex = isExpanded ? EXPANDED_PAGE_Z_INDEX : ''
  }

  const handleAfterRender = ({ ctx }: { ctx: CanvasRenderingContext2D }): void => {
    // toCanvasElement/toDataURL render into a temporary context with a temporary viewport.
    if (ctx !== canvas.contextContainer && ctx !== canvas.contextTop) return
    syncClip()
  }

  syncClip()
  canvas.on('after:render', handleAfterRender)

  return () => {
    canvas.off('after:render', handleAfterRender)
    if (pageElement) pageElement.style.zIndex = ''
  }
}
