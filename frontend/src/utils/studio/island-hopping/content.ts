import type { StudioConfig } from '@/types/studio-template.types'
import { DPI } from '@/types/canvas-settings.types'
import { createRngFromSeedInput } from '../_shared/uniqueness'
import type { IhRules } from './solver'

/**
 * What an Island Hopping page shows, and how each page's chart and island
 * chain are chosen.
 *
 * A page is one Bridges (Hashi) chart, built fresh from the seller's puzzle
 * salt and the page seed (so two sellers on the same settings print
 * different books, and the same seed reprints the same page), under the
 * sign of an island chain on a retirement cruise — Porch Swing Islands,
 * Gone Fishin' Islands. A book sails to every chain before one returns, and
 * a seller's next book opens with chains their last one did not visit.
 */

export const IH_TEMPLATE_KEY = 'island-hopping'
export const IH_DEFAULT_TITLE = 'Island Hopping'

export const IH_BUILD_FAILED_MESSAGE = 'Could not build an Island Hopping puzzle for this page. Try again.'

export function ihPageTooSmallMessage(level: IhLevelSpec): string {
  return `This page size is too small for ${level.gridLabel} island charts at large print. Pick a larger page in Settings, or an easier level.`
}

/* ------------------------------------------------------------------ *
 * Levels
 * ------------------------------------------------------------------ */

export type IhLevel = 'gentle' | 'classic' | 'challenging'

export interface IhLevelSpec {
  value: IhLevel
  label: string
  /** "9 × 9", for help lines and messages. */
  gridLabel: string
  /** Lattice points across and down. */
  size: number
  minIslands: number
  maxIslands: number
  /** The steps a reader needs; the solver may use no others. */
  rules: IhRules
  /** Steps the level's charts must not fall to alone (they need the level's own). */
  beyond: IhRules | null
  /** Share of bridges laid double: fewer doubles, fewer free starts. */
  double: number
  /** Chance a clear lane gets a bridge of its own, making loops. */
  loop: number
  /** Smallest lattice spacing the level prints, canvas px. */
  minCell: number
}

const inch = (n: number) => Math.round(n * DPI * 100) / 100

/**
 * Difficulty is the chart and what it takes to solve it — never a guess.
 * Gentle charts fall to counting round each island; Classic charts also
 * need "this bridge would cut a group off" at least once; Challenging charts
 * need a "what if" check as well, on a bigger sea.
 */
export const IH_LEVELS: readonly IhLevelSpec[] = [
  { value: 'gentle', label: 'Gentle — 7 × 7, 8 to 11 islands', gridLabel: '7 × 7', size: 7, minIslands: 8, maxIslands: 11, rules: 'basic', beyond: null, double: 0.4, loop: 0.3, minCell: inch(0.5) },
  { value: 'classic', label: 'Classic — 9 × 9, 14 to 18 islands', gridLabel: '9 × 9', size: 9, minIslands: 14, maxIslands: 18, rules: 'connect', beyond: 'basic', double: 0.25, loop: 0.2, minCell: inch(0.42) },
  { value: 'challenging', label: 'Challenging — 10 × 10, 20 to 25 islands', gridLabel: '10 × 10', size: 10, minIslands: 20, maxIslands: 25, rules: 'probe', beyond: 'connect', double: 0.3, loop: 0.3, minCell: inch(0.38) },
]

export const DEFAULT_IH_LEVEL: IhLevel = 'classic'

export function parseIhLevel(raw: unknown): IhLevel {
  const value = String(raw ?? '')
  return IH_LEVELS.some((l) => l.value === value) ? (value as IhLevel) : DEFAULT_IH_LEVEL
}

export const ihLevelSpec = (level: IhLevel): IhLevelSpec => IH_LEVELS.find((l) => l.value === level)!

/* ------------------------------------------------------------------ *
 * The page's words
 * ------------------------------------------------------------------ */

export const IH_INSTRUCTION =
  'Draw bridges so each island has as many as its number. Bridges run straight across or down, never cross, and at most two join a pair. In the end, every island is linked.'

/** Gentle adds the tip every Bridges solver learns first. */
export const IH_GENTLE_TIP = 'Tip: start with islands that have only one way to go.'

export function ihInstruction(config: StudioConfig, level: IhLevel): string {
  if (config.showInstructions === false) return ''
  return level === 'gentle' ? `${IH_INSTRUCTION} ${IH_GENTLE_TIP}` : IH_INSTRUCTION
}

/** The legend under the chart. */
export const ihIslandWord = (islands: number) => `Island (${islands} to join)`
export const IH_BRIDGE_WORD = 'Bridge (1 or 2)'

