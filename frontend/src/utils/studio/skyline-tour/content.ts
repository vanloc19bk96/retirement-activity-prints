import type { StudioConfig } from '@/types/studio-template.types'
import { DPI } from '@/types/canvas-settings.types'
import { createRngFromSeedInput } from '../_shared/uniqueness'
import type { SkyRules } from './solver'

/**
 * What a Skyline Tour page shows, and how each page's city and name are
 * chosen.
 *
 * A page is one Skyscrapers city, built fresh from the seller's puzzle salt
 * and the page seed (so two sellers on the same settings print different
 * books, and the same seed reprints the same page), under the name board of
 * a skyline worth touring in retirement — Chicago Lakefront, Paris Left
 * Bank, Sydney Harbour, the Hometown Main Street. A book works through every
 * skyline before one returns, and a seller's next book opens with skylines
 * their last one did not use.
 */

export const SKY_TEMPLATE_KEY = 'skyline-tour'
export const SKY_DEFAULT_TITLE = 'Skyline Tour'

export const SKY_BUILD_FAILED_MESSAGE = 'Could not build a Skyline Tour puzzle for this page. Try again.'

export function skyPageTooSmallMessage(level: SkyLevelSpec): string {
  return `This page size is too small for ${level.gridLabel} cities at large print. Pick a larger page in Settings, or an easier level.`
}

/* ------------------------------------------------------------------ *
 * Levels
 * ------------------------------------------------------------------ */

export type SkyLevel = 'gentle' | 'classic' | 'challenging'

export interface SkyLevelSpec {
  value: SkyLevel
  label: string
  /** "6 × 6", for help lines and messages. */
  gridLabel: string
  /** Plots across and down, and the tallest building. */
  size: number
  /** The steps a reader needs; the solver may use no others. */
  rules: SkyRules
  /** Steps the level's cities must not fall to alone (they need the level's own). */
  beyond: SkyRules | null
  /** The most plots a city of the level hands over. */
  maxGivens: number
  /** Every side of the city keeps at least this many clues. */
  minCluesPerSide: number
  /** Smallest plot the level prints, canvas px. */
  minCell: number
}

const inch = (n: number) => Math.round(n * DPI * 100) / 100

/**
 * Difficulty is the city and what it takes to solve it — never a guess.
 * Gentle cities fall to the edge count, singles and "the last two plots,
 * both ways round"; Classic cities also need "try the orders" at least
 * once; Challenging cities, a size larger, need "what if" at least once.
 */
export const SKY_LEVELS: readonly SkyLevelSpec[] = [
  { value: 'gentle', label: 'Gentle: 5 × 5 city', gridLabel: '5 × 5', size: 5, rules: 'basic', beyond: null, maxGivens: 2, minCluesPerSide: 1, minCell: inch(0.5) },
  { value: 'classic', label: 'Classic: 6 × 6 city', gridLabel: '6 × 6', size: 6, rules: 'line', beyond: 'basic', maxGivens: 3, minCluesPerSide: 1, minCell: inch(0.45) },
  {
    value: 'challenging',
    label: 'Challenging: 7 × 7 city',
    gridLabel: '7 × 7',
    size: 7,
    rules: 'probe',
    beyond: 'line',
    maxGivens: 4,
    minCluesPerSide: 1,
    minCell: inch(0.42),
  },
]

export const DEFAULT_SKY_LEVEL: SkyLevel = 'classic'

export function parseSkyLevel(raw: unknown): SkyLevel {
  const value = String(raw ?? '')
  return SKY_LEVELS.some((l) => l.value === value) ? (value as SkyLevel) : DEFAULT_SKY_LEVEL
}

export const skyLevelSpec = (level: SkyLevel): SkyLevelSpec => SKY_LEVELS.find((l) => l.value === level)!

/* ------------------------------------------------------------------ *
 * The page's words
 * ------------------------------------------------------------------ */

export function skyInstructionFor(size: number): string {
  return `Fill each row and column with buildings 1 to ${size} floors tall, each height once. A number outside counts the buildings seen from there: a taller one hides the shorter ones behind it.`
}

/** Gentle adds the first trick every Skyscrapers solver learns. */
export const SKY_GENTLE_TIP = 'Tip: next to a 1 stands the tallest building.'

export function skyInstruction(config: StudioConfig, level: SkyLevel): string {
  if (config.showInstructions === false) return ''
  const base = skyInstructionFor(skyLevelSpec(level).size)
  return level === 'gentle' ? `${base} ${SKY_GENTLE_TIP}` : base
}

/** The clue the legend's sample shows. */
export const SKY_LEGEND_SAMPLE = 3

/** The legend under the city: the heights to place, and what the sample clue means. */
export const skyHeightsWord = (size: number) => `Heights 1 to ${size}`
export const skySampleWord = (seen: number) => `= ${seen} buildings seen from here`

