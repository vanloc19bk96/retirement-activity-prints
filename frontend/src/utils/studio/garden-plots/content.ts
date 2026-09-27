import type { StudioConfig } from '@/types/studio-template.types'
import { DPI } from '@/types/canvas-settings.types'
import { createRngFromSeedInput } from '../_shared/uniqueness'
import type { GpRules } from './solver'

/**
 * What a Garden Plots page shows, and how each page's garden and name are
 * chosen.
 *
 * A page is one Queens-style garden, built fresh from the seller's puzzle
 * salt and the page seed (so two sellers on the same settings print
 * different books, and the same seed reprints the same page), under the
 * sign of a retiree's garden — Sunny Porch Garden, Lavender Lane. A book
 * works through every garden before one returns, and a seller's next book
 * opens with gardens their last one did not use.
 */

export const GP_TEMPLATE_KEY = 'garden-plots'
export const GP_DEFAULT_TITLE = 'Garden Plots'

export const GP_BUILD_FAILED_MESSAGE = 'Could not build a Garden Plots puzzle for this page. Try again.'

export function gpPageTooSmallMessage(level: GpLevelSpec): string {
  return `This page size is too small for ${level.gridLabel} gardens at large print. Pick a larger page in Settings, or an easier level.`
}

/* ------------------------------------------------------------------ *
 * Levels
 * ------------------------------------------------------------------ */

export type GpLevel = 'gentle' | 'classic' | 'challenging'

export interface GpLevelSpec {
  value: GpLevel
  label: string
  /** "8 × 8", for help lines and messages. */
  gridLabel: string
  /** Squares across and down; also the beds and the flowers. */
  size: number
  /** The steps a reader needs; the solver may use no others. */
  rules: GpRules
  /** Steps the level's gardens must not fall to alone (they need the level's own). */
  beyond: GpRules | null
  /** The fewest group or "what if" steps a garden of the level takes. */
  minSets: number
  /** Smallest square the level prints, canvas px. */
  minCell: number
}

const inch = (n: number) => Math.round(n * DPI * 100) / 100

/**
 * Difficulty is the garden and what it takes to solve it — never a guess.
 * Gentle gardens fall to crossing off and counting; Classic gardens also
 * need counting beds in groups at least once; Challenging gardens, a size
 * larger, need group counting or a "what if" check at least twice.
 */
export const GP_LEVELS: readonly GpLevelSpec[] = [
  { value: 'gentle', label: 'Gentle — 7 × 7, 7 flowers', gridLabel: '7 × 7', size: 7, rules: 'basic', beyond: null, minSets: 0, minCell: inch(0.5) },
  { value: 'classic', label: 'Classic — 8 × 8, 8 flowers', gridLabel: '8 × 8', size: 8, rules: 'sets', beyond: 'basic', minSets: 1, minCell: inch(0.5) },
  { value: 'challenging', label: 'Challenging — 9 × 9, 9 flowers', gridLabel: '9 × 9', size: 9, rules: 'probe', beyond: 'basic', minSets: 2, minCell: inch(0.45) },
]

export const DEFAULT_GP_LEVEL: GpLevel = 'classic'

export function parseGpLevel(raw: unknown): GpLevel {
  const value = String(raw ?? '')
  return GP_LEVELS.some((l) => l.value === value) ? (value as GpLevel) : DEFAULT_GP_LEVEL
}

export const gpLevelSpec = (level: GpLevel): GpLevelSpec => GP_LEVELS.find((l) => l.value === level)!

/* ------------------------------------------------------------------ *
 * The page's words
 * ------------------------------------------------------------------ */

export const GP_INSTRUCTION =
  'Plant one flower in every row, every column and every garden bed (the areas inside the heavy lines). Flowers never touch — not even corner to corner.'

/** Gentle adds the first trick every Queens solver learns. */
export const GP_GENTLE_TIP = 'Tip: a bed that lies all in one row or column puts its flower there — cross off the rest of that line.'

export function gpInstruction(config: StudioConfig, level: GpLevel): string {
  if (config.showInstructions === false) return ''
  return level === 'gentle' ? `${GP_INSTRUCTION} ${GP_GENTLE_TIP}` : GP_INSTRUCTION
}

/** The legend under the garden. */
export const gpBedWord = (beds: number) => `${beds} garden beds`
export const gpFlowerWord = (flowers: number) => `Flower (plant ${flowers})`

/* ------------------------------------------------------------------ *
 * Gardens
 * ------------------------------------------------------------------ */

