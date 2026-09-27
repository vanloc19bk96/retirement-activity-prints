import type { StudioConfig } from '@/types/studio-template.types'
import { DPI } from '@/types/canvas-settings.types'
import { createRngFromSeedInput } from '../_shared/uniqueness'
import type { DriveRules } from './solver'

/**
 * What a Scenic Drive page shows, and how each page's grid and route are
 * chosen.
 *
 * A page is one cross-sums grid, built fresh from the seller's puzzle salt
 * and the page seed (so two sellers on the same settings print different
 * books, and the same seed reprints the same page), under the road sign of
 * a drive a retiree would love to take — the Blue Ridge Parkway, a Covered
 * Bridge Byway, the Road Trip to the Grandkids. A book works through every
 * route before one returns, and a seller's next book opens with routes their
 * last one did not use.
 */

export const DRIVE_TEMPLATE_KEY = 'scenic-drive'
export const DRIVE_DEFAULT_TITLE = 'Scenic Drive'

export const DRIVE_BUILD_FAILED_MESSAGE = 'Could not build a Scenic Drive puzzle for this page. Try again.'

export function drivePageTooSmallMessage(level: DriveLevelSpec): string {
  return `This page size is too small for ${level.gridLabel} grids at large print. Pick a larger page in Settings, or an easier level.`
}

/* ------------------------------------------------------------------ *
 * Levels
 * ------------------------------------------------------------------ */

export type DriveLevel = 'gentle' | 'classic' | 'challenging'

export interface DriveLevelSpec {
  value: DriveLevel
  label: string
  /** "8 × 8", for help lines and messages. */
  gridLabel: string
  /** Squares across and down, the gray top row and left column included. */
  size: number
  /** The steps a reader needs; the solver may use no others. */
  rules: DriveRules
  /** Steps the level's grids must not fall to alone (they need the level's own). */
  beyond: DriveRules | null
  /** The longest run across or down. */
  maxRun: number
  /** The share of the inner squares that are gray, fewest to most. */
  blacks: readonly [number, number]
  /** How often tuning takes the digit whose totals are hardest to make other ways. */
  greed: number
  /** Smallest square pitch the level prints, canvas px. */
  minCell: number
}

const inch = (n: number) => Math.round(n * DPI * 100) / 100

/**
 * Difficulty is the grid and what it takes to solve it — never a guess.
 * Gentle grids are small, with runs of two to four squares, and fall to the
 * sum table alone; Classic grids, a size larger with runs up to six, also
 * need "make it fit" at least once; Challenging grids, larger again, need
 * "what if" at least once.
 */
export const DRIVE_LEVELS: readonly DriveLevelSpec[] = [
  { value: 'gentle', label: 'Gentle: 7 × 7 grid', gridLabel: '7 × 7', size: 7, rules: 'sums', beyond: null, maxRun: 4, blacks: [0.25, 0.4], greed: 0.8, minCell: inch(0.5) },
  { value: 'classic', label: 'Classic: 8 × 8 grid', gridLabel: '8 × 8', size: 8, rules: 'fit', beyond: 'sums', maxRun: 6, blacks: [0.22, 0.36], greed: 0.5, minCell: inch(0.48) },
  {
    value: 'challenging',
    label: 'Challenging: 9 × 9 grid',
    gridLabel: '9 × 9',
    size: 9,
    rules: 'probe',
    beyond: 'fit',
    maxRun: 6,
    blacks: [0.22, 0.34],
    greed: 0.85,
    minCell: inch(0.44),
  },
]

export const DEFAULT_DRIVE_LEVEL: DriveLevel = 'classic'

export function parseDriveLevel(raw: unknown): DriveLevel {
  const value = String(raw ?? '')
  return DRIVE_LEVELS.some((l) => l.value === value) ? (value as DriveLevel) : DEFAULT_DRIVE_LEVEL
}

export const driveLevelSpec = (level: DriveLevel): DriveLevelSpec => DRIVE_LEVELS.find((l) => l.value === level)!

/* ------------------------------------------------------------------ *
 * The page's words
 * ------------------------------------------------------------------ */

export const DRIVE_HOW_TO =
  'Write 1 to 9 in the white squares so each run adds up to its total (upper number across, lower down). No repeats in a run.'

/** Gentle adds the first trick every cross-sums solver learns. */
export const DRIVE_GENTLE_TIP = 'Tip: 3 in two squares is always 1 + 2.'

export function driveInstruction(config: StudioConfig, level: DriveLevel): string {
  if (config.showInstructions === false) return ''
  // The tip on a line of its own, so it never leaves a word or two stranded under the rules.
  return level === 'gentle' ? `${DRIVE_HOW_TO}\n${DRIVE_GENTLE_TIP}` : DRIVE_HOW_TO
}

/** The legend's sample run: a total of 4 across two squares holding 1 and 3. */
export const DRIVE_LEGEND_RUN = [1, 3] as const
export const DRIVE_LEGEND_TOTAL = 4
/** The legend's repeated pair: the same digit twice in a run, crossed out. */
export const DRIVE_LEGEND_TWIN = 2
/** The legend under the grid: what a run adds up to, and what it never holds. */
export const DRIVE_SUM_WORD = '= the run adds up to 4'
export const DRIVE_TWICE_WORD = '= no digit twice in a run'

