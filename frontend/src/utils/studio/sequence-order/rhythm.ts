import { STUDIO_BODY_SIZE, STUDIO_STROKE_HAIRLINE } from '@/constants/studio.constants'
import type { SequenceAnswerFormat } from '@/types/studio-sequence.types'
import { fitListTable, fitSharedLabelSize, type ListTable } from '../list-recall/table'
import type { Box } from '../studio-layout'

/** ≈10 mm at the editor's 72 DPI coordinate space (§7.2). */
export const MIN_BOX = 28
/** Preferred label size — body scale, not oversized large-print. */
export const GRID_LABEL_SIZE = STUDIO_BODY_SIZE
/** Floor so long labels stay legible after width-fit. */
export const MIN_LABEL_SIZE = 12

const MIN_CELL_H = Math.round(GRID_LABEL_SIZE * 2.6)
/** Absolute floor so study number-boxes stay writable when the stack is dense. */
const ABS_MIN_CELL_H = MIN_BOX + 8
const BLANK_LINE_H = GRID_LABEL_SIZE * 1.75
const BLANK_GAP = 12
const MIN_BLANK_LINE_H = GRID_LABEL_SIZE * 1.15
const MIN_BLANK_GAP = 6
const SECTION_GAP = 28
const LABEL_BOX_GAP = 16
const BLANK_GAP_RATIO = BLANK_GAP / BLANK_LINE_H
/** Breathing room so outer hairline bars stay inside the safe field. */
export const STROKE_INSET = Math.ceil(STUDIO_STROKE_HAIRLINE / 2) + 1
export const CELL_PAD = 16

export interface ItemRhythm {
  count: number
  cols: number
  rows: number
  table: ListTable
  boxSize: number
  fontSize: number
  /** Max label width inside a numbered cell (after box + padding). */
  labelMaxW: number
  /** Write-list only: tops of numbered blank lines. */
  blankTops: number[]
  /** Write-list only: left edge of each blank (supports multi-column answer lines). */
  blankLefts: number[]
  blankWidth: number
}

/** Two columns once there are enough items to balance the page. */
export function sequenceColumnCount(itemCount: number): number {
  return itemCount >= 4 ? 2 : 1
}

export function numberedLabelMaxWidth(cellW: number, boxSize: number): number {
  return Math.max(40, cellW - CELL_PAD * 2 - boxSize - LABEL_BOX_GAP)
}

function blankBandHeight(rows: number, lineH: number, gap: number): number {
  if (rows <= 0) return 0
  return rows * lineH + Math.max(0, rows - 1) * gap
}

function shiftTable(table: ListTable, top: number): ListTable {
  const { left, width, height } = table.bounds
  const { cellW, cellH, cols, rows } = table
  return {
    cols,
    rows,
    cellW,
    cellH,
    bounds: { left, top, width, height },
    cellBox: (row, col) => ({
      left: left + col * cellW,
      top: top + row * cellH,
      width: cellW,
      height: cellH,
    }),
  }
}

/** Match the item grid so 8 write-list blanks stay compact instead of one tall column. */
function blankColumnCount(itemCount: number): number {
  return sequenceColumnCount(itemCount)
}

/** Scale blank line metrics so grid + blanks fit the field without dropping items. */
function resolveBlankMetrics(
  fieldHeight: number,
  gridRows: number,
  blankRows: number,
): { lineH: number; gap: number; bandH: number } {
  const gridFloor = gridRows * ABS_MIN_CELL_H
  const maxBand = Math.max(0, fieldHeight - gridFloor - SECTION_GAP)
  const unit = blankRows + Math.max(0, blankRows - 1) * BLANK_GAP_RATIO
  const comfortBand = blankBandHeight(blankRows, BLANK_LINE_H, BLANK_GAP)

  if (comfortBand <= maxBand) {
    return { lineH: BLANK_LINE_H, gap: BLANK_GAP, bandH: comfortBand }
  }

  const fittedLineH = unit > 0 ? maxBand / unit : MIN_BLANK_LINE_H
  const lineH = Math.max(MIN_BLANK_LINE_H, Math.min(BLANK_LINE_H, fittedLineH))
  const gap = Math.max(MIN_BLANK_GAP, Math.min(BLANK_GAP, lineH * BLANK_GAP_RATIO))
  return { lineH, gap, bandH: blankBandHeight(blankRows, lineH, gap) }
}

