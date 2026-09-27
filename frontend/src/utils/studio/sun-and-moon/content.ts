import type { StudioConfig } from '@/types/studio-template.types'
import { DPI } from '@/types/canvas-settings.types'
import { createRngFromSeedInput } from '../_shared/uniqueness'
import type { SmRules } from './solver'

/**
 * What a Sun & Moon page shows, and how each page's grid and name are
 * chosen.
 *
 * A page is one grid of suns and moons, built fresh from the seller's puzzle
 * salt and the page seed (so two sellers on the same settings print
 * different books, and the same seed reprints the same page), under the sign
 * of a day a retiree would love to balance — Sunrise at the Lake, Harvest
 * Moon Hayride. A book works through every day before one returns, and a
 * seller's next book opens with days their last one did not use.
 */

export const SM_TEMPLATE_KEY = 'sun-and-moon'
export const SM_DEFAULT_TITLE = 'Sun & Moon'

export const SM_BUILD_FAILED_MESSAGE = 'Could not build a Sun & Moon puzzle for this page. Try again.'

export function smPageTooSmallMessage(level: SmLevelSpec): string {
  return `This page size is too small for ${level.gridLabel} grids at large print. Pick a larger page in Settings, or an easier level.`
}

/* ------------------------------------------------------------------ *
 * Levels
 * ------------------------------------------------------------------ */

export type SmLevel = 'gentle' | 'classic' | 'challenging'

export interface SmLevelSpec {
  value: SmLevel
  label: string
  /** "8 × 8", for help lines and messages. */
  gridLabel: string
  /** Squares across and down (even). */
  size: number
  /** The steps a reader needs; the solver may use no others. */
  rules: SmRules
  /** Steps the level's grids must not fall to alone (they need the level's own). */
  beyond: SmRules | null
  /** The fewest of the level's own steps a grid takes ("make the row fit" at Classic, "what if" at Challenging). */
  minHard: number
  /** How often a square the reader is stuck on gets a sign rather than its own sun or moon. */
  signShare: number
  /** Fewest and most clues (printed suns and moons, and signs), as a share of the squares. */
  clues: readonly [number, number]
  /** Smallest square the level prints, canvas px. */
  minCell: number
}

const inch = (n: number) => Math.round(n * DPI * 100) / 100

/**
 * Difficulty is the grid and what it takes to solve it — never a guess.
 * Gentle grids are the famous 6 × 6 and fall to the four first steps;
 * Classic grids, 8 × 8, also need "make the row fit" at least twice;
 * Challenging grids, 10 × 10, need "what if" at least twice. Every level
 * keeps only the clues it needs, so a grid never gives more away than it
 * must.
 */
export const SM_LEVELS: readonly SmLevelSpec[] = [
  { value: 'gentle', label: 'Gentle — 6 × 6 grid', gridLabel: '6 × 6', size: 6, rules: 'basic', beyond: null, minHard: 0, signShare: 0.55, clues: [0.18, 0.45], minCell: inch(0.6) },
  { value: 'classic', label: 'Classic — 8 × 8 grid', gridLabel: '8 × 8', size: 8, rules: 'lines', beyond: 'basic', minHard: 2, signShare: 0.55, clues: [0.16, 0.36], minCell: inch(0.5) },
  {
    value: 'challenging',
    label: 'Challenging — 10 × 10 grid',
    gridLabel: '10 × 10',
    size: 10,
    rules: 'probe',
    beyond: 'lines',
    minHard: 2,
    signShare: 0.55,
    clues: [0.15, 0.34],
    minCell: inch(0.41),
  },
]

export const DEFAULT_SM_LEVEL: SmLevel = 'classic'

export function parseSmLevel(raw: unknown): SmLevel {
  const value = String(raw ?? '')
  return SM_LEVELS.some((l) => l.value === value) ? (value as SmLevel) : DEFAULT_SM_LEVEL
}

export const smLevelSpec = (level: SmLevel): SmLevelSpec => SM_LEVELS.find((l) => l.value === level)!

/* ------------------------------------------------------------------ *
 * The page's words
 * ------------------------------------------------------------------ */

export const SM_HOW_TO =
  'Draw a sun or a moon in every square. Every row and column is half suns, half moons, with never three alike side by side.'

/** Gentle adds the first trick every sun-and-moon solver learns. */
export const SM_GENTLE_TIP = 'Tip: two suns together? Moons go at both ends.'

export function smInstruction(config: StudioConfig, level: SmLevel): string {
  if (config.showInstructions === false) return ''
  // The tip on a line of its own, so it never leaves a word or two stranded under the rules.
  return level === 'gentle' ? `${SM_HOW_TO}\n${SM_GENTLE_TIP}` : SM_HOW_TO
}

/** The legend under the grid: what each sign between two squares means (the how-to leaves the signs to it). */
export const SM_ALIKE_WORD = 'alike'
export const SM_OPPOSITE_WORD = 'opposite'

