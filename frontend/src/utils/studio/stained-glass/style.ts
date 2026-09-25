import type { StudioRng } from '../studio-rng'
import { createRngFromSeedInput } from '../_shared/uniqueness'
import { SG_PATTERNS, type SgFavor } from './composition'
import { BORDER_KINDS, FRAME_KINDS } from './frame'
import { pt, type Pt } from './geometry'
import { SG_INK_WIDTH, type SgInk, type SgMosaicStyle } from './mosaic'
import { drawingBounds, rotate, type SubjectDrawing } from './subject-kit'
import type { SgSubject } from './subjects'

/**
 * Each book's look, and each page's hand.
 *
 * A subject library is shared by every seller, so two books that print the
 * same teapot in the same window would print the same picture however the
 * glass around it was cut. Two layers keep them apart:
 *
 * **Book style** — dealt once per book, from the seller's salt and the seed of
 * the book's first Stained Glass page, then stamped on every page's label so
 * later pages (another sitting, another device) adopt it. It sets the pen
 * (line weights), the window the book favours, the border's proportions and
 * the way its subjects are drawn (a touch wider or narrower, a slight taper).
 * A book reads as one set; the seller's next book is dealt a style as far as
 * possible from the ones they printed lately, and another seller's books are
 * dealt from another salt.
 *
 * **Page hand** — dealt per page around the book's style: a little more or
 * less stretch and taper, how much of the window the subject fills, and a
 * gentle tilt for things that fly. The same subject in the same window
 * comes out with a different outline from one page to the next.
 *
 * Every axis is bounded by print, not taste: line weights stay at or above
 * 1.5 pt, and the stretch and taper are kept small. At full strength a few
 * narrow parts can still dip under the coloring floor on the smallest trims,
 * so a page that fails steps down to half strength (proven for every version
 * of every subject, in every pen) and then to the plain drawing.
 */

/* ------------------------------------------------------------------ *
 * Axes
 * ------------------------------------------------------------------ */

/** Pen sets, canvas px at 96 dpi. The joints never drop below 2 px (1.5 pt). */
export const SG_INK_PROFILES: readonly Readonly<Record<SgInk, number>>[] = [
  SG_INK_WIDTH,
  { frame: 4.5, band: 3, silhouette: 3.5, part: 2.5, accent: 2.75, cell: 2.25 },
  { frame: 3.75, band: 2.5, silhouette: 3.25, part: 2.25, accent: 2.25, cell: 2 },
]

/** Every weight any book may print, for the drawn-panel check. */
export const SG_ALL_INK_WEIGHTS: ReadonlySet<number> = new Set(SG_INK_PROFILES.flatMap((p) => Object.values(p)))

const BAND_INCHES = [0.22, 0.26, 0.31] as const
const TILE_INCHES = [0.8, 0.95, 1.15] as const
/** Rounded windows: corner radius as a share of the shorter side. */
const CORNERS = [0.1, 0.14, 0.18] as const
/** Width ÷ height of the subject against its drawing. */
const ASPECTS = [0.94, 0.97, 1, 1.03, 1.06] as const
/** Bottom wider (+) or narrower (−) than the top, as a share of the half-width. */
const TAPERS = [-0.035, -0.015, 0, 0.015, 0.035] as const
/** How much of the stage the subject fills. */
const FILLS = [0.86, 0.93, 1] as const
/** Cells inside the subject: fewer, larger pieces (↑) or more, smaller ones (↓). */
const SUBJECT_CELLS = [0.85, 1, 1.2] as const

/** Hard limits on a page's hand, style and jitter together. */
export const SG_HAND_LIMITS = {
  aspect: [0.93, 1.07],
  taper: [-0.045, 0.045],
  fill: [0.8, 1],
  /** Degrees either way, and only for subjects that fly. */
  tilt: 7,
} as const

/** Axis name → number of options, in token order. */
const AXES = [
  ['ink', SG_INK_PROFILES.length],
  ['frame', FRAME_KINDS.length],
  ['border', BORDER_KINDS.length],
  ['pattern', SG_PATTERNS.length],
  ['band', BAND_INCHES.length],
  ['tile', TILE_INCHES.length],
  ['corner', CORNERS.length],
  ['aspect', ASPECTS.length],
  ['taper', TAPERS.length],
  ['fill', FILLS.length],
  ['subjectCell', SUBJECT_CELLS.length],
] as const

type Axis = (typeof AXES)[number][0]

/** One option per axis. */
export type SgBookStyle = Readonly<Record<Axis, number>>

const TOKEN_PREFIX = 'st'

/** The style as it is stamped on a page label: `st` and one digit per axis. */
export const sgStyleToken = (style: SgBookStyle): string => TOKEN_PREFIX + AXES.map(([axis]) => style[axis]).join('')

/** A token back into a style; null for anything this version did not write. */
export function parseSgStyleToken(token: string | undefined): SgBookStyle | null {
  if (!token || !token.startsWith(TOKEN_PREFIX)) return null
  const digits = token.slice(TOKEN_PREFIX.length)
  if (digits.length !== AXES.length || !/^\d+$/.test(digits)) return null
  const out: Record<string, number> = {}
  for (const [i, [axis, count]] of AXES.entries()) {
    const value = Number(digits[i])
    if (value >= count) return null
    out[axis] = value
  }
  return out as SgBookStyle
}

/** How many axes two styles differ on. */
export const sgStyleDistance = (a: SgBookStyle, b: SgBookStyle) => AXES.filter(([axis]) => a[axis] !== b[axis]).length

