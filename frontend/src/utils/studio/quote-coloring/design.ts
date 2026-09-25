import type { StudioRng } from '../studio-rng'
import type { QcBookEntry, QcDetailSpec, QcPatternChoice } from './content'
import {
  QC_CARTOUCHES,
  QC_FRAMES,
  QC_LATTICES,
  QC_LAYOUTS,
  motifMinRadius,
  type QcDesign,
  type QcFill,
} from './compose'
import { QC_LETTER_STYLES, type QcFontSet, type QcLetterStyle } from './fonts'
import { motifsOf, type QcMotifSet } from './motifs'

/**
 * How a page looks, dealt against what the book already prints.
 *
 * Every axis — lettering face, layout, cartouche, frame, pattern family and
 * the motifs in it — takes the option the book has used least, ties broken
 * by the page's own seed (which carries the seller's salt), and never the
 * same cartouche or frame as the page before. So a book cycles through its
 * looks instead of repeating one, and two sellers on the same settings deal
 * different books. The saying itself is what changes most; the design makes
 * sure the same saying could never come back looking the same either.
 */

const SETS: readonly QcMotifSet[] = ['floral', 'geometric', 'travel']

/**
 * Words that tie a saying to a pattern: a garden saying framed by flowers, a
 * road-trip or hobby saying by the things it names. Sayings about neither
 * rotate through the families like any other axis.
 */
const SET_WORDS: Readonly<Record<Exclude<QcMotifSet, 'geometric'>, readonly string[]>> = {
  floral: [
    'garden', 'gardens', 'gardening', 'flower', 'flowers', 'bloom', 'blooms', 'blossom', 'rose', 'roses', 'tulip',
    'tulips', 'seed', 'seeds', 'plant', 'plants', 'planting', 'spring', 'petal', 'petals', 'leaf', 'leaves', 'sunflower',
    'daisy', 'daisies', 'bud', 'buds', 'grow', 'growing', 'soil', 'weeds', 'meadow', 'orchard', 'bouquet',
  ],
  travel: [
    'travel', 'trip', 'trips', 'road', 'map', 'maps', 'suitcase', 'pack', 'passport', 'journey', 'wander', 'wandering',
    'boat', 'sail', 'sailing', 'sea', 'beach', 'shore', 'train', 'postcard', 'postcards', 'cruise', 'camper', 'van',
    'trail', 'hike', 'explore', 'balloon', 'horizon', 'adventure', 'tea', 'teacup', 'coffee', 'mug', 'book', 'books',
    'read', 'reading', 'paint', 'painting', 'camera', 'photo', 'photos', 'porch', 'kitchen', 'bake', 'baking', 'fish', 'fishing',
  ],
}

/** The motif family a saying's own words ask for, if any. */
export function qcSetHint(saying: string): QcMotifSet | null {
  const words = new Set(saying.toLowerCase().match(/[a-z]+/g) ?? [])
  const score = (set: keyof typeof SET_WORDS) => SET_WORDS[set].filter((w) => words.has(w)).length
  const floral = score('floral')
  const travel = score('travel')
  if (floral === 0 && travel === 0) return null
  return floral >= travel ? 'floral' : 'travel'
}

function leastUsed<T extends string>(options: readonly T[], used: readonly string[], rng: StudioRng, avoid?: string): T {
  const counts = new Map<string, number>()
  for (const u of used) counts.set(u, (counts.get(u) ?? 0) + 1)
  const pool = options.length > 1 && avoid ? options.filter((o) => o !== avoid) : options
  const least = Math.min(...pool.map((o) => counts.get(o) ?? 0))
  return rng.pick(pool.filter((o) => (counts.get(o) ?? 0) === least))
}

/** The faces this page may letter in, least used in the book first, never the last page's first. */
export function qcStyleOrder(fonts: QcFontSet, book: readonly QcBookEntry[], rng: StudioRng): QcLetterStyle[] {
  const available = QC_LETTER_STYLES.filter((s) => fonts[s.id])
  const counts = new Map<string, number>()
  for (const e of book) counts.set(e.style, (counts.get(e.style) ?? 0) + 1)
  const last = book[book.length - 1]?.style
  return rng
    .shuffle(available)
    .sort((a, b) => (counts.get(a.id) ?? 0) - (counts.get(b.id) ?? 0) || Number(a.id === last) - Number(b.id === last))
}

export function dealQcDesign(options: {
  style: QcLetterStyle
  pattern: QcPatternChoice
  book: readonly QcBookEntry[]
  detail: QcDetailSpec
  rng: StudioRng
  /** The saying, so a mixed pattern can suit it. */
  saying?: string
}): QcDesign {
  const { style, pattern, book, detail, rng, saying } = options
  const last = book[book.length - 1]
  // A saying's own family wins while the book is not already ahead on it,
  // so the pattern suits the words without every page turning floral.
  const hint = saying ? qcSetHint(saying) : null
  const usage = (set: QcMotifSet) => book.filter((e) => e.set === set).length
  const hinted = hint && usage(hint) <= Math.min(...SETS.map(usage)) + 1 ? hint : null
  const set = pattern !== 'mix' ? pattern : (hinted ?? leastUsed(SETS, book.map((e) => e.set), rng, last?.set))
  const fill: QcFill = rng.chance(set === 'geometric' ? 0.7 : 0.3) ? 'lattice' : 'pack'
  const layout = leastUsed(QC_LAYOUTS, book.map((e) => e.layout), rng)
  const cartouche = leastUsed(QC_CARTOUCHES, book.map((e) => e.cartouche), rng, last?.cartouche)
  const frame = leastUsed(QC_FRAMES, book.map((e) => e.frame), rng, last?.frame)
  const reach = fill === 'lattice' ? detail.lattice : detail.pack[1]
  const fits = rng.shuffle(motifsOf(set)).filter((m) => motifMinRadius(m, detail) <= reach)
  // A pattern of the small motifs only would read as confetti: keep the
  // pool to the ones that print at a real size here.
  const motifs = fits.slice(0, fill === 'lattice' ? 2 : 5).map((m) => m.id)
  return {
    style,
    layout,
    cartouche,
    frame,
    fill,
    lattice: rng.pick(QC_LATTICES),
    set,
    motifs,
    corner: rng.pick([0.08, 0.18, 0.28]),
  }
}
