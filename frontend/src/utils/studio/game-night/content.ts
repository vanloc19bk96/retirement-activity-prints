import type { StudioConfig } from '@/types/studio-template.types'
import { DPI } from '@/types/canvas-settings.types'
import { createRngFromSeedInput } from '../_shared/uniqueness'
import type { GnCage, GnOp, GnRules } from './solver'

/**
 * What a Game Night page shows, and how each page's grid and name are
 * chosen.
 *
 * A page is one grid of bold boxes, each with its target and sign, built
 * fresh from the seller's puzzle salt and the page seed (so two sellers on
 * the same settings print different books, and the same seed reprints the
 * same page), under the sign of a game night a retiree looks forward to —
 * Tuesday Canasta Club, Cribbage on the Porch, Mahjong by the Lake. A book
 * works through every night before one returns, and a seller's next book
 * opens with nights their last one did not use.
 */

export const GN_TEMPLATE_KEY = 'game-night'
export const GN_DEFAULT_TITLE = 'Game Night'

export const GN_BUILD_FAILED_MESSAGE = 'Could not build a Game Night puzzle for this page. Try again.'

export function gnPageTooSmallMessage(level: GnLevelSpec): string {
  return `This page size is too small for ${level.gridLabel} grids at large print. Pick a larger page in Settings, or an easier level.`
}

/* ------------------------------------------------------------------ *
 * Levels
 * ------------------------------------------------------------------ */

export type GnLevel = 'gentle' | 'classic' | 'challenging'

export interface GnLevelSpec {
  value: GnLevel
  label: string
  /** "6 × 6", for help lines and messages. */
  gridLabel: string
  /** Squares across and down; the numbers run 1 to size. */
  size: number
  /** The signs the level prints. */
  ops: readonly GnOp[]
  /** The steps a reader needs; the solver may use no others. */
  rules: GnRules
  /** Steps the level's grids must not fall to alone (they need the level's own). */
  beyond: GnRules | null
  /** The fewest of the level's own steps a grid takes ("must be here" at Classic, "what if" at Challenging). */
  minHard: number
  /** Weights for boxes of 1, 2, 3 and 4 squares when the boxes are first grown. */
  mix: readonly number[]
  /** The most boxes of one square (numbers given outright). */
  maxGivens: number
  /** Smallest square the level prints, canvas px. */
  minCell: number
}

const inch = (n: number) => Math.round(n * DPI * 100) / 100

/**
 * Difficulty is the grid and what it takes to solve it — never a guess.
 * Gentle grids, 5 × 5, add and take away only and fall to the first steps
 * alone; Classic grids, 6 × 6, use all four signs and need "must be here"
 * at least twice; Challenging grids, 7 × 7, need "what if" at least twice.
 */
export const GN_LEVELS: readonly GnLevelSpec[] = [
  { value: 'gentle', label: 'Gentle — 5 × 5, add & take away', gridLabel: '5 × 5', size: 5, ops: ['+', '-'], rules: 'basic', beyond: null, minHard: 0, mix: [0, 6, 4, 0], maxGivens: 3, minCell: inch(0.62) },
  { value: 'classic', label: 'Classic — 6 × 6, all four signs', gridLabel: '6 × 6', size: 6, ops: ['+', '-', '*', '/'], rules: 'lines', beyond: 'basic', minHard: 2, mix: [0, 5, 3.5, 1.5], maxGivens: 2, minCell: inch(0.56) },
  { value: 'challenging', label: 'Challenging — 7 × 7, all four signs', gridLabel: '7 × 7', size: 7, ops: ['+', '-', '*', '/'], rules: 'probe', beyond: 'lines', minHard: 2, mix: [0, 4.5, 3.5, 2], maxGivens: 1, minCell: inch(0.5) },
]

export const DEFAULT_GN_LEVEL: GnLevel = 'classic'

export function parseGnLevel(raw: unknown): GnLevel {
  const value = String(raw ?? '')
  return GN_LEVELS.some((l) => l.value === value) ? (value as GnLevel) : DEFAULT_GN_LEVEL
}

