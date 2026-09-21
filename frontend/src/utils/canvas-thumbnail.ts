import { StaticCanvas, type Canvas, type FabricObject } from 'fabric'
import { omitFabricCanvasJsonSurfaceFields } from '@/utils/canvas-template'

export const CANVAS_THUMBNAIL_PIXEL_WIDTH = 180
const THUMBNAIL_JPEG_QUALITY = 0.74

/** Same-origin pixel for failed CORS fetches — avoids tainting the export canvas. */
const TRANSPARENT_1X1_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

function isHttpOrHttpsUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim())
}

function getThumbnailProxyAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {}
  if (typeof localStorage === 'undefined') return headers
  try {
    const userStr = localStorage.getItem('user')
    if (userStr) {
      const user = JSON.parse(userStr) as { id?: unknown }
      if (typeof user.id === 'string' && user.id.trim()) {
        headers['X-User-Id'] = user.id.trim()
      }
    }
  } catch {
    /* ignore */
  }
  const token = localStorage.getItem('launch_token')?.trim()
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  return headers
}

/**
 * Load remote bitmaps via same-origin API proxy so third-party hosts without CORS
 * still work for thumbnail StaticCanvas (no browser CORS errors).
 */
async function resolveImageSrcForThumbnailExport(src: string): Promise<string> {
  const trimmed = src.trim()
  if (!isHttpOrHttpsUrl(trimmed)) return trimmed
  const params = new URLSearchParams({ url: trimmed })
  try {
    const res = await fetch(`/api/thumbnail-asset?${params.toString()}`, {
      credentials: 'same-origin',
      headers: getThumbnailProxyAuthHeaders(),
    })
    if (!res.ok) return TRANSPARENT_1X1_PNG
    const blob = await res.blob()
    return URL.createObjectURL(blob)
  } catch {
    return TRANSPARENT_1X1_PNG
  }
}

/** Keys Fabric / SVG-like nodes may use for remote bitmap URLs (patterns, images, clipPath). */
const FABRIC_HTTP_URL_KEYS = new Set(['src', 'source', 'originalImageUrl', 'href'])

/**
 * Deep-rewrites remote image URLs anywhere in canvas JSON (objects, fills, backgroundImage,
 * clipPath, etc.) to blob: URLs or a transparent 1×1 data URL — avoids SecurityError on export.
 */
export async function rewriteFabricCanvasJsonImagesForThumbnailExport(
  canvasJson: object,
): Promise<{ json: object; revoke: () => void }> {
  const blobUrls: string[] = []
  const json = JSON.parse(JSON.stringify(canvasJson)) as Record<string, unknown>

  const visitDeep = async (node: unknown): Promise<void> => {
    if (node == null) return
    if (typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') return
    if (Array.isArray(node)) {
      await Promise.all(node.map((item) => visitDeep(item)))
      return
    }
    if (typeof node !== 'object') return

    const o = node as Record<string, unknown>
    for (const key of Object.keys(o)) {
      const val = o[key]
      if (
        typeof val === 'string' &&
        FABRIC_HTTP_URL_KEYS.has(key) &&
        isHttpOrHttpsUrl(val)
      ) {
        const next = await resolveImageSrcForThumbnailExport(val)
        o[key] = next
        if (key === 'src' && typeof o.type === 'string' && o.type.toLowerCase() === 'image') {
          o.crossOrigin = 'anonymous'
        }
        if (next.startsWith('blob:')) {
          blobUrls.push(next)
        }
      } else {
        await visitDeep(val)
      }
    }
  }

  await visitDeep(json)

  return {
    json,
    revoke: (): void => {
      for (const u of blobUrls) {
        try {
          URL.revokeObjectURL(u)
        } catch {
          /* noop */
        }
      }
    },
  }
}

type SerializedCanvasThumbnailOptions = {
  canvasJson: object
  width: number
  height: number
  maxWidth?: number
}

function convertCanvasElementToObjectUrl(
  element: HTMLCanvasElement,
  quality = THUMBNAIL_JPEG_QUALITY,
): Promise<string | null> {
  return new Promise((resolve) => {
    element.toBlob(
      (blob) => {
        if (!blob) {
          resolve(null)
          return
        }
        resolve(URL.createObjectURL(blob))
      },
      'image/jpeg',
      quality,
    )
  })
}

type SelectionVisualState = {
  target: FabricObject
  hasBorders: boolean
  hasControls: boolean
}

function getSelectionVisualTargets(canvas: Canvas): FabricObject[] {
  const targets = new Set<FabricObject>()
  const activeObject = canvas.getActiveObject?.() as FabricObject | null
  if (activeObject) targets.add(activeObject)

  const activeObjects =
    (canvas as Canvas & { getActiveObjects?: () => FabricObject[] }).getActiveObjects?.() ?? []
  for (const object of activeObjects) {
    if (object) targets.add(object)
  }

  return Array.from(targets)
}

function copyCanvasElement(
  sourceElement: HTMLCanvasElement,
  multiplier: number,
): HTMLCanvasElement | null {
  const snapshotElement = document.createElement('canvas')
  snapshotElement.width = Math.max(1, Math.round(sourceElement.width * multiplier))
  snapshotElement.height = Math.max(1, Math.round(sourceElement.height * multiplier))

  const context = snapshotElement.getContext('2d')
  if (!context) return null

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, snapshotElement.width, snapshotElement.height)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(sourceElement, 0, 0, snapshotElement.width, snapshotElement.height)
  return snapshotElement
}

