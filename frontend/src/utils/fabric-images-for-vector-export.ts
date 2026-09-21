import { FabricImage, type FabricObject, type StaticCanvas } from 'fabric'

import { DPI } from '@/types/canvas-settings.types'

/** Target print density for raster embeds in vector PDF/SVG export. */
const VECTOR_EXPORT_PRINT_DPI = 300

/** Cap a single embedded bitmap so one dense page cannot blow peak RAM. */
const MAX_INLINE_EDGE_PX = 1024

const JPEG_QUALITY = 0.82

type SourceCropRect = {
  cropX: number
  cropY: number
  width: number
  height: number
}

function walkNestedFabricObjects(rootObjects: FabricObject[], visit: (obj: FabricObject) => void): void {
  for (const obj of rootObjects) {
    const getObjects = (obj as { getObjects?: () => FabricObject[] }).getObjects
    const children = typeof getObjects === 'function' ? getObjects.call(obj) : undefined
    if (children && children.length > 0) {
      walkNestedFabricObjects(children, visit)
    }
    visit(obj)
  }
}

function isFabricImage(obj: FabricObject): obj is FabricImage {
  return obj instanceof FabricImage || obj.type === 'image'
}

function getElementNaturalSize(element: CanvasImageSource): { width: number; height: number } | null {
  const naturalWidth =
    element instanceof HTMLImageElement
      ? element.naturalWidth || element.width
      : element instanceof HTMLCanvasElement
        ? element.width
        : 0
  const naturalHeight =
    element instanceof HTMLImageElement
      ? element.naturalHeight || element.height
      : element instanceof HTMLCanvasElement
        ? element.height
        : 0
  if (naturalWidth < 1 || naturalHeight < 1) return null
  return { width: naturalWidth, height: naturalHeight }
}

/** Visible source window in bitmap pixels (Fabric cropX/cropY/width/height). */
function getFabricImageSourceCrop(image: FabricImage, natural: { width: number; height: number }): SourceCropRect {
  const cropX = Math.max(0, Math.min(image.cropX ?? 0, natural.width - 1))
  const cropY = Math.max(0, Math.min(image.cropY ?? 0, natural.height - 1))
  const width = Math.max(1, Math.min(image.width ?? natural.width, natural.width - cropX))
  const height = Math.max(1, Math.min(image.height ?? natural.height, natural.height - cropY))
  return { cropX, cropY, width, height }
}

function hasActiveSourceCrop(crop: SourceCropRect, natural: { width: number; height: number }): boolean {
  return (
    crop.cropX > 0 ||
    crop.cropY > 0 ||
    crop.width < natural.width - 0.5 ||
    crop.height < natural.height - 0.5
  )
}

function resolveInlinePixelSize(
  image: FabricImage,
  sourceCrop: SourceCropRect,
): { width: number; height: number } | null {
  const element = image.getElement()
  if (!element) return null

  const natural = getElementNaturalSize(element)
  if (!natural) return null

  const size = computeVectorExportInlineSize({
    naturalWidth: sourceCrop.width,
    naturalHeight: sourceCrop.height,
    displayWidth: Math.max(1, image.getScaledWidth()),
    displayHeight: Math.max(1, image.getScaledHeight()),
  })

  // Already small enough and already a data URI — svg2pdf will not re-fetch.
  // Still re-bake when a crop window is active so PDF does not keep stale crop offsets.
  const src = typeof image.getSrc === 'function' ? image.getSrc() : ''
  if (
    !hasActiveSourceCrop(sourceCrop, natural) &&
    src.startsWith('data:image/') &&
    natural.width <= size.width + 1 &&
    natural.height <= size.height + 1
  ) {
    return null
  }

  return size
}

function rasterElementToJpegDataUrl(
  element: CanvasImageSource,
  width: number,
  height: number,
  sourceCrop: SourceCropRect,
): string | null {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return null

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  try {
    // Bake the Fabric crop window into pixels — drawing the full element into the
    // display box stretches/squeezes cropped photos in PDF/SVG export.
    context.drawImage(
      element,
      sourceCrop.cropX,
      sourceCrop.cropY,
      sourceCrop.width,
      sourceCrop.height,
      0,
      0,
      width,
      height,
    )
    return canvas.toDataURL('image/jpeg', JPEG_QUALITY)
  } catch {
    // Tainted canvas (missing CORS) — leave the original src for svg2pdf.
    return null
  }
}

async function inlineOneFabricImageForVectorExport(image: FabricImage): Promise<void> {
  const element = image.getElement()
  if (!element) return

  const natural = getElementNaturalSize(element)
  if (!natural) return

  const sourceCrop = getFabricImageSourceCrop(image, natural)
  const size = resolveInlinePixelSize(image, sourceCrop)
  if (!size) return

  const prevScaledWidth = image.getScaledWidth()
  const prevScaledHeight = image.getScaledHeight()

  const dataUrl = rasterElementToJpegDataUrl(element, size.width, size.height, sourceCrop)
  if (!dataUrl) return

  await image.setSrc(dataUrl, { crossOrigin: 'anonymous' })
  // Buffer already contains the crop window — clear offsets so Fabric does not crop twice.
  image.set({
    cropX: 0,
    cropY: 0,
    width: size.width,
    height: size.height,
    scaleX: prevScaledWidth / Math.max(1, size.width),
    scaleY: prevScaledHeight / Math.max(1, size.height),
  })
  image.setCoords()
}

/**
 * Replace remote / oversized Fabric bitmaps with compact JPEG data URIs sized for print.
 *
 * svg2pdf re-fetches every `xlink:href` via XHR and builds binary strings — hundreds of
 * full-res outline PNGs (Which Did You See? grids) OOM or abort PDF export around ~40 pages.
 * Inlining after Fabric already loaded the pixels avoids the second fetch and bounds RAM.
 */
export async function inlineFabricImagesForVectorExport(canvas: StaticCanvas): Promise<void> {
  const images: FabricImage[] = []
  walkNestedFabricObjects(canvas.getObjects(), (obj) => {
    if (isFabricImage(obj)) images.push(obj)
  })

  // Sequential — parallel toDataURL of dense grids spikes peak memory.
  for (const image of images) {
    await inlineOneFabricImageForVectorExport(image)
  }
}

/**
 * Pure helper for unit tests — target pixel size from display vs source (crop) dims.
 * Scales uniformly so aspect ratio is preserved when capping natural size / max edge.
 */
export function computeVectorExportInlineSize(options: {
  naturalWidth: number
  naturalHeight: number
  displayWidth: number
  displayHeight: number
}): { width: number; height: number } {
  const printScale = VECTOR_EXPORT_PRINT_DPI / DPI
  let width = Math.max(1, Math.ceil(options.displayWidth * printScale))
  let height = Math.max(1, Math.ceil(options.displayHeight * printScale))

  const sourceScale = Math.min(1, options.naturalWidth / width, options.naturalHeight / height)
  width *= sourceScale
  height *= sourceScale

  const maxEdge = Math.max(width, height)
  if (maxEdge > MAX_INLINE_EDGE_PX) {
    const edgeScale = MAX_INLINE_EDGE_PX / maxEdge
    width *= edgeScale
    height *= edgeScale
  }

  return {
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  }
}
