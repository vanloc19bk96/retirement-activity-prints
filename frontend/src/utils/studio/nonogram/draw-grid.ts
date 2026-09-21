import type { StudioFabricObject } from '@/types/studio-template.types'
import {
  estimateTextBoxWidth,
  insetBox,
  boxCenterX,
  boxCenterY,
  type Box,
} from '../studio-layout'
import { buildRect, buildText, buildGroup, type StudioTag } from '../studio-fabric-builders'
import {
  STUDIO_INK,
  STUDIO_RULE_MEDIUM,
  STUDIO_STROKE_HAIRLINE,
  STUDIO_STROKE_BOLD,
  STUDIO_DIGIT_FONT,
} from '@/constants/studio.constants'
import type { NonogramPuzzle } from './types'

/** Breathing room from safe edges — same as Hitori / Number Snake. */
const FIELD_INSET = 16

const BAND = 5

function ruleBar(
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

function lineThickness(index: number, size: number): number {
  if (index === 0 || index === size) return STUDIO_STROKE_BOLD
  if (index % BAND === 0) return STUDIO_STROKE_BOLD
  return STUDIO_STROKE_HAIRLINE
}

function snapPuzzleInField(
  field: Box,
  size: number,
  maxRowClue: number,
  maxColClue: number,
) {
  const totalCols = size + maxRowClue
  const totalRows = size + maxColClue
  const cell = Math.floor(
    Math.min(field.width / totalCols, field.height / totalRows),
  )
  const puzzleW = cell * totalCols
  const puzzleH = cell * totalRows
  const left = Math.round(field.left + (field.width - puzzleW) / 2)
  const top = Math.round(field.top + (field.height - puzzleH) / 2)
  const gridLeft = left + maxRowClue * cell
  const gridTop = top + maxColClue * cell
  const gridBounds: Box = {
    left: gridLeft,
    top: gridTop,
    width: cell * size,
    height: cell * size,
  }
  return {
    cell,
    left,
    top,
    gridLeft,
    gridTop,
    gridBounds,
    cellBox: (r: number, c: number): Box => ({
      left: gridLeft + c * cell,
      top: gridTop + r * cell,
      width: cell,
      height: cell,
    }),
  }
}

function drawGridBars(
  g: ReturnType<typeof snapPuzzleInField>,
  size: number,
  tag: StudioTag,
): StudioFabricObject[] {
  const bars: StudioFabricObject[] = []
  const { left, top, width, height } = g.gridBounds
  const cell = g.cell

  for (let line = 0; line <= size; line++) {
    const thickness = lineThickness(line, size)
    bars.push(
      ruleBar(
        barOrigin(line, size, left, width, cell, thickness),
        top,
        thickness,
        height,
        tag,
      ),
    )
  }

  for (let line = 0; line <= size; line++) {
    const thickness = lineThickness(line, size)
    bars.push(
      ruleBar(
        left,
        barOrigin(line, size, top, height, cell, thickness),
        width,
        thickness,
        tag,
      ),
    )
  }

  return bars
}

export function drawNonogramGrid(options: {
  field: Box
  puzzle: NonogramPuzzle
  tag: StudioTag
}): StudioFabricObject {
  const { puzzle, tag } = options
  // Inset so clue digits + grid never sit flush on the safe-area guide (title shrinks body).
  const field = insetBox(options.field, FIELD_INSET)
  const { size, bitmap, rowClues, colClues } = puzzle
  const maxRowClue = Math.max(...rowClues.map((c) => c.length))
  const maxColClue = Math.max(...colClues.map((c) => c.length))

  const g = snapPuzzleInField(field, size, maxRowClue, maxColClue)
  const parts: StudioFabricObject[] = [...drawGridBars(g, size, tag)]

  const clueSize = Math.max(9, Math.round(g.cell * 0.42))
  const inset = Math.max(1, Math.round(g.cell * 0.12))

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!bitmap[r]![c]) continue
      const cell = g.cellBox(r, c)
      parts.push(
        buildRect(
          {
            left: cell.left + inset,
            top: cell.top + inset,
            width: cell.width - inset * 2,
            height: cell.height - inset * 2,
            fill: STUDIO_INK,
            stroke: 'transparent',
            strokeWidth: 0,
          },
          tag,
          'answer',
        ),
      )
    }
  }

  rowClues.forEach((clue, r) => {
    const rowBox = g.cellBox(r, 0)
    clue.forEach((num, i) => {
      const slot = clue.length - i
      const text = String(num)
      const cx = g.gridLeft - slot * g.cell + g.cell / 2
      parts.push(
        buildText(
          {
            left: Math.round(cx),
            top: Math.round(boxCenterY(rowBox)),
            text,
            fontFamily: STUDIO_DIGIT_FONT,
            fontSize: clueSize,
            fontWeight: 'normal',
            textAlign: 'center',
            originX: 'center',
            originY: 'center',
            width: estimateTextBoxWidth(text, clueSize, g.cell),
          },
          tag,
          'prompt',
        ),
      )
    })
  })

  colClues.forEach((clue, c) => {
    const colBox = g.cellBox(0, c)
    clue.forEach((num, i) => {
      const slot = clue.length - i
      const text = String(num)
      const cy = g.gridTop - slot * g.cell + g.cell / 2
      parts.push(
        buildText(
          {
            left: Math.round(boxCenterX(colBox)),
            top: Math.round(cy),
            text,
            fontFamily: STUDIO_DIGIT_FONT,
            fontSize: clueSize,
            fontWeight: 'normal',
            textAlign: 'center',
            originX: 'center',
            originY: 'center',
            width: estimateTextBoxWidth(text, clueSize, g.cell),
          },
          tag,
          'prompt',
        ),
      )
    })
  })

  // Geometric block (clue gutters + grid), not text extents — keeps center stable.
  const groupBounds: Box = {
    left: g.left,
    top: g.top,
    width: g.cell * (size + maxRowClue),
    height: g.cell * (size + maxColClue),
  }
  return buildGroup(parts, groupBounds, tag)
}
