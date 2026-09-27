import type { StudioConfig } from '@/types/studio-template.types'
import { DPI } from '@/types/canvas-settings.types'
import { createRngFromSeedInput } from '../_shared/uniqueness'
import type { StonesRules } from './solver'

/**
 * What a Stepping Stones page shows, and how each page's path and name are
 * chosen.
 *
 * A page is one number path, built fresh from the seller's puzzle salt and
 * the page seed (so two sellers on the same settings print different
 * books, and the same seed reprints the same page), under the signpost of a
 * walk a retiree loves — the Rose Garden Path, a Seaside Boardwalk, the
 * Grandkids’ Nature Walk. A book works through every walk before one
 * returns, and a seller's next book opens with walks their last one did
 * not use.
 */

export const STONES_TEMPLATE_KEY = 'stepping-stones'
export const STONES_DEFAULT_TITLE = 'Stepping Stones'

export const STONES_BUILD_FAILED_MESSAGE = 'Could not build a Stepping Stones puzzle for this page. Try again.'

export function stonesPageTooSmallMessage(level: StonesLevelSpec): string {
  return `This page size is too small for ${level.gridLabel} paths at large print. Pick a larger page in Settings, or an easier level.`
}

/* ------------------------------------------------------------------ *
 * Levels
 * ------------------------------------------------------------------ */

export type StonesLevel = 'gentle' | 'classic' | 'challenging'

export interface StonesLevelSpec {
  value: StonesLevel
  label: string
  /** "8 × 8", for help lines and messages. */
  gridLabel: string
  /** Stones across and down. */
  size: number
  /** The steps a reader needs; the solver may use no others. */
  rules: StonesRules
  /** Steps the level's paths must not fall to alone (they need the level's own). */
  beyond: StonesRules | null
  /** Longest straight run of stones a walk may take. */
  maxRun: number
  /** Fewest and most numbers printed, as a share of the stones. */
  clues: readonly [number, number]
  /** Smallest stone pitch the level prints, canvas px. */
  minCell: number
}

const inch = (n: number) => Math.round(n * DPI * 100) / 100

/**
 * Difficulty is the path and what it takes to solve it — never a guess.
 * Gentle paths fall to counting steps, with a generous third of the numbers
 * printed; Classic paths also need "no dead ends" at least once; Challenging
 * paths, a size larger and sparer, need "what if" at least once.
 */
export const STONES_LEVELS: readonly StonesLevelSpec[] = [
  { value: 'gentle', label: 'Gentle: 6 × 6 path (1 to 36)', gridLabel: '6 × 6', size: 6, rules: 'reach', beyond: null, maxRun: 4, clues: [0.36, 0.5], minCell: inch(0.6) },
  { value: 'classic', label: 'Classic: 8 × 8 path (1 to 64)', gridLabel: '8 × 8', size: 8, rules: 'link', beyond: 'reach', maxRun: 5, clues: [0.28, 0.4], minCell: inch(0.5) },
  {
    value: 'challenging',
    label: 'Challenging: 9 × 9 path (1 to 81)',
    gridLabel: '9 × 9',
    size: 9,
    rules: 'probe',
    beyond: 'link',
    maxRun: 6,
    clues: [0.16, 0.3],
    minCell: inch(0.45),
  },
]

export const DEFAULT_STONES_LEVEL: StonesLevel = 'classic'

export function parseStonesLevel(raw: unknown): StonesLevel {
  const value = String(raw ?? '')
  return STONES_LEVELS.some((l) => l.value === value) ? (value as StonesLevel) : DEFAULT_STONES_LEVEL
}

export const stonesLevelSpec = (level: StonesLevel): StonesLevelSpec => STONES_LEVELS.find((l) => l.value === level)!

/** The last number on a level's path. */
export const stonesLast = (level: StonesLevel) => stonesLevelSpec(level).size ** 2

/* ------------------------------------------------------------------ *
 * The page's words
 * ------------------------------------------------------------------ */

export function stonesHowTo(level: StonesLevel): string {
  return `Write 1 to ${stonesLast(level)} on the stones to make one path: each number next to the one before it, across or down, never diagonally.`
}

/** Gentle adds the first trick every number-path solver learns. */
export const STONES_GENTLE_TIP = 'Tip: 5 and 9 are four steps apart, so 6, 7 and 8 fill the stones between.'

export function stonesInstruction(config: StudioConfig, level: StonesLevel): string {
  if (config.showInstructions === false) return ''
  return level === 'gentle' ? `${stonesHowTo(level)} ${STONES_GENTLE_TIP}` : stonesHowTo(level)
}

/** The legend's sample pair: two numbers in a row on neighbouring stones. */
export const STONES_LEGEND_PAIR = [4, 5] as const
/** The legend under the path: what "next" means, and the start and finish stones. */
export const STONES_NEXT_WORD = '= next number, across or down'
export const STONES_ENDS_WORD = '= start and finish'

