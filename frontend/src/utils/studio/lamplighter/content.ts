import type { StudioConfig } from '@/types/studio-template.types'
import { DPI } from '@/types/canvas-settings.types'
import { createRngFromSeedInput } from '../_shared/uniqueness'
import type { LampRules } from './solver'

/**
 * What a Lamplighter page shows, and how each page's house and name are
 * chosen.
 *
 * A page is one Light Up (Akari) house, built fresh from the seller's puzzle
 * salt and the page seed (so two sellers on the same settings print
 * different books, and the same seed reprints the same page), under the
 * name board of a retiree's home — Lakeside Cabin, Grandma’s Farmhouse. A
 * book works through every home before one returns, and a seller's next
 * book opens with homes their last one did not use.
 */

export const LAMP_TEMPLATE_KEY = 'lamplighter'
export const LAMP_DEFAULT_TITLE = 'Lamplighter'

export const LAMP_BUILD_FAILED_MESSAGE = 'Could not build a Lamplighter puzzle for this page. Try again.'

export function lampPageTooSmallMessage(level: LampLevelSpec): string {
  return `This page size is too small for ${level.gridLabel} houses at large print. Pick a larger page in Settings, or an easier level.`
}

/* ------------------------------------------------------------------ *
 * Levels
 * ------------------------------------------------------------------ */

export type LampLevel = 'gentle' | 'classic' | 'challenging'

export interface LampLevelSpec {
  value: LampLevel
  label: string
  /** "9 × 9", for help lines and messages. */
  gridLabel: string
  /** Squares across and down. */
  size: number
  /** How many walls the house is built with. */
  walls: number
  /** The fewest numbers a house of the level prints. */
  minNumbers: number
  /** The steps a reader needs; the solver may use no others. */
  rules: LampRules
  /** Steps the level's houses must not fall to alone (they need the level's own). */
  beyond: LampRules | null
  /** Smallest square the level prints, canvas px. */
  minCell: number
}

const inch = (n: number) => Math.round(n * DPI * 100) / 100

/**
 * Difficulty is the house and what it takes to solve it — never a guess.
 * Gentle houses fall to counting round the numbers and "only one place can
 * light this square"; Classic houses also need "wherever the light comes
 * from" at least once; Challenging houses, a size larger, need "what if" at
 * least once.
 */
export const LAMP_LEVELS: readonly LampLevelSpec[] = [
  { value: 'gentle', label: 'Gentle: 7 × 7 house', gridLabel: '7 × 7', size: 7, walls: 13, minNumbers: 4, rules: 'basic', beyond: null, minCell: inch(0.5) },
  { value: 'classic', label: 'Classic: 9 × 9 house', gridLabel: '9 × 9', size: 9, walls: 21, minNumbers: 6, rules: 'shine', beyond: 'basic', minCell: inch(0.45) },
  {
    value: 'challenging',
    label: 'Challenging: 10 × 10 house',
    gridLabel: '10 × 10',
    size: 10,
    walls: 26,
    minNumbers: 8,
    rules: 'probe',
    beyond: 'shine',
    minCell: inch(0.4),
  },
]

export const DEFAULT_LAMP_LEVEL: LampLevel = 'classic'

export function parseLampLevel(raw: unknown): LampLevel {
  const value = String(raw ?? '')
  return LAMP_LEVELS.some((l) => l.value === value) ? (value as LampLevel) : DEFAULT_LAMP_LEVEL
}

export const lampLevelSpec = (level: LampLevel): LampLevelSpec => LAMP_LEVELS.find((l) => l.value === level)!

/* ------------------------------------------------------------------ *
 * The page's words
 * ------------------------------------------------------------------ */

export const LAMP_INSTRUCTION =
  'Put lamps on white squares until all are lit. A lamp shines along its row and column up to a wall; no lamp may shine on another. A number is how many lamps touch that wall.'

/** Gentle adds the first trick every Light Up solver learns. */
export const LAMP_GENTLE_TIP = 'Tip: dot every square a lamp already lights.'

export function lampInstruction(config: StudioConfig, level: LampLevel): string {
  if (config.showInstructions === false) return ''
  return level === 'gentle' ? `${LAMP_INSTRUCTION} ${LAMP_GENTLE_TIP}` : LAMP_INSTRUCTION
}

/** The number the legend's sample wall carries. */
export const LAMP_LEGEND_SAMPLE = 2

/** The legend under the house: how many lamps there are to place, and what the sample wall's number means. */
export const lampCountWord = (lamps: number) => `${lamps} lamps`
export const lampSampleWord = (lamps: number) => `= ${lamps} lamps touch it`

/* ------------------------------------------------------------------ *
 * Homes
 * ------------------------------------------------------------------ */

