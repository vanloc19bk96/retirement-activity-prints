/**
 * Tight, ink-centred vertical line box for Fabric text.
 *
 * Two separate things are tuned here:
 *
 * * **Line box height** — `_fontSizeMult` x `lineHeight`. Stock Fabric reserves
 *   `1.13 x 1.16`; we hug the em square so the box is about `fontSize` tall.
 * * **Where the ink sits inside that box** — `_fontSizeFraction` is the share of
 *   the box below the baseline, so the baseline lands at
 *   `fontSize x mult x (1 - fraction)` from the top.
 *
 * A *constant* fraction cannot centre the glyphs. Caps-only text ("A") has no
 * descender, so a fixed 0.24em reserve under the baseline leaves every bit of
 * empty space below the letter while the cap nearly touches the top of the box.
 * The fraction is therefore recomputed per object from the text's real ink
 * extents (`actualBoundingBoxAscent/Descent`), which leaves the same gap above
 * the first inked line as below the last one.
 *
 * `FABRIC_TEXT_FONT_SIZE_MULT` must stay in sync with `FABRIC_FONT_SIZE_MULT` in
 * studio-text-metrics so Studio layout reserves the same height Fabric paints;
 * the fraction moves ink *inside* that height and never changes it.
 */

import { FabricText, Textbox } from 'fabric'

/**
 * Line box height = `fontSize * mult`.
 * Stock Fabric is 1.13; 1 hugs the em square (selection box ≈ fontSize tall).
 */
export const FABRIC_TEXT_FONT_SIZE_MULT = 1

/**
 * Fallback share of the line box below the baseline, used only when ink extents
 * are unavailable (no canvas, or a browser without `actualBoundingBox*`).
 * ~0.24em clears typical descenders without a large empty band under the ink.
 */
export const FABRIC_TEXT_FONT_SIZE_FRACTION = 0.24

/** Default leading between wrapped lines (stock Fabric is 1.16). */
export const FABRIC_TEXT_LINE_HEIGHT = 1

/** Fabric `FabricText.CACHE_FONT_SIZE` — measure here, scale to the real size. */
const MEASURE_FONT_SIZE = 400

/** Ink extents of one line, in em (relative to `fontSize`). */
export interface TextInkExtent {
  /** Ink height above the baseline. Negative when the ink sits below it. */
  ascentEm: number
  /** Ink depth below the baseline. */
  descentEm: number
}

export interface CenteredFractionInput extends TextInkExtent {
  /** Rendered (wrapped) line count of the object. */
  lineCount: number
  /** Index of the first line that has ink — `ascentEm` belongs to it. */
  firstInkLine: number
  /** Index of the last line that has ink — `descentEm` belongs to it. */
  lastInkLine: number
  /** The object's `lineHeight`. */
  lineHeight: number
}

/**
 * `_fontSizeFraction` that leaves the same gap above the ink as below it.
 *
 * With `M` = one line box (`fontSize x mult`) and `P` = the line pitch
 * (`M x lineHeight`), Fabric puts line `i` on a baseline at `i x P + M(1 - f)`
 * and sizes the object `(n - 1) x P + M` tall. Equating
 *
 * * `topGap    = firstInkLine x P + M(1 - f) - ascent`
 * * `bottomGap = height - lastInkLine x P - M(1 - f) - descent`
 *
 * and solving for `f` gives the expression below, in em (everything over `M`).
 * `slack` is the dead space blank leading/trailing lines add on one side, which
 * has to be paid for by the other.
 */
export function centeredFontSizeFraction({
  ascentEm,
  descentEm,
  lineCount,
  firstInkLine,
  lastInkLine,
  lineHeight,
}: CenteredFractionInput): number {
  const mult = FABRIC_TEXT_FONT_SIZE_MULT
  const slack = (lineCount - 1 - lastInkLine - firstInkLine) * lineHeight
  const fraction = 0.5 - (ascentEm / mult - descentEm / mult + slack) / 2
  // Bogus metrics (a font reporting nonsense) must not fling the baseline out of
  // the box; anything in [0, 1] still paints on or inside the line box.
  return Math.min(1, Math.max(0, fraction))
}

let cachedContext: CanvasRenderingContext2D | null | undefined

/** A 2D context that reports ink extents, or `null` (Node, jsdom, old browsers). */
function measuringContext(): CanvasRenderingContext2D | null {
  if (cachedContext !== undefined) return cachedContext
  cachedContext = null
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    try {
      const ctx = document.createElement('canvas').getContext('2d')
      const probe = ctx?.measureText('M')
      // jsdom hands back metrics with only `width` (and it is 0) — useless here.
      if (ctx && probe && typeof probe.actualBoundingBoxAscent === 'number' && probe.width > 0) {
        cachedContext = ctx
      }
    } catch {
      cachedContext = null
    }
  }
  return cachedContext
}

/** `declaration + NUL + line -> ink extents`, in em. */
const inkCache = new Map<string, TextInkExtent | null>()

/** Typing mints a fresh key per keystroke, so the cache needs a ceiling. */
const INK_CACHE_LIMIT = 2000

/**
 * Drop ink extents measured before a webfont finished loading — otherwise text
 * stays centred on the fallback face's metrics after the real face lands.
 */
export function clearFabricTextInkMetricsCache(): void {
  inkCache.clear()
}

