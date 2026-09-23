import { hasWall, isPerfectMaze, type MazePuzzle } from './generator'
import type { MazePagePlan } from './layout'
import type { MazeLevel } from './levels'

export interface MazeKdpPreflightResult {
  ok: boolean
  warnings: string[]
  errors: string[]
}

/** Direction deltas: 0 up, 1 right, 2 down, 3 left. */
function stepDirection(dr: number, dc: number): number | null {
  if (dr === -1 && dc === 0) return 0
  if (dr === 0 && dc === 1) return 1
  if (dr === 1 && dc === 0) return 2
  if (dr === 0 && dc === -1) return 3
  return null
}

/** Every step of the printed route crosses an opening, never a wall. */
function routeIsWalkable(puzzle: MazePuzzle): boolean {
  for (let i = 1; i < puzzle.solution.length; i++) {
    const a = puzzle.solution[i - 1]!
    const b = puzzle.solution[i]!
    const dir = stepDirection(b.r - a.r, b.c - a.c)
    if (dir === null) return false
    if (hasWall(puzzle, a, dir)) return false
  }
  return true
}

function borderGaps(walls: readonly boolean[]): number {
  return walls.filter((wall) => !wall).length
}

/**
 * The last gate before a maze sheet is considered export-ready.
 *
 * Fit, safe area and corridor width are already structural: the grid is sized
 * from a printable path width and centred in a measured block, so nothing here
 * can overflow a page. What is left is the part a reader only discovers with a
 * pencil in their hand — a maze with no way through, a maze with two, a border
 * that leaks out of the side, or a key tracing a route the page does not have.
 * Every one of those is a refund and a one-star review, so none of them prints.
 */
export function runMazeKdpPreflight(options: {
  puzzle: MazePuzzle
  plan: MazePagePlan
  level: MazeLevel
}): MazeKdpPreflightResult {
  const { puzzle, plan, level } = options
  const warnings: string[] = []
  const errors: string[] = []

  if (puzzle.rows !== plan.rows || puzzle.cols !== plan.cols) {
    errors.push('The maze is not the size this page was laid out for.')
  }

  // One route, and one only — what the instruction on the page promises.
  if (!isPerfectMaze(puzzle)) {
    errors.push('This maze does not have exactly one way through.')
  }

  const topGaps = borderGaps(puzzle.hWalls[0]!)
  const bottomGaps = borderGaps(puzzle.hWalls[puzzle.rows]!)
  if (topGaps !== 1 || bottomGaps !== 1) {
    errors.push('The maze needs exactly one entrance and one exit.')
  }
  let sideGaps = 0
  for (let r = 0; r < puzzle.rows; r++) {
    if (!puzzle.vWalls[r]![0]) sideGaps++
    if (!puzzle.vWalls[r]![puzzle.cols]) sideGaps++
  }
  if (sideGaps > 0) {
    errors.push('The maze border is open at the side.')
  }

  const route = puzzle.solution
  const first = route[0]
  const last = route[route.length - 1]
  if (
    route.length === 0 ||
    first!.r !== puzzle.start.r ||
    first!.c !== puzzle.start.c ||
    last!.r !== puzzle.finish.r ||
    last!.c !== puzzle.finish.c
  ) {
    errors.push('The answer key does not run from Start to Finish.')
  } else if (!routeIsWalkable(puzzle)) {
    errors.push('The answer key crosses a wall.')
  }

  // Shorter than one drop down the page plus the sideways travel the two
  // openings force is not a maze the carver could have produced.
  const floor = puzzle.rows + Math.floor(puzzle.cols / 3)
  if (route.length > 0 && route.length < floor) {
    errors.push('This maze is too easy to be worth printing.')
  }

  if (plan.metrics.cell < level.minPath) {
    errors.push('Maze paths must stay wide enough to draw a line down.')
  }
  if (plan.metrics.wallWidth < 2) {
    errors.push('Maze walls must stay heavy enough to print.')
  }

  // Not a fault, but worth knowing: a small trim can hold the grid down to
  // where the level's route length is simply unreachable.
  if (route.length < level.profile.minRouteFactor * (puzzle.rows + puzzle.cols)) {
    warnings.push(
      'This page size keeps the route shorter than the level aims for. ' +
        'A larger page size in Settings fits a longer one.',
    )
  }

  return { ok: errors.length === 0, warnings, errors }
}
