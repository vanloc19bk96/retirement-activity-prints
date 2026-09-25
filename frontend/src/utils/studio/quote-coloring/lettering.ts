import type opentype from 'opentype.js'
import {
  chainSegments,
  cutSegments,
  pointInRing,
  pt,
  ringSegments,
  toRegion,
  type Bounds,
  type Pt,
  type Ring,
  type Seg,
} from '../stained-glass/geometry'

/**
 * The saying as outline lettering: glyph shapes from the font file, laid out
 * in balanced lines at the biggest size the space allows.
 *
 * What it guarantees, so the page never has to take it on trust:
 *
 * * **Exact text.** One glyph per character, straight from the character map
 *   (no ligatures, no substitutions); a character the face has no glyph for
 *   refuses the saying rather than printing a box. The lines, read back in
 *   order, are the saying.
 * * **Letters never touch.** Two letters whose outlines would meet print as
 *   one blob with a sliver between them. Every neighbouring pair is measured
 *   outline to outline and eased apart until there is clear paper between
 *   them, on top of the face's own spacing and kerning.
 * * **Whole words.** Lines break only between words, so punctuation stays on
 *   its word, and the break is chosen for balance: the widest line as narrow
 *   as possible, and no lone short word on a line when another break works.
 * * **One clean outline per letter.** Font files often build a letter from
 *   overlapping pieces (the bar of a T laid over its stem), which a filled
 *   letter hides and an outline letter would print as stray lines inside it.
 *   Only the letter's true edge is drawn: the lines where filled meets
 *   unfilled.
 */

/** Size the glyphs are prepared at before the layout scales them, canvas px per em. */
const REF_EM = 100
/** Clear paper between two letters' outlines, as a share of the em (at least `minGapPx`). */
const LETTER_GAP_EM = 0.055
/** Clear paper between two lines' ink, as a share of the em (at least `minLineGapPx`). */
const LINE_GAP_EM = 0.2
/** Word space, as a multiple of the face's own. */
const WORD_SPACE = 1.15
/** Flattening step along a glyph outline at the reference size, canvas px. */
const SAMPLE_STEP = 2
/** Flattening step for the outline as printed, canvas px at the final size. */
const PRINT_STEP = 1.25
const MAX_LINES = 5

export interface QcGlyph {
  char: string
  /** The font's contours, flattened, in page coordinates (they may overlap). */
  rings: Ring[]
  /** The letter's edge as printed: polylines where filled meets unfilled. */
  outline: Pt[][]
  bounds: Bounds
}

export interface QcLine {
  text: string
  glyphs: QcGlyph[]
  bounds: Bounds
}

export interface QcLettering {
  /** The text as lettered (the saying, in capitals for a caps face). */
  text: string
  /** Em size, canvas px. */
  size: number
  lines: QcLine[]
  bounds: Bounds
}

export interface LetteringLimits {
  /** Smallest em size worth printing (the face's colorable floor). */
  minSize: number
  /** Biggest em size wanted, however much room there is. */
  maxSize: number
  /** Floor for the gap between letters, canvas px at the final size. */
  minGapPx: number
  /** Floor for the gap between lines, canvas px at the final size. */
  minLineGapPx: number
}

/* ------------------------------------------------------------------ *
 * Glyphs at the reference size
 * ------------------------------------------------------------------ */

interface RawCommand {
  type: string
  x?: number
  y?: number
  x1?: number
  y1?: number
  x2?: number
  y2?: number
}

interface PreparedGlyph {
  char: string
  /** Pen position of the glyph's origin on the baseline, reference px. */
  x: number
  commands: RawCommand[]
  rings: Ring[]
  bounds: Bounds
  samples: Pt[]
}

interface PreparedWord {
  text: string
  glyphs: PreparedGlyph[]
  /** Pen advance from the word's origin to its end, reference px. */
  advance: number
  /** Ink extents relative to the word's origin. */
  bounds: Bounds
}

function emptyBounds(): Bounds {
  return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
}

function grow(b: Bounds, p: Pt): void {
  if (p.x < b.minX) b.minX = p.x
  if (p.x > b.maxX) b.maxX = p.x
  if (p.y < b.minY) b.minY = p.y
  if (p.y > b.maxY) b.maxY = p.y
}