/* ------------------------------------------------------------------ *
 * Dealing a book's style
 * ------------------------------------------------------------------ */

const CANDIDATES = 24

function randomStyle(rng: StudioRng): SgBookStyle {
  const out: Record<string, number> = {}
  for (const [axis, count] of AXES) out[axis] = rng.int(0, count - 1)
  return out as SgBookStyle
}

/**
 * A new book's style: from the seller's salt and the seed of its first page,
 * as far as it can get from the styles this seller printed lately (`recent`,
 * tokens). The best of a few candidates by the smallest distance to any
 * recent style, so a seller's books do not settle into one look.
 */
export function dealSgStyle(options: { ownerSalt: string; seed: number; recent?: readonly string[] }): SgBookStyle {
  const { ownerSalt, seed, recent = [] } = options
  const rng = createRngFromSeedInput({ ownerSalt, templateKey: 'stained-glass', configHash: 'book-style', pageNonce: seed })
  const past = recent.map(parseSgStyleToken).filter((s): s is SgBookStyle => s !== null)
  let best = randomStyle(rng)
  if (past.length === 0) return best
  let bestScore = Math.min(...past.map((p) => sgStyleDistance(best, p)))
  for (let i = 1; i < CANDIDATES && bestScore < AXES.length; i++) {
    const candidate = randomStyle(rng)
    const score = Math.min(...past.map((p) => sgStyleDistance(candidate, p)))
    if (score > bestScore) (best = candidate), (bestScore = score)
  }
  return best
}

/** The window, border and pattern this book leans toward. */
export const sgStyleFavor = (style: SgBookStyle): SgFavor => ({
  frame: FRAME_KINDS[style.frame]!,
  border: BORDER_KINDS[style.border]!,
  pattern: SG_PATTERNS[style.pattern]!,
})

export const sgStyleInk = (style: SgBookStyle): Readonly<Record<SgInk, number>> => SG_INK_PROFILES[style.ink]!

/* ------------------------------------------------------------------ *
 * A page's hand
 * ------------------------------------------------------------------ */

export interface SgHand {
  /** Width ÷ height against the drawing. */
  aspect: number
  /** Bottom wider (+) or narrower (−) than the top. */
  taper: number
  /** Degrees clockwise. */
  tilt: number
  /** Share of the stage the subject fills. */
  fill: number
}

/** Things that fly (a balloon, a butterfly) may tilt; anything that stands or sits indoors stays level. */
export const sgSubjectFlies = (subject: SgSubject) => subject.setting === 'outdoor' && subject.ground === 'none'

const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, v))

/** The book's hand, jittered for this page. */
export function dealSgHand(style: SgBookStyle, subject: SgSubject, rng: StudioRng): SgHand {
  const jitter = (spread: number) => (rng.next() - 0.5) * spread
  return {
    aspect: clamp(ASPECTS[style.aspect]! * (1 + jitter(0.05)), SG_HAND_LIMITS.aspect),
    taper: clamp(TAPERS[style.taper]! + jitter(0.03), SG_HAND_LIMITS.taper),
    tilt: sgSubjectFlies(subject) ? jitter(SG_HAND_LIMITS.tilt * 2) : 0,
    fill: clamp(FILLS[style.fill]! + jitter(0.1), SG_HAND_LIMITS.fill),
  }
}

/**
 * The hand at a share of its strength: 1 as dealt, 0 plain (the reference
 * drawing, filling its stage). Half strength is proven colorable for every
 * version at the smallest size a page prints (the tests), so a page steps
 * down to it before going plain, and plain is the drawing the library tests
 * prove on its own.
 */
export const easeSgHand = (hand: SgHand, strength: number): SgHand => ({
  aspect: 1 + (hand.aspect - 1) * strength,
  taper: hand.taper * strength,
  tilt: hand.tilt * strength,
  fill: 1 - (1 - hand.fill) * strength,
})

/**
 * The drawing as this hand draws it: stretched about its centre, tapered top
 * to bottom, then tilted. Straight edges stay straight under the stretch and
 * bow imperceptibly under the taper; every shape stays closed.
 */
export function applySgHand(drawing: SubjectDrawing, hand: SgHand): SubjectDrawing {
  if (hand.aspect === 1 && hand.taper === 0 && hand.tilt === 0) return drawing
  const b = drawingBounds(drawing)
  const cx = (b.minX + b.maxX) / 2
  const cy = (b.minY + b.maxY) / 2
  const half = (b.maxY - b.minY) / 2 || 1
  const map = (p: Pt) => pt(cx + (p.x - cx) * hand.aspect * (1 + hand.taper * ((p.y - cy) / half)), p.y)
  const tilt = (pts: Pt[]) => (hand.tilt === 0 ? pts : rotate(pts, hand.tilt, cx, cy))
  return {
    pieces: drawing.pieces.map((piece) => ({ ...piece, ring: tilt(piece.ring.map(map)) })),
    strokes: drawing.strokes.map((s) => ({ ...s, pts: tilt(s.pts.map(map)) })),
  }
}

/** What the mosaic needs from the book's style and the page's hand. */
export function sgMosaicStyle(style: SgBookStyle, hand: SgHand): SgMosaicStyle {
  return {
    ink: sgStyleInk(style),
    bandInches: BAND_INCHES[style.band]!,
    tileInches: TILE_INCHES[style.tile]!,
    corner: CORNERS[style.corner]!,
    fill: hand.fill,
    subjectCellScale: SUBJECT_CELLS[style.subjectCell]!,
  }
}
