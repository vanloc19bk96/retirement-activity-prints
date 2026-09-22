import type { StudioFabricObject } from '@/types/studio-template.types'
import {
  boxCenterX,
  boxCenterY,
  insetBox,
  type Box,
} from '../studio-layout'
import {
  buildText,
  buildRect,
  buildGroup,
  type StudioTag,
} from '../studio-fabric-builders'
import { STUDIO_PAPER, STUDIO_DIGIT_FONT } from '@/constants/studio.constants'
import { hugTextBoxWidth } from '../studio-text-metrics'
import {
  TEXT_PAINT_HEIGHT_RATIO,
  drawWhiteCellEdges,
  occupiedLattice,
  paintBoxHeight,
  sliceOccupied,
  snapGridInField,
  type GridVAlign,
} from '../_shared/lattice-grid'
import {
  GRID_CLUE_GAP,
  GRID_LETTER_RATIO,
  GRID_MIN_CELL,
  type CrosswordPagePlan,
} from './layout'
import { drawClueLists, planClueLists, type ClueListsPlan } from './draw-clues'
import type { CrosswordBuild, CrosswordEntry } from './types'

/** Clue number as a share of the cell, and its padding inside the corner. */
const NUMBER_CELL_RATIO = 0.2
const NUMBER_MIN_SIZE = 9
const NUMBER_PAD_X_RATIO = 0.1
const NUMBER_PAD_Y_RATIO = 0.06
const NUMBER_LETTER_GAP = 2
/** Keeps the grid off the column edges so a bar never sits on the safe area. */
const GRID_FIELD_INSET = 2