export interface GpGarden {
  id: string
  /** What the sign over the garden says. */
  name: string
}

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/**
 * Written for the retiree with dirt under their fingernails: the porch, the
 * seasons, the garden club and the grandchildren. No brands, no money, no
 * drink, no age jokes.
 */
const NAMES = [
  'Sunny Porch Garden',
  'Rose Arbor Garden',
  'Kitchen Herb Garden',
  'Butterfly Meadow',
  'Cottage Garden',
  'Tulip Time Garden',
  'Hummingbird Garden',
  'Morning Glory Fence',
  'Sunflower Patch',
  'Lavender Lane',
  'Moonlight Garden',
  'Rock Garden Path',
  'Daffodil Hill',
  'Wildflower Field',
  'Birdbath Garden',
  'Secret Garden Gate',
  'Community Allotment',
  'Window Box Garden',
  'Greenhouse Rows',
  'Peony Border',
  'Hollyhock Corner',
  'Tea Rose Terrace',
  'Zinnia Beds',
  'Marigold Walk',
  'Hydrangea Hedge',
  'Pumpkin Patch',
  'Tomato Trellis',
  'Strawberry Patch',
  'Dahlia Show Garden',
  'Shady Fern Garden',
  'Water Lily Pond',
  'Picket Fence Garden',
  'Grandkids’ Garden',
  'Porch Swing Garden',
  'Poppy Field',
  'Pansy Pots',
  'Blue Iris Border',
  'Orchard Meadow',
  'Sweet Pea Arch',
  'Garden Club Show',
  'Raised Bed Garden',
  'Bluebell Wood',
] as const

export const GP_GARDENS: readonly GpGarden[] = NAMES.map((name) => ({ id: slug(name), name }))

const GARDEN_INDEX = new Map(GP_GARDENS.map((g) => [g.id, g]))
export const gpGardenById = (id: string) => GARDEN_INDEX.get(id)

/**
 * What the sign over the garden reads: on one line, or broken between words
 * where the two lines come out most even on a narrow trim.
 */
export function gpSignText(garden: GpGarden, lines: 1 | 2 = 1): string {
  if (lines === 1) return garden.name
  const words = garden.name.split(' ')
  let best = garden.name
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

/** `garden|level|beds`: the label a page stamps, and what the book reads back. */
export const gpPageLabel = (garden: GpGarden, level: GpLevel, signature: string) => `${garden.id}|${level}|${signature}`

export interface GpBookEntry {
  garden: string
  level: GpLevel | null
  signature: string
}

/** The book's Garden Plots pages, oldest first, from their stamped labels. */
export function parseGpBook(labels: readonly string[]): GpBookEntry[] {
  const out: GpBookEntry[] = []
  for (const label of labels) {
    const [id, level, signature] = label.split('|')
    if (!id || !gpGardenById(id)) continue
    out.push({ garden: id, level: GP_LEVELS.some((l) => l.value === level) ? (level as GpLevel) : null, signature: signature ?? '' })
  }
  return out
}

/**
 * The garden for a page.
 *
 * Least-used in the book first, so a book works through every garden
 * before one returns; among those, ones this seller has not printed lately;
 * then the dealt order. The previous page's garden never follows itself.
 */
export function pickGpGarden(options: {
  level: GpLevel
  seed: number
  ownerSalt: string
  book: readonly GpBookEntry[]
  /** Garden ids this seller printed lately. */
  recent: readonly string[]
}): GpGarden {
  const { level, seed, ownerSalt, book, recent } = options
  const rng = createRngFromSeedInput({
    ownerSalt,
    templateKey: GP_TEMPLATE_KEY,
    configHash: `level:${level}`,
    pageNonce: seed,
    stream: 'garden',
  })
  const shown = new Map<string, number>()
  for (const entry of book) shown.set(entry.garden, (shown.get(entry.garden) ?? 0) + 1)
  const previous = book.length > 0 ? book[book.length - 1]!.garden : null
  const recentSet = new Set(recent)
  const dealt = rng.shuffle(GP_GARDENS)
  const order = new Map(dealt.map((g, i) => [g.id, i]))
  const ranked = [...GP_GARDENS].sort((a, b) => {
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

/** The garden stream for one attempt at a page. */
export function gpGardenRng(options: { level: GpLevel; seed: number; ownerSalt: string; attempt: number }) {
  const { level, seed, ownerSalt, attempt } = options
  return createRngFromSeedInput({
    ownerSalt,
    templateKey: GP_TEMPLATE_KEY,
    configHash: `level:${level}`,
    pageNonce: seed,
    stream: `beds:${attempt}`,
  })
}
