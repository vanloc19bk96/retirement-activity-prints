import type { StudioFabricObject } from '@/types/studio-template.types'
import { unionObjectBounds, type Box } from '../studio-layout'
import { hasWall, type MazeCell } from '../maze/generator'
import type { SmLevel } from './content'
import { outlineChains } from './draw'
import { isPerfectShapedMaze, outlineEdges, routeFloor, type ShapedMazePuzzle, type ShapedOpening } from './generator'
import { hasPinch, isInside, isSinglePiece } from './mask'
import { placementsClear, shapeFault, type SmOpeningPlacement, type SmPagePlan } from './layout'

export interface SmKdpPreflightResult {
  ok: boolean
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

const sameCell = (a: MazeCell | undefined, b: MazeCell) => !!a && a.r === b.r && a.c === b.c

const isOutlineEdge = (puzzle: ShapedMazePuzzle, opening: ShapedOpening) =>
  outlineEdges(puzzle.mask).some((e) => sameCell(e.cell, opening.cell) && e.dir === opening.dir)

/**
 * The last gate before a shaped maze reaches the editor.
 *
 * Checks the things a reader would only find with a pencil in hand, plus the
 * things a print proof would show: a shape that has drifted from its drawing
 * or come apart, a maze with no way through or two, a gap in the outline other
 * than Start and Finish, a key tracing a route the page does not have,
 * corridors or walls too fine to print, captions on top of each other, and
 * anything outside the safe area. Any one of them and the page is rebuilt
 * with another shape; none of them ever prints.
 */
export function runSmKdpPreflight(options: {
  puzzle: ShapedMazePuzzle
  plan: SmPagePlan
  level: SmLevel
  start: SmOpeningPlacement
  finish: SmOpeningPlacement
}): SmKdpPreflightResult {
  const { puzzle, plan, level, start, finish } = options
  const errors: string[] = []
  const { mask } = puzzle

  // The shape.
  const fault = shapeFault(mask, plan.quality, level)
  if (fault) errors.push(`The shape does not hold a good maze (${fault}).`)
  if (!isSinglePiece(mask)) errors.push('The shape is in more than one piece.')
  if (hasPinch(mask)) errors.push('Two walls of the outline meet at a point.')
  if (puzzle.rows !== mask.rows || puzzle.cols !== mask.cols) errors.push('The maze is not the size of its shape.')

  // The openings.
  if (!isOutlineEdge(puzzle, puzzle.start) || !isOutlineEdge(puzzle, puzzle.finish)) {
    errors.push('Start and Finish must open onto the page, on the outline.')
  }
  if (sameCell(puzzle.start.cell, puzzle.finish.cell)) errors.push('Start and Finish share a corridor.')
  if (hasWall(puzzle, puzzle.start.cell, puzzle.start.dir) || hasWall(puzzle, puzzle.finish.cell, puzzle.finish.dir)) {
    errors.push('Start or Finish is walled shut.')
  }

  // One route, and one only; the outline closed everywhere else.
  if (!isPerfectShapedMaze(puzzle, mask, [puzzle.start, puzzle.finish])) {
    errors.push('This maze does not have exactly one way through.')
  }
  // The drawn outline must break exactly where the two openings are: the
  // outer loop, cut twice, is two open lines; every other loop stays closed.
  const openChains = outlineChains(puzzle).filter((chain) => chain[0] !== chain[chain.length - 1]).length
  if (openChains !== 2) errors.push('The outline has a gap other than Start and Finish.')

  // The key.
  const route = puzzle.solution
  if (route.length === 0 || !sameCell(route[0], puzzle.start.cell) || !sameCell(route[route.length - 1], puzzle.finish.cell)) {
    errors.push('The answer key does not run from Start to Finish.')
  } else {
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1]!
      const b = route[i]!
      const dir = stepDirection(b.r - a.r, b.c - a.c)
      if (dir === null || hasWall(puzzle, a, dir) || !isInside(mask, b.r, b.c)) {
        errors.push('The answer key crosses a wall.')
        break
      }
    }
    if (route.length < Math.round(routeFloor(mask.count, level.profile) * 0.6)) {
      errors.push('This maze is too easy to be worth printing.')
    }
  }

  // Print.
  if (plan.cell < level.minPath) errors.push('Maze paths must stay wide enough to draw a line down.')
  if (plan.metrics.wallWidth < 2) errors.push('Maze walls must stay heavy enough to print.')
  if (!placementsClear(start, finish, plan.metrics.labelGap)) errors.push('The Start and Finish captions overlap.')

  return { ok: errors.length === 0, errors }
}

/** Every drawn object sits inside the box — the safe area, with its inset. */
export function smDrawnInside(objects: readonly StudioFabricObject[], box: Box): boolean {
  const bounds = unionObjectBounds([...objects])
  if (!bounds) return false
  return (
    bounds.left >= box.left - 0.5 &&
    bounds.top >= box.top - 0.5 &&
    bounds.left + bounds.width <= box.left + box.width + 0.5 &&
    bounds.top + bounds.height <= box.top + box.height + 0.5
  )
}