/* ------------------------------------------------------------------ *
 * Routes
 * ------------------------------------------------------------------ */

export interface DriveRoute {
  id: string
  /** What the road sign over the grid says. */
  name: string
}

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/**
 * Written for the retiree with time at last for the long way round: coast
 * roads, fall colors, covered bridges, the drive to see the grandchildren.
 * Public byways and made-up country roads only: no brands, no money, no
 * drink, no age jokes, no roads a film made famous.
 */
const NAMES = [
  'Blue Ridge Parkway',
  'Pacific Coast Highway',
  'Great River Road',
  'Cabot Trail',
  'Great Ocean Road',
  'Ring of Kerry',
  'Covered Bridge Byway',
  'Autumn Leaves Drive',
  'Lakeshore Loop',
  'Lighthouse Coast Road',
  'Apple Orchard Byway',
  'Wildflower Trail',
  'Sunday Drive to the Lake',
  'Cherry Blossom Parkway',
  'Maple Sugar Backroads',
  'Sea Cliff Highway',
  'Painted Desert Drive',
  'Redwood Forest Road',
  'Canyon Rim Drive',
  'Prairie Sky Highway',
  'Harvest Country Road',
  'Old Mill Scenic Route',
  'Mountain Laurel Loop',
  'Bluebonnet Byway',
  'Seaside Village Road',
  'Lavender Fields Drive',
  'Sunflower Country Road',
  'Pine Ridge Parkway',
  'Riverbend Scenic Route',
  'Fall Colors Byway',
  'Fishing Village Loop',
  'Northern Lights Highway',
  'Island Ferry Road',
  'Road Trip to the Grandkids',
  'Snowbird Route South',
  'Golden Hills Drive',
  'Lakes and Loons Loop',
  'Rolling Hills Road',
  'Starry Night Highway',
  'Tulip Fields Drive',
  'Coastal Cottage Road',
  'Moose Country Byway',
  'Hot Springs Loop',
  'Mesa Sunset Drive',
  'Second Honeymoon Drive',
  'Glacier View Highway',
] as const

export const DRIVE_ROUTES: readonly DriveRoute[] = NAMES.map((name) => ({ id: slug(name), name }))

const ROUTE_INDEX = new Map(DRIVE_ROUTES.map((w) => [w.id, w]))
export const driveRouteById = (id: string) => ROUTE_INDEX.get(id)

/**
 * What the road sign over the grid reads: on one line, or broken between
 * words where the two lines come out most even on a narrow trim.
 */
export function driveSignText(route: DriveRoute, lines: 1 | 2 = 1): string {
  if (lines === 1) return route.name
  const words = route.name.split(' ')
  let best = route.name
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

/** `route|level|grid`: the label a page stamps, and what the book reads back. */
export const drivePageLabel = (route: DriveRoute, level: DriveLevel, signature: string) => `${route.id}|${level}|${signature}`

export interface DriveBookEntry {
  route: string
  level: DriveLevel | null
  signature: string
}

/** The book's Scenic Drive pages, oldest first, from their stamped labels. */
export function parseDriveBook(labels: readonly string[]): DriveBookEntry[] {
  const out: DriveBookEntry[] = []
  for (const label of labels) {
    const [id, level, signature] = label.split('|')
    if (!id || !driveRouteById(id)) continue
    out.push({ route: id, level: DRIVE_LEVELS.some((l) => l.value === level) ? (level as DriveLevel) : null, signature: signature ?? '' })
  }
  return out
}

/**
 * The route for a page.
 *
 * Least-used in the book first, so a book works through every route before
 * one returns; among those, ones this seller has not printed lately; then
 * the dealt order. The previous page's route never follows itself.
 */
export function pickDriveRoute(options: {
  level: DriveLevel
  seed: number
  ownerSalt: string
  book: readonly DriveBookEntry[]
  /** Route ids this seller printed lately. */
  recent: readonly string[]
}): DriveRoute {
  const { level, seed, ownerSalt, book, recent } = options
  const rng = createRngFromSeedInput({
    ownerSalt,
    templateKey: DRIVE_TEMPLATE_KEY,
    configHash: `level:${level}`,
    pageNonce: seed,
    stream: 'route',
  })
  const shown = new Map<string, number>()
  for (const entry of book) shown.set(entry.route, (shown.get(entry.route) ?? 0) + 1)
  const previous = book.length > 0 ? book[book.length - 1]!.route : null
  const recentSet = new Set(recent)
  const dealt = rng.shuffle(DRIVE_ROUTES)
  const order = new Map(dealt.map((w, i) => [w.id, i]))
  const ranked = [...DRIVE_ROUTES].sort((a, b) => {
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
export function driveGridRng(options: { level: DriveLevel; seed: number; ownerSalt: string; attempt: number }) {
  const { level, seed, ownerSalt, attempt } = options
  return createRngFromSeedInput({
    ownerSalt,
    templateKey: DRIVE_TEMPLATE_KEY,
    configHash: `level:${level}`,
    pageNonce: seed,
    stream: `grid:${attempt}`,
  })
}