/* ------------------------------------------------------------------ *
 * Skylines
 * ------------------------------------------------------------------ */

export interface SkyCity {
  id: string
  /** What the name board over the city says. */
  name: string
}

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/**
 * Written for the retiree finally taking the trips: the lakefronts and
 * harbours, the old towns and river walks of the bucket list, and the two
 * skylines closest to home — Main Street, and the one the grandchildren
 * build from blocks on the living-room floor. No brands, no money, no
 * drink, no gambling towns, no age jokes.
 */
const NAMES = [
  'Chicago Lakefront',
  'Manhattan Midtown',
  'San Francisco Bay',
  'Seattle Waterfront',
  'Boston Harbor',
  'Philadelphia Old City',
  'Nashville Music Row',
  'New Orleans French Quarter',
  'Savannah Riverfront',
  'Charleston Harbor',
  'Miami Beach',
  'Denver Downtown',
  'Pittsburgh Three Rivers',
  'San Antonio River Walk',
  'Toronto Harbourfront',
  'Montreal Old Port',
  'Old Quebec City',
  'Vancouver Harbour',
  'London Riverside',
  'Paris Left Bank',
  'Rome Seven Hills',
  'Florence by the Arno',
  'Venice Grand Canal',
  'Vienna Ringstrasse',
  'Prague Old Town',
  'Amsterdam Canal Ring',
  'Edinburgh Royal Mile',
  'Dublin Quays',
  'Lisbon Hilltops',
  'Barcelona Gothic Quarter',
  'Budapest Danube Bank',
  'Copenhagen Harbour',
  'Stockholm Waterfront',
  'Athens Plaka',
  'Sydney Harbour',
  'Singapore Marina',
  'Hong Kong Harbour',
  'Tokyo Ginza',
  'Cape Town Waterfront',
  'Honolulu Waikiki',
  'San Diego Bayfront',
  'Santa Fe Plaza',
  'Hometown Main Street',
  'Grandkids’ Block City',
] as const

export const SKY_CITIES: readonly SkyCity[] = NAMES.map((name) => ({ id: slug(name), name }))

const CITY_INDEX = new Map(SKY_CITIES.map((c) => [c.id, c]))
export const skyCityById = (id: string) => CITY_INDEX.get(id)

/**
 * What the name board over the city reads: on one line, or broken between
 * words where the two lines come out most even on a narrow trim.
 */
export function skySignText(city: SkyCity, lines: 1 | 2 = 1): string {
  if (lines === 1) return city.name
  const words = city.name.split(' ')
  let best = city.name
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

/** `city|level|puzzle`: the label a page stamps, and what the book reads back. */
export const skyPageLabel = (city: SkyCity, level: SkyLevel, signature: string) => `${city.id}|${level}|${signature}`

export interface SkyBookEntry {
  city: string
  level: SkyLevel | null
  signature: string
}

/** The book's Skyline Tour pages, oldest first, from their stamped labels. */
export function parseSkyBook(labels: readonly string[]): SkyBookEntry[] {
  const out: SkyBookEntry[] = []
  for (const label of labels) {
    const [id, level, signature] = label.split('|')
    if (!id || !skyCityById(id)) continue
    out.push({ city: id, level: SKY_LEVELS.some((l) => l.value === level) ? (level as SkyLevel) : null, signature: signature ?? '' })
  }
  return out
}

/**
 * The skyline for a page.
 *
 * Least-used in the book first, so a book works through every skyline
 * before one returns; among those, ones this seller has not printed lately;
 * then the dealt order. The previous page's skyline never follows itself.
 */
export function pickSkyCity(options: {
  level: SkyLevel
  seed: number
  ownerSalt: string
  book: readonly SkyBookEntry[]
  /** Skyline ids this seller printed lately. */
  recent: readonly string[]
}): SkyCity {
  const { level, seed, ownerSalt, book, recent } = options
  const rng = createRngFromSeedInput({
    ownerSalt,
    templateKey: SKY_TEMPLATE_KEY,
    configHash: `level:${level}`,
    pageNonce: seed,
    stream: 'city',
  })
  const shown = new Map<string, number>()
  for (const entry of book) shown.set(entry.city, (shown.get(entry.city) ?? 0) + 1)
  const previous = book.length > 0 ? book[book.length - 1]!.city : null
  const recentSet = new Set(recent)
  const dealt = rng.shuffle(SKY_CITIES)
  const order = new Map(dealt.map((c, i) => [c.id, i]))
  const ranked = [...SKY_CITIES].sort((a, b) => {
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
export function skyCityRng(options: { level: SkyLevel; seed: number; ownerSalt: string; attempt: number }) {
  const { level, seed, ownerSalt, attempt } = options
  return createRngFromSeedInput({
    ownerSalt,
    templateKey: SKY_TEMPLATE_KEY,
    configHash: `level:${level}`,
    pageNonce: seed,
    stream: `city:${attempt}`,
  })
}
