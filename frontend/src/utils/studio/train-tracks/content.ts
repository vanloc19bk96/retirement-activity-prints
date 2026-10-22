import type { StudioConfig } from '@/types/studio-template.types'
import { DPI } from '@/types/canvas-settings.types'
import { createRngFromSeedInput } from '../_shared/uniqueness'
import type { TtRules } from './solver'

/**
 * What a Train Tracks page shows, and how each page's line and name are
 * chosen.
 *
 * A page is one Train Tracks board: a railway line enters the board on one
 * side and leaves on another, and the reader lays the track between from
 * the numbers beside the rows and columns. Every board is built fresh from
 * the seller's puzzle salt and the page seed (so two sellers on the same
 * settings print different books, and the same seed reprints the same
 * page), under the station sign of a scenic line a retiree would ride —
 * Lakeside Line, Maple Valley Railway. A book works through every line
 * before one returns, and a seller's next book opens with lines their last
 * one did not use.
 */

export const TT_TEMPLATE_KEY = 'train-tracks'
export const TT_DEFAULT_TITLE = 'Train Tracks'

export const TT_BUILD_FAILED_MESSAGE = 'Could not build a Train Tracks puzzle for this page. Try again.'

export function ttPageTooSmallMessage(level: TtLevelSpec): string {
  return `This page size is too small for ${level.gridLabel} boards at large print. Pick a larger page in Settings, or an easier level.`
}

/* ------------------------------------------------------------------ *
 * Levels
 * ------------------------------------------------------------------ */

export type TtLevel = 'gentle' | 'classic' | 'challenging'

export interface TtLevelSpec {
  value: TtLevel
  label: string
  /** "8 × 8", for help lines and messages. */
  gridLabel: string
  /** Squares across and down. */
  size: number
  /** The share of the board the line covers: at least, at most. */
  fill: readonly [number, number]
  /** The steps a reader needs; the solver may use no others. */
  rules: TtRules
  /** Steps the level's boards must not fall to alone (they need the level's own). */
  beyond: TtRules | null
  /** The fewest of the level's own steps a board takes. */
  minAdvanced: number
  /** Pieces printed to start the reader off (the two end pieces among them): at least, at most. */
  givens: readonly [number, number]
  /** Smallest square the level prints, canvas px. */
  minCell: number
}

const inch = (n: number) => Math.round(n * DPI * 100) / 100

/**
 * Difficulty is the board and what it takes to solve it — never a guess.
 * Gentle boards fall to the numbers and the squares, with "don't close a
 * loop" where it helps; Classic boards always need "don't close it early";
 * Challenging boards always need "what if" at least once. None needs trial
 * and error past one step.
 */
export const TT_LEVELS: readonly TtLevelSpec[] = [
  {
    value: 'gentle',
    label: 'Gentle: 6 × 6',
    gridLabel: '6 × 6',
    size: 6,
    fill: [0.45, 0.62],
    rules: 'loop',
    beyond: null,
    minAdvanced: 0,
    givens: [3, 6],
    minCell: inch(0.5),
  },
  {
    value: 'classic',
    label: 'Classic: 8 × 8',
    gridLabel: '8 × 8',
    size: 8,
    fill: [0.42, 0.6],
    rules: 'loop',
    beyond: 'local',
    minAdvanced: 1,
    givens: [3, 8],
    minCell: inch(0.45),
  },
  {
    value: 'challenging',
    label: 'Challenging: 10 × 10',
    gridLabel: '10 × 10',
    size: 10,
    fill: [0.4, 0.58],
    rules: 'probe',
    beyond: 'loop',
    minAdvanced: 1,
    givens: [3, 10],
    minCell: inch(0.36),
  },
]

export const DEFAULT_TT_LEVEL: TtLevel = 'classic'

export function parseTtLevel(raw: unknown): TtLevel {
  const value = String(raw ?? '')
  return TT_LEVELS.some((l) => l.value === value) ? (value as TtLevel) : DEFAULT_TT_LEVEL
}

export const ttLevelSpec = (level: TtLevel): TtLevelSpec => TT_LEVELS.find((l) => l.value === level)!

/* ------------------------------------------------------------------ *
 * The page's words
 * ------------------------------------------------------------------ */

export const TT_INSTRUCTION =
  'Lay one track from where it enters to where it leaves, square to square, never crossing itself and through every piece shown. Each number counts the track squares in its row or column.'

/** Gentle adds the first trick every Train Tracks solver learns. */
export const TT_GENTLE_TIP = 'Tip: once a row or column has all its track squares, the rest of it stays empty.'

export function ttInstruction(config: StudioConfig, level: TtLevel): string {
  if (config.showInstructions === false) return ''
  return level === 'gentle' ? `${TT_INSTRUCTION} ${TT_GENTLE_TIP}` : TT_INSTRUCTION
}

