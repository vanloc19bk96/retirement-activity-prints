import type { StudioFabricObject } from '@/types/studio-template.types'
import {
  boxCenterY,
  estimateTextBoxWidth,
  estimateSpacedRunWidth,
  insetBox,
  toNonBreakingSpaces,
  type Box,
} from '../studio-layout'
import { buildText, buildRect, buildGroup, type StudioTag } from '../studio-fabric-builders'
import { drawGridLines } from '../studio-grid-rules'
import {
  STUDIO_INK_MUTED,
  STUDIO_RULE_MEDIUM,
  STUDIO_STROKE_HAIRLINE,
  STUDIO_BODY_SIZE,
  STUDIO_DIGIT_FONT,
} from '@/constants/studio.constants'
import { type Rung, formatDigits } from './ladder'
import { LADDER_STROKE_INSET } from './draw'

const CELL_PAD = 12
const HEADER_ROWS = 1
const PREFERRED_CELL_H = STUDIO_BODY_SIZE * 2.2
const MIN_CELL_H = 34
const DIGIT_SIZE = STUDIO_BODY_SIZE * 0.9
const MIN_DIGIT_SIZE = 12
const LABEL_SIZE = STUDIO_BODY_SIZE * 0.65
/** Max columns for study/recall; never more columns than sequences. */
const SPREAD_MAX_COLS = 2

type SpreadMode = 'study' | 'recall'

interface SpreadTable {
  cols: number
  dataRows: number
  rows: number
  cellW: number
  cellH: number
  bounds: Box
  cellBox: (row: number, col: number) => Box
}

/** Study & recall share this so pages mirror — 1 sequence → 1 col (no empty column). */
export function spreadCols(rungCount: number): number {
  return Math.min(SPREAD_MAX_COLS, Math.max(1, rungCount))
}

function fitDigitSize(text: string, maxWidth: number): number {
  if (maxWidth <= 0) return MIN_DIGIT_SIZE
  let units = 0
  for (const ch of text) {
    units += ch === ' ' || ch === '\u00a0' ? 0.3 : 0.62
  }
  const fitted = (maxWidth - 4) / Math.max(units, 1)
  return Math.max(MIN_DIGIT_SIZE, Math.min(DIGIT_SIZE, fitted))
}

/** Same geometry for study and recall — column-major, header row. */
function fitSpreadTable(field: Box, rungCount: number): SpreadTable {
  const cols = spreadCols(rungCount)
  const dataRows = Math.max(1, Math.ceil(rungCount / cols))
  const rows = dataRows + HEADER_ROWS
  const cellW = Math.max(1, Math.floor(field.width / cols))
  const cellH = Math.max(
    MIN_CELL_H,
    Math.floor(Math.min(PREFERRED_CELL_H, field.height / rows)),
  )
  const gridW = cellW * cols
  const gridH = cellH * rows
  const left = Math.round(field.left + (field.width - gridW) / 2)
  const top = Math.round(field.top + (field.height - gridH) / 2)
  return {
    cols,
    dataRows,
    rows,
    cellW,
    cellH,
    bounds: { left, top, width: gridW, height: gridH },
    cellBox: (row, col) => ({
      left: left + col * cellW,
      top: top + row * cellH,
      width: cellW,
      height: cellH,
    }),
  }
}

function pushHeaderLabel(
  objects: StudioFabricObject[],
  cell: Box,
  label: string,
  font: string,
  tag: StudioTag,
): void {
  objects.push(
    buildText(
      {
        left: cell.left + CELL_PAD,
        top: boxCenterY(cell) - LABEL_SIZE * 0.4,
        text: label,
        width: estimateTextBoxWidth(label, LABEL_SIZE, cell.width - CELL_PAD * 2),
        fontFamily: font,
        fontSize: LABEL_SIZE,
        fill: STUDIO_INK_MUTED,
      },
      tag,
      'decoration',
    ),
  )
}

function pushRungDigits(
  objects: StudioFabricObject[],
  cell: Box,
  rung: Rung,
  tag: StudioTag,
): void {
  const raw = formatDigits(rung.digits)
  const maxW = Math.max(24, cell.width - CELL_PAD * 2)
  const fontSize = Math.min(fitDigitSize(raw, maxW), Math.floor(cell.height * 0.55))
  const text = toNonBreakingSpaces(raw)
  objects.push(
    buildText(
      {
        left: cell.left + CELL_PAD,
        top: boxCenterY(cell) - fontSize / 2,
        text,
        width: estimateSpacedRunWidth(text, fontSize, maxW),
        fontFamily: STUDIO_DIGIT_FONT,
        fontSize,
        fontWeight: 'normal',
      },
      tag,
      'prompt',
    ),
  )
}

/** Writing rule on the digit baseline (same stroke/color as grid-copy bars). */
function pushAnswerLine(objects: StudioFabricObject[], cell: Box, tag: StudioTag): void {
  const fontSize = Math.min(DIGIT_SIZE, Math.floor(cell.height * 0.55))
  const thickness = STUDIO_STROKE_HAIRLINE
  const width = Math.max(1, cell.width - CELL_PAD * 2)
  const left = cell.left + CELL_PAD
  const top = Math.round(boxCenterY(cell) + fontSize / 2) - thickness
  objects.push(
    buildRect(
      {
        left,
        top,
        width,
        height: thickness,
        fill: STUDIO_RULE_MEDIUM,
        stroke: 'transparent',
        strokeWidth: 0,
      },
      tag,
      'structure',
    ),
  )
}

/**
 * Study / recall: identical grid (column-major). Cols = min(2, rungCount).
 * Study fills cells with sequences; recall fills the same cells with writing lines.
 */
function pushSpreadTable(
  objects: StudioFabricObject[],
  area: Box,
  rungs: Rung[],
  font: string,
  tag: StudioTag,
  mode: SpreadMode,
): void {
  const field = insetBox(area, LADDER_STROKE_INSET)
  const table = fitSpreadTable(field, rungs.length)
  const headerLabel = mode === 'study' ? 'Sequence' : 'Your answer'
  const gridObjects: StudioFabricObject[] = []

  for (let c = 0; c < table.cols; c++) {
    pushHeaderLabel(gridObjects, table.cellBox(0, c), headerLabel, font, tag)
  }

  // Column-major: finish the left ladder before the right column.
  for (let c = 0; c < table.cols; c++) {
    for (let r = 0; r < table.dataRows; r++) {
      const rung = rungs[c * table.dataRows + r]
      const cell = table.cellBox(r + HEADER_ROWS, c)
      if (!rung) continue
      if (mode === 'study') pushRungDigits(gridObjects, cell, rung, tag)
      else pushAnswerLine(gridObjects, cell, tag)
    }
  }

  gridObjects.push(
    ...drawGridLines(table.bounds, table.cellW, table.cols, table.rows, tag, {
      rowPitch: table.cellH,
    }),
  )
  objects.push(buildGroup(gridObjects, table.bounds, tag))
}

export function pushStudyTable(
  objects: StudioFabricObject[],
  area: Box,
  rungs: Rung[],
  font: string,
  tag: StudioTag,
): void {
  pushSpreadTable(objects, area, rungs, font, tag, 'study')
}

export function pushRecallTable(
  objects: StudioFabricObject[],
  area: Box,
  rungs: Rung[],
  font: string,
  tag: StudioTag,
): void {
  pushSpreadTable(objects, area, rungs, font, tag, 'recall')
}