const quad = (a: number, c: number, b: number, t: number) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * c + t * t * b
const cubic = (a: number, c1: number, c2: number, b: number, t: number) =>
  (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * c1 + 3 * (1 - t) * t * t * c2 + t ** 3 * b

/** Contours of a glyph's commands as closed polylines, curves stepped every ~`step` px. */
export function flattenCommands(commands: readonly RawCommand[], step = SAMPLE_STEP): Ring[] {
  const rings: Ring[] = []
  let ring: Pt[] = []
  let cur = pt(0, 0)
  const close = () => {
    if (ring.length >= 3) rings.push(ring)
    ring = []
  }
  for (const c of commands) {
    if (c.type === 'M') {
      close()
      cur = pt(c.x!, c.y!)
      ring.push(cur)
    } else if (c.type === 'L') {
      cur = pt(c.x!, c.y!)
      ring.push(cur)
    } else if (c.type === 'Q') {
      const len = Math.hypot(c.x1! - cur.x, c.y1! - cur.y) + Math.hypot(c.x! - c.x1!, c.y! - c.y1!)
      const n = Math.max(2, Math.min(32, Math.ceil(len / step)))
      for (let i = 1; i <= n; i++) ring.push(pt(quad(cur.x, c.x1!, c.x!, i / n), quad(cur.y, c.y1!, c.y!, i / n)))
      cur = pt(c.x!, c.y!)
    } else if (c.type === 'C') {
      const len =
        Math.hypot(c.x1! - cur.x, c.y1! - cur.y) + Math.hypot(c.x2! - c.x1!, c.y2! - c.y1!) + Math.hypot(c.x! - c.x2!, c.y! - c.y2!)
      const n = Math.max(2, Math.min(32, Math.ceil(len / step)))
      for (let i = 1; i <= n; i++) {
        ring.push(pt(cubic(cur.x, c.x1!, c.x2!, c.x!, i / n), cubic(cur.y, c.y1!, c.y2!, c.y!, i / n)))
      }
      cur = pt(c.x!, c.y!)
    } else if (c.type === 'Z') {
      close()
    }
  }
  close()
  // A repeated closing point adds a zero-length edge; drop it.
  return rings.map((r) => {
    const a = r[0]!
    const b = r[r.length - 1]!
    return Math.hypot(a.x - b.x, a.y - b.y) < 1e-6 ? r.slice(0, -1) : r
  })
}

/** Points along every edge, at most `step` apart, for outline-to-outline distance. */
function densify(rings: readonly Ring[], step: number): Pt[] {
  const out: Pt[] = []
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!
      const b = ring[(i + 1) % ring.length]!
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step))
      for (let k = 0; k < n; k++) out.push(pt(a.x + ((b.x - a.x) * k) / n, a.y + ((b.y - a.y) * k) / n))
    }
  }
  return out
}

/**
 * The glyph a character prints as, or null when the face has none. A space
 * is not a glyph here: words are laid out separately.
 */
function glyphFor(font: opentype.Font, char: string): opentype.Glyph | null {
  const glyph = font.charToGlyph(char)
  if (!glyph || glyph.index === 0) return null
  const unicodes: number[] = glyph.unicodes ?? (glyph.unicode != null ? [glyph.unicode] : [])
  if (!unicodes.includes(char.codePointAt(0)!)) return null
  return glyph
}

/** Nearest approach of two outlines, or -1 when they overlap. */
function outlineGap(a: PreparedGlyph, b: PreparedGlyph, dx: number, reach: number): number {
  const bb = b.bounds
  let best = Infinity
  for (const p of a.samples) {
    if (p.x < bb.minX + dx - reach || p.x > bb.maxX + dx + reach || p.y < bb.minY - reach || p.y > bb.maxY + reach) continue
    const local = pt(p.x - dx, p.y)
    if (b.rings.some((ring) => pointInRing(local, ring))) return -1
    for (const q of b.samples) {
      const d = Math.hypot(local.x - q.x, local.y - q.y)
      if (d < best) best = d
    }
  }
  for (const q of b.samples) {
    const global = pt(q.x + dx, q.y)
    if (global.x < a.bounds.minX - reach || global.x > a.bounds.maxX + reach) continue
    if (a.rings.some((ring) => pointInRing(global, ring))) return -1
  }
  return best
}

