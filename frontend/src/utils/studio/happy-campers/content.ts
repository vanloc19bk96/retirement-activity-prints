import type { StudioConfig } from '@/types/studio-template.types'
import { DPI } from '@/types/canvas-settings.types'
import { createRngFromSeedInput } from '../_shared/uniqueness'
import type { HcRules } from './solver'

/**
 * What a Happy Campers page shows, and how each page's grid and campground
 * are chosen.
 *
 * A page is one Tents & Trees grid, built fresh from the seller's puzzle
 * salt and the page seed (so two sellers on the same settings print
 * different books, and the same seed reprints the same page), under the
 * sign of a campground with a retirement name — Rocking Chair Ridge, Gone
 * Fishin' Cove. A book walks every campground before one returns, and a
 * seller's next book opens with names their last one did not use.
 */

export const HC_TEMPLATE_KEY = 'happy-campers'
export const HC_DEFAULT_TITLE = 'Happy Campers'

export const HC_BUILD_FAILED_MESSAGE = 'Could not build a Happy Campers puzzle for this page. Try again.'

export function hcPageTooSmallMessage(level: HcLevelSpec): string {
  return `This page size is too small for ${level.gridLabel} campgrounds at large print. Pick a larger page in Settings, or an easier level.`
}

/* ------------------------------------------------------------------ *
 * Levels
 * ------------------------------------------------------------------ */

export type HcLevel = 'gentle' | 'classic' | 'challenging'

export interface HcLevelSpec {
  value: HcLevel
  label: string
  /** "8 × 8", for help lines and messages. */
  gridLabel: string
  size: number
  /** Trees (and so tents) on a grid of the level. */
  minTents: number
  maxTents: number
  /** The steps a reader needs; the solver may use no others. */
  rules: HcRules
  /** True when the level's grids must need more than the basic steps. */
  beyondBasic: boolean
  /** Smallest square the level prints, canvas px. */
  minCell: number
}

const inch = (n: number) => Math.round(n * DPI * 100) / 100

/**
 * Difficulty is the grid and what it takes to solve it — never a guess.
 * Gentle grids fall to the counts and "this tree has only one free side";
 * Classic adds counting gaps along a row; Challenging grids cannot be
 * finished without that counting or a "what if" check, on a bigger field.
 */
export const HC_LEVELS: readonly HcLevelSpec[] = [
  { value: 'gentle', label: 'Gentle — 6 × 6, 7 tents', gridLabel: '6 × 6', size: 6, minTents: 7, maxTents: 7, rules: 'basic', beyondBasic: false, minCell: inch(0.55) },
  { value: 'classic', label: 'Classic — 8 × 8, 12 or 13 tents', gridLabel: '8 × 8', size: 8, minTents: 12, maxTents: 13, rules: 'runs', beyondBasic: false, minCell: inch(0.45) },
  { value: 'challenging', label: 'Challenging — 10 × 10, 18 to 20 tents', gridLabel: '10 × 10', size: 10, minTents: 18, maxTents: 20, rules: 'probe', beyondBasic: true, minCell: inch(0.36) },
]

export const DEFAULT_HC_LEVEL: HcLevel = 'classic'

export function parseHcLevel(raw: unknown): HcLevel {
  const value = String(raw ?? '')
  return HC_LEVELS.some((l) => l.value === value) ? (value as HcLevel) : DEFAULT_HC_LEVEL
}

export const hcLevelSpec = (level: HcLevel): HcLevelSpec => HC_LEVELS.find((l) => l.value === level)!

/* ------------------------------------------------------------------ *
 * The page's words
 * ------------------------------------------------------------------ */

export const HC_INSTRUCTION =
  'Pitch one tent beside every tree: above, below, left or right of it. Tents never touch, not even corner to corner. The numbers tell how many tents go in each row and column.'

/** Gentle adds the tip every Tents & Trees solver learns first. */
export const HC_GENTLE_TIP = 'Tip: dot the squares where no tent can go.'

export function hcInstruction(config: StudioConfig, level: HcLevel): string {
  if (config.showInstructions === false) return ''
  return level === 'gentle' ? `${HC_INSTRUCTION} ${HC_GENTLE_TIP}` : HC_INSTRUCTION
}

/** The legend under the grid. */
export const HC_TREE_WORD = 'Tree'
export const hcTentWord = (tents: number) => `Tent (${tents} to pitch)`

/* ------------------------------------------------------------------ *
 * Campgrounds
 * ------------------------------------------------------------------ */

export interface HcCampground {
  id: string
  /** What the sign says, without "Campground". */
  name: string
}

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/**
 * Written for the retiree: the slow mornings, the hobbies, the grandchildren
 * and the road trips. No brands, no money, no drink, no age jokes.
 */
