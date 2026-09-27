import type { StudioConfig } from '@/types/studio-template.types'
import { DPI } from '@/types/canvas-settings.types'
import { createRngFromSeedInput } from '../_shared/uniqueness'
import type { PearlRules } from './solver'

/**
 * What a String of Pearls page shows, and how each page's board and name
 * are chosen.
 *
 * A page is one Masyu board, built fresh from the seller's puzzle salt and
 * the page seed (so two sellers on the same settings print different
 * books, and the same seed reprints the same page), under the name board
 * of a necklace from a retiree's life — Golden Anniversary Pearls,
 * Grandma’s Sunday Pearls. A book works through every necklace before one
 * returns, and a seller's next book opens with necklaces their last one did
 * not use.
 */

export const PEARL_TEMPLATE_KEY = 'string-of-pearls'
export const PEARL_DEFAULT_TITLE = 'String of Pearls'

export const PEARL_BUILD_FAILED_MESSAGE = 'Could not build a String of Pearls puzzle for this page. Try again.'

export function pearlPageTooSmallMessage(level: PearlLevelSpec): string {
  return `This page size is too small for ${level.gridLabel} boards at large print. Pick a larger page in Settings, or an easier level.`
}

/* ------------------------------------------------------------------ *
 * Levels
 * ------------------------------------------------------------------ */

export type PearlLevel = 'gentle' | 'classic' | 'challenging'

export interface PearlLevelSpec {
  value: PearlLevel
  label: string
  /** "8 × 8", for help lines and messages. */
  gridLabel: string
  /** Squares across and down. */
  size: number
  /** Least share of the board's squares the necklace threads. */
  cover: number
  /** The fewest pearls a board of the level prints. */
  minPearls: number
  /** The steps a reader needs; the solver may use no others. */
  rules: PearlRules
  /** Steps the level's boards must not fall to alone (they need the level's own). */
  beyond: PearlRules | null
  /** Smallest square the level prints, canvas px. */
  minCell: number
}

const inch = (n: number) => Math.round(n * DPI * 100) / 100

/**
 * Difficulty is the board and what it takes to solve it — never a guess.
 * Gentle boards fall to the pearls' own rules, one square at a time;
 * Classic boards also need "don't close the loop early" at least once;
 * Challenging boards, a size larger, need "what if" at least once.
 */
export const PEARL_LEVELS: readonly PearlLevelSpec[] = [
  { value: 'gentle', label: 'Gentle: 6 × 6 board', gridLabel: '6 × 6', size: 6, cover: 0.6, minPearls: 6, rules: 'local', beyond: null, minCell: inch(0.55) },
  { value: 'classic', label: 'Classic: 8 × 8 board', gridLabel: '8 × 8', size: 8, cover: 0.6, minPearls: 8, rules: 'loop', beyond: 'local', minCell: inch(0.48) },
  {
    value: 'challenging',
    label: 'Challenging: 10 × 10 board',
    gridLabel: '10 × 10',
    size: 10,
    cover: 0.6,
    minPearls: 12,
    rules: 'probe',
    beyond: 'loop',
    minCell: inch(0.4),
  },
]

export const DEFAULT_PEARL_LEVEL: PearlLevel = 'classic'

export function parsePearlLevel(raw: unknown): PearlLevel {
  const value = String(raw ?? '')
  return PEARL_LEVELS.some((l) => l.value === value) ? (value as PearlLevel) : DEFAULT_PEARL_LEVEL
}

export const pearlLevelSpec = (level: PearlLevel): PearlLevelSpec => PEARL_LEVELS.find((l) => l.value === level)!

/* ------------------------------------------------------------------ *
 * The page's words
 * ------------------------------------------------------------------ */

export const PEARL_INSTRUCTION =
  'Draw one loop through the squares that visits every pearl and never crosses itself. White pearl: go straight, and turn just before or after. Black pearl: turn, and go straight two squares each way.'

/** Gentle adds the first trick every Masyu solver learns. */
export const PEARL_GENTLE_TIP = 'Tip: a black pearl within two squares of an edge runs away from that edge.'

export function pearlInstruction(config: StudioConfig, level: PearlLevel): string {
  if (config.showInstructions === false) return ''
  return level === 'gentle' ? `${PEARL_INSTRUCTION} ${PEARL_GENTLE_TIP}` : PEARL_INSTRUCTION
}

/** The legend under the board: what each pearl asks of the necklace. */
export const PEARL_WHITE_WORD = '= go straight through'
export const PEARL_BLACK_WORD = '= turn on it'

/* ------------------------------------------------------------------ *
 * Necklaces
 * ------------------------------------------------------------------ */

export interface PearlNecklace {
  id: string
  /** What the name board over the board says. */
  name: string
}

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/**
 * Written for the retiree threading the necklaces of their life: the
 * anniversaries, the dances, the heirloom in the jewellery box, the
 * macaroni string the grandchildren made. No brands, no money, no drink, no
 * age jokes.
 */
