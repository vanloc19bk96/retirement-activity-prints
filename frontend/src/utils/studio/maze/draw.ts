import type { StudioFabricObject } from '@/types/studio-template.types'
import {
  estimateTextBoxWidth,
  insetBox,
  unionObjectBounds,
  type Box,
} from '../studio-layout'
import { snapGridInField } from '../studio-grid-rules'
import {
  buildRect,
  buildLine,
  buildText,
  buildGroup,
  type StudioTag,
} from '../studio-fabric-builders'
import {
  STUDIO_RULE_MEDIUM,
  STUDIO_ANSWER_INK,
  STUDIO_STROKE_HAIRLINE,
  STUDIO_STROKE_NORMAL,
} from '@/constants/studio.constants'
import type { MazeCell, MazePuzzle } from './generator'

/** Breathing room from safe edges — same as Grid Copy / Number Snake / Hitori. */
const FIELD_INSET = 16

/** Start / Finish caption size. Small enough to sit outside the maze frame. */
const LABEL_SIZE = 18
const LABEL_GAP = 6
/** Clearance above/below the frame for the solution path stubs. */
const STUB_CLEARANCE = 8

/** Vertical space captions (and path stubs) need above and below the maze. */
export function mazeLabelBandHeight(showLabels: boolean): number {
  return showLabels ? STUB_CLEARANCE + LABEL_GAP + LABEL_SIZE : STUB_CLEARANCE
}

/** Inset body used for sizing + drawing so stubs/walls clear the safe edge. */
export function mazeContentField(area: Box): Box {
  return insetBox(area, FIELD_INSET)
}

/** Grid box inside `area` after field inset + Start/Finish (or stub) bands. */
export function mazeGridField(area: Box, showLabels: boolean): Box {
  const field = mazeContentField(area)
  const band = mazeLabelBandHeight(showLabels)
  return {
    ...field,
    top: field.top + band,
    height: Math.max(1, field.height - band * 2),
  }
}

/** Cell size the maze would use if drawn in `area` (after inset + label bands). */
export function cellForMazeField(
  area: Box,
  cols: number,
  rows: number,
  showLabels: boolean,
): number {
  return snapGridInField(mazeGridField(area, showLabels), cols, rows).cell
}

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
      fill: STUDIO_RULE_MEDIUM,
      stroke: 'transparent',
      strokeWidth: 0,
    },
    tag,
    'structure',
  )
}

/**
 * Wall bars are centred on the grid lines and over-run by half a thickness at
 * each end, so corners close without a notch.
 */
function drawWalls(
  puzzle: MazePuzzle,
  bounds: Box,
  cell: number,
  thickness: number,
  tag: StudioTag,
): StudioFabricObject[] {
  const { rows, cols, hWalls, vWalls } = puzzle
  const half = thickness / 2
  const bars: StudioFabricObject[] = []

  for (let r = 0; r <= rows; r++) {
    for (const run of collectRuns(cols, (c) => hWalls[r]![c]!)) {
      bars.push(
        wallBar(
          bounds.left + run.from * cell - half,
          bounds.top + r * cell - half,
          (run.to - run.from + 1) * cell + thickness,
          thickness,
          tag,
        ),
      )
    }
  }

  for (let c = 0; c <= cols; c++) {
    for (const run of collectRuns(rows, (r) => vWalls[r]![c]!)) {
      bars.push(
        wallBar(
          bounds.left + c * cell - half,
          bounds.top + run.from * cell - half,
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

function cellCenter(bounds: Box, cell: number, at: MazeCell): Point {
  return {
    x: bounds.left + at.c * cell + cell / 2,
    y: bounds.top + at.r * cell + cell / 2,
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
 * The solution route, hidden on the puzzle page and revealed on the key.
 * Drawn through corridor centres with round caps so it reads clearly against
 * the wall bars in black-and-white print.
 */
function drawSolution(
  puzzle: MazePuzzle,
  bounds: Box,
  cell: number,
  stub: number,
  tag: StudioTag,
): StudioFabricObject[] {
  const centers = puzzle.solution.map((at) => cellCenter(bounds, cell, at))
  const first = centers[0]!
  const last = centers[centers.length - 1]!
  const points = simplify([
    { x: first.x, y: bounds.top - stub },
    ...centers,
    { x: last.x, y: bounds.top + puzzle.rows * cell + stub },
  ])

  // Lighter than the old wall-plus-padding weight so the route does not dominate.
  const width = Math.max(
    STUDIO_STROKE_HAIRLINE,
    Math.min(STUDIO_STROKE_NORMAL, Math.round(cell * 0.1)),
  )
  const segments: StudioFabricObject[] = []
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!
    const b = points[i]!
    segments.push(
      buildLine(
        {
          x1: a.x,
          y1: a.y,
          x2: b.x,
          y2: b.y,
          stroke: STUDIO_ANSWER_INK,
          strokeWidth: width,
          strokeLineCap: 'round',
        },
        tag,
        'answer',
      ),
    )
  }
  return segments
}

function caption(
  text: string,
  centerX: number,
  top: number,
  field: Box,
  font: string,
  tag: StudioTag,
): StudioFabricObject {
  const width = estimateTextBoxWidth(text, LABEL_SIZE, field.width)
  // Openings sit at the grid corners — keep the caption inside the content column.
  const min = field.left + width / 2
  const max = field.left + field.width - width / 2
  return buildText(
    {
      left: Math.min(Math.max(centerX, min), max),
      top,
      text,
      width,
      fontSize: LABEL_SIZE,
      fontFamily: font,
      textAlign: 'center',
      originX: 'center',
    },
    tag,
    'structure',
  )
}

export function drawMaze(options: {
  field: Box
  puzzle: MazePuzzle
  showLabels: boolean
  font: string
  tag: StudioTag
  /**
   * Cap cell size (solution page). Keeps the maze the same size as the puzzle
   * page while still centering in a taller no-instruction body.
   */
  maxCell?: number
}): StudioFabricObject {
  const { field: area, puzzle, showLabels, font, tag, maxCell } = options
  const field = mazeContentField(area)
  const band = mazeLabelBandHeight(showLabels)
  const gridField = mazeGridField(area, showLabels)

  const fitted = snapGridInField(gridField, puzzle.cols, puzzle.rows)
  const cell =
    maxCell !== undefined
      ? Math.max(1, Math.min(fitted.cell, Math.floor(maxCell)))
      : fitted.cell
  const width = cell * puzzle.cols
  const height = cell * puzzle.rows
  const bounds: Box = {
    left: Math.round(gridField.left + (gridField.width - width) / 2),
    top: Math.round(gridField.top + (gridField.height - height) / 2),
    width,
    height,
  }

  // Same mid-gray hairline weight as Grid Copy.
  const thickness = STUDIO_STROKE_HAIRLINE
  const startX = bounds.left + puzzle.start.c * cell + cell / 2
  const finishX = bounds.left + puzzle.finish.c * cell + cell / 2
  const gridBottom = bounds.top + puzzle.rows * cell
  const stub = Math.min(STUB_CLEARANCE, Math.round(cell * 0.6))

  const parts: StudioFabricObject[] = [
    ...drawWalls(puzzle, bounds, cell, thickness, tag),
    ...drawSolution(puzzle, bounds, cell, stub, tag),
  ]

  if (showLabels) {
    parts.push(
      caption('Start', startX, bounds.top - band, field, font, tag),
      caption('Finish', finishX, gridBottom + STUB_CLEARANCE + LABEL_GAP, field, font, tag),
    )
  }

  const groupBounds = unionObjectBounds(parts) ?? bounds
  return buildGroup(parts, groupBounds, tag)
}