export interface LampHome {
  id: string
  /** What the name board over the house says. */
  name: string
}

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/**
 * Written for the retiree lighting up the house of their days: the lake,
 * the shore, the farm, the grandchildren's favourite visit, the place they
 * always meant to live. No brands, no money, no drink, no age jokes.
 */
const NAMES = [
  'Lakeside Cabin',
  'Seaside Cottage',
  'Grandma’s Farmhouse',
  'Mountain Lodge',
  'Rose Garden Cottage',
  'Lighthouse Keeper’s House',
  'Sunset Bungalow',
  'Cape Cod Cottage',
  'Victorian Townhouse',
  'Log Cabin Retreat',
  'Beach House',
  'Porch Swing Cottage',
  'Orchard House',
  'Winter Cabin',
  'Maple Lane House',
  'Harbor View Cottage',
  'Old Schoolhouse',
  'Red Barn Loft',
  'Riverside Cottage',
  'Pine Ridge Cabin',
  'Meadow Farmhouse',
  'Craftsman Bungalow',
  'Stone Cottage',
  'Hilltop Ranch',
  'Desert Adobe',
  'Fishing Cabin',
  'Grandpa’s Workshop',
  'Sunroom Retreat',
  'Family Homestead',
  'Retirement Cottage',
  'Snowbird Condo',
  'Houseboat on the Bay',
  'Holiday Cabin',
  'Alpine Chalet',
  'Tudor Cottage',
  'Adirondack Lodge',
  'Prairie Farmhouse',
  'Carriage House',
  'Country Inn',
  'Bed and Breakfast',
  'Tiny House',
  'Cozy Duplex',
  'Brick Colonial',
  'Treehouse for Grandkids',
] as const

export const LAMP_HOMES: readonly LampHome[] = NAMES.map((name) => ({ id: slug(name), name }))

const HOME_INDEX = new Map(LAMP_HOMES.map((h) => [h.id, h]))
export const lampHomeById = (id: string) => HOME_INDEX.get(id)

/**
 * What the name board over the house reads: on one line, or broken between
 * words where the two lines come out most even on a narrow trim.
 */
export function lampSignText(home: LampHome, lines: 1 | 2 = 1): string {
  if (lines === 1) return home.name
  const words = home.name.split(' ')
  let best = home.name
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

/** `home|level|house`: the label a page stamps, and what the book reads back. */
export const lampPageLabel = (home: LampHome, level: LampLevel, signature: string) => `${home.id}|${level}|${signature}`

export interface LampBookEntry {
  home: string
  level: LampLevel | null
  signature: string
}

/** The book's Lamplighter pages, oldest first, from their stamped labels. */
export function parseLampBook(labels: readonly string[]): LampBookEntry[] {
  const out: LampBookEntry[] = []
  for (const label of labels) {
    const [id, level, signature] = label.split('|')
    if (!id || !lampHomeById(id)) continue
    out.push({ home: id, level: LAMP_LEVELS.some((l) => l.value === level) ? (level as LampLevel) : null, signature: signature ?? '' })
  }
  return out
}

/**
 * The home for a page.
 *
 * Least-used in the book first, so a book works through every home before
 * one returns; among those, ones this seller has not printed lately; then
 * the dealt order. The previous page's home never follows itself.
 */
export function pickLampHome(options: {
  level: LampLevel
  seed: number
  ownerSalt: string
  book: readonly LampBookEntry[]
  /** Home ids this seller printed lately. */
  recent: readonly string[]
}): LampHome {
  const { level, seed, ownerSalt, book, recent } = options
  const rng = createRngFromSeedInput({
    ownerSalt,
    templateKey: LAMP_TEMPLATE_KEY,
    configHash: `level:${level}`,
    pageNonce: seed,
    stream: 'home',
  })
  const shown = new Map<string, number>()
  for (const entry of book) shown.set(entry.home, (shown.get(entry.home) ?? 0) + 1)
  const previous = book.length > 0 ? book[book.length - 1]!.home : null
  const recentSet = new Set(recent)
  const dealt = rng.shuffle(LAMP_HOMES)
  const order = new Map(dealt.map((h, i) => [h.id, i]))
  const ranked = [...LAMP_HOMES].sort((a, b) => {
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
export function lampHouseRng(options: { level: LampLevel; seed: number; ownerSalt: string; attempt: number }) {
  const { level, seed, ownerSalt, attempt } = options
  return createRngFromSeedInput({
    ownerSalt,
    templateKey: LAMP_TEMPLATE_KEY,
    configHash: `level:${level}`,
    pageNonce: seed,
    stream: `house:${attempt}`,
  })
}
