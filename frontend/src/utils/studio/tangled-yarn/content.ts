import type { StudioConfig } from '@/types/studio-template.types'
import { DPI } from '@/types/canvas-settings.types'
import { createRngFromSeedInput } from '../_shared/uniqueness'
import type { TyRules } from './solver'

/**
 * What a Tangled Yarn page shows, and how each page's grid and project are
 * chosen.
 *
 * A page is one Numberlink grid, built fresh from the seller's puzzle salt
 * and the page seed (so two sellers on the same settings print different
 * books, and the same seed reprints the same page), under the tag of a
 * knitting project from a retiree's yarn basket — Sunday Morning Scarf,
 * Rocking Chair Afghan. A book works through every project before one
 * returns, and a seller's next book opens with projects their last one did
 * not use.
 */

export const TY_TEMPLATE_KEY = 'tangled-yarn'
export const TY_DEFAULT_TITLE = 'Tangled Yarn'

export const TY_BUILD_FAILED_MESSAGE = 'Could not build a Tangled Yarn puzzle for this page. Try again.'

export function tyPageTooSmallMessage(level: TyLevelSpec): string {
  return `This page size is too small for ${level.gridLabel} yarn grids at large print. Pick a larger page in Settings, or an easier level.`
}

/* ------------------------------------------------------------------ *
 * Levels
 * ------------------------------------------------------------------ */

export type TyLevel = 'gentle' | 'classic' | 'challenging'

export interface TyLevelSpec {
  value: TyLevel
  label: string
  /** "8 × 8", for help lines and messages. */
  gridLabel: string
  /** Squares across and down. */
  size: number
  minPairs: number
  maxPairs: number
  /** The steps a reader needs; the solver may use no others. */
  rules: TyRules
  /** Steps the level's grids must not fall to alone (they need the level's own). */
  beyond: TyRules | null
  /** Smallest square the level prints, canvas px. */
  minCell: number
}

const inch = (n: number) => Math.round(n * DPI * 100) / 100

/**
 * Difficulty is the grid and what it takes to solve it — never a guess.
 * Gentle grids fall to counting round each square; Classic grids also need
 * "which yarn can reach this square" at least once; Challenging grids need
 * a "what if" check as well, on a bigger grid.
 */
export const TY_LEVELS: readonly TyLevelSpec[] = [
  { value: 'gentle', label: 'Gentle — 6 × 6, 5 to 7 pairs', gridLabel: '6 × 6', size: 6, minPairs: 5, maxPairs: 7, rules: 'basic', beyond: null, minCell: inch(0.55) },
  { value: 'classic', label: 'Classic — 8 × 8, 8 to 11 pairs', gridLabel: '8 × 8', size: 8, minPairs: 8, maxPairs: 11, rules: 'reach', beyond: 'basic', minCell: inch(0.44) },
  { value: 'challenging', label: 'Challenging — 10 × 10, 12 to 16 pairs', gridLabel: '10 × 10', size: 10, minPairs: 12, maxPairs: 16, rules: 'probe', beyond: 'reach', minCell: inch(0.38) },
]

export const DEFAULT_TY_LEVEL: TyLevel = 'classic'

export function parseTyLevel(raw: unknown): TyLevel {
  const value = String(raw ?? '')
  return TY_LEVELS.some((l) => l.value === value) ? (value as TyLevel) : DEFAULT_TY_LEVEL
}

export const tyLevelSpec = (level: TyLevel): TyLevelSpec => TY_LEVELS.find((l) => l.value === level)!

/* ------------------------------------------------------------------ *
 * The page's words
 * ------------------------------------------------------------------ */

/**
 * The letters on the yarn balls, pair 1 first. No I or O (they read as 1
 * and 0), no Q (it reads as O), and no M or W (too wide for a small ball).
 */
export const TY_LETTERS = 'ABCDEFGHJKLNPRST'

/** The letter on pair k's balls (k from 1). */
export const tyLetter = (k: number) => TY_LETTERS[k - 1] ?? '?'

export const TY_INSTRUCTION =
  'Join each pair of matching letters with one strand of yarn. Strands run square to square, across or down, never cross, and fill every square.'

/** Gentle adds the tip every Numberlink solver learns first. */
export const TY_GENTLE_TIP = 'Tip: a square with only two open sides must use both — start in the corners.'

export function tyInstruction(config: StudioConfig, level: TyLevel): string {
  if (config.showInstructions === false) return ''
  return level === 'gentle' ? `${TY_INSTRUCTION} ${TY_GENTLE_TIP}` : TY_INSTRUCTION
}

/** The legend under the grid. */
export const tyBallWord = (pairs: number) => `Yarn ball (${pairs} pairs)`
export const TY_STRAND_WORD = 'Strand of yarn'

