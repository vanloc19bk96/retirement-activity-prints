import type { StudioFabricObject } from '@/types/studio-template.types'
import {
  boxCenterX,
  boxCenterY,
  estimateTextBoxWidth,
  estimateSpacedRunWidth,
  fitFontSizeToWidth,
  insetBox,
  toNonBreakingSpaces,
  type Box,
} from '../studio-layout'
import {
  buildText,
  buildLine,
  buildGroup,
  type StudioTag,
} from '../studio-fabric-builders'
import { drawGridLines } from '../studio-grid-rules'
import {
  STUDIO_BODY_SIZE,
  STUDIO_INK_MUTED,
  STUDIO_RULE_MEDIUM,
  STUDIO_STROKE_HAIRLINE,
} from '@/constants/studio.constants'

export interface AnagramItem {
  answer: string
  scrambled: string
}

/** Breathing room from safe edges — matches digit-span-ladder / list-recall. */
const STROKE_INSET = 16
const HEADER_ROWS = 1
const CELL_PAD = 12
const INDEX_GAP = 8
const INDEX_W = 40
const PREFERRED_ROW_H = STUDIO_BODY_SIZE * 2.2
const MIN_SCRAMBLE_SIZE = 12
const LABEL_SIZE = STUDIO_BODY_SIZE * 0.65
const COLS = 2

interface AnagramTable {
  cols: number
  rows: number
  cellW: number
  cellH: number
  bounds: Box
  cellBox: (row: number, col: number) => Box
}

