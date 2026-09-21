import type { StudioFabricObject } from '@/types/studio-template.types'
import {
  boxCenterX,
  boxCenterY,
  estimateTextBoxWidth,
  fitFontSizeToWidth,
  insetBox,
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
import type { RetirementPrintStyle } from './content'
import { minPuzzleFont } from './content'
import type { MissingVowelItem } from './mask'

export type { MissingVowelItem }

const STROKE_INSET = 16
const CELL_PAD = 12
const INDEX_GAP = 8
const INDEX_W = 48
const PREFERRED_ROW_H = STUDIO_BODY_SIZE * 2.2
const STACKED_PREFERRED_ROW_H = STUDIO_BODY_SIZE * 3.35
const MIN_LINE_BOTTOM_PAD = 12
const LINE_BOTTOM_RATIO = 0.24
const UPPERCASE_ADVANCE = 0.62
const MASK_ADVANCE = 0.55

interface MvTable {
  cols: number
  rows: number
  cellW: number
  cellH: number
  bounds: Box
  cellBox: (row: number, col: number) => Box
}

function fitTable(field: Box, rows: number, cols: number, preferredRowH: number): MvTable {
  const cellW = Math.max(1, Math.floor(field.width / cols))
  const cellH = Math.max(
    1,
    Math.floor(Math.min(preferredRowH, field.height / Math.max(1, rows))),
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

function itemColumnCount(
  itemCount: number,
  fieldHeight: number,
  printStyle: RetirementPrintStyle,
): number {
  const minRow = printStyle === 'large-print' ? 40 : 28
  if (itemCount * minRow <= fieldHeight) return 1
  return 2
}

function noWrap(text: string): string {
  return text.replace(/ /g, '\u00A0')
}

function estimateRunWidth(text: string, fontSize: number): number {
  let units = 0
  for (const ch of text) {
    if (ch === ' ' || ch === '\u00A0') units += 0.32
    else if (ch === '_') units += MASK_ADVANCE
    else units += UPPERCASE_ADVANCE
  }
  return Math.ceil((units + 0.35) * fontSize)
}

function fitRunSize(text: string, preferred: number, maxWidth: number, minSize: number): number {
  if (maxWidth <= 0) return minSize
  let size = preferred
  while (size > minSize && estimateRunWidth(text, size) > maxWidth) size -= 1
  return Math.max(minSize, size)
}

function sharedPromptSize(
  items: MissingVowelItem[],
  promptMaxW: number,
  rowH: number,
  minSize: number,
): number {
  const preferred = Math.min(STUDIO_BODY_SIZE, Math.floor(rowH * 0.45))
  let size = preferred
  for (const item of items) {
    size = Math.min(size, fitRunSize(noWrap(item.masked), preferred, promptMaxW, minSize))
  }
  return size
}

function promptBaselineY(cell: Box, fontSize: number): number {
  return Math.round(boxCenterY(cell) + fontSize / 2)
}

function stackedWriteY(cell: Box): number {
  const pad = Math.max(MIN_LINE_BOTTOM_PAD, Math.round(cell.height * LINE_BOTTOM_RATIO))
  return Math.round(cell.top + cell.height - pad)
}

function stackedPromptCell(cell: Box, writeY: number, fontSize: number): Box {
  const gap = Math.max(8, Math.round(fontSize * 0.35))
  return { ...cell, height: Math.max(1, writeY - gap - cell.top) }
}

function pushIndexAndMasked(
  objects: StudioFabricObject[],
  cell: Box,
  index: number,
  masked: string,
  style: { font: string; textSize: number; labelSize: number; tag: StudioTag; role: 'prompt' | 'decoration' },
): void {
  const { font, textSize, labelSize, tag, role } = style
  const baselineY = promptBaselineY(cell, textSize)
  const label = `${index}.`
  const display = noWrap(masked)
  const contentMaxW = Math.max(24, cell.width - CELL_PAD * 2)
  const labelW = estimateTextBoxWidth(label, labelSize, INDEX_W)
  const textMaxW = Math.max(24, contentMaxW - labelW - INDEX_GAP)
  const textW = Math.min(textMaxW, estimateRunWidth(display, textSize))
  const blockW = labelW + INDEX_GAP + textW
  const blockLeft = boxCenterX(cell) - blockW / 2

  objects.push(
    buildText(
      {
        left: blockLeft,
        top: baselineY,
        text: label,
        width: labelW,
        fontFamily: font,
        fontSize: labelSize,
        fill: STUDIO_INK_MUTED,
        originY: 'bottom',
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
        top: baselineY,
        text: display,
        width: textW,
        fontFamily: font,
        fontSize: textSize,
        originY: 'bottom',
        lineHeight: 1,
      },
      tag,
      role,
    ),
  )
}

function pushAnswerLine(
  objects: StudioFabricObject[],
  cell: Box,
  tag: StudioTag,
  y: number,
): void {
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

function pushAnswerText(
  objects: StudioFabricObject[],
  cell: Box,
  answer: string,
  font: string,
  fontSize: number,
  tag: StudioTag,
  y: number,
): void {
  const answerMaxW = Math.max(24, cell.width - CELL_PAD * 2)
  const display = noWrap(answer)
  const answerSize = fitRunSize(display, fontSize, answerMaxW, 10)
  objects.push(
    buildText(
      {
        left: boxCenterX(cell),
        top: y,
        text: display,
        width: Math.min(answerMaxW, estimateRunWidth(display, answerSize)),
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

export interface DrawMvOptions {
  forAnswerKey?: boolean
  printStyle?: RetirementPrintStyle
}

/** Numbered list: masked prompt | write-in line (answer on the key). */
export function drawMvItems(
  objects: StudioFabricObject[],
  field: Box,
  items: MissingVowelItem[],
  font: string,
  tag: StudioTag,
  options?: DrawMvOptions,
): void {
  if (items.length === 0) return

  const forAnswerKey = options?.forAnswerKey === true
  const printStyle = options?.printStyle ?? 'large-print'
  const tableField = insetBox(field, STROKE_INSET)
  const itemCols = itemColumnCount(items.length, tableField.height, printStyle)
  const isStacked = itemCols !== 1
  const cols = 2
  const rows = isStacked ? Math.ceil(items.length / cols) : items.length
  const preferredRowH = isStacked ? STACKED_PREFERRED_ROW_H : PREFERRED_ROW_H
  const table = fitTable(tableField, rows, cols, preferredRowH)
  const minSize = minPuzzleFont(printStyle)
  const promptMaxW = Math.max(24, table.cellW - CELL_PAD * 2 - INDEX_W - INDEX_GAP)
  const textSize = sharedPromptSize(items, promptMaxW, table.cellH, minSize)
  const labelSize = fitFontSizeToWidth(`${items.length}.`, INDEX_W, textSize, 10)
  const gridObjects: StudioFabricObject[] = []
  const maskedRole: 'prompt' | 'decoration' = forAnswerKey ? 'decoration' : 'prompt'

  items.forEach((item, i) => {
    const promptStyle = { font, textSize, labelSize, tag, role: maskedRole }
    if (!isStacked) {
      const promptCell = table.cellBox(i, 0)
      const answerCell = table.cellBox(i, 1)
      const writeY = promptBaselineY(promptCell, textSize)
      pushIndexAndMasked(gridObjects, promptCell, i + 1, item.masked, promptStyle)
      if (!forAnswerKey) pushAnswerLine(gridObjects, answerCell, tag, writeY)
      pushAnswerText(gridObjects, answerCell, item.display.toUpperCase(), font, textSize, tag, writeY)
      return
    }
    const row = Math.floor(i / table.cols)
    const col = i % table.cols
    const cell = table.cellBox(row, col)
    const writeY = stackedWriteY(cell)
    pushIndexAndMasked(gridObjects, stackedPromptCell(cell, writeY, textSize), i + 1, item.masked, promptStyle)
    if (!forAnswerKey) pushAnswerLine(gridObjects, cell, tag, writeY)
    pushAnswerText(gridObjects, cell, item.display.toUpperCase(), font, textSize, tag, writeY)
  })

  gridObjects.push(
    ...drawGridLines(table.bounds, table.cellW, table.cols, table.rows, tag, {
      rowPitch: table.cellH,
    }),
  )
  objects.push(buildGroup(gridObjects, table.bounds, tag))
}
