import type { StudioFabricObject } from '@/types/studio-template.types'
import { unionObjectBounds, type Box } from '../studio-layout'
import { hugTextBoxWidth, fabricTextHeight, type FontSpec } from '../studio-text-metrics'
import {
  buildRect,
  buildCenteredLine,
  buildText,
  buildPolygon,
  buildGroup,
  type StudioTag,
} from '../studio-fabric-builders'
import { STUDIO_INK, STUDIO_ANSWER_INK } from '@/constants/studio.constants'
import type { MazeCell, MazePuzzle } from './generator'
import type { MazePagePlan } from './layout'

/**
 * The maze as ink on a black-and-white interior.
 *
 * Three decisions here are about the press rather than the screen. Walls are
 * black, not the mid-grey the studio rules its cell grids in: a grey hairline
 * survives a monitor and comes back off a print-on-demand press as a broken
 * line, and a broken wall in a maze is not a lighter wall — it is a second way
 * through. Wall bars are merged into runs, so a twenty-six column maze is a few
 * hundred rectangles instead of two thousand. And the outer frame is drawn
 * heavier than the corridors inside it, which is what turns the two gaps in it
 * into an entrance and an exit rather than two places the printer missed.
 */

export const MAZE_WALL_INK = STUDIO_INK

const START_LABEL = 'Start'
const FINISH_LABEL = 'Finish'

interface Run {
  from: number
  to: number
}

/** Consecutive `true` spans — one wall bar per run instead of one per edge. */
function collectRuns(length: number, isSet: (i: number) => boolean): Run[] {
  const runs: Run[] = []
  let from = -1
  for (let i = 0; i < length; i++) {
    if (isSet(i)) {
      if (from < 0) from = i
    } else if (from >= 0) {
      runs.push({ from, to: i - 1 })
      from = -1
    }
  }
  if (from >= 0) runs.push({ from, to: length - 1 })
  return runs
}

function wallBar(
  left: number,
  top: number,
  width: number,
  height: number,
  tag: StudioTag,
): StudioFabricObject {
  return buildRect(
    {
      left: Math.round(left),
      top: Math.round(top),
      width: Math.round(width),
      height: Math.round(height),
      fill: MAZE_WALL_INK,
      stroke: 'transparent',
      strokeWidth: 0,
    },
    tag,
    'structure',
  )
}

/**
 * Wall bars are centred on the grid lines and over-run by half a thickness at
 * each end, so corners close without a notch. The four border lines take the
 * heavier weight; everything inside takes the corridor weight.
 */
function drawWalls(
  puzzle: MazePuzzle,
  grid: Box,
  plan: MazePagePlan,
  tag: StudioTag,
): StudioFabricObject[] {
  const { rows, cols, hWalls, vWalls } = puzzle
  const { cell, wallWidth, borderWidth } = plan.metrics
  const bars: StudioFabricObject[] = []

  for (let r = 0; r <= rows; r++) {
    const thickness = r === 0 || r === rows ? borderWidth : wallWidth
    const half = thickness / 2
    for (const run of collectRuns(cols, (c) => hWalls[r]![c]!)) {
      bars.push(
        wallBar(
          grid.left + run.from * cell - half,
          grid.top + r * cell - half,
          (run.to - run.from + 1) * cell + thickness,
          thickness,
          tag,
        ),
      )
    }
  }

  for (let c = 0; c <= cols; c++) {
    const thickness = c === 0 || c === cols ? borderWidth : wallWidth
    const half = thickness / 2
    for (const run of collectRuns(rows, (r) => vWalls[r]![c]!)) {
      bars.push(
        wallBar(
          grid.left + c * cell - half,
          grid.top + run.from * cell - half,
          thickness,
          (run.to - run.from + 1) * cell + thickness,
          tag,
        ),
      )
    }
  }

  return bars
}

interface Point {
  x: number
  y: number
}

function cellCenterX(grid: Box, cell: number, at: MazeCell): number {
  // Integer so the arrow tip and the route stroke share one centre. Rounding
  // only the arrow's box left leaves the stroke half a pixel off on odd cells.
  return Math.round(grid.left + at.c * cell + cell / 2)
}

function cellCenter(grid: Box, cell: number, at: MazeCell): Point {
  return {
    x: cellCenterX(grid, cell, at),
    y: Math.round(grid.top + at.r * cell + cell / 2),
  }
}

/** Collapse collinear points so each straight leg of the route is one segment. */
function simplify(points: Point[]): Point[] {
  const out: Point[] = []
  for (const p of points) {
    const n = out.length
    if (n >= 2) {
      const a = out[n - 2]!
      const b = out[n - 1]!
      if ((a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y)) {
        out[n - 1] = p
        continue
      }
    }
    out.push(p)
  }
  return out
}

/**
 * The solution route: hidden on the puzzle page, revealed on the key.
 *
 * Drawn through corridor centres with round caps and joins, so the corners
 * read as a traced pencil line rather than as a chain of separate strokes. It
 * runs out through both gaps to the outer edge of the frame and stops there —
 * far enough to show which openings it used, not so far that it collides with
 * the arrows the puzzle page prints above and below them.
 */
