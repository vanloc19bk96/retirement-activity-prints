/**
 * Text metrics that agree with what Fabric actually renders.
 *
 * Studio generators decide wrapping and stack heights *before* Fabric exists,
 * so every number here mirrors a specific Fabric behaviour:
 *
 * * **Line boxes.** `FabricText._fontSizeMult` (see `FABRIC_FONT_SIZE_MULT`) and
 *   `lineHeight` multiply, so a rendered line is
 *   `fontSize x FABRIC_FONT_SIZE_MULT x lineHeight` tall — not
 *   `fontSize x lineHeight`. Reserving the smaller number is what lets a wrapped
 *   prompt collide with whatever is drawn under it.
 * * **Glyph widths.** Fabric measures each glyph with `ctx.measureText` at
 *   `CACHE_FONT_SIZE` and scales linearly. Doing the same here means our wrap
 *   points are Fabric's wrap points, so a manually wrapped prompt is never
 *   re-wrapped into a line the layout did not reserve.
 *
 * In Node (tests, SSR) there is no canvas, so a per-character advance table
 * stands in. `isExactMeasurement` reports which mode is live so callers can
 * widen their wrap safety pad when the numbers are only estimates.
 */

import { STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import { FABRIC_TEXT_FONT_SIZE_MULT } from '@/utils/fabric-text-vertical-metrics'

/** Fabric `FabricText._fontSizeMult` — keep in sync with editor text metrics. */
export const FABRIC_FONT_SIZE_MULT = FABRIC_TEXT_FONT_SIZE_MULT

/** Fabric `FabricText.CACHE_FONT_SIZE` — measure here, scale to the real size. */
const MEASURE_FONT_SIZE = 400

/** Generic families Fabric does not quote in its font declaration. */
const GENERIC_FONTS = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
])

export interface FontSpec {
  fontFamily?: string
  fontWeight?: string | number
  fontStyle?: 'normal' | 'italic' | 'oblique'
}

/** The same string Fabric feeds to `ctx.font`, so the browser cache is shared. */
function fontDeclaration(spec: FontSpec, size: number): string {
  const family = spec.fontFamily?.trim() || STUDIO_DEFAULT_FONT
  const quoted =
    family.includes("'") ||
    family.includes('"') ||
    family.includes(',') ||
    GENERIC_FONTS.has(family.toLowerCase())
      ? family
      : `"${family}"`
  const weight = spec.fontWeight ?? 'normal'
  const style = spec.fontStyle ?? 'normal'
  return `${style} ${weight} ${size}px ${quoted}`
}

let cachedContext: CanvasRenderingContext2D | null | undefined

function measuringContext(): CanvasRenderingContext2D | null {
  if (cachedContext !== undefined) return cachedContext
  cachedContext = null
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    try {
      const ctx = document.createElement('canvas').getContext('2d')
      // jsdom hands back a context whose measureText always reports 0 — useless.
      if (ctx && ctx.measureText('MMMM').width > 0) cachedContext = ctx
    } catch {
      cachedContext = null
    }
  }
  return cachedContext
}

/** `declaration -> run -> width at MEASURE_FONT_SIZE`. Mirrors Fabric's font cache. */
const runWidthCache = new Map<string, Map<string, number>>()
/** Times `runWidthCache` has been dropped. */
let metricsEpoch = 0

function cacheFor(declaration: string): Map<string, number> {
  let cache = runWidthCache.get(declaration)
  if (!cache) {
    cache = new Map()
    runWidthCache.set(declaration, cache)
  }
  return cache
}

/**
 * Drop measurements taken before a webfont finished loading — otherwise the
 * first layout after a lazy font load is built on fallback-font widths.
 */
export function clearStudioTextMetricsCache(): void {
  runWidthCache.clear()
  metricsEpoch++
}

/**
 * Bumped every time the width cache is dropped. Callers that cache results
 * built on these widths key them by it, so a plan made on fallback-font widths
 * does not outlive the real font arriving.
 */
export function studioTextMetricsEpoch(): number {
  return metricsEpoch
}