/**
 * Shared grid rhythm for the study/recall pair (list-recall / grid-copy style).
 * Always keeps the requested item count — scales cells/blanks to fit, never drops items.
 */
export function computeItemRhythm(
  body: Box,
  labels: string[],
  answerFormat: SequenceAnswerFormat,
): ItemRhythm {
  const preferredFont = GRID_LABEL_SIZE
  const preferredBox = Math.max(MIN_BOX, Math.round(preferredFont * 1.45))
  const wantsBlanks = answerFormat === 'write-list'
  const field: Box = {
    left: body.left + STROKE_INSET,
    top: body.top + STROKE_INSET,
    width: Math.max(1, body.width - STROKE_INSET * 2),
    height: Math.max(1, body.height - STROKE_INSET * 2),
  }

  const count = Math.min(8, Math.max(1, labels.length))
  const cols = sequenceColumnCount(count)
  const rows = Math.max(1, Math.ceil(count / cols))
  const blankCols = wantsBlanks ? blankColumnCount(count) : 1
  const blankRows = wantsBlanks ? Math.max(1, Math.ceil(count / blankCols)) : 0

  const blankMetrics = wantsBlanks
    ? resolveBlankMetrics(field.height, rows, blankRows)
    : { lineH: 0, gap: 0, bandH: 0 }
  const blanksReserve = wantsBlanks ? blankMetrics.bandH + SECTION_GAP : 0
  const gridHeight = Math.max(1, field.height - blanksReserve)
  const preferredCellH = Math.max(
    ABS_MIN_CELL_H,
    Math.min(MIN_CELL_H, Math.floor(gridHeight / rows)),
  )
  let table = fitListTable(
    { ...field, height: gridHeight },
    count,
    cols,
    field.width / cols,
    preferredCellH,
  )

  // Number-box budget first (tighter than plain write-list prompts).
  const labelMaxW = numberedLabelMaxWidth(table.cellW, preferredBox)
  const visibleLabels = labels.slice(0, count)
  const fontSize = fitSharedLabelSize(
    visibleLabels,
    labelMaxW,
    preferredFont,
    table.cellH,
    MIN_LABEL_SIZE,
  )
  // Keep writable boxes readable; shrink with the label when type is small.
  const boxSize = Math.max(MIN_BOX, Math.min(preferredBox, Math.round(fontSize * 1.6)))

  let blankTops: number[] = []
  let blankLefts: number[] = []
  let blankWidth = field.width

  if (wantsBlanks) {
    const stackH = table.bounds.height + SECTION_GAP + blankMetrics.bandH
    const stackTop = Math.round(field.top + Math.max(0, (field.height - stackH) / 2))
    table = shiftTable(table, stackTop)
    const blankStart = table.bounds.top + table.bounds.height + SECTION_GAP
    const bandLeft = table.bounds.left
    const bandWidth = table.bounds.width
    blankWidth = Math.floor(bandWidth / blankCols)
    const pitch = blankMetrics.lineH + blankMetrics.gap
    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / blankCols)
      const col = i % blankCols
      blankTops.push(Math.round(blankStart + row * pitch))
      blankLefts.push(Math.round(bandLeft + col * blankWidth))
    }
  } else {
    const top = Math.round(field.top + (field.height - table.bounds.height) / 2)
    table = shiftTable(table, top)
  }

  return {
    count,
    cols,
    rows: table.rows,
    table,
    boxSize,
    fontSize,
    labelMaxW: numberedLabelMaxWidth(table.cellW, boxSize),
    blankTops,
    blankLefts,
    blankWidth,
  }
}