/* ------------------------------------------------------------------ *
 * Island chains
 * ------------------------------------------------------------------ */

export interface IhChain {
  id: string
  /** What the sign says, without "Islands". */
  name: string
}

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/**
 * Written for the retiree on a slow cruise: beach days, hobbies, the
 * grandchildren and long lazy mornings. No brands, no money, no drink, no
 * age jokes.
 */
const NAMES = [
  'Porch Swing',
  'Gone Fishin’',
  'Slow Tide',
  'Hammock',
  'Sun Hat',
  'Flip-Flop',
  'Beach Chair',
  'Seashell',
  'Sandcastle',
  'Snowbird',
  'Sea Breeze',
  'Tide Pool',
  'Palm Shade',
  'Postcard',
  'Grandkids’',
  'Sweet Tea',
  'Paperback',
  'Pelican',
  'Lighthouse',
  'Starfish',
  'Driftwood',
  'Beachcomber',
  'Kite Flying',
  'Sunrise Stroll',
  'No Alarm Clock',
  'Long Weekend',
  'Easy Breezy',
  'Afternoon Nap',
  'Crossword',
  'Jigsaw',
  'Birdwatch',
  'Early Bird',
  'Rocking Chair',
  'Beach Umbrella',
  'Picnic Blanket',
  'Sailboat',
  'Rowboat',
  'Fishing Pole',
  'Tall Tale',
  'Sunset Porch',
  'Pineapple',
  'Conch Shell',
] as const

export const IH_CHAINS: readonly IhChain[] = NAMES.map((name) => ({ id: slug(name), name }))

const CHAIN_INDEX = new Map(IH_CHAINS.map((c) => [c.id, c]))
export const ihChainById = (id: string) => CHAIN_INDEX.get(id)

/** What the sign over the chart reads: on one line, or the name over "Islands" on a narrow trim. */
export const ihSignText = (chain: IhChain, lines: 1 | 2 = 1) => `${chain.name}${lines === 2 ? '\n' : ' '}Islands`

/* ------------------------------------------------------------------ *
 * The book
 * ------------------------------------------------------------------ */

/** `chain|level|chart`: the label a page stamps, and what the book reads back. */
export const ihPageLabel = (chain: IhChain, level: IhLevel, signature: string) => `${chain.id}|${level}|${signature}`

export interface IhBookEntry {
  chain: string
  level: IhLevel | null
  signature: string
}

/** The book's Island Hopping pages, oldest first, from their stamped labels. */
export function parseIhBook(labels: readonly string[]): IhBookEntry[] {
  const out: IhBookEntry[] = []
  for (const label of labels) {
    const [id, level, signature] = label.split('|')
    if (!id || !ihChainById(id)) continue
    out.push({ chain: id, level: IH_LEVELS.some((l) => l.value === level) ? (level as IhLevel) : null, signature: signature ?? '' })
  }
  return out
}

/**
 * The island chain for a page.
 *
 * Least-used in the book first, so a book sails to every chain before one
 * returns; among those, ones this seller has not printed lately; then the
 * dealt order. The previous page's chain never follows itself.
 */
export function pickIhChain(options: {
  level: IhLevel
  seed: number
  ownerSalt: string
  book: readonly IhBookEntry[]
  /** Chain ids this seller printed lately. */
  recent: readonly string[]
}): IhChain {
  const { level, seed, ownerSalt, book, recent } = options
  const rng = createRngFromSeedInput({
    ownerSalt,
    templateKey: IH_TEMPLATE_KEY,
    configHash: `level:${level}`,
    pageNonce: seed,
    stream: 'chain',
  })
  const shown = new Map<string, number>()
  for (const entry of book) shown.set(entry.chain, (shown.get(entry.chain) ?? 0) + 1)
  const previous = book.length > 0 ? book[book.length - 1]!.chain : null
  const recentSet = new Set(recent)
  const dealt = rng.shuffle(IH_CHAINS)
  const order = new Map(dealt.map((c, i) => [c.id, i]))
  const ranked = [...IH_CHAINS].sort((a, b) => {
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

/** The chart stream for one attempt at a page. */
export function ihChartRng(options: { level: IhLevel; seed: number; ownerSalt: string; attempt: number }) {
  const { level, seed, ownerSalt, attempt } = options
  return createRngFromSeedInput({
    ownerSalt,
    templateKey: IH_TEMPLATE_KEY,
    configHash: `level:${level}`,
    pageNonce: seed,
    stream: `chart:${attempt}`,
  })
}
