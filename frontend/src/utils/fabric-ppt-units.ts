import { DPI } from '@/types/canvas-settings.types'

export function pixelsToInches(pixels: number): number {
  return pixels / DPI
}

export function pixelsToPoints(pixels: number): number {
  return (pixels * 72) / DPI
}

export function parseFabricColor(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null

  const normalized = value.trim()
  if (normalized === 'transparent' || normalized === 'none') return null

  if (normalized.startsWith('#')) {
    const hex = normalized.slice(1)
    if (/^[0-9a-fA-F]{3}$/.test(hex)) {
      return hex
        .split('')
        .map((char) => char + char)
        .join('')
        .toUpperCase()
    }
    if (/^[0-9a-fA-F]{6}$/.test(hex)) {
      return hex.toUpperCase()
    }
    return null
  }

  const rgbMatch = normalized.match(
    /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/i,
  )
  if (!rgbMatch) return null

  // Fully transparent fills (e.g. Fabric default `rgba(0,0,0,0)`) must map to no color,
  // otherwise PPT renders them as solid black.
  const alpha = rgbMatch[4] !== undefined ? Number(rgbMatch[4]) : 1
  if (Number.isFinite(alpha) && alpha <= 0) return null

  const toHex = (channel: string): string => Number(channel).toString(16).padStart(2, '0')
  return `${toHex(rgbMatch[1]!)}${toHex(rgbMatch[2]!)}${toHex(rgbMatch[3]!)}`.toUpperCase()
}

export function parseFabricFontFamily(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return 'Inter'

  const primary = value
    .split(',')[0]
    ?.trim()
    .replace(/^["']|["']$/g, '')

  return primary || 'Inter'
}

export function parseFabricTextAlign(value: unknown): 'left' | 'center' | 'right' | 'justify' {
  if (value === 'center' || value === 'right' || value === 'justify') return value
  return 'left'
}

const PPT_TEXT_WIDTH_PADDING_RATIO = 1.08
const PPT_TEXT_MIN_CHAR_WIDTH_RATIO = 0.62

type PptTextBox = {
  x: number
  y: number
  w: number
  h: number
}

type FabricTextLayoutInput = {
  text?: string
  fontSize?: number
  scaleX?: number
  scaleY?: number
  originX?: string | number
  originY?: string | number
  width?: number
  textAlign?: string
}

export function resolvePptTextAlignFromFabricText(
  object: FabricTextLayoutInput,
): 'left' | 'center' | 'right' | 'justify' {
  if (object.textAlign === 'center' || object.textAlign === 'right' || object.textAlign === 'justify') {
    return parseFabricTextAlign(object.textAlign)
  }
  if (object.originX === 'center') return 'center'
  if (object.originX === 'right') return 'right'
  return parseFabricTextAlign(object.textAlign)
}

export function resolveFabricTextVisualFontSizePx(object: FabricTextLayoutInput): number {
  const fontSize = object.fontSize ?? 12
  const scaleX =
    typeof object.scaleX === 'number' && Number.isFinite(object.scaleX) ? Math.abs(object.scaleX) : 1
  const scaleY =
    typeof object.scaleY === 'number' && Number.isFinite(object.scaleY) ? Math.abs(object.scaleY) : 1
  const textScale = scaleY > 0 ? scaleY : scaleX
  return fontSize * (textScale > 0 ? textScale : 1)
}

type FabricStrokeLayoutInput = {
  strokeWidth?: unknown
  strokeUniform?: unknown
  scaleX?: unknown
  scaleY?: unknown
}

export function resolveFabricVisualStrokeWidthPx(object: FabricStrokeLayoutInput): number {
  const strokeWidth = typeof object.strokeWidth === 'number' ? object.strokeWidth : 0
  if (strokeWidth <= 0) return 0

  const scaleX =
    typeof object.scaleX === 'number' && Number.isFinite(object.scaleX) ? Math.abs(object.scaleX) : 1
  const scaleY =
    typeof object.scaleY === 'number' && Number.isFinite(object.scaleY) ? Math.abs(object.scaleY) : 1
  const scale = Math.max(scaleX, scaleY, 0.0001)

  if (object.strokeUniform === true) {
    // Fabric applies strokeUniform by dividing strokeWidth before the scale transform.
    // PPT line width has no non-scaling-stroke equivalent, so pre-compensate.
    return strokeWidth / scale
  }

  return strokeWidth * scale
}

/**
 * True when Fabric already laid the run on one visual line (no soft-wrap).
 * PPT bold metrics are often wider than Fabric — those labels must expand /
 * disable wrap on export so “Game 1” does not drop the digit onto the next line.
 */
export function isFabricTextSingleVisualLine(object: {
  text?: string
  _textLines?: unknown[]
  textLines?: unknown[]
}): boolean {
  const text = object.text ?? ''
  if (!text || text.includes('\n')) return false
  const lines = object._textLines ?? object.textLines
  if (Array.isArray(lines)) return lines.length <= 1
  return true
}

export function expandPptTextBoxForFabricText(args: {
  box: PptTextBox
  object: FabricTextLayoutInput
  pixelBounds: { width: number; height: number }
}): PptTextBox {
  const { box, object, pixelBounds } = args
  const trimmedText = (object.text ?? '').trim()
  const fontSizePx = resolveFabricTextVisualFontSizePx(object)
  const longestLineLength = trimmedText
    .split('\n')
    .reduce((max, line) => Math.max(max, line.trim().length), 0)
  const textboxWidthPx =
    typeof object.width === 'number' && object.width > 0 ? object.width * (object.scaleX ?? 1) : 0

  const minWidthPx = Math.max(
    fontSizePx * Math.max(1, longestLineLength) * PPT_TEXT_MIN_CHAR_WIDTH_RATIO,
    textboxWidthPx,
    pixelBounds.width,
  )
  const minHeightPx = Math.max(fontSizePx * 1.15, pixelBounds.height)
  const targetWidthPx = minWidthPx * PPT_TEXT_WIDTH_PADDING_RATIO
  const targetHeightPx = minHeightPx * PPT_TEXT_WIDTH_PADDING_RATIO

  let x = box.x
  let y = box.y
  const w = pixelsToInches(targetWidthPx)
  const h = pixelsToInches(targetHeightPx)
  // textAlign center/right with originX left is common for digit badges — grow
  // around the Fabric box center so PPT padding does not shove glyphs sideways.
  const align = resolvePptTextAlignFromFabricText(object)

  if (object.originX === 'center' || align === 'center') {
    x = box.x + box.w / 2 - w / 2
  } else if (object.originX === 'right' || align === 'right') {
    x = box.x + box.w - w
  }

  if (object.originY === 'center' || align === 'center') {
    y = box.y + box.h / 2 - h / 2
  } else if (object.originY === 'bottom') {
    y = box.y + box.h - h
  }

  return { x, y, w, h }
}

export function isBoldFontWeight(value: unknown): boolean {
  if (value === 'bold' || value === 700 || value === '700') return true
  if (typeof value === 'number' && value >= 600) return true
  return false
}

export function fabricOpacityToTransparency(opacity: unknown): number | undefined {
  if (typeof opacity !== 'number' || !Number.isFinite(opacity)) return undefined
  const clamped = Math.min(1, Math.max(0, opacity))
  if (clamped >= 1) return undefined
  return Math.round((1 - clamped) * 100)
}
