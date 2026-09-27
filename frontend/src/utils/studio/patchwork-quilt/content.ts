import type { StudioConfig } from '@/types/studio-template.types'
import { DPI } from '@/types/canvas-settings.types'
import { createRngFromSeedInput } from '../_shared/uniqueness'
import type { PqRules } from './solver'

/**
 * What a Patchwork Quilt page shows, and how each page's quilt and name are
 * chosen.
 *
 * A page is one Shikaku-style quilt, pieced fresh from the seller's puzzle
 * salt and the page seed (so two sellers on the same settings print
 * different books, and the same seed reprints the same page), under the
 * label of a retiree's quilt — Sunday Porch Quilt, Grandkids’ Nap Quilt. A
 * book works through every quilt name before one returns, and a seller's
 * next book opens with names their last one did not use.
 */

export const PQ_TEMPLATE_KEY = 'patchwork-quilt'
export const PQ_DEFAULT_TITLE = 'Patchwork Quilt'

export const PQ_BUILD_FAILED_MESSAGE = 'Could not build a Patchwork Quilt puzzle for this page. Try again.'

export function pqPageTooSmallMessage(level: PqLevelSpec): string {
  return `This page size is too small for ${level.gridLabel} quilts at large print. Pick a larger page in Settings, or an easier level.`
}

/* ------------------------------------------------------------------ *
 * Levels
 * ------------------------------------------------------------------ */

export type PqLevel = 'gentle' | 'classic' | 'challenging'

export interface PqLevelSpec {
  value: PqLevel
  label: string
  /** "9 × 9", for help lines and messages. */
  gridLabel: string
  /** Squares across and down. */
  size: number
  /** The largest patch the quilt is pieced from. */
  maxPatch: number
  /** The longest side a patch may run. */
  maxSide: number
  /** The steps a reader needs; the solver may use no others. */
  rules: PqRules
  /** Steps the level's quilts must not fall to alone (they need the level's own). */
  beyond: PqRules | null
  /** Smallest square the level prints, canvas px. */
  minCell: number
}

const inch = (n: number) => Math.round(n * DPI * 100) / 100

/**
 * Difficulty is the quilt and what it takes to solve it — never a guess.
 * Gentle quilts fall to laying one number's patch at a time; Classic quilts
 * also need "only one number reaches this square" at least once;
 * Challenging quilts, a size larger with bigger patches, need "would it
 * block" at least once.
 */
export const PQ_LEVELS: readonly PqLevelSpec[] = [
  { value: 'gentle', label: 'Gentle: 7 × 7, patches up to 8', gridLabel: '7 × 7', size: 7, maxPatch: 8, maxSide: 4, rules: 'basic', beyond: null, minCell: inch(0.5) },
  { value: 'classic', label: 'Classic: 9 × 9, patches up to 12', gridLabel: '9 × 9', size: 9, maxPatch: 12, maxSide: 6, rules: 'reach', beyond: 'basic', minCell: inch(0.45) },
  {
    value: 'challenging',
    label: 'Challenging: 10 × 10, patches up to 18',
    gridLabel: '10 × 10',
    size: 10,
    maxPatch: 18,
    maxSide: 6,
    rules: 'block',
    beyond: 'reach',
    minCell: inch(0.4),
  },
]

export const DEFAULT_PQ_LEVEL: PqLevel = 'classic'

export function parsePqLevel(raw: unknown): PqLevel {
  const value = String(raw ?? '')
  return PQ_LEVELS.some((l) => l.value === value) ? (value as PqLevel) : DEFAULT_PQ_LEVEL
}

export const pqLevelSpec = (level: PqLevel): PqLevelSpec => PQ_LEVELS.find((l) => l.value === level)!

/* ------------------------------------------------------------------ *
 * The page's words
 * ------------------------------------------------------------------ */

export const PQ_INSTRUCTION =
  'Sew the quilt into patches along the lines: every patch is a rectangle (or square) holding exactly one number, and the number is how many squares it covers.'

/** Gentle adds the first trick every Shikaku solver learns. */
export const PQ_GENTLE_TIP = 'Tip: start with a number whose patch fits only one way.'

export function pqInstruction(config: StudioConfig, level: PqLevel): string {
  if (config.showInstructions === false) return ''
  return level === 'gentle' ? `${PQ_INSTRUCTION} ${PQ_GENTLE_TIP}` : PQ_INSTRUCTION
}

/** The number the legend's sample patch carries. */
export const PQ_LEGEND_SAMPLE = 2

/** The legend under the quilt: what the sample patch's number means, and how many patches there are. */
export const pqSampleWord = (squares: number) => `= ${squares} squares`
export const pqPatchWord = (patches: number) => `${patches} patches`

/* ------------------------------------------------------------------ *
 * Quilts
 * ------------------------------------------------------------------ */