function drawSolution(
  puzzle: MazePuzzle,
  grid: Box,
  plan: MazePagePlan,
  tag: StudioTag,
): StudioFabricObject[] {
  const { cell, routeWidth, inkPad } = plan.metrics
  const centers = puzzle.solution.map((at) => cellCenter(grid, cell, at))
  if (centers.length === 0) return []

  const first = centers[0]!
  const last = centers[centers.length - 1]!
  const points = simplify([
    { x: first.x, y: grid.top - inkPad },
    ...centers,
    { x: last.x, y: grid.top + puzzle.rows * cell + inkPad },
  ])

  const segments: StudioFabricObject[] = []
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!
    const b = points[i]!
    segments.push(
      // Left-origin Fabric lines paint half a stroke to the right of x1.
      buildCenteredLine(
        {
          x1: a.x,
          y1: a.y,
          x2: b.x,
          y2: b.y,
          stroke: STUDIO_ANSWER_INK,
          strokeWidth: routeWidth,
          strokeUniform: true,
          strokeLineCap: 'round',
          strokeLineJoin: 'round',
        },
        tag,
        'answer',
      ),
    )
  }
  return segments
}

/** Solid triangle pointing down the page — into the entrance, out of the exit. */
function arrow(
  centerX: number,
  top: number,
  plan: MazePagePlan,
  tag: StudioTag,
): StudioFabricObject {
  const { arrowWidth, arrowHeight } = plan.metrics
  return buildPolygon(
    {
      left: centerX - arrowWidth / 2,
      top: Math.round(top),
      points: [
        { x: 0, y: 0 },
        { x: arrowWidth, y: 0 },
        { x: arrowWidth / 2, y: arrowHeight },
      ],
      fill: MAZE_WALL_INK,
      stroke: 'transparent',
      strokeWidth: 0,
    },
    tag,
    'structure',
  )
}

/**
 * A caption over its opening, kept inside the block it belongs to.
 *
 * The openings sit wherever the puzzle put them, including hard against a
 * corner, so the centre is clamped: a "Finish" hanging off the side of the
 * maze reads as a stray word, and on a narrow trim it would reach the margin.
 */
function caption(
  text: string,
  centerX: number,
  top: number,
  block: Box,
  plan: MazePagePlan,
  spec: FontSpec,
  tag: StudioTag,
): StudioFabricObject {
  const width = hugTextBoxWidth(text, plan.metrics.labelFont, block.width, spec)
  const min = block.left + width / 2
  const max = block.left + block.width - width / 2
  return buildText(
    {
      left: Math.round(Math.min(Math.max(centerX, min), max)),
      top: Math.round(top),
      text,
      width,
      fontSize: plan.metrics.labelFont,
      fontFamily: String(spec.fontFamily),
      fontWeight: 700,
      textAlign: 'center',
      originX: 'center',
    },
    tag,
    'structure',
  )
}

/**
 * One maze, drawn into the block `mazeBlockBox` reserved for it.
 *
 * Grouped, so a seller can pick the whole puzzle up and move it, and so the
 * solution route travels with the maze it belongs to. Group bounds come from
 * the drawn objects rather than from the plan: a round line cap reaches half a
 * stroke past its endpoint, and bounds that ignored it would clip the route on
 * the key.
 */
export function drawMaze(options: {
  block: Box
  puzzle: MazePuzzle
  plan: MazePagePlan
  font: string
  tag: StudioTag
}): StudioFabricObject {
  const { block, puzzle, plan, font, tag } = options
  const { cell, inkPad, labelBand, labelFont, labelGap, arrowGap, arrowHeight } =
    plan.metrics
  const spec: FontSpec = { fontFamily: font, fontWeight: 700 }
  const labelHeight = Math.ceil(fabricTextHeight(1, labelFont))

  const grid: Box = {
    left: block.left + inkPad,
    top: block.top + labelBand + inkPad,
    width: cell * plan.cols,
    height: cell * plan.rows,
  }
  const startX = cellCenterX(grid, cell, puzzle.start)
  const finishX = cellCenterX(grid, cell, puzzle.finish)
  const gridBottom = grid.top + grid.height

  const parts: StudioFabricObject[] = [
    ...drawWalls(puzzle, grid, plan, tag),
    ...drawSolution(puzzle, grid, plan, tag),
    caption(START_LABEL, startX, block.top, block, plan, spec, tag),
    arrow(startX, block.top + labelHeight + labelGap, plan, tag),
    arrow(finishX, gridBottom + inkPad + arrowGap, plan, tag),
    caption(
      FINISH_LABEL,
      finishX,
      gridBottom + inkPad + arrowGap + arrowHeight + labelGap,
      block,
      plan,
      spec,
      tag,
    ),
  ]

  return buildGroup(parts, unionObjectBounds(parts) ?? block, tag)
}