export const gnLevelSpec = (level: GnLevel): GnLevelSpec => GN_LEVELS.find((l) => l.value === level)!

/* ------------------------------------------------------------------ *
 * The page's words
 * ------------------------------------------------------------------ */

/** How a sign prints: a true minus, times and divide, never a hyphen, x or slash. */
export const GN_SIGN_GLYPH: Record<GnOp, string> = { '+': '+', '-': '−', '*': '×', '/': '÷', '=': '' }

/** A box's clue as it prints in its corner: "12+", "3−", "30×", "2÷", or a lone "4". */
export const gnClueText = (cage: Pick<GnCage, 'op' | 'target'>) => `${cage.target}${GN_SIGN_GLYPH[cage.op]}`

export function gnHowTo(level: GnLevel): string {
  const { size } = gnLevelSpec(level)
  const lead = `Write 1 to ${size} once in every row and column.`
  // Gentle spells both signs out and names the lone number; at the harder levels the legend works every sign.
  if (level === 'gentle') return `${lead} The numbers in each bold box make its number: add them for +, take the smaller from the larger for −. A box with no sign holds just its number.`
  return `${lead} Each bold box’s numbers make its number with its sign; for − and ÷, start with the larger.`
}

/** Gentle adds the first trick every solver learns. */
export const GN_GENTLE_TIP = 'Tip: with 1 to 5, a 4− box can only hold 1 and 5.'

export function gnInstruction(config: StudioConfig, level: GnLevel): string {
  if (config.showInstructions === false) return ''
  // The tip on a line of its own, so it never leaves a word or two stranded under the rules.
  return level === 'gentle' ? `${gnHowTo(level)}\n${GN_GENTLE_TIP}` : gnHowTo(level)
}

/** One legend entry: a little box of two squares, its clue and numbers, and the sum it stands for. */
export interface GnLegendEntry {
  op: Exclude<GnOp, '='>
  /** The two numbers, left to right. */
  values: readonly [number, number]
  target: number
  /** "2 + 3 = 5", its spaces unbreakable so the sum never wraps. */
  words: string
}

const entry = (op: GnLegendEntry['op'], values: readonly [number, number], target: number): GnLegendEntry => ({
  op,
  values,
  target,
  words: [values[0], GN_SIGN_GLYPH[op], values[1], '=', target].join(' '),
})

const LEGEND: Record<GnLegendEntry['op'], GnLegendEntry> = {
  '+': entry('+', [2, 3], 5),
  '-': entry('-', [4, 1], 3),
  '*': entry('*', [2, 4], 8),
  '/': entry('/', [6, 2], 3),
}

/** The legend under the grid: one worked box for every sign the level prints. */
export const gnLegendEntries = (level: GnLevel): GnLegendEntry[] => gnLevelSpec(level).ops.map((op) => LEGEND[op as GnLegendEntry['op']])

/* ------------------------------------------------------------------ *
 * Game nights
 * ------------------------------------------------------------------ */

