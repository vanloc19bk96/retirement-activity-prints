import type { StudioConfig } from '@/types/studio-template.types'
import { DPI } from '@/types/canvas-settings.types'
import { createRngFromSeedInput } from '../_shared/uniqueness'
import type { YsRules } from './solver'

/**
 * What a Yard Sale page shows, and how each page's grid and name are
 * chosen.
 *
 * A page is one grid of numbers, built fresh from the seller's puzzle salt
 * and the page seed (so two sellers on the same settings print different
 * books, and the same seed reprints the same page), under the sign of a
 * clear-out a retiree would love to get round to — the Attic Treasures Sale,
 * the Workshop Clear-Out, the Grandkids' Toy Swap. A book works through every
 * sale before one returns, and a seller's next book opens with sales their
 * last one did not use.
 */

export const YS_TEMPLATE_KEY = 'yard-sale'
export const YS_DEFAULT_TITLE = 'Yard Sale'

export const YS_BUILD_FAILED_MESSAGE = 'Could not build a Yard Sale puzzle for this page. Try again.'

export function ysPageTooSmallMessage(level: YsLevelSpec): string {
  return `This page size is too small for ${level.gridLabel} grids at large print. Pick a larger page in Settings, or an easier level.`
}

/* ------------------------------------------------------------------ *
 * Levels
 * ------------------------------------------------------------------ */

export type YsLevel = 'gentle' | 'classic' | 'challenging'

export interface YsLevelSpec {
  value: YsLevel
  label: string
  /** "8 × 8", for help lines and messages. */
  gridLabel: string
  /** Squares across and down; the numbers run 1 to size. */
  size: number
  /** The steps a reader needs; the solver may use no others. */
  rules: YsRules
  /** Steps the level's grids must not fall to alone (they need the level's own). */
  beyond: YsRules | null
  /** The fewest of the level's own steps a grid takes ("never wall off" at Classic, "what if" at Challenging). */
  minHard: number
  /** Fewest and most shaded squares in the answer, as a share of the squares. */
  shaded: readonly [number, number]
  /** Smallest square the level prints, canvas px. */
  minCell: number
}

const inch = (n: number) => Math.round(n * DPI * 100) / 100

/**
 * Difficulty is the grid and what it takes to solve it — never a guess.
 * Gentle grids, 6 × 6, fall to the first steps alone; Classic grids, 8 × 8,
 * also need "never wall off" at least twice; Challenging grids, 9 × 9, need
 * "what if" at least twice. Every level shades about a third of its squares
 * or a little less, the share puzzle books print.
 */
export const YS_LEVELS: readonly YsLevelSpec[] = [
  { value: 'gentle', label: 'Gentle — 6 × 6 grid', gridLabel: '6 × 6', size: 6, rules: 'basic', beyond: null, minHard: 0, shaded: [0.25, 0.36], minCell: inch(0.6) },
  { value: 'classic', label: 'Classic — 8 × 8 grid', gridLabel: '8 × 8', size: 8, rules: 'walls', beyond: 'basic', minHard: 2, shaded: [0.25, 0.34], minCell: inch(0.5) },
  { value: 'challenging', label: 'Challenging — 9 × 9 grid', gridLabel: '9 × 9', size: 9, rules: 'probe', beyond: 'walls', minHard: 2, shaded: [0.25, 0.34], minCell: inch(0.45) },
]

export const DEFAULT_YS_LEVEL: YsLevel = 'classic'

export function parseYsLevel(raw: unknown): YsLevel {
  const value = String(raw ?? '')
  return YS_LEVELS.some((l) => l.value === value) ? (value as YsLevel) : DEFAULT_YS_LEVEL
}

export const ysLevelSpec = (level: YsLevel): YsLevelSpec => YS_LEVELS.find((l) => l.value === level)!

/* ------------------------------------------------------------------ *
 * The page's words
 * ------------------------------------------------------------------ */

export const YS_HOW_TO =
  'Shade some repeated numbers so no number shows twice in any row or column. Shaded squares never touch side by side, and the white squares all stay joined.'

/** Gentle adds the first trick every solver learns. */
export const YS_GENTLE_TIP = 'Tip: in 4 2 4, the 2 always stays white.'

export function ysInstruction(config: StudioConfig, level: YsLevel): string {
  if (config.showInstructions === false) return ''
  // The tip on a line of its own, so it never leaves a word or two stranded under the rules.
  return level === 'gentle' ? `${YS_HOW_TO}\n${YS_GENTLE_TIP}` : YS_HOW_TO
}

/** The legend under the grid: two alike with one shaded, and two shaded side by side crossed out. */
export const YS_REPEAT_WORD = 'shade one'
export const YS_TOUCH_WORD = 'never touch'
/** The legend's sample repeat: two alike side by side, the first one shaded. */
export const YS_LEGEND_PAIR = [4, 4] as const
/** The legend's two shaded squares side by side: left blank, so the cross between them reads at a glance. */
export const YS_LEGEND_TWINS = [null, null] as const