function createLiveCanvasThumbnailSnapshotElement(
  canvas: Canvas,
  sourceElement: HTMLCanvasElement,
  multiplier: number,
): HTMLCanvasElement | null {
  const selectionVisuals: SelectionVisualState[] = getSelectionVisualTargets(canvas).map((target) => ({
    target,
    hasBorders: target.hasBorders,
    hasControls: target.hasControls,
  }))

  try {
    for (const { target } of selectionVisuals) {
      target.set({ hasBorders: false, hasControls: false })
    }
    canvas.renderAll()
    return copyCanvasElement(sourceElement, multiplier)
  } finally {
    for (const { target, hasBorders, hasControls } of selectionVisuals) {
      target.set({ hasBorders, hasControls })
    }
    canvas.renderAll()
  }
}

function getSafeCanvasSize(width: number, height: number): { width: number; height: number } {
  return {
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  }
}

/** JPEG thumbnails cannot represent transparency; empty/transparent Fabric `background` becomes black. */
function applyOpaqueWhiteThumbnailBackground(canvasJson: object): void {
  const root = canvasJson as Record<string, unknown>
  root.background = '#ffffff'
}

export async function createCanvasThumbnailObjectUrl(
  canvas: Canvas,
  maxWidth = CANVAS_THUMBNAIL_PIXEL_WIDTH,
): Promise<string | null> {
  const lifecycle = canvas as Canvas & { disposed?: boolean }
  if (lifecycle.disposed) return null

  const width = canvas.getWidth()
  if (!Number.isFinite(width) || width <= 0) return null

  const multiplier = Math.min(1, maxWidth / width)

  try {
    const sourceElement = canvas.getElement()
    if (!(sourceElement instanceof HTMLCanvasElement)) return null
    const snapshotElement = createLiveCanvasThumbnailSnapshotElement(canvas, sourceElement, multiplier)
    if (!snapshotElement) return null
    return await convertCanvasElementToObjectUrl(snapshotElement)
  } catch {
    return null
  }
}

export async function createSerializedCanvasThumbnailObjectUrl({
  canvasJson,
  width,
  height,
  maxWidth = CANVAS_THUMBNAIL_PIXEL_WIDTH,
}: SerializedCanvasThumbnailOptions): Promise<string | null> {
  if (typeof document === 'undefined') return null

  const { json: safeJson, revoke } = await rewriteFabricCanvasJsonImagesForThumbnailExport(canvasJson)
  applyOpaqueWhiteThumbnailBackground(safeJson)

  const logicalSize = getSafeCanvasSize(width, height)
  const scale = Math.min(1, maxWidth / logicalSize.width)
  const thumbnailWidth = Math.max(1, Math.round(logicalSize.width * scale))
  const thumbnailHeight = Math.max(1, Math.round(logicalSize.height * scale))
  const element = document.createElement('canvas')

  const canvas = new StaticCanvas(element, {
    width: thumbnailWidth,
    height: thumbnailHeight,
    backgroundColor: '#ffffff',
  })

  try {
    const loadJson = omitFabricCanvasJsonSurfaceFields(safeJson as Record<string, unknown>)
    await canvas.loadFromJSON(loadJson)
    canvas.setDimensions({ width: thumbnailWidth, height: thumbnailHeight })
    canvas.backgroundColor = '#ffffff'
    canvas.setViewportTransform([scale, 0, 0, scale, 0, 0])
    canvas.renderAll()

    const sourceElement = canvas.getElement()
    if (!(sourceElement instanceof HTMLCanvasElement)) return null
    return await convertCanvasElementToObjectUrl(sourceElement)
  } catch {
    return null
  } finally {
    revoke()
    void canvas.dispose()
  }
}
