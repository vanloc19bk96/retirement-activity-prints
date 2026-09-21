import type { StudioFabricObject } from '@/types/studio-template.types'
import { fitSquareGrid, insetBox, type Box } from '../studio-layout'
import { drawGridLines } from '../studio-grid-rules'
import { buildRect, buildText, buildGroup, type StudioTag } from '../studio-fabric-builders'
import {
  STUDIO_INK,
  STUDIO_STROKE_BOLD,
  STUDIO_DIGIT_FONT,
} from '@/constants/studio.constants'
import type { ShikakuPuzzle, ShikakuRect } from './types'

/** Breathing room from safe edges — same as Grid Copy / Hitori / Number Snake. */
const FIELD_INSET = 16

/** Weight of the solution outlines. Heavier than the grid so blocks read first. */
const CUT_THICKNESS = STUDIO_STROKE_BOLD

/** Cell size the grid would use if drawn in `area`. */
export function cellForField(area: Box, rows: number, cols: number): number {
  return fitSquareGrid(insetBox(area, FIELD_INSET), cols, rows).cell
}

/** Integer-aligned grid re-centered in `field`. */
function snapGridInField(field: Box, cell: number, rows: number, cols: number) {
  const width = cell * cols
  const height = cell * rows
  const left = Math.round(field.left + (field.width - width) / 2)
  const top = Math.round(field.top + (field.height - height) / 2)
  return {
    cell,
    bounds: { left, top, width, height } as Box,
    cellBox: (r: number, c: number): Box => ({
      left: left + c * cell,
      top: top + r * cell,
      width: cell,
      height: cell,
    }),
  }
}

/**
 * Where the bar on grid line `index` starts. Outer lines are pulled flush
 * inside the bounds; interior lines straddle the line they sit on.
 */
function lineOrigin(
  index: number,
  count: number,
  start: number,
  span: number,
  cell: number,
  thickness: number,
): number {
  if (index === 0) return start
  if (index === count) return start + span - thickness
  return start + index * cell - Math.floor(thickness / 2)
}

/**
 * Solution outlines as filled bars, deduped by geometry.
 *
 * Neighbouring blocks share an edge, so drawing four sides per rectangle would
 * stack two bars on the same pixels — same look, twice the objects to move and
 * export.
 */
function drawCutLines(
  grid: ReturnType<typeof snapGridInField>,
  puzzle: ShikakuPuzzle,
  tag: StudioTag,
): StudioFabricObject[] {
  const { rows, cols } = puzzle
  const { left, top, width, height } = grid.bounds
  const cell = grid.cell
  const t = CUT_THICKNESS
  const seen = new Set<string>()
  const bars: StudioFabricObject[] = []

  const colAt = (i: number): number => lineOrigin(i, cols, left, width, cell, t)
  const rowAt = (j: number): number => lineOrigin(j, rows, top, height, cell, t)

  const push = (x: number, y: number, w: number, h: number): void => {
    const key = `${x},${y},${w},${h}`
    if (seen.has(key)) return
    seen.add(key)
    bars.push(
      buildRect(
        { left: x, top: y, width: w, height: h, fill: STUDIO_INK, stroke: 'transparent', strokeWidth: 0 },
        tag,
        'answer',
      ),
    )
  }

  const vertical = (i: number, j0: number, j1: number): void => {
    const y0 = rowAt(j0)
    push(colAt(i), y0, t, rowAt(j1) + t - y0)
  }
  const horizontal = (j: number, i0: number, i1: number): void => {
    const x0 = colAt(i0)
    push(x0, rowAt(j), colAt(i1) + t - x0, t)
  }

  for (const rect of puzzle.solution as ShikakuRect[]) {
    vertical(rect.c, rect.r, rect.r + rect.h)
    vertical(rect.c + rect.w, rect.r, rect.r + rect.h)
    horizontal(rect.r, rect.c, rect.c + rect.w)
    horizontal(rect.r + rect.h, rect.c, rect.c + rect.w)
  }

  return bars
}

function drawClueNumbers(
  grid: ReturnType<typeof snapGridInField>,
  puzzle: ShikakuPuzzle,
  tag: StudioTag,
): StudioFabricObject[] {
  /**
   * Identical top-left boxes for every number — never originY:"center".
   * Centering each glyph bbox makes some digits sit higher and look larger
   * after Fabric remeasures (group children + per-glyph metrics).
   */
  const digitSize = Math.max(12, Math.round(grid.cell * 0.5))
  const boxW = grid.cell
  const boxH = digitSize
  // Nudge up: glyphs sit on the baseline in the lower part of the em box.
  const opticalLift = Math.round(digitSize * 0.08)

  return puzzle.clues.map((clue) => {
    const cell = grid.cellBox(clue.r, clue.c)
    return buildText(
      {
        left: Math.round(cell.left + (cell.width - boxW) / 2),
        top: Math.round(cell.top + (cell.height - boxH) / 2 - opticalLift),
        width: boxW,
        height: boxH,
        lineHeight: 1,
        text: String(clue.value),
        fontFamily: STUDIO_DIGIT_FONT,
        fontSize: digitSize,
        fontWeight: 'normal',
        textAlign: 'center',
        originX: 'left',
        originY: 'top',
      },
      tag,
      'prompt',
    )
  })
}

export function drawShikakuGrid(options: {
  field: Box
  puzzle: ShikakuPuzzle
  tag: StudioTag
  /**
   * Cap cell size (solution page). Keeps the grid the same size as the puzzle
   * page while still centering in a taller no-instruction body.
   */
  maxCell?: number
}): StudioFabricObject {
  const { puzzle, tag, maxCell } = options
  // Inset before fit — with a page title the body shrinks and a full-bleed
  // grid otherwise lands flush on (or past) the safe-area guide.
  const field = insetBox(options.field, FIELD_INSET)
  const { rows, cols } = puzzle
  const fittedCell = fitSquareGrid(field, cols, rows).cell
  const cell =
    maxCell !== undefined ? Math.max(1, Math.min(fittedCell, Math.floor(maxCell))) : fittedCell
  const grid = snapGridInField(field, cell, rows, cols)

  const parts: StudioFabricObject[] = [
    ...drawGridLines(grid.bounds, cell, cols, rows, tag, {
      // Bold only on the outer frame: interior indices are never 0 mod count.
      boxCols: cols,
      boxRows: rows,
    }),
    // Outlines sit under the numbers so a clue is never covered by ink.
    ...drawCutLines(grid, puzzle, tag),
    ...drawClueNumbers(grid, puzzle, tag),
  ]

  return buildGroup(parts, grid.bounds, tag)
}
