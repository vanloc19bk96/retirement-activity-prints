import type { Canvas, FabricObject } from 'fabric'
import type { MarginGuide } from '@/types/canvas-settings.types'
import type { CanvasLogicalSize } from '@/types/fabric-canvas-item.types'

const STANDARD_TEMPLATE_SIZE = {
  width: 612,
  height: 792,
}

type CanvasTargetArea = {
  left: number
  top: number
  width: number
  height: number
}

type ScaleTemplateObjectsOptions = {
  targetSize?: CanvasLogicalSize
  targetArea?: CanvasTargetArea
  templateSize?: CanvasLogicalSize
}

type TemplateObjectBounds = {
  left: number
  top: number
  width: number
  height: number
}

function isPositiveFiniteNumber(value: number): boolean {
  return Number.isFinite(value) && value > 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

/** Fabric serializes image objects as `type: "Image"`; older data may use lowercase. */
function isFabricSerializedImageType(value: unknown): boolean {
  return typeof value === 'string' && value.toLowerCase() === 'image'
}

function isHttpOrHttpsImageSrc(src: string): boolean {
  const s = src.trim().toLowerCase()
  return s.startsWith('http://') || s.startsWith('https://')
}

function cloneTemplateNodeWithAnonymousImageCors(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(cloneTemplateNodeWithAnonymousImageCors)
  }

  if (!isRecord(value)) return value

  const next: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) {
    next[key] = cloneTemplateNodeWithAnonymousImageCors(child)
  }

  if (
    isFabricSerializedImageType(next.type) &&
    typeof next.src === 'string' &&
    isHttpOrHttpsImageSrc(next.src)
  ) {
    next.crossOrigin = 'anonymous'
  }

  return next
}

export function normalizeTemplateCanvasJson(templateJson: unknown): object | null {
  if (!isRecord(templateJson)) return null
  const normalized = cloneTemplateNodeWithAnonymousImageCors(templateJson)
  return isRecord(normalized) ? normalized : null
}

/** Ensures remote images load with CORS so canvas export (`toDataURL` / `toBlob`) is not tainted. */
export function applyAnonymousCrossOriginToFabricImageObjects(
  canvasJson: Record<string, unknown>,
): Record<string, unknown> {
  const normalized = cloneTemplateNodeWithAnonymousImageCors(canvasJson)
  return isRecord(normalized) ? normalized : canvasJson
}

function buildTemplateJsonFetchUrl(templateJsonUrl: string): string {
  try {
    const url = new URL(templateJsonUrl)
    url.searchParams.set('_t', Date.now().toString())
    return url.toString()
  } catch {
    const separator = templateJsonUrl.includes('?') ? '&' : '?'
    return `${templateJsonUrl}${separator}_t=${Date.now()}`
  }
}

/**
 * Supabase local stack commonly returns signed URLs with the Docker-internal hostname
 * `supabase-kong`, which is not resolvable from the browser. Rewrite it to `localhost`
 * so templates can be fetched in local dev.
 */
function normalizeBrowserReachableTemplateUrl(templateJsonUrl: string): string {
  try {
    const url = new URL(templateJsonUrl)
    if (url.hostname === 'supabase-kong') {
      url.hostname = 'localhost'
      return url.toString()
    }
    return templateJsonUrl
  } catch {
    return templateJsonUrl
  }
}

export async function fetchTemplateCanvasJson(templateJsonUrl: string): Promise<object | null> {
  const normalizedUrl = normalizeBrowserReachableTemplateUrl(templateJsonUrl.trim())
  if (!normalizedUrl) return null

  const response = await fetch(buildTemplateJsonFetchUrl(normalizedUrl), { cache: 'no-store' })
  if (!response.ok) return null

  return normalizeTemplateCanvasJson(await response.json())
}

export function getCanvasLogicalSize(canvas: Canvas): CanvasLogicalSize | null {
  const zoom = canvas.getZoom()
  if (!isPositiveFiniteNumber(zoom)) return null

  const width = canvas.getWidth() / zoom
  const height = canvas.getHeight() / zoom
  if (!isPositiveFiniteNumber(width) || !isPositiveFiniteNumber(height)) return null

  return { width, height }
}

/**
 * Canvas content uses logical page pixels; object left/top are authored in that space.
 * Live editor canvases persist a zoom-scaled `width`/`height` in `toObject()` while
 * off-screen renders use full logical size. Mismatched metadata makes `loadFromJSON`
 * rescale objects on reload, so align metadata to logical dimensions only.
 */
export function normalizeFabricCanvasJsonToLogicalSize(
  canvasJson: object,
  logicalSize: CanvasLogicalSize,
): object {
  if (!isPositiveFiniteNumber(logicalSize.width) || !isPositiveFiniteNumber(logicalSize.height)) {
    return canvasJson
  }

  return {
    ...(canvasJson as Record<string, unknown>),
    width: logicalSize.width,
    height: logicalSize.height,
  }
}

/**
 * Fabric 7 `loadFromJSON` calls `this.set(serialized)`, so JSON `width`/`height`
 * (and viewport/clipPath) overwrite the destination canvas. Strip surface fields
 * before load — callers own target dimensions and an identity viewport for export.
 */
export function omitFabricCanvasJsonSurfaceFields(
  canvasJson: Record<string, unknown>,
): Record<string, unknown> {
  const {
    width: _width,
    height: _height,
    viewportTransform: _viewportTransform,
    clipPath: _clipPath,
    ...rest
  } = canvasJson
  return rest
}

function getTemplateObjectBounds(objects: FabricObject[]): TemplateObjectBounds | null {
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

  return {
    left: minLeft,
    top: minTop,
    width: maxRight - minLeft,
    height: maxBottom - minTop,
  }
}

