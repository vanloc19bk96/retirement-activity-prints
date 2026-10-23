import type { Canvas, FabricObject } from 'fabric'

import type { BookCoverDimensions, BookCoverZones, ZoneRect } from '@/types/book-cover.types'
import { DPI } from '@/types/canvas-settings.types'

/** Fully transparent pixels (empty canvas areas) carry no color information. */
const MIN_ALPHA = 128
/** Colors closer than this (RGB distance) count as the same swatch. */
const MIN_SWATCH_DISTANCE = 48
/** Width of the cover strip beside each spine fold that sets the edge colors. */
const EDGE_STRIP_INCHES = 0.35
const SAMPLE_TARGET_PX = 64
const MAX_PALETTE_SIZE = 8

type Rgb = [number, number, number]

function toHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`
}

function parseHex(hex: string): Rgb | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) return null
  const value = Number.parseInt(match[1], 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

function distance(a: Rgb, b: Rgb): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

/** Mean color of the opaque pixels in RGBA data, or null when none are opaque. */
export function averageColor(data: Uint8ClampedArray): string | null {
  let r = 0
  let g = 0
  let b = 0
  let count = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < MIN_ALPHA) continue
    r += data[i]
    g += data[i + 1]
    b += data[i + 2]
    count += 1
  }
  if (count === 0) return null
  return toHex([r / count, g / count, b / count])
}

/** Most common colors in RGBA data (4-bit buckets), most frequent first. */
export function dominantColors(data: Uint8ClampedArray, max: number): string[] {
  const buckets = new Map<number, { count: number; sum: Rgb }>()
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < MIN_ALPHA) continue
    const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4)
    const bucket = buckets.get(key) ?? { count: 0, sum: [0, 0, 0] }
    bucket.count += 1
    bucket.sum[0] += data[i]
    bucket.sum[1] += data[i + 1]
    bucket.sum[2] += data[i + 2]
    buckets.set(key, bucket)
  }

  const ranked = [...buckets.values()]
    .sort((a, b) => b.count - a.count)
    .map(({ count, sum }): Rgb => [sum[0] / count, sum[1] / count, sum[2] / count])

  return mergeSwatches(ranked.map(toHex), max)
}

/** Drop near-duplicate colors, keeping the first of each, up to `max` swatches. */
export function mergeSwatches(colors: Array<string | null>, max: number): string[] {
  const kept: Rgb[] = []
  for (const color of colors) {
    const rgb = color ? parseHex(color) : null
    if (!rgb) continue
    if (kept.some((existing) => distance(existing, rgb) < MIN_SWATCH_DISTANCE)) continue
    kept.push(rgb)
    if (kept.length >= max) break
  }
  return kept.map(toHex)
}

function relativeLuminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map((channel) => {
    const c = channel / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Black or white text, whichever reads better on `backgroundHex`. */
export function readableTextColor(backgroundHex: string): '#ffffff' | '#111111' {
  const rgb = parseHex(backgroundHex)
  if (!rgb) return '#111111'
  const luminance = relativeLuminance(rgb)
  // Contrast ratio against white vs. against black.
  return 1.05 / (luminance + 0.05) >= (luminance + 0.05) / 0.05 ? '#ffffff' : '#111111'
}

function readRegionPixels(
  canvas: Canvas,
  rect: ZoneRect,
  filter: (object: FabricObject) => boolean,
): Uint8ClampedArray | null {
  if (rect.width <= 0 || rect.height <= 0) return null
  const zoom = canvas.getZoom()
  const vpt = canvas.viewportTransform ?? [1, 0, 0, 1, 0, 0]
  const screenWidth = rect.width * zoom
  const screenHeight = rect.height * zoom
  const multiplier = SAMPLE_TARGET_PX / Math.max(screenWidth, screenHeight)

  const element = canvas.toCanvasElement(multiplier, {
    left: rect.x * zoom + vpt[4],
    top: rect.y * zoom + vpt[5],
    width: screenWidth,
    height: screenHeight,
    // Canvas children are full FabricObjects; Fabric types the filter with the base class.
    filter: (object) => filter(object as FabricObject),
  })
  const context = element.getContext('2d')
  if (!context || element.width === 0 || element.height === 0) return null
  return context.getImageData(0, 0, element.width, element.height).data
}

/** Main colors of one cover area, leaving out the objects `exclude` matches. */
export function sampleCoverAreaPalette(
  canvas: Canvas,
  rect: ZoneRect,
  exclude: (object: FabricObject) => boolean,
): string[] {
  try {
    const pixels = readRegionPixels(canvas, rect, (object) => !exclude(object))
    return pixels ? dominantColors(pixels, MAX_PALETTE_SIZE) : []
  } catch {
    // A cross-origin image taints the sample canvas; fall back to presets.
    return []
  }
}

/**
 * Swatches that match the cover: the colors right beside each spine fold
 * first (they blend into the spine best), then the front cover's main colors.
 * Spine objects are left out so the spine does not suggest its own color.
 */
export function sampleBookCoverPalette(
  canvas: Canvas,
  zones: BookCoverZones,
  dimensions: BookCoverDimensions,
  isSpineObject: (object: FabricObject) => boolean,
): string[] {
  const strip = EDGE_STRIP_INCHES * DPI
  const filter = (object: FabricObject): boolean => !isSpineObject(object)
  const top = 0
  const height = dimensions.fullHeightPixels

  try {
    const frontEdge = readRegionPixels(
      canvas,
      { x: zones.frontCover.x, y: top, width: strip, height },
      filter,
    )
    const backEdge = readRegionPixels(
      canvas,
      { x: zones.spine.x - strip, y: top, width: strip, height },
      filter,
    )
    const front = readRegionPixels(canvas, zones.frontCover, filter)

    return mergeSwatches(
      [
        frontEdge ? averageColor(frontEdge) : null,
        backEdge ? averageColor(backEdge) : null,
        ...(front ? dominantColors(front, MAX_PALETTE_SIZE) : []),
      ],
      MAX_PALETTE_SIZE,
    )
  } catch {
    // A cross-origin image taints the sample canvas; fall back to presets.
    return []
  }
}