function entryStartCells(entries: CrosswordEntry[]): CrosswordEntry[] {
  const seen = new Set<string>()
  const out: CrosswordEntry[] = []
  const sorted = [...entries].sort(
    (a, b) => a.number - b.number || a.dir.localeCompare(b.dir),
  )
  for (const entry of sorted) {
    const key = `${entry.r},${entry.c}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(entry)
  }
  return out
}

function letterMetrics(cell: number, numberBand: number) {
  const bottomPad = Math.max(2, Math.round(cell * NUMBER_PAD_Y_RATIO))
  const fieldHeight = Math.max(1, cell - numberBand - bottomPad)
  const preferred = Math.floor(cell * GRID_LETTER_RATIO)
  const fitted = Math.floor(fieldHeight / TEXT_PAINT_HEIGHT_RATIO)
  const fontSize = Math.max(8, Math.min(preferred, fitted))
  return {
    fontSize,
    boxHeight: paintBoxHeight(fontSize),
    centerOffsetY: numberBand + fieldHeight / 2 - cell / 2,
  }
}

export interface CrosswordGridGeometry {
  cell: number
  rows: number
  cols: number
  /** Box the drawn grid group occupies. */
  bounds: Box
}

/**
 * Largest cell the field allows for this build, never above `maxCell`.
 * The build is cropped to its used cells, so a sparse grid gets bigger squares
 * rather than a square field with empty rows in it.
 */
export function crosswordGridGeometry(
  built: CrosswordBuild,
  field: Box,
  maxCell: number,
  vAlign: GridVAlign,
): CrosswordGridGeometry {
  const gridField = insetBox(field, GRID_FIELD_INSET)
  const region = occupiedLattice(built.grid, built.size)
  const cell = Math.max(
    1,
    Math.floor(
      Math.min(gridField.width / region.cols, gridField.height / region.rows, maxCell),
    ),
  )
  const snapped = snapGridInField(gridField, cell, region, vAlign)
  return { cell, rows: region.rows, cols: region.cols, bounds: snapped.bounds }
}

function drawLetterGrid(options: {
  built: CrosswordBuild
  entries: CrosswordEntry[]
  field: Box
  font: string
  tag: StudioTag
  maxCell: number
  vAlign: GridVAlign
}): StudioFabricObject {
  const { built, entries, field, font, tag, maxCell, vAlign } = options
  const gridField = insetBox(field, GRID_FIELD_INSET)
  const region = occupiedLattice(built.grid, built.size)
  const grid = sliceOccupied(built.grid, region)
  const geometry = crosswordGridGeometry(built, field, maxCell, vAlign)
  const snapped = snapGridInField(gridField, geometry.cell, region, vAlign)

  const numberSize = Math.max(
    NUMBER_MIN_SIZE,
    Math.floor(geometry.cell * NUMBER_CELL_RATIO),
  )
  const numberPadX = Math.max(3, Math.round(geometry.cell * NUMBER_PAD_X_RATIO))
  const numberPadY = Math.max(2, Math.round(geometry.cell * NUMBER_PAD_Y_RATIO))
  const numberBoxH = paintBoxHeight(numberSize)
  const numberBand = numberPadY + numberBoxH + NUMBER_LETTER_GAP
  const letter = letterMetrics(geometry.cell, numberBand)
  const parts: StudioFabricObject[] = []

  // White answer cells only — an unused cell stays paper, never a black square.
  // Solid black squares double the ink on an interior page and read as heavy
  // in print-on-demand; an open lattice is also the friendlier page to solve.
  for (let r = 0; r < region.rows; r++) {
    for (let c = 0; c < region.cols; c++) {
      const glyph = grid[r]![c]
      if (glyph === null) continue
      const cell = snapped.cellBox(r, c)
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
            width: hugTextBoxWidth(glyph, letter.fontSize, cell.width, {
              fontFamily: font,
            }),
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

  // Bars on top of the fills so every edge keeps the same weight.
  parts.push(...drawWhiteCellEdges(grid, snapped.bounds, geometry.cell, tag))

  for (const entry of entryStartCells(entries)) {
    const cell = snapped.cellBox(entry.r - region.minR, entry.c - region.minC)
    const text = String(entry.number)
    parts.push(
      buildText(
        {
          left: cell.left + numberPadX,
          top: cell.top + numberPadY,
          text,
          fontFamily: STUDIO_DIGIT_FONT,
          fontSize: numberSize,
          fontWeight: 'normal',
          width: hugTextBoxWidth(text, numberSize, cell.width * 0.5, {
            fontFamily: STUDIO_DIGIT_FONT,
          }),
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

  return buildGroup(parts, snapped.bounds, tag)
}

export interface CrosswordDrawnPuzzle {
  objects: StudioFabricObject[]
  /** Null on the solution page, which prints the filled grid alone. */
  clues: ClueListsPlan | null
}

/**
 * Grid over clues, as one optically centred stack.
 *
 * The clue list is measured first because it is the block with a hard floor —
 * it may not set below large print — and the grid then takes what is left.
 * Sizing the grid first and letting the clues have the remainder is what used
 * to push clue type down to nine point on a full page.
 */
export function drawCrosswordPuzzle(options: {
  field: Box
  built: CrosswordBuild
  entries: CrosswordEntry[]
  font: string
  tag: StudioTag
  plan: CrosswordPagePlan
  /** Solution page: the filled grid alone, centred in the body. */
  forAnswerKey?: boolean
}): CrosswordDrawnPuzzle {
  const { field, built, entries, font, tag, plan, forAnswerKey = false } = options

  if (forAnswerKey) {
    // Nothing shares the page, so the solution grid may use the whole column.
    return {
      objects: [
        drawLetterGrid({
          built,
          entries,
          field,
          font,
          tag,
          maxCell: Math.max(GRID_MIN_CELL, Math.floor(field.width / 6)),
          vAlign: 'center',
        }),
      ],
      clues: null,
    }
  }

  const region = occupiedLattice(built.grid, built.size)
  // Reserve what the grid needs *before* offering the rest to the clue lists,
  // inset included — the two pixels the lattice gives up to the field edge are
  // what put a cell a hair under the writable floor.
  const clueBudget = Math.max(
    0,
    field.height -
      (region.rows * GRID_MIN_CELL + GRID_FIELD_INSET * 2) -
      GRID_CLUE_GAP,
  )
  const cluePlan = planClueLists({
    entries,
    width: field.width,
    maxHeight: clueBudget,
    font,
    preferredFontSize: plan.clueFontSize,
  })
  const clueHeight = cluePlan ? cluePlan.height : 0
  const gap = cluePlan ? GRID_CLUE_GAP : 0

  const gridField: Box = {
    ...field,
    height: Math.max(GRID_MIN_CELL + GRID_FIELD_INSET * 2, field.height - clueHeight - gap),
  }
  const geometry = crosswordGridGeometry(built, gridField, plan.gridCell, 'top')

  // Centre the whole stack, so a compact grid does not leave the page bottom-heavy.
  const stackHeight = geometry.bounds.height + gap + clueHeight
  const offsetY = Math.max(0, Math.floor((field.height - stackHeight) / 2))

  const grid = drawLetterGrid({
    built,
    entries,
    field: { ...gridField, top: field.top + offsetY },
    font,
    tag,
    maxCell: plan.gridCell,
    vAlign: 'top',
  })

  if (!cluePlan) return { objects: [grid], clues: null }

  const clues = drawClueLists(
    cluePlan,
    {
      left: field.left,
      top: field.top + offsetY + geometry.bounds.height + gap,
      width: field.width,
      height: clueHeight,
    },
    font,
    tag,
  )
  return { objects: [grid, ...clues], clues: cluePlan }
}