/* ------------------------------------------------------------------ *
 * Projects
 * ------------------------------------------------------------------ */

export interface TyProject {
  id: string
  /** What the tag over the grid says. */
  name: string
}

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/**
 * Written for the retiree with a full yarn basket: slow mornings, the
 * porch, the seasons and the grandchildren. No brands, no money, no drink,
 * no age jokes.
 */
const NAMES = [
  'Sunday Morning Scarf',
  'Rocking Chair Afghan',
  'Front Porch Throw',
  'Snow Day Mittens',
  'Grandbaby Blanket',
  'Garden Party Shawl',
  'Book Club Cardigan',
  'Lazy Sunday Socks',
  'Fireside Sweater',
  'Picnic Day Tote',
  'Teatime Cozy',
  'Birdwatcher Beanie',
  'Harvest Moon Cowl',
  'Starry Night Shawl',
  'Sunrise Walk Hat',
  'Lakeside Pullover',
  'Holiday Stocking',
  'Granny Square Throw',
  'Rainy Day Slippers',
  'Cabin Weekend Socks',
  'Snowbird Wrap',
  'Apple Orchard Vest',
  'First Frost Gloves',
  'Porch Swing Pillow',
  'Rose Garden Shawl',
  'Autumn Leaves Afghan',
  'Seaside Cardigan',
  'Grandkids’ Hats',
  'Country Fair Blanket',
  'Evening Stroll Wrap',
  'Road Trip Socks',
  'Hearthside Throw',
  'Bluebird Booties',
  'Lighthouse Pullover',
  'Sweet Pea Cardigan',
  'Maple Leaf Mittens',
  'Snowflake Sweater',
  'Honeybee Dishcloth',
  'Wildflower Shawl',
  'Farmers Market Tote',
  'Sleepy Cat Blanket',
  'Pinecone Beanie',
] as const

export const TY_PROJECTS: readonly TyProject[] = NAMES.map((name) => ({ id: slug(name), name }))

const PROJECT_INDEX = new Map(TY_PROJECTS.map((p) => [p.id, p]))
export const tyProjectById = (id: string) => PROJECT_INDEX.get(id)

/**
 * What the tag over the grid reads: on one line, or broken between words
 * where the two lines come out most even on a narrow trim.
 */
export function tySignText(project: TyProject, lines: 1 | 2 = 1): string {
  if (lines === 1) return project.name
  const words = project.name.split(' ')
  let best = project.name
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

/** `project|level|grid`: the label a page stamps, and what the book reads back. */
export const tyPageLabel = (project: TyProject, level: TyLevel, signature: string) => `${project.id}|${level}|${signature}`

export interface TyBookEntry {
  project: string
  level: TyLevel | null
  signature: string
}

/** The book's Tangled Yarn pages, oldest first, from their stamped labels. */
export function parseTyBook(labels: readonly string[]): TyBookEntry[] {
  const out: TyBookEntry[] = []
  for (const label of labels) {
    const [id, level, signature] = label.split('|')
    if (!id || !tyProjectById(id)) continue
    out.push({ project: id, level: TY_LEVELS.some((l) => l.value === level) ? (level as TyLevel) : null, signature: signature ?? '' })
  }
  return out
}

/**
 * The project for a page.
 *
 * Least-used in the book first, so a book works through every project
 * before one returns; among those, ones this seller has not printed lately;
 * then the dealt order. The previous page's project never follows itself.
 */
export function pickTyProject(options: {
  level: TyLevel
  seed: number
  ownerSalt: string
  book: readonly TyBookEntry[]
  /** Project ids this seller printed lately. */
  recent: readonly string[]
}): TyProject {
  const { level, seed, ownerSalt, book, recent } = options
  const rng = createRngFromSeedInput({
    ownerSalt,
    templateKey: TY_TEMPLATE_KEY,
    configHash: `level:${level}`,
    pageNonce: seed,
    stream: 'project',
  })
  const shown = new Map<string, number>()
  for (const entry of book) shown.set(entry.project, (shown.get(entry.project) ?? 0) + 1)
  const previous = book.length > 0 ? book[book.length - 1]!.project : null
  const recentSet = new Set(recent)
  const dealt = rng.shuffle(TY_PROJECTS)
  const order = new Map(dealt.map((p, i) => [p.id, i]))
  const ranked = [...TY_PROJECTS].sort((a, b) => {
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
export function tyGridRng(options: { level: TyLevel; seed: number; ownerSalt: string; attempt: number }) {
  const { level, seed, ownerSalt, attempt } = options
  return createRngFromSeedInput({
    ownerSalt,
    templateKey: TY_TEMPLATE_KEY,
    configHash: `level:${level}`,
    pageNonce: seed,
    stream: `grid:${attempt}`,
  })
}
