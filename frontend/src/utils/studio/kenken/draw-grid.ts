import type { StudioFabricObject } from '@/types/studio-template.types'
import {
  fitSquareGrid,
  insetBox,
  unionObjectBounds,
  estimateTextBoxWidth,
  boxCenterX,
  boxCenterY,
  type Box,
} from '../studio-layout'
import { buildRect, buildText, buildGroup, type StudioTag } from '../studio-fabric-builders'
import {
  STUDIO_RULE_MEDIUM,
  STUDIO_STROKE_HAIRLINE,
  STUDIO_DIGIT_FONT,
} from '@/constants/studio.constants'
import type { CalcudokuPuzzle, Cell, Op } from './types'

/** Breathing room from safe edges — same as Hitori / Number Snake. */
const FIELD_INSET = 16

/** Cage / outer frame — heavier than shared STUDIO_STROKE_BOLD so cages read clearly. */
const CAGE_STROKE = 5

const OP_GLYPH: Record<Op, string> = {
  add: '+',
  sub: '−',
  mul: '×',
  div: '÷',
  none: '',
}

function topLeftCell(cells: Cell[]): Cell {
  return cells.reduce((best, cell) => {
    if (cell.r < best.r) return cell
    if (cell.r === best.r && cell.c < best.c) return cell
    return best
  })
}

function cageLabel(op: Op, target: number): string {
  return op === 'none' ? String(target) : `${target}${OP_GLYPH[op]}`
}

function inkBar(
  left: number,
  top: number,
  width: number,
  height: number,
  tag: StudioTag,
): StudioFabricObject {
  return buildRect(
    {
      left,
      top,
      width,
      height,
      // Match Grid Copy / drawGridLines default — mid gray, not pure black.
      fill: STUDIO_RULE_MEDIUM,
      stroke: 'transparent',
      strokeWidth: 0,
    },
    tag,
    'structure',
  )
}

/** Integer-aligned grid re-centered in `field`. */
function snapGridInField(field: Box, cell: number, size: number) {
  const width = cell * size
  const height = cell * size
  const left = Math.round(field.left + (field.width - width) / 2)
  const top = Math.round(field.top + (field.height - height) / 2)
  const bounds: Box = { left, top, width, height }
  return {
    cell,
    bounds,
    cellBox: (r: number, c: number): Box => ({
      left: left + c * cell,
      top: top + r * cell,
      width: cell,
      height: cell,
    }),
  }
}

/** Keep outer bars flush inside bounds; center internal bars on the grid line. */
function barOrigin(
  index: number,
  count: number,
  start: number,
  span: number,
  step: number,
  thickness: number,
): number {
  if (index === 0) return start
  if (index === count) return start + span - thickness
  return start + index * step - Math.floor(thickness / 2)
}

function verticalEdgeThickness(
  line: number,
  row: number,
  size: number,
  cageOf: number[][],
): number {
  if (line === 0 || line === size) return CAGE_STROKE
  return cageOf[row]![line - 1] === cageOf[row]![line]
    ? STUDIO_STROKE_HAIRLINE
    : CAGE_STROKE
}

function horizontalEdgeThickness(
  line: number,
  col: number,
  size: number,
  cageOf: number[][],
): number {
  if (line === 0 || line === size) return CAGE_STROKE
  return cageOf[line - 1]![col] === cageOf[line]![col]
    ? STUDIO_STROKE_HAIRLINE
    : CAGE_STROKE
}

/**
 * One bar per continuous run on each grid line — never per-cell segments that
 * abut and double-paint at seams (that made some edges look thicker).
 */
function drawCageGrid(
  g: ReturnType<typeof snapGridInField>,
  size: number,
  cageOf: number[][],
  tag: StudioTag,
): StudioFabricObject[] {
  const bars: StudioFabricObject[] = []
  const { left, top, width, height } = g.bounds
  const cell = g.cell

  for (let line = 0; line <= size; line++) {
    let row = 0
    while (row < size) {
      const thickness = verticalEdgeThickness(line, row, size, cageOf)
      let end = row + 1
      while (
        end < size &&
        verticalEdgeThickness(line, end, size, cageOf) === thickness
      ) {
        end++
      }
      bars.push(
        inkBar(
          barOrigin(line, size, left, width, cell, thickness),
          top + row * cell,
          thickness,
          (end - row) * cell,
          tag,
        ),
      )
      row = end
    }
  }

  for (let line = 0; line <= size; line++) {
    let col = 0
    while (col < size) {
      const thickness = horizontalEdgeThickness(line, col, size, cageOf)
      let end = col + 1
      while (
        end < size &&
        horizontalEdgeThickness(line, end, size, cageOf) === thickness
      ) {
        end++
      }
      bars.push(
        inkBar(
          left + col * cell,
          barOrigin(line, size, top, height, cell, thickness),
          (end - col) * cell,
          thickness,
          tag,
        ),
      )
      col = end
    }
  }

  return bars
}

export function drawKenkenGrid(options: {
  field: Box
  puzzle: CalcudokuPuzzle
  tag: StudioTag
}): StudioFabricObject {
  const { puzzle, tag } = options
  // Inset so thick cage bars never sit flush on the safe-area guide (title shrinks body).
  const field = insetBox(options.field, FIELD_INSET)
  const { size, cages, solution, cageOf } = puzzle
  const fitted = fitSquareGrid(field, size, size)
  const g = snapGridInField(field, fitted.cell, size)
  const parts: StudioFabricObject[] = [...drawCageGrid(g, size, cageOf, tag)]

  const labelSize = Math.max(10, Math.round(g.cell * 0.22))
  for (const cage of cages) {
    const tl = topLeftCell(cage.cells)
    const cellBox = g.cellBox(tl.r, tl.c)
    const text = cageLabel(cage.op, cage.target)
    parts.push(
      buildText(
        {
          left: cellBox.left + Math.max(4, Math.round(g.cell * 0.08)),
          top: cellBox.top + Math.max(3, Math.round(g.cell * 0.06)),
          text,
          fontFamily: STUDIO_DIGIT_FONT,
          fontSize: labelSize,
          fontWeight: 'normal',
          originX: 'left',
          originY: 'top',
          width: estimateTextBoxWidth(text, labelSize, cellBox.width * 0.9),
        },
        tag,
        'prompt',
      ),
    )
  }

  const digitSize = Math.round(g.cell * 0.48)
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const cellBox = g.cellBox(r, c)
      const text = String(solution[r]![c])
      parts.push(
        buildText(
          {
            left: Math.round(boxCenterX(cellBox)),
            top: Math.round(boxCenterY(cellBox)),
            text,
            fontFamily: STUDIO_DIGIT_FONT,
            fontSize: digitSize,
            fontWeight: 'normal',
            textAlign: 'center',
            originX: 'center',
            originY: 'center',
            width: estimateTextBoxWidth(text, digitSize, cellBox.width),
          },
          tag,
          'answer',
        ),
      )
    }
  }

  const groupBounds = unionObjectBounds(parts) ?? g.bounds
  return buildGroup(parts, groupBounds, tag)
}