export interface PqQuilt {
  id: string
  /** What the label over the quilt says. */
  name: string
}

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/**
 * Written for the retiree at the quilting frame: classic blocks, the
 * porch, the seasons, the grandchildren and the day they left work. No
 * brands, no money, no drink, no age jokes.
 */
const NAMES = [
  'Sunday Porch Quilt',
  'Log Cabin Quilt',
  'Grandma’s Flower Garden',
  'Double Wedding Ring',
  'Nine Patch Throw',
  'Rail Fence Quilt',
  'Flying Geese Quilt',
  'Ohio Star Quilt',
  'Bear Paw Quilt',
  'Churn Dash Quilt',
  'Friendship Quilt',
  'Memory Quilt',
  'Farewell Party Quilt',
  'Rocking Chair Throw',
  'Grandkids’ Nap Quilt',
  'Quilting Bee Quilt',
  'Lake House Quilt',
  'Seaside Cottage Quilt',
  'Maple Leaf Quilt',
  'Harvest Table Quilt',
  'Sunshine and Shadow',
  'Trip Around the World',
  'Courthouse Steps',
  'Card Trick Quilt',
  'Jacob’s Ladder',
  'Irish Chain Quilt',
  'Pinwheel Quilt',
  'Garden Path Quilt',
  'Starry Night Quilt',
  'County Fair Quilt',
  'Snowball Quilt',
  'Hearth and Home',
  'Winter Cabin Quilt',
  'Road Trip Quilt',
  'Anniversary Quilt',
  'Gone Fishing Quilt',
  'Postage Stamp Quilt',
  'Hourglass Quilt',
  'Rainy Day Quilt',
  'Cozy Reading Quilt',
  'Bow Tie Quilt',
  'Picnic Blanket Quilt',
  'Sampler Quilt',
  'Schoolhouse Quilt',
] as const

export const PQ_QUILTS: readonly PqQuilt[] = NAMES.map((name) => ({ id: slug(name), name }))

const QUILT_INDEX = new Map(PQ_QUILTS.map((q) => [q.id, q]))
export const pqQuiltById = (id: string) => QUILT_INDEX.get(id)

/**
 * What the label over the quilt reads: on one line, or broken between words
 * where the two lines come out most even on a narrow trim.
 */
export function pqSignText(quilt: PqQuilt, lines: 1 | 2 = 1): string {
  if (lines === 1) return quilt.name
  const words = quilt.name.split(' ')
  let best = quilt.name
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

/** `quilt|level|numbers`: the label a page stamps, and what the book reads back. */
export const pqPageLabel = (quilt: PqQuilt, level: PqLevel, signature: string) => `${quilt.id}|${level}|${signature}`

export interface PqBookEntry {
  quilt: string
  level: PqLevel | null
  signature: string
}

/** The book's Patchwork Quilt pages, oldest first, from their stamped labels. */
export function parsePqBook(labels: readonly string[]): PqBookEntry[] {
  const out: PqBookEntry[] = []
  for (const label of labels) {
    const [id, level, signature] = label.split('|')
    if (!id || !pqQuiltById(id)) continue
    out.push({ quilt: id, level: PQ_LEVELS.some((l) => l.value === level) ? (level as PqLevel) : null, signature: signature ?? '' })
  }
  return out
}

/**
 * The quilt name for a page.
 *
 * Least-used in the book first, so a book works through every name before
 * one returns; among those, ones this seller has not printed lately; then
 * the dealt order. The previous page's name never follows itself.
 */
export function pickPqQuilt(options: {
  level: PqLevel
  seed: number
  ownerSalt: string
  book: readonly PqBookEntry[]
  /** Quilt ids this seller printed lately. */
  recent: readonly string[]
}): PqQuilt {
  const { level, seed, ownerSalt, book, recent } = options
  const rng = createRngFromSeedInput({
    ownerSalt,
    templateKey: PQ_TEMPLATE_KEY,
    configHash: `level:${level}`,
    pageNonce: seed,
    stream: 'quilt',
  })
  const shown = new Map<string, number>()
  for (const entry of book) shown.set(entry.quilt, (shown.get(entry.quilt) ?? 0) + 1)
  const previous = book.length > 0 ? book[book.length - 1]!.quilt : null
  const recentSet = new Set(recent)
  const dealt = rng.shuffle(PQ_QUILTS)
  const order = new Map(dealt.map((q, i) => [q.id, i]))
  const ranked = [...PQ_QUILTS].sort((a, b) => {
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

/** The piecing stream for one attempt at a page. */
export function pqQuiltRng(options: { level: PqLevel; seed: number; ownerSalt: string; attempt: number }) {
  const { level, seed, ownerSalt, attempt } = options
  return createRngFromSeedInput({
    ownerSalt,
    templateKey: PQ_TEMPLATE_KEY,
    configHash: `level:${level}`,
    pageNonce: seed,
    stream: `patches:${attempt}`,
  })
}
