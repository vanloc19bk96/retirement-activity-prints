import type { FabricObject } from 'fabric'
import { loadSVGFromURL, util } from 'fabric'

/**
 * SVG sources often declare only a `viewBox` (no intrinsic width/height).
 * Loading them as `FabricImage` yields a visible selection box with no pixels.
 */
export function isSvgImageSrc(src: string): boolean {
  const value = src.trim().toLowerCase()
  if (value.startsWith('data:image/svg+xml')) return true
  const path = value.split(/[?#]/, 1)[0] ?? value
  return path.endsWith('.svg')
}

/** Parse an SVG URL / data-URI into a selectable Fabric group (or single object). */
export async function loadSvgAsFabricObject(src: string): Promise<FabricObject | null> {
  const { objects, options: svgOptions } = await loadSVGFromURL(src, undefined, {
    crossOrigin: 'anonymous',
  })
  const validObjects = objects.filter((obj): obj is FabricObject => Boolean(obj))
  if (validObjects.length === 0) return null
  return util.groupSVGElements(validObjects, svgOptions)
}