/** Ink extents of one line at `fontDeclaration`, in em, or `null` if unmeasurable. */
export function measureTextInkExtent(
  line: string,
  fontDeclaration: string,
  measureFontSize: number = MEASURE_FONT_SIZE,
): TextInkExtent | null {
  if (!line.trim()) return null
  const ctx = measuringContext()
  if (!ctx) return null

  const key = `${fontDeclaration}\u0000${line}`
  const cached = inkCache.get(key)
  if (cached !== undefined) return cached

  let extent: TextInkExtent | null = null
  try {
    ctx.font = fontDeclaration
    const metrics = ctx.measureText(line)
    const ascent = metrics.actualBoundingBoxAscent
    const descent = metrics.actualBoundingBoxDescent
    if (Number.isFinite(ascent) && Number.isFinite(descent)) {
      extent = {
        ascentEm: ascent / measureFontSize,
        descentEm: descent / measureFontSize,
      }
    }
  } catch {
    extent = null
  }
  if (inkCache.size >= INK_CACHE_LIMIT) inkCache.clear()
  inkCache.set(key, extent)
  return extent
}

/** The slice of a Fabric text object this module reads. */
type FabricTextLike = {
  text?: string
  CACHE_FONT_SIZE?: number
  _textLines?: string[][]
  lineHeight?: number
  _fontSizeFraction?: number
  dirty?: boolean
  _getFontDeclaration?: (style?: object, forMeasuring?: boolean) => string
}

/** Rendered (wrapped) lines, falling back to the raw text before `_splitText`. */
function renderedLines(target: FabricTextLike): string[] {
  const split = target._textLines
  if (Array.isArray(split) && split.length > 0) return split.map((line) => line.join(''))
  return typeof target.text === 'string' ? target.text.split('\n') : []
}

/**
 * `_fontSizeFraction` that vertically centres this object's ink in its box, or
 * the constant fallback when there is no ink we can measure.
 */
export function inkCenteredFontSizeFraction(target: FabricTextLike): number {
  const lines = renderedLines(target)
  if (lines.length === 0) return FABRIC_TEXT_FONT_SIZE_FRACTION

  // Fabric measures at CACHE_FONT_SIZE and scales linearly; reusing its font
  // string keeps us on the same browser measurement cache.
  const declaration = target._getFontDeclaration?.({}, true)
  if (!declaration) return FABRIC_TEXT_FONT_SIZE_FRACTION
  // `forMeasuring` declarations are sized at the object's own CACHE_FONT_SIZE.
  const measureFontSize = target.CACHE_FONT_SIZE ?? MEASURE_FONT_SIZE

  let first: { index: number; extent: TextInkExtent } | undefined
  let last: { index: number; extent: TextInkExtent } | undefined
  for (let index = 0; index < lines.length; index += 1) {
    const extent = measureTextInkExtent(lines[index], declaration, measureFontSize)
    if (!extent) continue
    if (!first) first = { index, extent }
    last = { index, extent }
  }
  if (!first || !last) return FABRIC_TEXT_FONT_SIZE_FRACTION

  return centeredFontSizeFraction({
    ascentEm: first.extent.ascentEm,
    descentEm: last.extent.descentEm,
    lineCount: lines.length,
    firstInkLine: first.index,
    lastInkLine: last.index,
    lineHeight: target.lineHeight ?? FABRIC_TEXT_LINE_HEIGHT,
  })
}

/**
 * Recompute `_fontSizeFraction` for one text object so its glyphs sit centred in
 * the bounding box. Safe on anything text-like; a no-op when nothing moves.
 */
export function syncFabricTextInkCenteredFraction(target: FabricTextLike): void {
  const fraction = inkCenteredFontSizeFraction(target)
  if (target._fontSizeFraction === fraction) return
  target._fontSizeFraction = fraction
  // Any cached bitmap was painted on the old baseline.
  target.dirty = true
}

type InitDimensionsHost = { prototype: { initDimensions?: (this: FabricTextLike) => void } }

/**
 * Re-centre after every re-measure. `initDimensions` is Fabric's single funnel
 * for "text, font or size changed" (`_set`, typing, wrapping, JSON rehydrate),
 * and it runs before anything is painted, so patching it keeps the fraction
 * fresh without hooking each mutation path. `Textbox` is patched too because its
 * override never calls `super`; `IText` inherits through its `super` call.
 */
function patchInitDimensions(host: InitDimensionsHost): void {
  const proto = host.prototype
  if (!Object.prototype.hasOwnProperty.call(proto, 'initDimensions')) return
  const original = proto.initDimensions
  if (typeof original !== 'function') return
  proto.initDimensions = function patchedInitDimensions(this: FabricTextLike) {
    original.call(this)
    syncFabricTextInkCenteredFraction(this)
  }
}

let didApply = false

/**
 * Patch FabricText defaults once so Text / IText / Textbox (and JSON rehydrate)
 * use tight vertical metrics with the ink centred in the line box.
 */
export function applyFabricTightTextVerticalMetrics(): void {
  if (didApply) return
  didApply = true

  Object.assign(FabricText.ownDefaults, {
    _fontSizeMult: FABRIC_TEXT_FONT_SIZE_MULT,
    _fontSizeFraction: FABRIC_TEXT_FONT_SIZE_FRACTION,
    lineHeight: FABRIC_TEXT_LINE_HEIGHT,
  })

  patchInitDimensions(FabricText as unknown as InitDimensionsHost)
  patchInitDimensions(Textbox as unknown as InitDimensionsHost)
}

// Apply on import so StaticCanvas / export paths that never call selection-style
// still construct text with tight vertical metrics.
applyFabricTightTextVerticalMetrics()
