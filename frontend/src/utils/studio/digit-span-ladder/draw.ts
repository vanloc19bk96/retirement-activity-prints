import type { StudioFabricObject } from '@/types/studio-template.types'
import {
  splitTop,
  boxCenterX,
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
import {
  type Rung,
  type DigitSpanDirection,
  formatDigits,
  directionBanner,
} from './ladder'

const BANNER_SIZE = STUDIO_BODY_SIZE * 0.7
const BANNER_H = BANNER_SIZE + 8
/** Extra space between the direction banner and the ladder grid. */
const BANNER_GAP = 28
/**
 * Breathing room from safe edges + hairline clearance.
 * Matches grid-copy / list-recall so outer bars never sit flush on the margin.
 */
export const LADDER_STROKE_INSET = 16
const HEADER_ROWS = 1
const CELL_PAD = 12
const DIGIT_SIZE = STUDIO_BODY_SIZE * 0.9
const MIN_DIGIT_SIZE = 12
const LABEL_SIZE = STUDIO_BODY_SIZE * 0.65
const MIN_ROW_H = 34
const PREFERRED_ROW_H = STUDIO_BODY_SIZE * 2.2

/** Vertical space the banner takes before the ladder grid. */
export function measureLadderChromeHeight(): number {
  return BANNER_H + BANNER_GAP
}

/** Max data rows that fit in `bodyHeight` with header row + stroke inset. */
export function maxLadderDataRows(bodyHeight: number): number {
  const fieldH = Math.max(0, bodyHeight - LADDER_STROKE_INSET * 2)
  const totalRows = Math.floor(fieldH / MIN_ROW_H)
  return Math.max(1, totalRows - HEADER_ROWS)
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

interface LadderTable {
  cols: number
  rows: number
  cellW: number
  cellH: number
  bounds: Box
  cellBox: (row: number, col: number) => Box
}

/** Centered 2-col (or 1-col) table — integer cells, re-centered in field. */
function fitLadderTable(field: Box, dataRows: number, cols: number): LadderTable {
  const rows = Math.max(1, dataRows) + HEADER_ROWS
  const cellW = Math.max(1, Math.floor(field.width / cols))
  const cellH = Math.max(
    MIN_ROW_H,
    Math.floor(Math.min(PREFERRED_ROW_H, field.height / rows)),
  )
  const gridW = cellW * cols
  const gridH = cellH * rows
  const left = Math.round(field.left + (field.width - gridW) / 2)
  const top = Math.round(field.top + (field.height - gridH) / 2)
  return {
    cols,
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

export function pushBanner(
  objects: StudioFabricObject[],
  area: Box,
  direction: DigitSpanDirection,
  font: string,
  tag: StudioTag,
): Box {
  const [banner, afterBanner] = splitTop(area, BANNER_H)
  // NBSP — bold banner metrics under-estimate and soft-wrap at spaces.
  const text = toNonBreakingSpaces(directionBanner(direction))
  objects.push(
    buildText(
      {
        left: boxCenterX(banner),
        top: boxCenterY(banner) - BANNER_SIZE * 0.4,
        text,
        width: estimateTextBoxWidth(text, BANNER_SIZE, banner.width),
        fontFamily: font,
        fontSize: BANNER_SIZE,
        fontWeight: 700,
        fill: STUDIO_INK_MUTED,
        textAlign: 'center',
        originX: 'center',
      },
      tag,
      'decoration',
    ),
  )
  const [, body] = splitTop(afterBanner, BANNER_GAP)
  return body
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

function digitFontSize(digits: number[], cell: Box): number {
  const raw = formatDigits(digits)
  const maxW = Math.max(24, cell.width - CELL_PAD * 2)
  return Math.min(fitDigitSize(raw, maxW), Math.floor(cell.height * 0.55))
}

/** Bottom of the vertically-centered digit run — writing line shares this Y. */
function digitBaselineY(cell: Box, fontSize: number): number {
  return Math.round(boxCenterY(cell) + fontSize / 2)
}

/** Writing rule — same bar stroke/color as grid-copy; sits on the digit baseline. */
function pushAnswerLine(
  objects: StudioFabricObject[],
  cell: Box,
  tag: StudioTag,
  fontSize: number,
): void {
  const thickness = STUDIO_STROKE_HAIRLINE
  const width = Math.max(1, cell.width - CELL_PAD * 2)
  const left = cell.left + CELL_PAD
  const top = digitBaselineY(cell, fontSize) - thickness
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

function pushSequenceText(
  objects: StudioFabricObject[],
  cell: Box,
  digits: number[],
  tag: StudioTag,
  fontSize: number,
): void {
  const raw = formatDigits(digits)
  const maxW = Math.max(24, cell.width - CELL_PAD * 2)
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

/**
 * Cover / recall ladder: grid-copy style bars, 2 cols × n data rows
 * (Sequence | Your answer), header row included. Everything inset for stroke clearance.
 */
export function pushLadderGrid(
  objects: StudioFabricObject[],
  area: Box,
  rungs: Rung[],
  font: string,
  tag: StudioTag,
  options: { showSequence: boolean },
): void {
  const field = insetBox(area, LADDER_STROKE_INSET)
  const cols = options.showSequence ? 2 : 1
  const table = fitLadderTable(field, rungs.length, cols)
  const gridObjects: StudioFabricObject[] = []

  if (options.showSequence) {
    pushHeaderLabel(gridObjects, table.cellBox(0, 0), 'Sequence', font, tag)
    pushHeaderLabel(gridObjects, table.cellBox(0, 1), 'Your answer', font, tag)
  } else {
    pushHeaderLabel(gridObjects, table.cellBox(0, 0), 'Your answer', font, tag)
  }

  for (let i = 0; i < rungs.length; i++) {
    const row = i + HEADER_ROWS
    const rung = rungs[i]
    if (!rung) continue
    if (options.showSequence) {
      const seqCell = table.cellBox(row, 0)
      const fontSize = digitFontSize(rung.digits, seqCell)
      pushSequenceText(gridObjects, seqCell, rung.digits, tag, fontSize)
      pushAnswerLine(gridObjects, table.cellBox(row, 1), tag, fontSize)
    } else {
      const ansCell = table.cellBox(row, 0)
      const fontSize = Math.min(DIGIT_SIZE, Math.floor(ansCell.height * 0.55))
      pushAnswerLine(gridObjects, ansCell, tag, fontSize)
    }
  }

  gridObjects.push(
    ...drawGridLines(table.bounds, table.cellW, table.cols, table.rows, tag, {
      rowPitch: table.cellH,
    }),
  )
  objects.push(buildGroup(gridObjects, table.bounds, tag))
}
