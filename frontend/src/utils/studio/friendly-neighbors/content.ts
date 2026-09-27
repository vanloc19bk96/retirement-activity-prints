import type { StudioConfig } from '@/types/studio-template.types'
import { DPI } from '@/types/canvas-settings.types'
import { createRngFromSeedInput } from '../_shared/uniqueness'
import type { NeighborsBlockMix } from './puzzle'
import type { NeighborsRules } from './solver'

/**
 * What a Friendly Neighbors page shows, and how each page's town and street
 * name are chosen.
 *
 * A page is one town of houses cut by streets into blocks, built fresh from
 * the seller's puzzle salt and the page seed (so two sellers on the same
 * settings print different books, and the same seed reprints the same page),
 * under the sign of a street a retiree would love to live on — Maple Lane,
 * Harbor View Cottages, Bluebird Hill. A book works through every street
 * before one returns, and a seller's next book opens with streets their last
 * one did not use.
 */

export const NEIGHBORS_TEMPLATE_KEY = 'friendly-neighbors'
export const NEIGHBORS_DEFAULT_TITLE = 'Friendly Neighbors'

export const NEIGHBORS_BUILD_FAILED_MESSAGE = 'Could not build a Friendly Neighbors puzzle for this page. Try again.'

export function neighborsPageTooSmallMessage(level: NeighborsLevelSpec): string {
  return `This page size is too small for ${level.gridLabel} towns at large print. Pick a larger page in Settings, or an easier level.`
}

/* ------------------------------------------------------------------ *
 * Levels
 * ------------------------------------------------------------------ */

export type NeighborsLevel = 'gentle' | 'classic' | 'challenging'

export interface NeighborsLevelSpec {
  value: NeighborsLevel
  label: string
  /** "8 × 8", for help lines and messages. */
  gridLabel: string
  /** Houses across and down. */
  size: number
  /** The steps a reader needs; the solver may use no others. */
  rules: NeighborsRules
  /** Steps the level's towns must not fall to alone (they need the level's own). */
  beyond: NeighborsRules | null
  /** How often the town aims for blocks of 5, 4, 3 and 2 houses. */
  mix: NeighborsBlockMix
  /** Fewest and most numbers printed, as a share of the houses. */
  clues: readonly [number, number]
  /** Smallest house pitch the level prints, canvas px. */
  minCell: number
}

const inch = (n: number) => Math.round(n * DPI * 100) / 100

/**
 * Difficulty is the town and what it takes to solve it — never a guess.
 * Gentle towns have more small blocks and a generous third of their numbers
 * printed, and fall to "one left" alone; Classic towns, mostly blocks of
 * four and five, also need "all touch one house" at least once; Challenging
 * towns, a size larger and sparer, need "claimed numbers" or "what if" at
 * least once.
 */
export const NEIGHBORS_LEVELS: readonly NeighborsLevelSpec[] = [
  { value: 'gentle', label: 'Gentle: 6 × 6 town', gridLabel: '6 × 6', size: 6, rules: 'single', beyond: null, mix: [6, 5, 2, 0], clues: [0.3, 0.5], minCell: inch(0.6) },
  { value: 'classic', label: 'Classic: 8 × 8 town', gridLabel: '8 × 8', size: 8, rules: 'touch', beyond: 'single', mix: [8, 4, 1, 0], clues: [0.2, 0.36], minCell: inch(0.5) },
  {
    value: 'challenging',
    label: 'Challenging: 9 × 9 town',
    gridLabel: '9 × 9',
    size: 9,
    rules: 'probe',
    beyond: 'touch',
    mix: [10, 3, 1, 0],
    clues: [0.11, 0.28],
    minCell: inch(0.45),
  },
]

export const DEFAULT_NEIGHBORS_LEVEL: NeighborsLevel = 'classic'

export function parseNeighborsLevel(raw: unknown): NeighborsLevel {
  const value = String(raw ?? '')
  return NEIGHBORS_LEVELS.some((l) => l.value === value) ? (value as NeighborsLevel) : DEFAULT_NEIGHBORS_LEVEL
}

export const neighborsLevelSpec = (level: NeighborsLevel): NeighborsLevelSpec => NEIGHBORS_LEVELS.find((l) => l.value === level)!

/* ------------------------------------------------------------------ *
 * The page's words
 * ------------------------------------------------------------------ */

export const NEIGHBORS_HOW_TO =
  'Fill each block with 1 up to its number of houses. Touching houses, even corner to corner or across a street, never match.'

/** Gentle adds the first trick every number-block solver learns. */
export const NEIGHBORS_GENTLE_TIP = 'Tip: a block of 2 holds only 1 and 2.'

export function neighborsInstruction(config: StudioConfig, level: NeighborsLevel): string {
  if (config.showInstructions === false) return ''
  // The tip on a line of its own, so it never leaves a word or two stranded under the rules.
  return level === 'gentle' ? `${NEIGHBORS_HOW_TO}\n${NEIGHBORS_GENTLE_TIP}` : NEIGHBORS_HOW_TO
}

/** The legend's sample block: three houses numbered 1, 2, 3. */
export const NEIGHBORS_LEGEND_BLOCK = [1, 2, 3] as const
/** The legend's touching pair: the same number either side of a street, crossed out. */
export const NEIGHBORS_LEGEND_TWIN = 2
/** The legend under the town: what a block holds, and what touching houses never do. */
export const NEIGHBORS_BLOCK_WORD = '= a block of 3 holds 1, 2, 3'
export const NEIGHBORS_TOUCH_WORD = '= no matching neighbors'

/* ------------------------------------------------------------------ *
 * Streets
 * ------------------------------------------------------------------ */