/**
 * One word at the reference size, letters eased apart until every pair has
 * `gap` px of clear paper between their outlines. Null when a character has
 * no glyph in this face.
 */
function prepareWord(font: opentype.Font, text: string, gap: number): PreparedWord | null {
  const scale = REF_EM / font.unitsPerEm
  const glyphs: PreparedGlyph[] = []
  let pen = 0
  let previous: opentype.Glyph | null = null
  for (const char of Array.from(text)) {
    const glyph = glyphFor(font, char)
    if (!glyph) return null
    if (previous) pen += font.getKerningValue(previous, glyph) * scale
    const path = glyph.getPath(0, 0, REF_EM)
    const commands = path.commands as RawCommand[]
    const rings = flattenCommands(commands)
    if (rings.length === 0) return null
    const bounds = emptyBounds()
    for (const ring of rings) for (const p of ring) grow(bounds, p)
    const prepared: PreparedGlyph = { char, x: 0, commands, rings, bounds, samples: densify(rings, SAMPLE_STEP) }

    const last = glyphs[glyphs.length - 1]
    if (last) {
      // Ease the letter right until its outline clears the one before.
      let x = pen
      for (let i = 0; i < 40; i++) {
        const d = outlineGap(last, prepared, x - last.x, gap)
        if (d >= gap) break
        x += d < 0 ? gap : Math.max(0.5, gap - d)
      }
      pen = x
    }
    prepared.x = pen
    glyphs.push(prepared)
    pen += (glyph.advanceWidth ?? font.unitsPerEm * 0.5) * scale
    previous = glyph
  }
  if (glyphs.length === 0) return null
  const bounds = emptyBounds()
  for (const g of glyphs) {
    grow(bounds, pt(g.bounds.minX + g.x, g.bounds.minY))
    grow(bounds, pt(g.bounds.maxX + g.x, g.bounds.maxY))
  }
  return { text, glyphs, advance: pen, bounds }
}

/**
 * Words already prepared, per face. A page tries a saying in several faces
 * and layouts, and a book reuses the same faces page after page; spacing a
 * word's letters is the costly part of a layout, and its result depends only
 * on the face, the word and the gap. Bounded per face.
 */
const wordCache = new WeakMap<opentype.Font, Map<string, PreparedWord | null>>()
const WORD_CACHE_LIMIT = 2000

function cachedWord(font: opentype.Font, text: string, gap: number): PreparedWord | null {
  let words = wordCache.get(font)
  if (!words) {
    words = new Map()
    wordCache.set(font, words)
  }
  const key = `${gap.toFixed(3)}|${text}`
  if (words.has(key)) return words.get(key)!
  const prepared = prepareWord(font, text, gap)
  if (words.size >= WORD_CACHE_LIMIT) words.delete(words.keys().next().value!)
  words.set(key, prepared)
  return prepared
}

/* ------------------------------------------------------------------ *
 * Lines
 * ------------------------------------------------------------------ */

interface LineSpan {
  from: number
  to: number
  width: number
  minY: number
  maxY: number
}

function lineSpan(words: readonly PreparedWord[], from: number, to: number, space: number): LineSpan {
  let pen = 0
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (let i = from; i < to; i++) {
    const w = words[i]!
    minX = Math.min(minX, pen + w.bounds.minX)
    maxX = Math.max(maxX, pen + w.bounds.maxX)
    minY = Math.min(minY, w.bounds.minY)
    maxY = Math.max(maxY, w.bounds.maxY)
    pen += w.advance + space
  }
  return { from, to, width: maxX - minX, minY, maxY }
}

/**
 * The best break of the words into `n` lines: narrowest widest line, then the
 * most even. Exhaustive over break points — a saying is at most a dozen words.
 */