// Per-character advance in em, used only when no canvas is available.
// Tuned against PT Serif (the Studio default): narrow letters, wide caps.
const NARROW_CHARS = new Set(['i', 'l', 'j', 't', 'f', 'I', '.', ',', ';', ':', '!', "'", '"', '|', '(', ')', '[', ']', '-', '`'])
const WIDE_CHARS = new Set(['m', 'w', 'M', 'W', '@', '%'])
const SPACE_EM = 0.25
const NARROW_EM = 0.3
const WIDE_EM = 0.86
const UPPER_EM = 0.66
const DIGIT_EM = 0.5
const DEFAULT_EM = 0.49

function estimateRunWidth(text: string, fontSize: number): number {
  let em = 0
  for (const ch of text) {
    if (ch === ' ' || ch === '\u00a0') em += SPACE_EM
    else if (NARROW_CHARS.has(ch)) em += NARROW_EM
    else if (WIDE_CHARS.has(ch)) em += WIDE_EM
    else if (ch >= '0' && ch <= '9') em += DIGIT_EM
    else if (ch >= 'A' && ch <= 'Z') em += UPPER_EM
    else em += DEFAULT_EM
  }
  return em * fontSize
}

/**
 * True when widths come from a real canvas with the requested font available.
 * Callers use it to pick how much slack to leave before Fabric's own wrap.
 */
export function isExactMeasurement(spec: FontSpec = {}): boolean {
  if (!measuringContext()) return false
  if (typeof document === 'undefined' || typeof document.fonts?.check !== 'function') {
    return false
  }
  try {
    return document.fonts.check(fontDeclaration(spec, 16))
  } catch {
    return false
  }
}

/**
 * Force the face itself to download, then report whether measurement is exact.
 *
 * A resolved `<link rel=stylesheet>` only means the CSS arrived — the woff2 is
 * fetched lazily, so `document.fonts.check` stays false and layout falls back
 * to estimated glyph widths. Fabric then measures the real face once it lands
 * and wraps differently from the plan, which is how a line the layout sized for
 * the column ends up running past it.
 */
export async function ensureExactMeasurement(spec: FontSpec = {}): Promise<boolean> {
  if (isExactMeasurement(spec)) return true
  if (typeof document === 'undefined' || typeof document.fonts?.load !== 'function') {
    return false
  }
  try {
    await Promise.race([
      document.fonts.load(fontDeclaration(spec, 16)),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ])
  } catch {
    return false
  }
  // Anything measured against the fallback face is now wrong.
  clearStudioTextMetricsCache()
  return isExactMeasurement(spec)
}

function cachedWidth(
  ctx: CanvasRenderingContext2D,
  cache: Map<string, number>,
  declaration: string,
  run: string,
): number {
  let width = cache.get(run)
  if (width === undefined) {
    ctx.font = declaration
    width = ctx.measureText(run).width
    cache.set(run, width)
  }
  return width
}

/**
 * Width of a single-line run at `fontSize`, accumulated the way Fabric's
 * `_wrapLine` does it: one measurement per word plus one standalone space per
 * gap.
 *
 * Measuring the whole string in one call is not equivalent — the browser
 * applies kerning across the word boundaries and returns a few pixels less.
 * That gap is small, and it is exactly large enough to make a line Fabric
 * considers too wide look like it fits, which is how a prompt the layout
 * planned as two lines came out as three.
 */
export function measureRunWidth(
  text: string,
  fontSize: number,
  spec: FontSpec = {},
): number {
  if (!text) return 0
  // NBSP and space share an advance; normalizing keeps the wrap decision and
  // the drawn (NBSP-joined) string measuring identically.
  const normalized = text.replace(/\u00a0/g, ' ')
  const ctx = measuringContext()
  if (!ctx) return estimateRunWidth(normalized, fontSize)

  const declaration = fontDeclaration(spec, MEASURE_FONT_SIZE)
  const cache = cacheFor(declaration)
  const words = normalized.split(' ')
  let base = 0
  if (words.length > 1) {
    base += (words.length - 1) * cachedWidth(ctx, cache, declaration, ' ')
  }
  for (const word of words) {
    if (word) base += cachedWidth(ctx, cache, declaration, word)
  }
  return (base * fontSize) / MEASURE_FONT_SIZE
}

