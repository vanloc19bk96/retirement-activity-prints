import type { StudioFabricObject } from '@/types/studio-template.types'
import {
  insetBox,
  fitSquareGrid,
  boxCenterX,
  boxCenterY,
  estimateTextBoxWidth,
  type Box,
} from '../studio-layout'
import {
  buildText,
  buildRect,
  buildGroup,
  type StudioTag,
} from '../studio-fabric-builders'
import { STUDIO_PAPER, STUDIO_DIGIT_FONT } from '@/constants/studio.constants'
import {
  TEXT_PAINT_HEIGHT_RATIO,
  drawWhiteCellEdges,
  occupiedLattice,
  paintBoxHeight,
  sliceOccupied,
  snapGridInField,
  type GridVAlign,
} from '../_shared/lattice-grid'
import type { CrosswordBuild, CrosswordEntry } from './types'
import { drawClueLists } from './draw-clues'

const GRID_LIST_GAP = 16
const LETTER_CELL_RATIO = 0.4
const NUMBER_CELL_RATIO = 0.16
const NUMBER_PAD_X_RATIO = 0.1
const NUMBER_PAD_Y_RATIO = 0.05
const NUMBER_LETTER_GAP = 2

function entryStartCells(entries: CrosswordEntry[]): CrosswordEntry[] {
  const seen = new Set<string>()
  const out: CrosswordEntry[] = []
  const sorted = [...entries].sort(
    (a, b) => a.number - b.number || a.dir.localeCompare(b.dir),
  )
  for (const e of sorted) {
    const key = `${e.r},${e.c}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(e)
  }
  return out
}

function letterMetrics(cell: number, numberBand: number) {
  const bottomPad = Math.max(2, Math.round(cell * NUMBER_PAD_Y_RATIO))
  const fieldHeight = Math.max(1, cell - numberBand - bottomPad)
  const baseSize = Math.max(11, Math.floor(cell * LETTER_CELL_RATIO))
  const fitted = Math.floor(fieldHeight / TEXT_PAINT_HEIGHT_RATIO)
  const fontSize = Math.max(8, Math.min(baseSize, fitted))
  return {
    fontSize,
    boxHeight: paintBoxHeight(fontSize),
    centerOffsetY: numberBand + fieldHeight / 2 - cell / 2,
  }
}

function drawLetterGrid(
  built: CrosswordBuild,
  entries: CrosswordEntry[],
  field: Box,
  font: string,
  tag: StudioTag,
  vAlign: GridVAlign,
): StudioFabricObject {
  const gridField = insetBox(field, 4)
  const region = occupiedLattice(built.grid, built.size)
  const grid = sliceOccupied(built.grid, region)
  const floated = fitSquareGrid(gridField, region.cols, region.rows)
  const g = snapGridInField(gridField, floated.cell, region, vAlign)
  const numberSize = Math.max(7, Math.floor(g.cell * NUMBER_CELL_RATIO))
  const numberPadX = Math.max(3, Math.round(g.cell * NUMBER_PAD_X_RATIO))
  const numberPadY = Math.max(2, Math.round(g.cell * NUMBER_PAD_Y_RATIO))
  const numberBoxH = paintBoxHeight(numberSize)
  const numberBand = numberPadY + numberBoxH + NUMBER_LETTER_GAP
  const letter = letterMetrics(g.cell, numberBand)
  const parts: StudioFabricObject[] = []

  // White letter cells only — unused / separator cells stay empty (no black fill).
  for (let r = 0; r < region.rows; r++) {
    for (let c = 0; c < region.cols; c++) {
      const glyph = grid[r]![c]
      if (glyph === null) continue
      const cell = g.cellBox(r, c)
      parts.push(
        buildRect(
          {
            left: cell.left,
            top: cell.top,
            width: cell.width,
            height: cell.height,
            fill: STUDIO_PAPER,
            stroke: 'transparent',
            strokeWidth: 0,
          },
          tag,
          'structure',
        ),
      )
      parts.push(
        buildText(
          {
            left: boxCenterX(cell),
            top: boxCenterY(cell) + letter.centerOffsetY,
            text: glyph,
            fontFamily: font,
            fontSize: letter.fontSize,
            fontWeight: 'normal',
            width: estimateTextBoxWidth(glyph, letter.fontSize, cell.width),
            height: letter.boxHeight,
            textAlign: 'center',
            originX: 'center',
            originY: 'center',
            lineHeight: 1,
          },
          tag,
          'answer',
        ),
      )
    }
  }

  // Bars on top of fills so every edge keeps full Grid Copy weight.
  parts.push(...drawWhiteCellEdges(grid, g.bounds, g.cell, tag))

  for (const e of entryStartCells(entries)) {
    const cell = g.cellBox(e.r - region.minR, e.c - region.minC)
    const text = String(e.number)
    parts.push(
      buildText(
        {
          left: cell.left + numberPadX,
          top: cell.top + numberPadY,
          text,
          fontFamily: STUDIO_DIGIT_FONT,
          fontSize: numberSize,
          fontWeight: 'normal',
          width: estimateTextBoxWidth(text, numberSize, cell.width * 0.45),
          height: numberBoxH,
          originX: 'left',
          originY: 'top',
          lineHeight: 1,
        },
        tag,
        'prompt',
      ),
    )
  }

  // Shrink-wrap to occupied cells, then center that block in the field.
  return buildGroup(parts, g.bounds, tag)
}

export interface CrosswordDrawnPuzzle {
  grid: StudioFabricObject
  clues: StudioFabricObject | null
  objects: StudioFabricObject[]
}

export function drawCrosswordPuzzle(options: {
  field: Box
  built: CrosswordBuild
  entries: CrosswordEntry[]
  font: string
  tag: StudioTag
  /** Solution page: filled grid only, optically centered in the body. */
  forAnswerKey?: boolean
  /** Large-print floor is 12 pt (spec §46); standard may go lower. */
  minClueFontSize?: number
}): CrosswordDrawnPuzzle {
  const {
    field,
    built,
    entries,
    font,
    tag,
    forAnswerKey = false,
    minClueFontSize = 8,
  } = options

  if (forAnswerKey) {
    const grid = drawLetterGrid(built, entries, field, font, tag, 'center')
    return { grid, clues: null, objects: [grid] }
  }

  // Grid on top, ACROSS/DOWN clues below. Reserve more clue band as answer
  // count grows so long custom lists are not clipped.
  const clueLines = Math.max(1, Math.ceil(entries.length / 2))
  const minClueBand = Math.min(field.height * 0.48, Math.max(220, clueLines * 28))
  const maxGridShare = Math.max(field.height * 0.42, field.height - minClueBand - GRID_LIST_GAP)
  const gridShare = Math.min(field.height * 0.64, field.width, maxGridShare)
  const gridArea: Box = {
    left: field.left,
    top: field.top,
    width: field.width,
    height: gridShare,
  }
  const clueArea: Box = {
    left: field.left,
    top: field.top + gridShare + GRID_LIST_GAP,
    width: field.width,
    height: Math.max(0, field.height - gridShare - GRID_LIST_GAP),
  }

  const grid = drawLetterGrid(built, entries, gridArea, font, tag, 'top')
  const clues = drawClueLists(entries, clueArea, font, tag, minClueFontSize)
  return {
    grid,
    clues,
    objects: clues ? [grid, clues] : [grid],
  }
}