function breakInto(words: readonly PreparedWord[], n: number, space: number): LineSpan[] | null {
  const count = words.length
  if (n > count) return null
  let best: { spans: LineSpan[]; widest: number; spread: number } | null = null
  const cuts: number[] = []
  const visit = (start: number, left: number) => {
    if (left === 1) {
      const spans: LineSpan[] = []
      let from = 0
      for (const cut of [...cuts, count]) {
        spans.push(lineSpan(words, from, cut, space))
        from = cut
      }
      const widths = spans.map((s) => s.width)
      const widest = Math.max(...widths)
      const spread = widths.reduce((sum, w) => sum + (widest - w) ** 2, 0)
      if (!best || widest < best.widest - 0.5 || (Math.abs(widest - best.widest) <= 0.5 && spread < best.spread)) {
        best = { spans, widest, spread }
      }
      return
    }
    for (let cut = start + 1; cut <= count - left + 1; cut++) {
      cuts.push(cut)
      visit(cut, left - 1)
      cuts.pop()
    }
  }
  visit(0, n)
  return best ? (best as { spans: LineSpan[] }).spans : null
}

/**
 * How much a break costs the page, as a share of its size. A line of one
 * short word ("to", "a") strands it; a very short last line under long ones
 * reads as an afterthought.
 */
function breakPenalty(words: readonly PreparedWord[], spans: readonly LineSpan[]): number {
  let penalty = 0
  const widest = Math.max(...spans.map((s) => s.width))
  spans.forEach((span, index) => {
    if (span.to - span.from === 1 && spans.length > 1) {
      const letters = words[span.from]!.text.replace(/[^A-Za-z]/g, '').length
      if (letters <= 3) penalty += 0.25
      else if (index === spans.length - 1) penalty += 0.08
    }
    if (span.width < widest * 0.3) penalty += 0.1
  })
  return penalty
}

function stackHeight(spans: readonly LineSpan[], size: number, limits: LetteringLimits): number {
  const k = size / REF_EM
  const gap = Math.max(limits.minLineGapPx, LINE_GAP_EM * size)
  return spans.reduce((sum, s) => sum + (s.maxY - s.minY) * k, 0) + gap * (spans.length - 1)
}

/** Biggest em size at which the lines fit `w` x `h`, from the width and a short search on the height. */
function fitSize(spans: readonly LineSpan[], w: number, h: number, limits: LetteringLimits): number {
  const widest = Math.max(...spans.map((s) => s.width))
  let size = Math.min(limits.maxSize, (w / widest) * REF_EM)
  // Height is linear in size except for the gap floor: step down until it fits.
  for (let i = 0; i < 60 && stackHeight(spans, size, limits) > h; i++) size *= 0.97
  return stackHeight(spans, size, limits) <= h ? size : 0
}

/* ------------------------------------------------------------------ *
 * The layout
 * ------------------------------------------------------------------ */

/** The text a style letters: the saying itself, in capitals for a caps face. */
export function letteredText(saying: string, caps: boolean): string {
  return caps ? saying.toUpperCase() : saying
}

function scaleCommands(commands: readonly RawCommand[], k: number, ox: number, oy: number): RawCommand[] {
  const X = (x: number | undefined) => (x == null ? undefined : ox + x * k)
  const Y = (y: number | undefined) => (y == null ? undefined : oy + y * k)
  return commands.map((c) => ({ type: c.type, x: X(c.x), y: Y(c.y), x1: X(c.x1), y1: Y(c.y1), x2: X(c.x2), y2: Y(c.y2) }))
}

/** Nonzero winding number of `p` against every contour. */
function winding(p: Pt, rings: readonly Ring[]): number {
  let w = 0
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[j]!
      const b = ring[i]!
      const cross = (b.x - a.x) * (p.y - a.y) - (p.x - a.x) * (b.y - a.y)
      if (a.y <= p.y) {
        if (b.y > p.y && cross > 0) w++
      } else if (b.y <= p.y && cross < 0) w--
    }
  }
  return w
}

/**
 * The edge of the filled letter: every contour cut where it crosses another,
 * keeping the pieces with fill on one side and paper on the other. Overlaps
 * inside the letter, which a filled glyph hides, are dropped.
 */
export function visibleOutline(rings: readonly Ring[]): Pt[][] {
  const regions = rings.map(toRegion)
  const eps = 0.2
  const pieces: Seg[] = cutSegments(rings.flatMap(ringSegments), regions, (mid, piece) => {
    const dx = piece.b.x - piece.a.x
    const dy = piece.b.y - piece.a.y
    const len = Math.hypot(dx, dy)
    if (len < 1e-6) return false
    const nx = (-dy / len) * eps
    const ny = (dx / len) * eps
    const left = winding(pt(mid.x + nx, mid.y + ny), rings) !== 0
    const right = winding(pt(mid.x - nx, mid.y - ny), rings) !== 0
    return left !== right
  })
  return chainSegments(pieces)
}

