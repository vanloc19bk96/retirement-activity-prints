import type { StudioConfig } from '@/types/studio-template.types'
import { DPI } from '@/types/canvas-settings.types'
import { createRngFromSeedInput } from '../_shared/uniqueness'
import type { FenceRules } from './solver'

/**
 * What a Country Fence page shows, and how each page's field and name are
 * chosen.
 *
 * A page is one Slitherlink field, built fresh from the seller's puzzle
 * salt and the page seed (so two sellers on the same settings print
 * different books, and the same seed reprints the same page), under the
 * name board of a pasture on a retiree's hobby farm — Sunny Acres Pasture,
 * Grandpa’s Back Forty. A book works through every pasture before one
 * returns, and a seller's next book opens with pastures their last one did
 * not use.
 */

export const FENCE_TEMPLATE_KEY = 'country-fence'
export const FENCE_DEFAULT_TITLE = 'Country Fence'

export const FENCE_BUILD_FAILED_MESSAGE = 'Could not build a Country Fence puzzle for this page. Try again.'

export function fencePageTooSmallMessage(level: FenceLevelSpec): string {
  return `This page size is too small for ${level.gridLabel} fields at large print. Pick a larger page in Settings, or an easier level.`
}

/* ------------------------------------------------------------------ *
 * Levels
 * ------------------------------------------------------------------ */

export type FenceLevel = 'gentle' | 'classic' | 'challenging'

export interface FenceLevelSpec {
  value: FenceLevel
  label: string
  /** "8 × 8", for help lines and messages. */
  gridLabel: string
  /** Squares across and down. */
  size: number
  /** Least and most share of the field's squares the pasture takes. */
  area: readonly [number, number]
  /** Least fence length, as rails per square of the field. */
  length: number
  /** The steps a reader needs; the solver may use no others. */
  rules: FenceRules
  /** Steps the level's fields must not fall to alone (they need the level's own). */
  beyond: FenceRules | null
  /** Smallest square the level prints, canvas px. */
  minCell: number
}

const inch = (n: number) => Math.round(n * DPI * 100) / 100

/**
 * Difficulty is the field and what it takes to solve it — never a guess.
 * Gentle fields fall to the numbers and the posts, one square at a time;
 * Classic fields also need "don't close the fence early" at least once;
 * Challenging fields, a size larger, need "what if" at least once.
 */
export const FENCE_LEVELS: readonly FenceLevelSpec[] = [
  { value: 'gentle', label: 'Gentle: 6 × 6 field', gridLabel: '6 × 6', size: 6, area: [0.4, 0.6], length: 1, rules: 'local', beyond: null, minCell: inch(0.55) },
  { value: 'classic', label: 'Classic: 8 × 8 field', gridLabel: '8 × 8', size: 8, area: [0.4, 0.6], length: 1, rules: 'loop', beyond: 'local', minCell: inch(0.48) },
  {
    value: 'challenging',
    label: 'Challenging: 10 × 10 field',
    gridLabel: '10 × 10',
    size: 10,
    area: [0.4, 0.6],
    length: 1,
    rules: 'probe',
    beyond: 'loop',
    minCell: inch(0.4),
  },
]

export const DEFAULT_FENCE_LEVEL: FenceLevel = 'classic'

export function parseFenceLevel(raw: unknown): FenceLevel {
  const value = String(raw ?? '')
  return FENCE_LEVELS.some((l) => l.value === value) ? (value as FenceLevel) : DEFAULT_FENCE_LEVEL
}

export const fenceLevelSpec = (level: FenceLevel): FenceLevelSpec => FENCE_LEVELS.find((l) => l.value === level)!

/* ------------------------------------------------------------------ *
 * The page's words
 * ------------------------------------------------------------------ */

export const FENCE_INSTRUCTION =
  'Join neighboring dots into one closed fence that never crosses or branches. Each number tells how many sides of its square are fence.'

/** Gentle adds the first tricks every Slitherlink solver learns. */
export const FENCE_GENTLE_TIP = 'Tip: a 0 has no fence round it, and a 3 in a corner is fenced on both corner sides.'

export function fenceInstruction(config: StudioConfig, level: FenceLevel): string {
  if (config.showInstructions === false) return ''
  return level === 'gentle' ? `${FENCE_INSTRUCTION} ${FENCE_GENTLE_TIP}` : FENCE_INSTRUCTION
}

/** The legend's sample square: a 3, fenced on every side but its bottom (sides run top, right, bottom, left). */
export const FENCE_LEGEND_SAMPLE = 3
export const FENCE_LEGEND_OPEN_SIDE = 2
/** The legend under the field: what a number counts, and what the reader builds. */
export const FENCE_SAMPLE_WORD = `= ${FENCE_LEGEND_SAMPLE} sides fenced`
export const FENCE_LOOP_WORD = '= one loop'

