import type { StudioConfig } from '@/types/studio-template.types'
import { DPI } from '@/types/canvas-settings.types'
import { createRngFromSeedInput } from '../_shared/uniqueness'
import type { CfRules } from './solver'

/**
 * What a Cruise Fleet page shows, and how each page's harbor and name are
 * chosen.
 *
 * A page is one Battleships-style harbor hiding a retirement cruise fleet
 * (a cruise ship, ferries, sailboats and rowboats), built fresh from the
 * seller's puzzle salt and the page seed (so two sellers on the same
 * settings print different books, and the same seed reprints the same
 * page), under the sign of a harbor — Sunset Harbor, Lighthouse Point. A
 * book works through every harbor before one returns, and a seller's next
 * book opens with harbors their last one did not use.
 */

export const CF_TEMPLATE_KEY = 'cruise-fleet'
export const CF_DEFAULT_TITLE = 'Cruise Fleet'

export const CF_BUILD_FAILED_MESSAGE = 'Could not build a Cruise Fleet puzzle for this page. Try again.'

export function cfPageTooSmallMessage(level: CfLevelSpec): string {
  return `This page size is too small for ${level.gridLabel} harbors at large print. Pick a larger page in Settings, or an easier level.`
}

/* ------------------------------------------------------------------ *
 * Levels
 * ------------------------------------------------------------------ */

export type CfLevel = 'gentle' | 'classic' | 'challenging'

export interface CfLevelSpec {
  value: CfLevel
  label: string
  /** "8 × 8", for help lines and messages. */
  gridLabel: string
  /** Squares across and down. */
  size: number
  /** The ships hidden in the harbor, longest first. */
  fleet: readonly number[]
  /** The steps a reader needs; the solver may use no others. */
  rules: CfRules
  /** Steps the level's harbors must not fall to alone (they need the level's own). */
  beyond: CfRules | null
  /** The fewest "where can it go" steps a harbor of the level takes. */
  minAdvanced: number
  /** Squares shown to start the reader off: at least this many. */
  minGivens: number
  /** Smallest square the level prints, canvas px. */
  minCell: number
}

const inch = (n: number) => Math.round(n * DPI * 100) / 100

/**
 * Difficulty is the harbor and what it takes to solve it — never a guess.
 * Gentle harbors fall to marking and counting, with a few more squares
 * shown; Classic harbors also need "where can it go" at least twice;
 * Challenging harbors, the classic 10 × 10 fleet, need it at least three
 * times. None needs trial and error.
 */
export const CF_LEVELS: readonly CfLevelSpec[] = [
  {
    value: 'gentle',
    label: 'Gentle — 6 × 6, 6 ships',
    gridLabel: '6 × 6',
    size: 6,
    fleet: [3, 2, 2, 1, 1, 1],
    rules: 'basic',
    beyond: null,
    minAdvanced: 0,
    minGivens: 3,
    minCell: inch(0.5),
  },
  {
    value: 'classic',
    label: 'Classic — 8 × 8, 8 ships',
    gridLabel: '8 × 8',
    size: 8,
    fleet: [4, 3, 3, 2, 2, 1, 1, 1],
    rules: 'fleet',
    beyond: 'basic',
    minAdvanced: 2,
    minGivens: 3,
    minCell: inch(0.45),
  },
  {
    value: 'challenging',
    label: 'Challenging — 10 × 10, 10 ships',
    gridLabel: '10 × 10',
    size: 10,
    fleet: [4, 3, 3, 2, 2, 2, 1, 1, 1, 1],
    rules: 'fleet',
    beyond: 'basic',
    minAdvanced: 3,
    minGivens: 2,
    minCell: inch(0.36),
  },
]

export const DEFAULT_CF_LEVEL: CfLevel = 'classic'

export function parseCfLevel(raw: unknown): CfLevel {
  const value = String(raw ?? '')
  return CF_LEVELS.some((l) => l.value === value) ? (value as CfLevel) : DEFAULT_CF_LEVEL
}

export const cfLevelSpec = (level: CfLevel): CfLevelSpec => CF_LEVELS.find((l) => l.value === level)!

/* ------------------------------------------------------------------ *
 * The page's words
 * ------------------------------------------------------------------ */

export const CF_INSTRUCTION =
  'Find the hidden fleet. Each number counts the ship squares in its row or column. Ships lie straight across or down and never touch — not even corner to corner.'

/** Gentle adds the first trick every Battleships solver learns. */
export const CF_GENTLE_TIP = 'Tip: once a row or column has all its ship squares, the rest of it is water.'

export function cfInstruction(config: StudioConfig, level: CfLevel): string {
  if (config.showInstructions === false) return ''
  return level === 'gentle' ? `${CF_INSTRUCTION} ${CF_GENTLE_TIP}` : CF_INSTRUCTION
}

/** Each length of ship in the fleet, by name: one and many. */
const SHIP_NAMES: Record<number, readonly [string, string]> = {
  4: ['cruise ship', 'cruise ships'],
  3: ['ferry', 'ferries'],
  2: ['sailboat', 'sailboats'],
  1: ['rowboat', 'rowboats'],
}

/** "2 ferries": a legend entry's words for the ships of one length. */
export function cfShipWord(length: number, count: number): string {
  const [one, many] = SHIP_NAMES[length] ?? [`${length}-square ship`, `${length}-square ships`]
  return `${count} ${count === 1 ? one : many}`
}

/** "× 2": a legend entry's words where room is short. */
export const cfShipCount = (count: number) => `× ${count}`