/** Widest line of a `\n`-separated block. */
export function measureBlockWidth(
  text: string,
  fontSize: number,
  spec: FontSpec = {},
): number {
  let widest = 0
  for (const line of text.split('\n')) {
    widest = Math.max(widest, measureRunWidth(line, fontSize, spec))
  }
  return widest
}

/**
 * Textbox width that hugs the run without inviting a soft wrap.
 * Fabric wraps only when a line is *strictly* wider than the box, so a pixel of
 * slack is enough when metrics are exact; estimates need a percentage.
 */
export function hugTextBoxWidth(
  text: string,
  fontSize: number,
  maxWidth: number,
  spec: FontSpec = {},
): number {
  const measured = measureBlockWidth(text, fontSize, spec)
  const pad = isExactMeasurement(spec) ? 1 : Math.max(2, measured * 0.06)
  return Math.min(maxWidth, Math.max(fontSize, Math.ceil(measured + pad)))
}

/** Height Fabric gives one rendered line: `fontSize x mult x lineHeight`. */
export function fabricLinePitch(fontSize: number, lineHeight = 1): number {
  return fontSize * FABRIC_FONT_SIZE_MULT * lineHeight
}

/**
 * Height of a textbox — Fabric's `calcTextHeight`: full pitch for every line
 * except the last, which contributes only its glyph box.
 */
export function fabricTextHeight(
  lineCount: number,
  fontSize: number,
  lineHeight = 1,
): number {
  const lines = Math.max(1, lineCount)
  return (
    (lines - 1) * fabricLinePitch(fontSize, lineHeight) +
    fontSize * FABRIC_FONT_SIZE_MULT
  )
}

/**
 * Width to break lines at so Fabric — which re-wraps anything wider than the
 * textbox — leaves our hard `\n` breaks alone.
 */
export function wrapSafeWidth(boxWidth: number, spec: FontSpec = {}): number {
  // Leave real air before the column edge. Exact canvas metrics still disagree
  // with Fabric's grapheme/kerning path by a few percent; wrapping flush then
  // locking spaces made Textbox expand past the safe-area guide. The pad must
  // stay larger than that skew so NBSP-locked hard lines never outgrow the box
  // (soft-wrapping them instead under-reserves height and stacks onto options).
  // Estimated metrics need a wider pad because they can be optimistic.
  const pad = isExactMeasurement(spec)
    ? Math.max(12, boxWidth * 0.08)
    : Math.max(16, boxWidth * 0.14)
  return Math.max(1, boxWidth - pad)
}

export interface WrapOptions extends FontSpec {
  /** Extra indent on every line after the first (hanging indent). */
  hangingIndent?: number
}

/**
 * Greedy word wrap using the same widths Fabric will use.
 *
 * Returns explicit lines so the caller can join them with `\n` and know the
 * line count for certain. A word wider than the column is split on character
 * boundaries rather than allowed to bleed past the measure.
 */
export function wrapTextToWidth(
  text: string,
  fontSize: number,
  maxWidth: number,
  options: WrapOptions = {},
): string[] {
  const { hangingIndent = 0, ...spec } = options
  const firstWidth = Math.max(fontSize, maxWidth)
  const restWidth = Math.max(fontSize, maxWidth - hangingIndent)
  const lines: string[] = []

  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean)
    if (words.length === 0) {
      lines.push('')
      continue
    }

    let current = ''
    // The first visual line of the whole block gets the full measure; every
    // continuation line is narrowed by the hanging indent.
    const widthFor = () => (lines.length === 0 ? firstWidth : restWidth)

    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word
      if (measureRunWidth(candidate, fontSize, spec) <= widthFor()) {
        current = candidate
        continue
      }
      if (current) {
        lines.push(current)
        current = ''
      }
      if (measureRunWidth(word, fontSize, spec) <= widthFor()) {
        current = word
        continue
      }
      // Unbreakable run (long blank rule, URL): split on characters.
      let chunk = ''
      for (const ch of word) {
        const next = chunk + ch
        if (chunk && measureRunWidth(next, fontSize, spec) > widthFor()) {
          lines.push(chunk)
          chunk = ch
        } else {
          chunk = next
        }
      }
      current = chunk
    }
    if (current) lines.push(current)
  }

  return lines.length > 0 ? lines : ['']
}
