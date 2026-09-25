import type { StudioRng } from '../studio-rng'
import { BORDER_KINDS, FRAME_KINDS, type BorderKind, type FrameKind } from './frame'
import type { SgGround, SgSubject } from './subjects'

/**
 * How one page is composed around its subject: the window, its border, the
 * pattern of the background glass, and the scenery.
 *
 * These are the choices that make two pages of the same subject genuinely
 * different panels — an arched window with a sunburst behind a teapot is not
 * the teapot in a square frame over even glass — so a book that returns to a
 * subject never returns to the same page. Every combination is a complete,
 * balanced design on its own; nothing here is decoration for its own sake.
 */

/**
 * `even` — relaxed, evenly sized cells, the classic mosaic.
 * `graded` — small cells near the subject, larger toward the frame.
 * `rings` — concentric courses around the subject, like a rose window.
 * `rays` — long cells fanning from the sun, or from below like a sunrise.
 * `lattice` — diamond quarries on the diagonal, like a leaded cottage window.
 * `honeycomb` — six-sided cells in even courses.
 */
export type SgPattern = 'even' | 'graded' | 'rings' | 'rays' | 'lattice' | 'honeycomb'
export const SG_PATTERNS: readonly SgPattern[] = ['even', 'graded', 'rings', 'rays', 'lattice', 'honeycomb']

/** The window, border and pattern a book leans toward (see `style.ts`). */
export interface SgFavor {
  frame: FrameKind
  border: BorderKind
  pattern: SgPattern
}

/**
 * How often a book's favourite wins outright; otherwise every option is dealt
 * evenly (the favourite included), so the book leans without repeating itself.
 */
const FAVOR_SHARE = 0.35

function lean<T>(rng: StudioRng, options: readonly T[], favorite: T | undefined): T {
  if (favorite !== undefined && options.includes(favorite) && rng.chance(FAVOR_SHARE)) return favorite
  return rng.pick(options)
}

export type SgScenery = 'hills' | 'waves' | 'dunes'

export interface SgComposition {
  frame: FrameKind
  border: BorderKind
  pattern: SgPattern
  /** A sun in the top corner on this side. Square-topped windows only. */
  sun: 'left' | 'right' | null
  /** Ground the subject stands on. */
  scenery: SgScenery | null
  /** A radiating medallion behind the subject. */
  halo: boolean
}

/**
 * A medallion rings the subject with a cell of air and a band of tiles, and
 * the subject must still be the picture inside it: below this many cells
 * across the panel it would leave the subject a thumbnail.
 */
export const HALO_MIN_SPAN = 6.5

/** A short name for the composition, so a book can tell two pages' designs apart. */
export const compositionKey = (c: SgComposition) =>
  [c.frame, c.border, c.pattern, c.sun ?? '-', c.scenery ?? '-', c.halo ? 'halo' : '-'].join('.')

const SCENERY_FOR: Record<SgGround, SgScenery | null> = {
  grass: 'hills',
  water: 'waves',
  sand: 'dunes',
  none: null,
}

/**
 * Deal a composition for a subject on a panel of the given proportions.
 *
 * Outdoor subjects get their ground, and a sun when the window has square
 * corners to hold one; indoor subjects get a medallion more often than not.
 * Pointed arches need a tall page, so a square trim never gets one.
 * Compositions in `avoid` (keys already in the book for this subject) are
 * passed over while another remains. `favor` tilts the deal toward the
 * book's own window, border and pattern.
 */
export function dealComposition(options: {
  subject: SgSubject
  rng: StudioRng
  aspect: number
  /** The panel's shorter side in background cells; a medallion needs room to ring the subject. */
  span?: number
  avoid?: ReadonlySet<string>
  favor?: SgFavor
}): SgComposition {
  const { subject, rng, aspect, span = Infinity, avoid, favor } = options
  const frames = FRAME_KINDS.filter((kind) => kind !== 'gothic' || aspect >= 1.22).filter((kind) => kind !== 'arch' || aspect >= 1.05)
  const deal = (): SgComposition => {
    const frame = lean(rng, frames, favor?.frame)
    const border = lean(rng, BORDER_KINDS.filter((b) => b !== 'blocks' || frame === 'rect' || frame === 'arch'), favor?.border)
    const outdoor = subject.setting === 'outdoor'
    const scenery = outdoor ? SCENERY_FOR[subject.ground] ?? (rng.chance(0.5) ? 'hills' : null) : null
    const squareTop = frame === 'rect' || frame === 'rounded'
    const sun = outdoor && squareTop && rng.chance(0.65) ? (rng.chance(0.5) ? 'left' : 'right') : null
    const halo = !sun && span >= HALO_MIN_SPAN && rng.chance(outdoor ? 0.25 : 0.45)
    const patterns = SG_PATTERNS.filter((p) => p !== 'rays' || !halo)
    return { frame, border, pattern: lean(rng, patterns, favor?.pattern), sun, scenery, halo }
  }
  let best = deal()
  for (let i = 0; i < 12 && avoid?.has(compositionKey(best)); i++) best = deal()
  return best
}

/** A composition the page can actually print: known kinds, and a sun only where a square top can hold it. */
export function isValidComposition(c: SgComposition): boolean {
  if (!FRAME_KINDS.includes(c.frame) || !BORDER_KINDS.includes(c.border) || !SG_PATTERNS.includes(c.pattern)) return false
  if (c.sun !== null && (c.sun !== 'left' && c.sun !== 'right')) return false
  if (c.sun !== null && c.frame !== 'rect' && c.frame !== 'rounded') return false
  if (c.border === 'blocks' && c.frame !== 'rect' && c.frame !== 'arch') return false
  if (c.halo && (c.sun !== null || c.pattern === 'rays')) return false
  return c.scenery === null || c.scenery === 'hills' || c.scenery === 'waves' || c.scenery === 'dunes'
}