/** The legend's last entry: the wave shown on open water (and its short form). */
export const CF_WATER_WORD = 'Open water'
export const CF_WATER_SHORT = 'Water'

/** The fleet as the legend lists it: each length, longest first, and how many. */
export function cfFleetEntries(fleet: readonly number[]): { length: number; count: number }[] {
  const counts = new Map<number, number>()
  for (const l of fleet) counts.set(l, (counts.get(l) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[0] - a[0]).map(([length, count]) => ({ length, count }))
}

/* ------------------------------------------------------------------ *
 * Harbors
 * ------------------------------------------------------------------ */

export interface CfHarbor {
  id: string
  /** What the sign over the harbor says. */
  name: string
}

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/**
 * Written for the retiree with a cruise on the calendar: harbors, piers,
 * lighthouses, sea life and slow days on the water. No brands, no money,
 * no drink, no age jokes, and no battles — this fleet is on vacation.
 */
const NAMES = [
  'Sunset Harbor',
  'Lighthouse Point',
  'Anchor Bay',
  'Seagull Cove',
  'Calm Seas Marina',
  'Captain’s Landing',
  'Harbor Lights',
  'Bluewater Bay',
  'Sailor’s Rest',
  'Tranquil Waters',
  'Gentle Tide Harbor',
  'Fisherman’s Wharf',
  'Coral Reef Bay',
  'Whale Watch Point',
  'Dolphin Cove',
  'Seashore Marina',
  'Moonlit Harbor',
  'Golden Coast',
  'Bayside Pier',
  'Paradise Port',
  'Starboard Bay',
  'Compass Rose Harbor',
  'Northern Lights Voyage',
  'Tropical Breeze Bay',
  'Harbor Master’s Cove',
  'Seaside Boardwalk',
  'Glacier Bay Voyage',
  'Fjord Passage',
  'Riverboat Landing',
  'Canal Lock Harbor',
  'Sea Turtle Cove',
  'Sandpiper Beach',
  'Clamshell Bay',
  'Rainbow Reef',
  'Windward Passage',
  'Leeward Harbor',
  'Old Mill Marina',
  'Lobster Pot Harbor',
  'Boathouse Row',
  'Anniversary Voyage',
  'Bon Voyage Harbor',
  'Smooth Sailing Bay',
  'Grandkids’ Beach Day',
  'Island Breeze Port',
] as const

export const CF_HARBORS: readonly CfHarbor[] = NAMES.map((name) => ({ id: slug(name), name }))

const HARBOR_INDEX = new Map(CF_HARBORS.map((h) => [h.id, h]))
export const cfHarborById = (id: string) => HARBOR_INDEX.get(id)

/**
 * What the sign over the harbor reads: on one line, or broken between
 * words where the two lines come out most even on a narrow trim.
 */
export function cfSignText(harbor: CfHarbor, lines: 1 | 2 = 1): string {
  if (lines === 1) return harbor.name
  const words = harbor.name.split(' ')
  let best = harbor.name
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

/** `harbor|level|fleet`: the label a page stamps, and what the book reads back. */
export const cfPageLabel = (harbor: CfHarbor, level: CfLevel, signature: string) => `${harbor.id}|${level}|${signature}`

export interface CfBookEntry {
  harbor: string
  level: CfLevel | null
  signature: string
}

/** The book's Cruise Fleet pages, oldest first, from their stamped labels. */
export function parseCfBook(labels: readonly string[]): CfBookEntry[] {
  const out: CfBookEntry[] = []
  for (const label of labels) {
    const [id, level, signature] = label.split('|')
    if (!id || !cfHarborById(id)) continue
    out.push({ harbor: id, level: CF_LEVELS.some((l) => l.value === level) ? (level as CfLevel) : null, signature: signature ?? '' })
  }
  return out
}

/**
 * The harbor for a page.
 *
 * Least-used in the book first, so a book works through every harbor
 * before one returns; among those, ones this seller has not printed lately;
 * then the dealt order. The previous page's harbor never follows itself.
 */
export function pickCfHarbor(options: {
  level: CfLevel
  seed: number
  ownerSalt: string
  book: readonly CfBookEntry[]
  /** Harbor ids this seller printed lately. */
  recent: readonly string[]
}): CfHarbor {
  const { level, seed, ownerSalt, book, recent } = options
  const rng = createRngFromSeedInput({
    ownerSalt,
    templateKey: CF_TEMPLATE_KEY,
    configHash: `level:${level}`,
    pageNonce: seed,
    stream: 'harbor',
  })
  const shown = new Map<string, number>()
  for (const entry of book) shown.set(entry.harbor, (shown.get(entry.harbor) ?? 0) + 1)
  const previous = book.length > 0 ? book[book.length - 1]!.harbor : null
  const recentSet = new Set(recent)
  const dealt = rng.shuffle(CF_HARBORS)
  const order = new Map(dealt.map((h, i) => [h.id, i]))
  const ranked = [...CF_HARBORS].sort((a, b) => {
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

/** The harbor stream for one attempt at a page. */
export function cfHarborRng(options: { level: CfLevel; seed: number; ownerSalt: string; attempt: number }) {
  const { level, seed, ownerSalt, attempt } = options
  return createRngFromSeedInput({
    ownerSalt,
    templateKey: CF_TEMPLATE_KEY,
    configHash: `level:${level}`,
    pageNonce: seed,
    stream: `fleet:${attempt}`,
  })
}