/** Centered 2-col table — integer cells, re-centered in field. */
function fitAnagramTable(field: Box, dataRows: number): AnagramTable {
  const rows = Math.max(1, dataRows) + HEADER_ROWS
  const cellW = Math.max(1, Math.floor(field.width / COLS))
  // Prefer readable rows, but always shrink to fit the field (dense sheets).
  const cellH = Math.max(
    1,
    Math.floor(Math.min(PREFERRED_ROW_H, field.height / rows)),
  )
  const gridW = cellW * COLS
  const gridH = cellH * rows
  const left = Math.round(field.left + (field.width - gridW) / 2)
  const top = Math.round(field.top + (field.height - gridH) / 2)
  return {
    cols: COLS,
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

function spacedScramble(scrambled: string): string {
  return toNonBreakingSpaces(scrambled.split('').join(' '))
}

/** Shrink spaced letter runs so they stay one line in the prompt column. */
function fitScrambleSize(text: string, maxWidth: number, preferred: number): number {
  if (maxWidth <= 0) return MIN_SCRAMBLE_SIZE
  let units = 0
  for (const ch of text) {
    units += ch === ' ' || ch === '\u00a0' ? 0.3 : 0.62
  }
  const fitted = (maxWidth - 4) / Math.max(units, 1)
  return Math.max(MIN_SCRAMBLE_SIZE, Math.min(preferred, fitted))
}

function sharedScrambleSize(items: AnagramItem[], promptMaxW: number, rowH: number): number {
  const preferred = Math.min(STUDIO_BODY_SIZE * 1.1, Math.floor(rowH * 0.55))
  let size = preferred
  for (const item of items) {
    size = Math.min(size, fitScrambleSize(spacedScramble(item.scrambled), promptMaxW, preferred))
  }
  return size
}

function pushHeaderLabel(
  objects: StudioFabricObject[],
  cell: Box,
  label: string,
  font: string,
  tag: StudioTag,
): void {
  const maxW = Math.max(24, cell.width - CELL_PAD * 2)
  objects.push(
    buildText(
      {
        left: boxCenterX(cell),
        top: boxCenterY(cell),
        text: label,
        width: estimateTextBoxWidth(label, LABEL_SIZE, maxW),
        fontFamily: font,
        fontSize: LABEL_SIZE,
        fill: STUDIO_INK_MUTED,
        textAlign: 'center',
        originX: 'center',
        originY: 'center',
      },
      tag,
      'decoration',
    ),
  )
}

/** Bottom of the vertically-centered scramble run — writing line shares this Y. */
function scrambleBaselineY(cell: Box, fontSize: number): number {
  return Math.round(boxCenterY(cell) + fontSize / 2)
}

/** Puzzle-only write-in rule — omitted on the answer-key page; sits on scramble baseline. */
function pushAnswerLine(
  objects: StudioFabricObject[],
  cell: Box,
  tag: StudioTag,
  fontSize: number,
): void {
  const y = scrambleBaselineY(cell, fontSize)
  objects.push(
    buildLine(
      {
        x1: cell.left + CELL_PAD,
        y1: y,
        x2: cell.left + cell.width - CELL_PAD,
        y2: y,
        stroke: STUDIO_RULE_MEDIUM,
        strokeWidth: STUDIO_STROKE_HAIRLINE,
      },
      tag,
      'structure',
    ),
  )
}

function pushScrambleRow(
  objects: StudioFabricObject[],
  cell: Box,
  item: AnagramItem,
  index: number,
  style: { font: string; scrambleSize: number; labelSize: number; tag: StudioTag },
): void {
  const { font, scrambleSize, labelSize, tag } = style
  // Same midY + originY center so index and word stay optically level despite size gap.
  const midY = boxCenterY(cell)
  const label = `${index}.`
  const scramble = spacedScramble(item.scrambled)
  const contentMaxW = Math.max(24, cell.width - CELL_PAD * 2)
  const scrambleMaxW = Math.max(24, contentMaxW - INDEX_W - INDEX_GAP)
  const labelW = estimateTextBoxWidth(label, labelSize, INDEX_W)
  const scrambleW = estimateSpacedRunWidth(scramble, scrambleSize, scrambleMaxW)
  const blockW = labelW + INDEX_GAP + scrambleW
  const blockLeft = boxCenterX(cell) - blockW / 2

  objects.push(
    buildText(
      {
        left: blockLeft,
        top: midY,
        text: label,
        width: labelW,
        fontFamily: font,
        fontSize: labelSize,
        fill: STUDIO_INK_MUTED,
        originY: 'center',
        lineHeight: 1,
      },
      tag,
      'decoration',
    ),
  )
  objects.push(
    buildText(
      {
        left: blockLeft + labelW + INDEX_GAP,
        top: midY,
        text: scramble,
        width: scrambleW,
        fontFamily: font,
        fontSize: scrambleSize,
        originY: 'center',
        lineHeight: 1,
      },
      tag,
      'prompt',
    ),
  )
}

function pushAnswerText(
  objects: StudioFabricObject[],
  cell: Box,
  answer: string,
  font: string,
  fontSize: number,
  tag: StudioTag,
): void {
  const answerMaxW = Math.max(24, cell.width - CELL_PAD * 2 - 4)
  const answerSize = fitFontSizeToWidth(answer, answerMaxW, fontSize, 10)
  objects.push(
    buildText(
      {
        left: boxCenterX(cell),
        // Same baseline as the write-in rule / scramble letters.
        top: scrambleBaselineY(cell, fontSize),
        text: answer,
        width: estimateTextBoxWidth(answer, answerSize, answerMaxW),
        fontFamily: font,
        fontSize: answerSize,
        textAlign: 'center',
        originX: 'center',
        originY: 'bottom',
        lineHeight: 1,
      },
      tag,
      'answer',
    ),
  )
}

export interface DrawAnagramOptions {
  forAnswerKey?: boolean
  /** Left column header. Default: Letters */
  scrambleHeader?: string
  /** Right column header on the puzzle page. Default: Your answer */
  answerHeader?: string
  /** Right column header on the answer-key page. Default: Answer */
  answerKeyHeader?: string
}

/** Digit-span-style 2-col table: Letters | Your answer (Answer on the key). */
export function drawAnagramItems(
  objects: StudioFabricObject[],
  field: Box,
  items: AnagramItem[],
  font: string,
  tag: StudioTag,
  options?: DrawAnagramOptions,
): void {
  if (items.length === 0) return

  const forAnswerKey = options?.forAnswerKey === true
  const scrambleHeader = options?.scrambleHeader ?? 'Letters'
  const answerHeader = options?.answerHeader ?? 'Your answer'
  const answerKeyHeader = options?.answerKeyHeader ?? 'Answer'
  const tableField = insetBox(field, STROKE_INSET)
  const table = fitAnagramTable(tableField, items.length)
  const promptMaxW = Math.max(24, table.cellW - CELL_PAD * 2 - INDEX_W - INDEX_GAP)
  const scrambleSize = sharedScrambleSize(items, promptMaxW, table.cellH)
  const labelSize = fitFontSizeToWidth(`${items.length}.`, INDEX_W, scrambleSize * 0.9, 10)
  const gridObjects: StudioFabricObject[] = []

  pushHeaderLabel(gridObjects, table.cellBox(0, 0), scrambleHeader, font, tag)
  pushHeaderLabel(
    gridObjects,
    table.cellBox(0, 1),
    forAnswerKey ? answerKeyHeader : answerHeader,
    font,
    tag,
  )

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (!item) continue
    const row = i + HEADER_ROWS
    const scrambleCell = table.cellBox(row, 0)
    const answerCell = table.cellBox(row, 1)
    pushScrambleRow(gridObjects, scrambleCell, item, i + 1, {
      font,
      scrambleSize,
      labelSize,
      tag,
    })
    // Puzzle write-in rules only — omitted on the answer-key layout.
    if (!forAnswerKey) {
      pushAnswerLine(gridObjects, answerCell, tag, scrambleSize)
    }
    pushAnswerText(gridObjects, answerCell, item.answer, font, scrambleSize, tag)
  }

  gridObjects.push(
    ...drawGridLines(table.bounds, table.cellW, table.cols, table.rows, tag, {
      rowPitch: table.cellH,
    }),
  )
  objects.push(buildGroup(gridObjects, table.bounds, tag))
}