const NAMES = [
  'Rocking Chair Ridge',
  'Gone Fishin’ Cove',
  'Slow Lane Lake',
  'Early Bird Bluff',
  'Porch Swing Pines',
  'Easy Street Glen',
  'Nap Time Hollow',
  'No Alarm Clock Acres',
  'Grandkids’ Grove',
  'Coffee Pot Creek',
  'Birdwatch Bay',
  'Crossword Cove',
  'Garden Gate Glen',
  'Sweet Tea Springs',
  'Card Table Canyon',
  'Lazy Sunday Lake',
  'Hammock Hill',
  'Tee Time Timbers',
  'Knitting Needle Knoll',
  'Postcard Point',
  'Road Trip Ridge',
  'Camper Van Cove',
  'Fishing Pole Pond',
  'Slipper Creek',
  'Recliner Ridge',
  'Snowbird Shores',
  'Free Time Forest',
  'Day Off Dells',
  'Pottering Pines',
  'Sunset Porch Point',
  'Scrapbook Springs',
  'Bird Feeder Bend',
  'Picnic Basket Park',
  'Long Lunch Landing',
  'Weekday Picnic Woods',
  'Bingo Night Bend',
  'Tomato Patch Trail',
  'Jigsaw Junction',
  'Pancake Breakfast Pines',
  'Afternoon Nap Narrows',
  'Old Friends Orchard',
  'Wander Awhile Woods',
] as const

export const HC_CAMPGROUNDS: readonly HcCampground[] = NAMES.map((name) => ({ id: slug(name), name }))

const CAMPGROUND_INDEX = new Map(HC_CAMPGROUNDS.map((c) => [c.id, c]))
export const hcCampgroundById = (id: string) => CAMPGROUND_INDEX.get(id)

/** What the sign over the grid reads: on one line, or the name over "Campground" on a narrow trim. */
export const hcSignText = (campground: HcCampground, lines: 1 | 2 = 1) => `${campground.name}${lines === 2 ? '\n' : ' '}Campground`

/* ------------------------------------------------------------------ *
 * The book
 * ------------------------------------------------------------------ */

/** `campground|level|grid`: the label a page stamps, and what the book reads back. */
export const hcPageLabel = (campground: HcCampground, level: HcLevel, signature: string) => `${campground.id}|${level}|${signature}`

export interface HcBookEntry {
  campground: string
  level: HcLevel | null
  signature: string
}

/** The book's Happy Campers pages, oldest first, from their stamped labels. */
export function parseHcBook(labels: readonly string[]): HcBookEntry[] {
  const out: HcBookEntry[] = []
  for (const label of labels) {
    const [id, level, signature] = label.split('|')
    if (!id || !hcCampgroundById(id)) continue
    out.push({ campground: id, level: HC_LEVELS.some((l) => l.value === level) ? (level as HcLevel) : null, signature: signature ?? '' })
  }
  return out
}

/**
 * The campground for a page.
 *
 * Least-used in the book first, so a book walks every name before one
 * returns; among those, ones this seller has not printed lately; then the
 * dealt order. The previous page's campground never follows itself.
 */
export function pickHcCampground(options: {
  level: HcLevel
  seed: number
  ownerSalt: string
  book: readonly HcBookEntry[]
  /** Campground ids this seller printed lately. */
  recent: readonly string[]
}): HcCampground {
  const { level, seed, ownerSalt, book, recent } = options
  const rng = createRngFromSeedInput({
    ownerSalt,
    templateKey: HC_TEMPLATE_KEY,
    configHash: `level:${level}`,
    pageNonce: seed,
    stream: 'campground',
  })
  const shown = new Map<string, number>()
  for (const entry of book) shown.set(entry.campground, (shown.get(entry.campground) ?? 0) + 1)
  const previous = book.length > 0 ? book[book.length - 1]!.campground : null
  const recentSet = new Set(recent)
  const dealt = rng.shuffle(HC_CAMPGROUNDS)
  const order = new Map(dealt.map((c, i) => [c.id, i]))
  const ranked = [...HC_CAMPGROUNDS].sort((a, b) => {
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
export function hcGridRng(options: { level: HcLevel; seed: number; ownerSalt: string; attempt: number }) {
  const { level, seed, ownerSalt, attempt } = options
  return createRngFromSeedInput({
    ownerSalt,
    templateKey: HC_TEMPLATE_KEY,
    configHash: `level:${level}`,
    pageNonce: seed,
    stream: `grid:${attempt}`,
  })
}