/** The legend's words, before the six pieces of track drawn in their squares. */
export const TT_LEGEND_WORD = 'Track pieces:'

/* ------------------------------------------------------------------ *
 * Lines
 * ------------------------------------------------------------------ */

export interface TtLine {
  id: string
  /** What the station sign over the board says. */
  name: string
}

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/**
 * Written for the retiree with time for the slow train: scenic branch
 * lines, country stations, seasons and day trips. No real railways or
 * named trains, no brands, no money, no drink, no age jokes.
 */
const NAMES = [
  'Lakeside Line',
  'Maple Valley Railway',
  'Sunset Junction',
  'Countryside Express',
  'Riverside Branch Line',
  'Mountain Pass Railway',
  'Coastal Rambler',
  'Orchard Branch Line',
  'Pine Ridge Line',
  'Willow Creek Junction',
  'Old Mill Station',
  'Harvest Moon Express',
  'Autumn Leaves Express',
  'Snowy Pass Line',
  'Prairie Sunset Line',
  'Canyon Rim Railway',
  'Heritage Steam Line',
  'Station Master’s Run',
  'Clocktower Junction',
  'Teacup Junction',
  'Rose Garden Line',
  'Cottage Country Line',
  'Farmers Market Express',
  'Lighthouse Coast Line',
  'Seaside Special',
  'Morning Mail Train',
  'Scenic Valley Railway',
  'Sunny Meadow Line',
  'Country Fair Express',
  'Grandkids’ Holiday Train',
  'Anniversary Special',
  'Long Weekend Line',
  'Bluebird Hill Line',
  'Golden Fields Railway',
  'Misty Glen Line',
  'Harbor View Branch',
  'Lavender Fields Line',
  'Covered Bridge Junction',
  'Waterfall Gorge Railway',
  'Hometown Depot Line',
  'Picnic Basket Express',
  'Retirement Express',
] as const

export const TT_LINES: readonly TtLine[] = NAMES.map((name) => ({ id: slug(name), name }))

const LINE_INDEX = new Map(TT_LINES.map((l) => [l.id, l]))
export const ttLineById = (id: string) => LINE_INDEX.get(id)

/**
 * What the station sign reads: on one line, or broken between words where
 * the two lines come out most even on a narrow trim.
 */
export function ttSignText(line: TtLine, lines: 1 | 2 = 1): string {
  if (lines === 1) return line.name
  const words = line.name.split(' ')
  let best = line.name
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

/** `line|level|board`: the label a page stamps, and what the book reads back. */
export const ttPageLabel = (line: TtLine, level: TtLevel, signature: string) => `${line.id}|${level}|${signature}`

export interface TtBookEntry {
  line: string
  level: TtLevel | null
  signature: string
}

/** The book's Train Tracks pages, oldest first, from their stamped labels. */
export function parseTtBook(labels: readonly string[]): TtBookEntry[] {
  const out: TtBookEntry[] = []
  for (const label of labels) {
    const [id, level, signature] = label.split('|')
    if (!id || !ttLineById(id)) continue
    out.push({ line: id, level: TT_LEVELS.some((l) => l.value === level) ? (level as TtLevel) : null, signature: signature ?? '' })
  }
  return out
}

/**
 * The line for a page.
 *
 * Least-used in the book first, so a book works through every line before
 * one returns; among those, ones this seller has not printed lately; then
 * the dealt order. The previous page's line never follows itself.
 */
export function pickTtLine(options: {
  level: TtLevel
  seed: number
  ownerSalt: string
  book: readonly TtBookEntry[]
  /** Line ids this seller printed lately. */
  recent: readonly string[]
}): TtLine {
  const { level, seed, ownerSalt, book, recent } = options
  const rng = createRngFromSeedInput({
    ownerSalt,
    templateKey: TT_TEMPLATE_KEY,
    configHash: `level:${level}`,
    pageNonce: seed,
    stream: 'line',
  })
  const shown = new Map<string, number>()
  for (const entry of book) shown.set(entry.line, (shown.get(entry.line) ?? 0) + 1)
  const previous = book.length > 0 ? book[book.length - 1]!.line : null
  const recentSet = new Set(recent)
  const dealt = rng.shuffle(TT_LINES)
  const order = new Map(dealt.map((l, i) => [l.id, i]))
  const ranked = [...TT_LINES].sort((a, b) => {
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

/** The board stream for one attempt at a page. */
export function ttBoardRng(options: { level: TtLevel; seed: number; ownerSalt: string; attempt: number }) {
  const { level, seed, ownerSalt, attempt } = options
  return createRngFromSeedInput({
    ownerSalt,
    templateKey: TT_TEMPLATE_KEY,
    configHash: `level:${level}`,
    pageNonce: seed,
    stream: `board:${attempt}`,
  })
}
