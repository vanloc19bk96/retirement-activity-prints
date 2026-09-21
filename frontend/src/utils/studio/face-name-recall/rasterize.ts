import { FACE_VIEW_BOX } from './face-preview'

/** Fallback size when there is no DOM to rasterise with — matches the bust crop. */
export const FACE_NATURAL_SIZE = FACE_VIEW_BOX.size
/** Raster size for Fabric images — sharp enough for print, small enough for store. */
const RASTER_SIZE = 512

function svgToBase64DataUri(svg: string): string {
  const encoded =
    typeof globalThis.btoa === 'function'
      ? globalThis.btoa(unescape(encodeURIComponent(svg)))
      : Buffer.from(svg, 'utf8').toString('base64')
  return `data:image/svg+xml;charset=utf-8;base64,${encoded}`
}

/**
 * Decode SVG → PNG data-URI for Fabric.
 * SVG-as-<img> with masks can fail or crop oddly; PNG is reliable.
 * Falls back to the SVG data-URI when DOM canvas is unavailable (tests / SSR).
 */
export async function rasterizeSvgToPngDataUri(svg: string): Promise<{
  dataUri: string
  naturalSize: number
}> {
  const svgUri = svgToBase64DataUri(svg)

  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return { dataUri: svgUri, naturalSize: FACE_NATURAL_SIZE }
  }

  const image = await loadHtmlImage(svgUri)
  const canvas = document.createElement('canvas')
  canvas.width = RASTER_SIZE
  canvas.height = RASTER_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return { dataUri: svgUri, naturalSize: FACE_NATURAL_SIZE }
  }

  // Opaque paper — KDP B&W interiors must not rely on transparency.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, RASTER_SIZE, RASTER_SIZE)
  ctx.drawImage(image, 0, 0, RASTER_SIZE, RASTER_SIZE)

  return { dataUri: canvas.toDataURL('image/png'), naturalSize: RASTER_SIZE }
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Face SVG failed to decode as an image'))
    image.src = src
  })
}