function moveObjectsBy(objects: FabricObject[], deltaX: number, deltaY: number): void {
  if (deltaX === 0 && deltaY === 0) return

  for (const object of objects) {
    object.set({
      left: (object.left ?? 0) + deltaX,
      top: (object.top ?? 0) + deltaY,
    })
    object.setCoords()
  }
}

function centerTemplateObjectsWithinArea(objects: FabricObject[], targetArea: CanvasTargetArea): void {
  const bounds = getTemplateObjectBounds(objects)
  if (!bounds) return

  const currentCenterX = bounds.left + bounds.width / 2
  const currentCenterY = bounds.top + bounds.height / 2
  const targetCenterX = targetArea.left + targetArea.width / 2
  const targetCenterY = targetArea.top + targetArea.height / 2

  moveObjectsBy(objects, targetCenterX - currentCenterX, targetCenterY - currentCenterY)
}

function scaleObjectsFromOrigin(
  objects: FabricObject[],
  scale: number,
  originX: number,
  originY: number,
): void {
  if (!isPositiveFiniteNumber(scale) || scale === 1) return

  for (const object of objects) {
    object.set({
      left: originX + ((object.left ?? 0) - originX) * scale,
      top: originY + ((object.top ?? 0) - originY) * scale,
      scaleX: (object.scaleX ?? 1) * scale,
      scaleY: (object.scaleY ?? 1) * scale,
    })
    object.setCoords()
  }
}

function clampTemplateObjectsWithinArea(objects: FabricObject[], targetArea: CanvasTargetArea): void {
  const bounds = getTemplateObjectBounds(objects)
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

  moveObjectsBy(objects, offsetX, offsetY)
}

function fitTemplateObjectsWithinArea(objects: FabricObject[], targetArea: CanvasTargetArea): void {
  let bounds = getTemplateObjectBounds(objects)
  if (!bounds) return

  const fitRatio = Math.min(
    targetArea.width / bounds.width,
    targetArea.height / bounds.height,
    1,
  )

  if (isPositiveFiniteNumber(fitRatio) && fitRatio < 1) {
    scaleObjectsFromOrigin(objects, fitRatio, bounds.left, bounds.top)
    bounds = getTemplateObjectBounds(objects)
    if (!bounds) return
  }

  centerTemplateObjectsWithinArea(objects, targetArea)
  clampTemplateObjectsWithinArea(objects, targetArea)
}

function isValidTargetArea(value: CanvasTargetArea): boolean {
  return (
    Number.isFinite(value.left) &&
    Number.isFinite(value.top) &&
    isPositiveFiniteNumber(value.width) &&
    isPositiveFiniteNumber(value.height)
  )
}

/** KDP page 1 is recto (right); even 1-based page numbers are verso (left). */
export function resolveInteriorIsLeftPage(pageIndex: number): boolean {
  if (!Number.isFinite(pageIndex) || pageIndex < 0) return false
  return Math.trunc(pageIndex) % 2 === 1
}

export function resolveInteriorPageSafeArea({
  canvasSize,
  marginGuide,
  isLeftPage,
}: {
  canvasSize: CanvasLogicalSize
  marginGuide: MarginGuide
  isLeftPage: boolean
}): CanvasTargetArea | null {
  const safeTop = marginGuide.bleedTopPixels + marginGuide.topPixels
  const safeBottom = marginGuide.bleedBottomPixels + marginGuide.bottomPixels
  const safeLeft = isLeftPage
    ? marginGuide.bleedOutsidePixels + marginGuide.outsidePixels
    : marginGuide.insidePixels
  const safeRight = isLeftPage
    ? marginGuide.insidePixels
    : marginGuide.bleedOutsidePixels + marginGuide.outsidePixels

  const safeArea = {
    left: safeLeft,
    top: safeTop,
    width: canvasSize.width - safeLeft - safeRight,
    height: canvasSize.height - safeTop - safeBottom,
  }

  return isValidTargetArea(safeArea) ? safeArea : null
}

export function scaleTemplateObjectsToCanvas(
  canvas: Canvas,
  options: ScaleTemplateObjectsOptions = {},
): void {
  const targetSize = options.targetSize ?? getCanvasLogicalSize(canvas)
  const templateSize = options.templateSize ?? STANDARD_TEMPLATE_SIZE
  if (!targetSize) return
  if (
    !isPositiveFiniteNumber(targetSize.width) ||
    !isPositiveFiniteNumber(targetSize.height) ||
    !isPositiveFiniteNumber(templateSize.width) ||
    !isPositiveFiniteNumber(templateSize.height)
  ) {
    return
  }

  const targetArea = options.targetArea ?? {
    left: 0,
    top: 0,
    width: targetSize.width,
    height: targetSize.height,
  }
  if (!isValidTargetArea(targetArea)) return

  const scale = Math.min(
    targetArea.width / templateSize.width,
    targetArea.height / templateSize.height,
  )
  if (!isPositiveFiniteNumber(scale)) return

  const offsetX = targetArea.left + (targetArea.width - templateSize.width * scale) / 2
  const offsetY = targetArea.top + (targetArea.height - templateSize.height * scale) / 2

  const objects = canvas.getObjects()
  for (const object of objects) {
    object.set({
      left: (object.left ?? 0) * scale + offsetX,
      top: (object.top ?? 0) * scale + offsetY,
      scaleX: (object.scaleX ?? 1) * scale,
      scaleY: (object.scaleY ?? 1) * scale,
    })
    object.setCoords()
  }

  fitTemplateObjectsWithinArea(objects, targetArea)
}