export interface GnNight {
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
 * Written for the retiree whose week now has a card club in it: porches and
 * clubhouses, grandchildren and neighbours, the lake and the cabin. Card and
 * board games anyone can name, lawn games and league nights. No brands, no
 * betting, no drink, no age jokes.
 */
const NAMES = [
  'Tuesday Canasta Club',
  'Cribbage on the Porch',
  'Mahjong Mornings',
  'Friday Bridge Club',
  'Dominoes at the Clubhouse',
  'Pinochle with the Neighbors',
  'Euchre Tournament Night',
  'Gin Rummy by the Fire',
  'Hearts at the Kitchen Table',
  'Spades with the Grandkids',
  'Checkers in the Park',
  'Chess by the Window',
  'Backgammon on the Deck',
  'Bingo at the Rec Center',
  'Jigsaw Puzzle Sunday',
  'Trivia Night at the Library',
  'Charades with the Family',
  'Rainy Day Board Games',
  'Grandkids’ Game Night',
  'Neighborhood Game Night',
  'Church Hall Game Night',
  'Bunco Night with Friends',
  'Dominoes on the Patio',
  'Cribbage at the Cabin',
  'Mahjong by the Lake',
  'Shuffleboard at the Shore',
  'Horseshoes at the Picnic',
  'Bocce Ball Tuesday',
  'Croquet on the Lawn',
  'Pickleball Doubles',
  'Bowling League Night',
  'Darts at the Clubhouse',
  'Card Club Holiday Party',
  'New Year’s Game Night',
  'Summer Cottage Game Night',
  'Card Games at the Campsite',
  'Cruise Ship Card Room',
  'Beach House Board Games',
  'Family Reunion Games',
  'Solitaire by Lamplight',
  'Go Fish with the Grandkids',
  'Crazy Eights at Lunch',
  'Whist Drive at the Hall',
  'Rummy on the Porch',
  'Snow Day Card Games',
  'Mini Golf with the Grandkids',
] as const

export const GN_NIGHTS: readonly GnNight[] = NAMES.map((name) => ({ id: slug(name), name }))

const NIGHT_INDEX = new Map(GN_NIGHTS.map((s) => [s.id, s]))
export const gnNightById = (id: string) => NIGHT_INDEX.get(id)

/**
 * What the sign over the grid reads: on one line, or broken between words
 * where the two lines come out most even on a narrow trim.
 */
export function gnSignText(night: GnNight, lines: 1 | 2 = 1): string {
  if (lines === 1) return night.name
  const words = night.name.split(' ')
  let best = night.name
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

/** `night|level|grid`: the label a page stamps, and what the book reads back. */
export const gnPageLabel = (night: GnNight, level: GnLevel, signature: string) => `${night.id}|${level}|${signature}`

export interface GnBookEntry {
  night: string
  level: GnLevel | null
  signature: string
}

/** The book's Game Night pages, oldest first, from their stamped labels. */
export function parseGnBook(labels: readonly string[]): GnBookEntry[] {
  const out: GnBookEntry[] = []
  for (const label of labels) {
    const [id, level, signature] = label.split('|')
    if (!id || !gnNightById(id)) continue
    out.push({ night: id, level: GN_LEVELS.some((l) => l.value === level) ? (level as GnLevel) : null, signature: signature ?? '' })
  }
  return out
}

/**
 * The night for a page.
 *
 * Least-used in the book first, so a book works through every night before
 * one returns; among those, ones this seller has not printed lately; then
 * the dealt order. The previous page's night never follows itself.
 */
export function pickGnNight(options: {
  level: GnLevel
  seed: number
  ownerSalt: string
  book: readonly GnBookEntry[]
  /** Night ids this seller printed lately. */
  recent: readonly string[]
}): GnNight {
  const { level, seed, ownerSalt, book, recent } = options
  const rng = createRngFromSeedInput({
    ownerSalt,
    templateKey: GN_TEMPLATE_KEY,
    configHash: `level:${level}`,
    pageNonce: seed,
    stream: 'night',
  })
  const shown = new Map<string, number>()
  for (const e of book) shown.set(e.night, (shown.get(e.night) ?? 0) + 1)
  const previous = book.length > 0 ? book[book.length - 1]!.night : null
  const recentSet = new Set(recent)
  const dealt = rng.shuffle(GN_NIGHTS)
  const order = new Map(dealt.map((s, i) => [s.id, i]))
  const ranked = [...GN_NIGHTS].sort((a, b) => {
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
export function gnGridRng(options: { level: GnLevel; seed: number; ownerSalt: string; attempt: number }) {
  const { level, seed, ownerSalt, attempt } = options
  return createRngFromSeedInput({
    ownerSalt,
    templateKey: GN_TEMPLATE_KEY,
    configHash: `level:${level}`,
    pageNonce: seed,
    stream: `grid:${attempt}`,
  })
}