/* ------------------------------------------------------------------ *
 * Days
 * ------------------------------------------------------------------ */

export interface SmDay {
  id: string
  /** What the sign over the grid says. */
  name: string
}

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/**
 * Written for the retiree who finally has the time to watch the sun come up
 * and the moon go down: lakes and porches, gardens and grandchildren, early
 * birds and night owls. No brands, no money, no drink, no age jokes.
 */
const NAMES = [
  'Sunrise at the Lake',
  'Harvest Moon Hayride',
  'Porch Swing Sunset',
  'Stargazing Campout',
  'Beach Cottage Week',
  'Lazy Sunday Morning',
  'Midsummer Evening',
  'Moonlit Garden Stroll',
  'Early Bird Fishing Trip',
  'Night Owl Book Club',
  'Sunny Side Up Breakfast',
  'Sunflower Farm Visit',
  'Full Moon Boat Ride',
  'Sunset Cruise',
  'Morning Walk on the Shore',
  'Starry Night Campfire',
  'Moonrise over the Bay',
  'First Day of Spring',
  'Summer Solstice Picnic',
  'Winter Solstice Supper',
  'Grandkids’ Sleepover',
  'Lighthouse at Dusk',
  'Dawn Chorus Birdwatch',
  'Sun Porch Crossword Hour',
  'Twilight Rocking Chair',
  'Desert Sunrise Drive',
  'Northern Lights Trip',
  'Meteor Shower Night',
  'Saturday Farmers Market',
  'Afternoon Tea in the Sun',
  'Moonflower Garden',
  'Evening Star Wish',
  'Sundial Garden',
  'Cabin by the Lake',
  'Snowy Moonlit Walk',
  'Autumn Equinox Fair',
  'Sunshine Road Trip',
  'Late Night Card Game',
  'Paddle at Sunrise',
  'Sunset Round of Golf',
  'Moon over the Mountains',
  'Beach Bonfire Night',
  'Sunlit Reading Nook',
  'Rise and Shine Stretch',
  'Owl Watch at Dusk',
  'Lullaby for the Grandbaby',
] as const

export const SM_DAYS: readonly SmDay[] = NAMES.map((name) => ({ id: slug(name), name }))

const DAY_INDEX = new Map(SM_DAYS.map((d) => [d.id, d]))
export const smDayById = (id: string) => DAY_INDEX.get(id)

/**
 * What the sign over the grid reads: on one line, or broken between words
 * where the two lines come out most even on a narrow trim.
 */
export function smSignText(day: SmDay, lines: 1 | 2 = 1): string {
  if (lines === 1) return day.name
  const words = day.name.split(' ')
  let best = day.name
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

/** `day|level|grid`: the label a page stamps, and what the book reads back. */
export const smPageLabel = (day: SmDay, level: SmLevel, signature: string) => `${day.id}|${level}|${signature}`

export interface SmBookEntry {
  day: string
  level: SmLevel | null
  signature: string
}

/** The book's Sun & Moon pages, oldest first, from their stamped labels. */
export function parseSmBook(labels: readonly string[]): SmBookEntry[] {
  const out: SmBookEntry[] = []
  for (const label of labels) {
    const [id, level, signature] = label.split('|')
    if (!id || !smDayById(id)) continue
    out.push({ day: id, level: SM_LEVELS.some((l) => l.value === level) ? (level as SmLevel) : null, signature: signature ?? '' })
  }
  return out
}

/**
 * The day for a page.
 *
 * Least-used in the book first, so a book works through every day before
 * one returns; among those, ones this seller has not printed lately; then
 * the dealt order. The previous page's day never follows itself.
 */
export function pickSmDay(options: {
  level: SmLevel
  seed: number
  ownerSalt: string
  book: readonly SmBookEntry[]
  /** Day ids this seller printed lately. */
  recent: readonly string[]
}): SmDay {
  const { level, seed, ownerSalt, book, recent } = options
  const rng = createRngFromSeedInput({
    ownerSalt,
    templateKey: SM_TEMPLATE_KEY,
    configHash: `level:${level}`,
    pageNonce: seed,
    stream: 'day',
  })
  const shown = new Map<string, number>()
  for (const entry of book) shown.set(entry.day, (shown.get(entry.day) ?? 0) + 1)
  const previous = book.length > 0 ? book[book.length - 1]!.day : null
  const recentSet = new Set(recent)
  const dealt = rng.shuffle(SM_DAYS)
  const order = new Map(dealt.map((d, i) => [d.id, i]))
  const ranked = [...SM_DAYS].sort((a, b) => {
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

/** The grid stream for one attempt at a page. */
export function smGridRng(options: { level: SmLevel; seed: number; ownerSalt: string; attempt: number }) {
  const { level, seed, ownerSalt, attempt } = options
  return createRngFromSeedInput({
    ownerSalt,
    templateKey: SM_TEMPLATE_KEY,
    configHash: `level:${level}`,
    pageNonce: seed,
    stream: `grid:${attempt}`,
  })
}