/* ------------------------------------------------------------------ *
 * Walks
 * ------------------------------------------------------------------ */

export interface StonesWalk {
  id: string
  /** What the signpost over the path says. */
  name: string
}

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/**
 * Written for the retiree who finally has time for the long way round: the
 * morning loop, the garden tour, the stroll with the grandchildren. No
 * brands, no money, no drink, no age jokes.
 */
const NAMES = [
  'Rose Garden Path',
  'Lakeside Morning Walk',
  'Seaside Boardwalk',
  'Autumn Leaf Trail',
  'Botanical Garden Loop',
  'Riverside Stroll',
  'Grandkids’ Nature Walk',
  'Cherry Blossom Walk',
  'Lighthouse Point Trail',
  'Village Green Stroll',
  'Butterfly Garden Path',
  'Covered Bridge Walk',
  'Sunset Beach Walk',
  'Pine Forest Trail',
  'Duck Pond Loop',
  'Farmers’ Market Stroll',
  'Wildflower Meadow Path',
  'Harbor Walk',
  'Japanese Tea Garden',
  'Birdwatching Trail',
  'Lavender Garden Path',
  'Mountain Lake Trail',
  'Maple Lane Walk',
  'Sunday Park Stroll',
  'Tulip Garden Walk',
  'Waterfall Trail',
  'Country Lane Walk',
  'Apple Orchard Path',
  'Fishing Pier Walk',
  'Hilltop Lookout Trail',
  'Herb Garden Path',
  'Dogwood Trail',
  'Canal Towpath',
  'Sand Dune Trail',
  'Magnolia Walk',
  'Garden Club Tour',
  'Snowy Woods Walk',
  'Grandma’s Garden Path',
  'Evening Walk with the Dog',
  'Zen Garden Path',
  'Lily Pond Walk',
  'Sunflower Trail',
  'Main Street Stroll',
  'Cottage Garden Path',
  'Bluebell Wood Walk',
  'Old Mill Stream Walk',
] as const

export const STONES_WALKS: readonly StonesWalk[] = NAMES.map((name) => ({ id: slug(name), name }))

const WALK_INDEX = new Map(STONES_WALKS.map((w) => [w.id, w]))
export const stonesWalkById = (id: string) => WALK_INDEX.get(id)

/**
 * What the signpost over the path reads: on one line, or broken between
 * words where the two lines come out most even on a narrow trim.
 */
export function stonesSignText(walk: StonesWalk, lines: 1 | 2 = 1): string {
  if (lines === 1) return walk.name
  const words = walk.name.split(' ')
  let best = walk.name
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

/** `walk|level|path`: the label a page stamps, and what the book reads back. */
export const stonesPageLabel = (walk: StonesWalk, level: StonesLevel, signature: string) => `${walk.id}|${level}|${signature}`

export interface StonesBookEntry {
  walk: string
  level: StonesLevel | null
  signature: string
}

/** The book's Stepping Stones pages, oldest first, from their stamped labels. */
export function parseStonesBook(labels: readonly string[]): StonesBookEntry[] {
  const out: StonesBookEntry[] = []
  for (const label of labels) {
    const [id, level, signature] = label.split('|')
    if (!id || !stonesWalkById(id)) continue
    out.push({ walk: id, level: STONES_LEVELS.some((l) => l.value === level) ? (level as StonesLevel) : null, signature: signature ?? '' })
  }
  return out
}

/**
 * The walk for a page.
 *
 * Least-used in the book first, so a book works through every walk before
 * one returns; among those, ones this seller has not printed lately; then
 * the dealt order. The previous page's walk never follows itself.
 */
export function pickStonesWalk(options: {
  level: StonesLevel
  seed: number
  ownerSalt: string
  book: readonly StonesBookEntry[]
  /** Walk ids this seller printed lately. */
  recent: readonly string[]
}): StonesWalk {
  const { level, seed, ownerSalt, book, recent } = options
  const rng = createRngFromSeedInput({
    ownerSalt,
    templateKey: STONES_TEMPLATE_KEY,
    configHash: `level:${level}`,
    pageNonce: seed,
    stream: 'walk',
  })
  const shown = new Map<string, number>()
  for (const entry of book) shown.set(entry.walk, (shown.get(entry.walk) ?? 0) + 1)
  const previous = book.length > 0 ? book[book.length - 1]!.walk : null
  const recentSet = new Set(recent)
  const dealt = rng.shuffle(STONES_WALKS)
  const order = new Map(dealt.map((w, i) => [w.id, i]))
  const ranked = [...STONES_WALKS].sort((a, b) => {
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
export function stonesPathRng(options: { level: StonesLevel; seed: number; ownerSalt: string; attempt: number }) {
  const { level, seed, ownerSalt, attempt } = options
  return createRngFromSeedInput({
    ownerSalt,
    templateKey: STONES_TEMPLATE_KEY,
    configHash: `level:${level}`,
    pageNonce: seed,
    stream: `path:${attempt}`,
  })
}