const NAMES = [
  'Golden Anniversary Pearls',
  'Grandma’s Sunday Pearls',
  'Wedding Day Strand',
  'Retirement Party Pearls',
  'Opera Night Strand',
  'Garden Party Pearls',
  'Seashell Necklace',
  'Christmas Eve Pearls',
  'Mother’s Day Strand',
  'Family Heirloom Pearls',
  'Afternoon Tea Pearls',
  'Dinner Dance Strand',
  'Pearl Anniversary Strand',
  'Easter Sunday Pearls',
  'Family Reunion Beads',
  'Ballroom Pearls',
  'Vow Renewal Pearls',
  'First Date Pearls',
  'Honeymoon Pearls',
  'Jewelry Box Treasure',
  'Grandkids’ Macaroni Necklace',
  'New Year’s Eve Strand',
  'Harbor Lights Pearls',
  'Moonlight Strand',
  'Sweetheart Pearls',
  'Keepsake Locket Chain',
  'Bridge Club Pearls',
  'Book Club Beads',
  'Choir Concert Pearls',
  'Theater Night Strand',
  'Spring Wedding Pearls',
  'Lakeside Beads',
  'Valentine’s Day Pearls',
  'Thanksgiving Pearls',
  'Riverboat Pearls',
  'Birthday Pearls',
  'Captain’s Dinner Pearls',
  'Friendship Beads',
  'Hawaiian Shell Lei',
  'Victorian Cameo Strand',
  'Great-Grandma’s Pearls',
  'Graduation Day Pearls',
  'Bingo Night Beads',
  'Rose Garden Beads',
] as const

export const PEARL_NECKLACES: readonly PearlNecklace[] = NAMES.map((name) => ({ id: slug(name), name }))

const NECKLACE_INDEX = new Map(PEARL_NECKLACES.map((h) => [h.id, h]))
export const pearlNecklaceById = (id: string) => NECKLACE_INDEX.get(id)

/**
 * What the name board over the board reads: on one line, or broken between
 * words where the two lines come out most even on a narrow trim.
 */
export function pearlSignText(necklace: PearlNecklace, lines: 1 | 2 = 1): string {
  if (lines === 1) return necklace.name
  const words = necklace.name.split(' ')
  let best = necklace.name
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

/** `necklace|level|board`: the label a page stamps, and what the book reads back. */
export const pearlPageLabel = (necklace: PearlNecklace, level: PearlLevel, signature: string) => `${necklace.id}|${level}|${signature}`

export interface PearlBookEntry {
  necklace: string
  level: PearlLevel | null
  signature: string
}

/** The book's String of Pearls pages, oldest first, from their stamped labels. */
export function parsePearlBook(labels: readonly string[]): PearlBookEntry[] {
  const out: PearlBookEntry[] = []
  for (const label of labels) {
    const [id, level, signature] = label.split('|')
    if (!id || !pearlNecklaceById(id)) continue
    out.push({ necklace: id, level: PEARL_LEVELS.some((l) => l.value === level) ? (level as PearlLevel) : null, signature: signature ?? '' })
  }
  return out
}

/**
 * The necklace for a page.
 *
 * Least-used in the book first, so a book works through every necklace
 * before one returns; among those, ones this seller has not printed lately;
 * then the dealt order. The previous page's necklace never follows itself.
 */
export function pickPearlNecklace(options: {
  level: PearlLevel
  seed: number
  ownerSalt: string
  book: readonly PearlBookEntry[]
  /** Necklace ids this seller printed lately. */
  recent: readonly string[]
}): PearlNecklace {
  const { level, seed, ownerSalt, book, recent } = options
  const rng = createRngFromSeedInput({
    ownerSalt,
    templateKey: PEARL_TEMPLATE_KEY,
    configHash: `level:${level}`,
    pageNonce: seed,
    stream: 'necklace',
  })
  const shown = new Map<string, number>()
  for (const entry of book) shown.set(entry.necklace, (shown.get(entry.necklace) ?? 0) + 1)
  const previous = book.length > 0 ? book[book.length - 1]!.necklace : null
  const recentSet = new Set(recent)
  const dealt = rng.shuffle(PEARL_NECKLACES)
  const order = new Map(dealt.map((h, i) => [h.id, i]))
  const ranked = [...PEARL_NECKLACES].sort((a, b) => {
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
export function pearlBoardRng(options: { level: PearlLevel; seed: number; ownerSalt: string; attempt: number }) {
  const { level, seed, ownerSalt, attempt } = options
  return createRngFromSeedInput({
    ownerSalt,
    templateKey: PEARL_TEMPLATE_KEY,
    configHash: `level:${level}`,
    pageNonce: seed,
    stream: `board:${attempt}`,
  })
}