export interface NeighborsStreet {
  id: string
  /** What the sign over the town says. */
  name: string
}

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/**
 * Written for the retiree settling into a street they love: front porches,
 * garden gates, birdsong, the grandchildren's bikes on the lawn. No brands,
 * no money, no drink, no age jokes, no streets a film made famous.
 */
const NAMES = [
  'Maple Lane',
  'Rosewood Court',
  'Harbor View Cottages',
  'Bluebird Hill',
  'Sunset Grove',
  'Willow Creek Lane',
  'Orchard Street',
  'Honeysuckle Row',
  'Lighthouse Cove',
  'Meadowbrook Village',
  'Chestnut Close',
  'Primrose Lane',
  'Juniper Court',
  'Magnolia Row',
  'Hummingbird Way',
  'Cardinal Circle',
  'Seashell Cottages',
  'Pinecone Ridge',
  'Fox Hollow Lane',
  'Robin’s Nest Lane',
  'Mulberry Street',
  'Sunflower Court',
  'Blueberry Hill',
  'Garden Gate Row',
  'Harvest Moon Lane',
  'Golden Pond Village',
  'Heron Point',
  'Brookside Cottages',
  'Clover Lane',
  'Tulip Tree Terrace',
  'Riverbend Village',
  'Cherry Blossom Way',
  'Old Mill Lane',
  'Poppy Field Row',
  'Lavender Lane',
  'Front Porch Lane',
  'Lemonade Lane',
  'Birdsong Court',
  'Dogwood Drive',
  'Hollyhock Lane',
  'Sea Breeze Village',
  'Sweetbriar Lane',
  'Evening Star Lane',
  'Swallowtail Way',
  'Grandkids’ Cul-de-Sac',
  'Apple Blossom Court',
] as const

export const NEIGHBORS_STREETS: readonly NeighborsStreet[] = NAMES.map((name) => ({ id: slug(name), name }))

const STREET_INDEX = new Map(NEIGHBORS_STREETS.map((w) => [w.id, w]))
export const neighborsStreetById = (id: string) => STREET_INDEX.get(id)

/**
 * What the sign over the town reads: on one line, or broken between words
 * where the two lines come out most even on a narrow trim.
 */
export function neighborsSignText(street: NeighborsStreet, lines: 1 | 2 = 1): string {
  if (lines === 1) return street.name
  const words = street.name.split(' ')
  let best = street.name
  let worst = Infinity
  for (let k = 1; k < words.length; k++) {
    const top = words.slice(0, k).join(' ')
    const bottom = words.slice(k).join(' ')
    const longer = Math.max(top.length, bottom.length)
    if (longer < worst) {
      worst = longer
      best = `${top}\n${bottom}`
    }
  }
  return best
}

/* ------------------------------------------------------------------ *
 * The book
 * ------------------------------------------------------------------ */

/** `street|level|town`: the label a page stamps, and what the book reads back. */
export const neighborsPageLabel = (street: NeighborsStreet, level: NeighborsLevel, signature: string) => `${street.id}|${level}|${signature}`

export interface NeighborsBookEntry {
  street: string
  level: NeighborsLevel | null
  signature: string
}

/** The book's Friendly Neighbors pages, oldest first, from their stamped labels. */
export function parseNeighborsBook(labels: readonly string[]): NeighborsBookEntry[] {
  const out: NeighborsBookEntry[] = []
  for (const label of labels) {
    const [id, level, signature] = label.split('|')
    if (!id || !neighborsStreetById(id)) continue
    out.push({ street: id, level: NEIGHBORS_LEVELS.some((l) => l.value === level) ? (level as NeighborsLevel) : null, signature: signature ?? '' })
  }
  return out
}

/**
 * The street for a page.
 *
 * Least-used in the book first, so a book works through every street before
 * one returns; among those, ones this seller has not printed lately; then
 * the dealt order. The previous page's street never follows itself.
 */
export function pickNeighborsStreet(options: {
  level: NeighborsLevel
  seed: number
  ownerSalt: string
  book: readonly NeighborsBookEntry[]
  /** Street ids this seller printed lately. */
  recent: readonly string[]
}): NeighborsStreet {
  const { level, seed, ownerSalt, book, recent } = options
  const rng = createRngFromSeedInput({
    ownerSalt,
    templateKey: NEIGHBORS_TEMPLATE_KEY,
    configHash: `level:${level}`,
    pageNonce: seed,
    stream: 'street',
  })
  const shown = new Map<string, number>()
  for (const entry of book) shown.set(entry.street, (shown.get(entry.street) ?? 0) + 1)
  const previous = book.length > 0 ? book[book.length - 1]!.street : null
  const recentSet = new Set(recent)
  const dealt = rng.shuffle(NEIGHBORS_STREETS)
  const order = new Map(dealt.map((w, i) => [w.id, i]))
  const ranked = [...NEIGHBORS_STREETS].sort((a, b) => {
    const byShown = (shown.get(a.id) ?? 0) - (shown.get(b.id) ?? 0)
    if (byShown !== 0) return byShown
    const byPrevious = Number(a.id === previous) - Number(b.id === previous)
    if (byPrevious !== 0) return byPrevious
    const byRecent = Number(recentSet.has(a.id)) - Number(recentSet.has(b.id))
    if (byRecent !== 0) return byRecent
    return order.get(a.id)! - order.get(b.id)!
  })
  return ranked[0]!
}

/** The building stream for one attempt at a page. */
export function neighborsTownRng(options: { level: NeighborsLevel; seed: number; ownerSalt: string; attempt: number }) {
  const { level, seed, ownerSalt, attempt } = options
  return createRngFromSeedInput({
    ownerSalt,
    templateKey: NEIGHBORS_TEMPLATE_KEY,
    configHash: `level:${level}`,
    pageNonce: seed,
    stream: `town:${attempt}`,
  })
}