/* ------------------------------------------------------------------ *
 * Sales
 * ------------------------------------------------------------------ */

export interface YsSale {
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
 * Written for the retiree who finally has the time to clear the attic, sort
 * the workshop and swap with the neighbours: porches and garages, hobbies
 * and grandchildren, the move to the lake. No brands, no prices, no drink,
 * no age jokes, and nothing sad (no estates, no house clearances).
 */
const NAMES = [
  'Maple Street Yard Sale',
  'Spring Cleaning Saturday',
  'Attic Treasures Sale',
  'Garage Clean-Out Day',
  'Church Rummage Sale',
  'Neighborhood Swap Meet',
  'Barn Sale at the Farm',
  'Moving to the Lake House',
  'Sewing Room Tidy-Up',
  'Workshop Clear-Out',
  'Flea Market Sunday',
  'Porch Sale on Elm Street',
  'Community Swap Day',
  'Library Book Sale',
  'Craft Fair Leftovers',
  'Moving Day Sale',
  'Closet Makeover',
  'Kitchen Drawer Sort',
  'Basement Treasure Hunt',
  'Old Record Crate',
  'Fishing Tackle Swap',
  'Garden Shed Clear-Out',
  'Holiday Decor Swap',
  'Quilt Guild Fabric Sale',
  'Model Train Swap Meet',
  'Country Antique Sale',
  'Whole Street Sale Day',
  'Back Porch Bargains',
  'Treasure Trunk Sale',
  'Bake Sale and Swap',
  'Cul-de-Sac Sale',
  'Old Toy Chest Sale',
  'Recipe Box Swap',
  'Farmhouse Clear-Out',
  'Summer Cottage Sale',
  'Keepsake Box Sort',
  'Photo Album Sort',
  'Grandkids’ Toy Swap',
  'Sunday Swap at the Park',
  'Tool Bench Tidy-Up',
  'Linen Closet Sort',
  'Bookshelf Clear-Out',
  'Card Club Swap',
  'Hobby Room Sale',
  'Collectors’ Swap Meet',
  'Front Lawn Sale',
] as const

export const YS_SALES: readonly YsSale[] = NAMES.map((name) => ({ id: slug(name), name }))

const SALE_INDEX = new Map(YS_SALES.map((s) => [s.id, s]))
export const ysSaleById = (id: string) => SALE_INDEX.get(id)

/**
 * What the sign over the grid reads: on one line, or broken between words
 * where the two lines come out most even on a narrow trim.
 */
export function ysSignText(sale: YsSale, lines: 1 | 2 = 1): string {
  if (lines === 1) return sale.name
  const words = sale.name.split(' ')
  let best = sale.name
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

/** `sale|level|grid`: the label a page stamps, and what the book reads back. */
export const ysPageLabel = (sale: YsSale, level: YsLevel, signature: string) => `${sale.id}|${level}|${signature}`

export interface YsBookEntry {
  sale: string
  level: YsLevel | null
  signature: string
}

/** The book's Yard Sale pages, oldest first, from their stamped labels. */
export function parseYsBook(labels: readonly string[]): YsBookEntry[] {
  const out: YsBookEntry[] = []
  for (const label of labels) {
    const [id, level, signature] = label.split('|')
    if (!id || !ysSaleById(id)) continue
    out.push({ sale: id, level: YS_LEVELS.some((l) => l.value === level) ? (level as YsLevel) : null, signature: signature ?? '' })
  }
  return out
}

/**
 * The sale for a page.
 *
 * Least-used in the book first, so a book works through every sale before
 * one returns; among those, ones this seller has not printed lately; then
 * the dealt order. The previous page's sale never follows itself.
 */
export function pickYsSale(options: {
  level: YsLevel
  seed: number
  ownerSalt: string
  book: readonly YsBookEntry[]
  /** Sale ids this seller printed lately. */
  recent: readonly string[]
}): YsSale {
  const { level, seed, ownerSalt, book, recent } = options
  const rng = createRngFromSeedInput({
    ownerSalt,
    templateKey: YS_TEMPLATE_KEY,
    configHash: `level:${level}`,
    pageNonce: seed,
    stream: 'sale',
  })
  const shown = new Map<string, number>()
  for (const entry of book) shown.set(entry.sale, (shown.get(entry.sale) ?? 0) + 1)
  const previous = book.length > 0 ? book[book.length - 1]!.sale : null
  const recentSet = new Set(recent)
  const dealt = rng.shuffle(YS_SALES)
  const order = new Map(dealt.map((s, i) => [s.id, i]))
  const ranked = [...YS_SALES].sort((a, b) => {
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
export function ysGridRng(options: { level: YsLevel; seed: number; ownerSalt: string; attempt: number }) {
  const { level, seed, ownerSalt, attempt } = options
  return createRngFromSeedInput({
    ownerSalt,
    templateKey: YS_TEMPLATE_KEY,
    configHash: `level:${level}`,
    pageNonce: seed,
    stream: `grid:${attempt}`,
  })
}
