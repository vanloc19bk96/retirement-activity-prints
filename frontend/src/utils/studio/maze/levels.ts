import type { StudioConfig, StudioSelectOption } from '@/types/studio-template.types'
import { DPI } from '@/types/canvas-settings.types'
import type { MazeProfile } from './generator'

/**
 * The one decision a maze page asks for.
 *
 * The form this replaces asked three, and two of them fought each other. "Maze
 * size" set a column count — twelve, sixteen, twenty or twenty-six — with no
 * idea what page it would be printed on, so "Extra large" on a 5 x 8 paperback
 * meant corridors about an eighth of an inch wide: narrower than the pencil, on
 * a page sold to readers in their seventies. "Difficulty" then set twistiness
 * separately, which let a seller ask for the hardest maze at the smallest size
 * and get a page nobody can solve, or the easiest at the largest and get a page
 * nobody wants to. The third question was whether to label Start and Finish,
 * which is not a question: an unlabelled maze is a maze with a printing fault.
 *
 * One plain-language level answers all of it. What it really sets is the width
 * of the corridors — everything else follows, because the trim decides how many
 * corridors of that width fit, and the grid decides how long a route through
 * them can run. `layout.ts` does that arithmetic against the page size in
 * Settings, and the level's help line reports the maze it produced there, so
 * nothing the form decided stays hidden.
 */
export type MazeLevelId = 'gentle' | 'classic' | 'challenging'

export interface MazeLevel {
  id: MazeLevelId
  /** Option label in the form — short enough not to truncate in the panel. */
  label: string
  /**
   * Corridor width band, in canvas pixels.
   *
   * This is the number the whole page is built from. The floor is what a hand
   * holding a pencil needs to draw a line down a corridor without riding the
   * walls; the ceiling is where a maze stops reading as a puzzle and starts
   * reading as a floor plan, all white space and eight turns.
   */
  minPath: number
  maxPath: number
  /**
   * Cells across. The floor is what makes a maze a maze rather than a diagram;
   * the ceiling is what stops a wide trim from spending its whole width on
   * corridors too numerous to tell apart.
   */
  minCols: number
  maxCols: number
  /** Cells down. Kept near the column band so the maze stays a block, not a strip. */
  minRows: number
  maxRows: number
  profile: MazeProfile
}

/** Corridor widths are set in inches and read back in inches on the form. */
const inches = (value: number): number => Math.round(value * DPI)

export const MAZE_LEVELS: readonly MazeLevel[] = [
  {
    id: 'gentle',
    label: 'Gentle — wide paths, few dead ends',
    // A third of an inch is about a pencil width plus room either side; the
    // ceiling is where the grid drops under ten cells on the trims this app
    // sells, and a nine-cell maze is a diagram of a maze.
    minPath: inches(0.34),
    maxPath: inches(0.44),
    minCols: 9,
    maxCols: 14,
    minRows: 9,
    maxRows: 20,
    profile: {
      // Long corridors, so the eye can follow one without losing its place.
      straightness: 0.68,
      routeShare: 0.22,
      deadEndShare: 0.15,
      minRouteFactor: 1.1,
    },
  },
  {
    id: 'classic',
    label: 'Classic — the everyday maze',
    minPath: inches(0.28),
    maxPath: inches(0.36),
    minCols: 11,
    maxCols: 20,
    minRows: 11,
    maxRows: 28,
    profile: {
      straightness: 0.52,
      routeShare: 0.3,
      deadEndShare: 0.22,
      minRouteFactor: 1.4,
    },
  },
  {
    id: 'challenging',
    label: 'Challenging — longer route, more turns',
    // A quarter inch is the floor for the whole game, not just this level: it
    // is about six millimetres, and below it a ballpoint line touches both
    // walls at once. Dense is allowed here; cramped is not.
    minPath: inches(0.24),
    maxPath: inches(0.31),
    minCols: 13,
    maxCols: 26,
    minRows: 13,
    maxRows: 34,
    profile: {
      straightness: 0.4,
      routeShare: 0.4,
      deadEndShare: 0.27,
      minRouteFactor: 1.8,
    },
  },
]

export const DEFAULT_MAZE_LEVEL_ID: MazeLevelId = 'classic'

const LEVEL_INDEX = new Map(MAZE_LEVELS.map((level) => [level.id, level]))

export const MAZE_LEVEL_OPTIONS: StudioSelectOption[] = MAZE_LEVELS.map((level) => ({
  label: level.label,
  value: level.id,
}))

/**
 * Sheets saved before the ladder replaced size + difficulty.
 *
 * Difficulty is read first because it is the field that meant difficulty. Size
 * only ever meant "how small may the corridors get", so it answers when
 * difficulty is absent: a book row or bulk job written against the old form
 * keeps printing the maze its seller chose rather than silently falling back to
 * the middle of the ladder.
 */
function legacyLevelId(config: StudioConfig): MazeLevelId | null {
  const difficulty = config.difficulty
  if (difficulty === 'easy' || difficulty === 'relaxed') return 'gentle'
  if (difficulty === 'hard' || difficulty === 'challenge') return 'challenging'
  if (difficulty === 'medium' || difficulty === 'classic') return 'classic'

  const size = config.size
  if (size === 'small') return 'gentle'
  if (size === 'large' || size === 'xlarge') return 'challenging'
  if (size === 'medium') return 'classic'
  return null
}

export function parseMazeLevel(config: StudioConfig): MazeLevel {
  const chosen = LEVEL_INDEX.get(String(config.level ?? '') as MazeLevelId)
  if (chosen) return chosen
  const legacy = legacyLevelId(config)
  return (
    (legacy ? LEVEL_INDEX.get(legacy) : undefined) ??
    LEVEL_INDEX.get(DEFAULT_MAZE_LEVEL_ID)!
  )
}

/**
 * What the page tells the solver.
 *
 * One sentence, and it states the promise the generator keeps: there is one way
 * through. A solver who knows that stops second-guessing a corridor they have
 * already walked, which is the difference between a puzzle and a chore.
 */
export const MAZE_INSTRUCTION =
  'Trace the one path from Start to Finish. Do not cross any walls.'

/** The instruction this page will really carry, for layout measurement. */
export function mazeInstruction(config: StudioConfig): string {
  if (config.showInstructions === false) return ''
  return MAZE_INSTRUCTION
}