/**
 * Lay the saying out in `box`, as big as it will go up to `maxSize`, centred.
 * Null when the face lacks a character or the saying cannot fit at `minSize`.
 */
export function layoutLettering(font: opentype.Font, text: string, box: Bounds, limits: LetteringLimits): QcLettering | null {
  const w = box.maxX - box.minX
  const h = box.maxY - box.minY
  if (w <= 0 || h <= 0) return null
  // The letter gap is set for the smallest size the page may print, where it
  // is tightest; at bigger sizes it only grows.
  const gapRef = Math.max(LETTER_GAP_EM * REF_EM, (limits.minGapPx / limits.minSize) * REF_EM)
  const words: PreparedWord[] = []
  for (const word of text.split(' ')) {
    const prepared = cachedWord(font, word, gapRef)
    if (!prepared) return null
    words.push(prepared)
  }
  const spaceGlyph = font.charToGlyph(' ')
  const space = ((spaceGlyph?.advanceWidth ?? font.unitsPerEm * 0.25) / font.unitsPerEm) * REF_EM * WORD_SPACE

  let chosen: { spans: LineSpan[]; size: number; score: number } | null = null
  for (let n = 1; n <= Math.min(MAX_LINES, words.length); n++) {
    const spans = breakInto(words, n, space)
    if (!spans) continue
    const size = fitSize(spans, w, h, limits)
    if (size < limits.minSize) continue
    const score = size * (1 - breakPenalty(words, spans))
    if (!chosen || score > chosen.score + 0.5) chosen = { spans, size, score }
  }
  if (!chosen) return null

  const { spans, size } = chosen
  const k = size / REF_EM
  const gap = Math.max(limits.minLineGapPx, LINE_GAP_EM * size)
  const total = stackHeight(spans, size, limits)
  let top = box.minY + (h - total) / 2
  const lines: QcLine[] = []
  const all = emptyBounds()
  for (const span of spans) {
    const baseline = top - span.minY * k
    // Centre the line's ink, not its pen advance, so a trailing comma or an
    // overhanging letter does not pull it off centre.
    let pen = 0
    let inkMin = Infinity
    let inkMax = -Infinity
    for (let i = span.from; i < span.to; i++) {
      const word = words[i]!
      inkMin = Math.min(inkMin, pen + word.bounds.minX)
      inkMax = Math.max(inkMax, pen + word.bounds.maxX)
      pen += word.advance + space
    }
    const ox = (box.minX + box.maxX) / 2 - ((inkMin + inkMax) / 2) * k
    const glyphs: QcGlyph[] = []
    const lineBounds = emptyBounds()
    pen = 0
    for (let i = span.from; i < span.to; i++) {
      const word = words[i]!
      for (const g of word.glyphs) {
        const gx = ox + (pen + g.x) * k
        const rings = flattenCommands(scaleCommands(g.commands, k, gx, baseline), PRINT_STEP)
        const bounds = emptyBounds()
        for (const ring of rings) for (const p of ring) grow(bounds, p)
        grow(lineBounds, pt(bounds.minX, bounds.minY))
        grow(lineBounds, pt(bounds.maxX, bounds.maxY))
        glyphs.push({ char: g.char, rings, outline: visibleOutline(rings), bounds })
      }
      pen += word.advance + space
    }
    grow(all, pt(lineBounds.minX, lineBounds.minY))
    grow(all, pt(lineBounds.maxX, lineBounds.maxY))
    lines.push({ text: words.slice(span.from, span.to).map((word) => word.text).join(' '), glyphs, bounds: lineBounds })
    top += (span.maxY - span.minY) * k + gap
  }
  return { text, size, lines, bounds: all }
}

/** The saying read back from the lettering, line by line. */
export function readBack(lettering: QcLettering): string {
  return lettering.lines.map((line) => line.text).join(' ')
}

/** Glyphs drawn, in order, as characters — the text with spaces taken out. */
export function glyphText(lettering: QcLettering): string {
  return lettering.lines.flatMap((line) => line.glyphs.map((g) => g.char)).join('')
}