/* ------------------------------------------------------------------ *
 * Pastures
 * ------------------------------------------------------------------ */

export interface FencePasture {
  id: string
  /** What the name board over the field says. */
  name: string
}

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/**
 * Written for the retiree who finally has the hobby farm: the paddocks, the
 * orchards, the patches the grandchildren help pick. No brands, no money,
 * no drink, no age jokes.
 */
const NAMES = [
  'Sunny Acres Pasture',
  'Grandpa’s Back Forty',
  'Clover Hill Meadow',
  'Red Barn Paddock',
  'Pony Paddock',
  'Wildflower Meadow',
  'Apple Orchard',
  'Duck Pond Meadow',
  'Sheep Meadow',
  'Pumpkin Patch',
  'Sunflower Field',
  'Old Mill Pasture',
  'Creekside Meadow',
  'Maple Grove',
  'Goat Pen',
  'Henhouse Yard',
  'Strawberry Patch',
  'Blueberry Field',
  'Alpaca Pasture',
  'Honeybee Meadow',
  'Hayfield',
  'Christmas Tree Farm',
  'Grandkids’ Petting Zoo',
  'Bunny Run',
  'Lambing Pasture',
  'Orchard Hill',
  'Riverside Pasture',
  'Windmill Pasture',
  'Lavender Field',
  'County Fairgrounds',
  'Horse Paddock',
  'Cornfield Corner',
  'Dairy Cow Pasture',
  'Vegetable Garden',
  'Cherry Orchard',
  'Buttercup Meadow',
  'Rolling Hills Ranch',
  'Pecan Grove',
  'Llama Pasture',
  'Farmhouse Front Yard',
  'Peach Orchard',
  'Donkey Paddock',
  'Tulip Field',
  'Grandma’s Kitchen Garden',
] as const

export const FENCE_PASTURES: readonly FencePasture[] = NAMES.map((name) => ({ id: slug(name), name }))

const PASTURE_INDEX = new Map(FENCE_PASTURES.map((h) => [h.id, h]))
export const fencePastureById = (id: string) => PASTURE_INDEX.get(id)

/**
 * What the name board over the field reads: on one line, or broken between
 * words where the two lines come out most even on a narrow trim.
 */
export function fenceSignText(pasture: FencePasture, lines: 1 | 2 = 1): string {
  if (lines === 1) return pasture.name
  const words = pasture.name.split(' ')
  let best = pasture.name
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

/** `pasture|level|field`: the label a page stamps, and what the book reads back. */
export const fencePageLabel = (pasture: FencePasture, level: FenceLevel, signature: string) => `${pasture.id}|${level}|${signature}`

export interface FenceBookEntry {
  pasture: string
  level: FenceLevel | null
  signature: string
}

/** The book's Country Fence pages, oldest first, from their stamped labels. */
export function parseFenceBook(labels: readonly string[]): FenceBookEntry[] {
  const out: FenceBookEntry[] = []
  for (const label of labels) {
    const [id, level, signature] = label.split('|')
    if (!id || !fencePastureById(id)) continue
    out.push({ pasture: id, level: FENCE_LEVELS.some((l) => l.value === level) ? (level as FenceLevel) : null, signature: signature ?? '' })
  }
  return out
}

/**
 * The pasture for a page.
 *
 * Least-used in the book first, so a book works through every pasture
 * before one returns; among those, ones this seller has not printed lately;
 * then the dealt order. The previous page's pasture never follows itself.
 */
export function pickFencePasture(options: {
  level: FenceLevel
  seed: number
  ownerSalt: string
  book: readonly FenceBookEntry[]
  /** Pasture ids this seller printed lately. */
  recent: readonly string[]
}): FencePasture {
  const { level, seed, ownerSalt, book, recent } = options
  const rng = createRngFromSeedInput({
    ownerSalt,
    templateKey: FENCE_TEMPLATE_KEY,
    configHash: `level:${level}`,
    pageNonce: seed,
    stream: 'pasture',
  })
  const shown = new Map<string, number>()
  for (const entry of book) shown.set(entry.pasture, (shown.get(entry.pasture) ?? 0) + 1)
  const previous = book.length > 0 ? book[book.length - 1]!.pasture : null
  const recentSet = new Set(recent)
  const dealt = rng.shuffle(FENCE_PASTURES)
  const order = new Map(dealt.map((h, i) => [h.id, i]))
  const ranked = [...FENCE_PASTURES].sort((a, b) => {
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
export function fenceFieldRng(options: { level: FenceLevel; seed: number; ownerSalt: string; attempt: number }) {
  const { level, seed, ownerSalt, attempt } = options
  return createRngFromSeedInput({
    ownerSalt,
    templateKey: FENCE_TEMPLATE_KEY,
    configHash: `level:${level}`,
    pageNonce: seed,
    stream: `field:${attempt}`,
  })
}
