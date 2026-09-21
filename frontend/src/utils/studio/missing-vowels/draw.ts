import type { StudioFabricObject } from '@/types/studio-template.types'
import {
  boxCenterX,
  boxCenterY,
  estimateTextBoxWidth,
  fitFontSizeToWidth,
  insetBox,
  type Box,
} from '../studio-layout'
import { buildText, buildGroup, type StudioTag } from '../studio-fabric-builders'
import { drawGridLines } from '../studio-grid-rules'
import { STUDIO_BODY_SIZE, STUDIO_INK_MUTED } from '@/constants/studio.constants'

export interface MvItem {
  answer: string
  /** Printable prompt with `__` blanks in vowel slots, e.g. "D __ L P H __ N". */
  prompt: string
}

/** Breathing room from safe edges — matches stroop / digit-span grids. */
const STROKE_INSET = 16
const CELL_PAD = 12
const INDEX_GAP = 8
const INDEX_W = 40
const PREFERRED_ROW_H = STUDIO_BODY_SIZE * 2.2
const MIN_PROMPT_SIZE = 12
/** Solution words have no blanks — keep them smaller than puzzle prompts. */
const ANSWER_SIZE_FACTOR = 0.78
const COLS = 2
/** Uppercase serif advance — wider than mixed-case 0.55em used by estimateTextBoxWidth. */
const UPPERCASE_ADVANCE = 0.7
/** Blanked prompts are mostly spaces — pricing them as caps left the box far too wide. */
const SPACE_ADVANCE = 0.32

interface MvTable {
  cols: number
  rows: number
  cellW: number
  cellH: number
  bounds: Box
  cellBox: (row: number, col: number) => Box
}

/** Centered n-col × m-row table — integer cells, re-centered in field. */
function fitMvTable(field: Box, itemCount: number, cols: number): MvTable {
  const rows = Math.max(1, Math.ceil(itemCount / cols))
  const cellW = Math.max(1, Math.floor(field.width / cols))
  const cellH = Math.max(
    1,
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

/** NBSP so Fabric won't wrap mid-prompt at letter gaps. */
function noWrapPrompt(prompt: string): string {
  return prompt.replace(/ /g, '\u00A0')
}

function estimateUppercaseWidth(text: string, fontSize: number): number {
  let longest = 0
  for (const line of text.split('\n')) {
    let units = 0
    for (const ch of line) {
      units += ch === ' ' || ch === '\u00A0' ? SPACE_ADVANCE : UPPERCASE_ADVANCE
    }
    longest = Math.max(longest, units)
  }
  return Math.ceil((longest + 0.35) * fontSize)
}

function fitPromptSize(text: string, preferred: number, maxWidth: number): number {
  if (maxWidth <= 0) return MIN_PROMPT_SIZE
  let size = preferred
  while (size > MIN_PROMPT_SIZE && estimateUppercaseWidth(text, size) > maxWidth) {
    size -= 1
  }
  return Math.max(MIN_PROMPT_SIZE, size)
}

function sharedPromptSize(items: MvItem[], promptMaxW: number, rowH: number): number {
  const preferred = Math.min(STUDIO_BODY_SIZE * 1.15, Math.floor(rowH * 0.55))
  let size = preferred
  for (const item of items) {
    size = Math.min(size, fitPromptSize(noWrapPrompt(item.prompt), preferred, promptMaxW))
  }
  return size
}

function sharedAnswerSize(items: MvItem[], answerMaxW: number, rowH: number): number {
  const preferred = Math.min(
    Math.floor(STUDIO_BODY_SIZE * ANSWER_SIZE_FACTOR),
    Math.floor(rowH * 0.4),
  )
  let size = preferred
  for (const item of items) {
    size = Math.min(size, fitPromptSize(noWrapPrompt(item.answer), preferred, answerMaxW))
  }
  return size
}

function maxRunWidth(items: MvItem[], textSize: number, textMaxW: number, forAnswerKey: boolean): number {
  let maxW = 0
  for (const item of items) {
    const display = noWrapPrompt(forAnswerKey ? item.answer : item.prompt)
    maxW = Math.max(maxW, Math.min(textMaxW, estimateUppercaseWidth(display, textSize)))
  }
  return maxW
}

function pushIndexedText(
  objects: StudioFabricObject[],
  cell: Box,
  index: number,
  text: string,
  style: {
    font: string
    textSize: number
    labelSize: number
    labelW: number
    bandW: number
    tag: StudioTag
    role: 'prompt' | 'answer'
  },
): void {
  const { font, textSize, labelSize, labelW, bandW, tag, role } = style
  const midY = boxCenterY(cell)
  const label = `${index}.`
  const display = noWrapPrompt(text)
  const textMaxW = Math.max(24, bandW - labelW - INDEX_GAP)
  const textW = Math.min(textMaxW, estimateUppercaseWidth(display, textSize))
  const bandLeft = boxCenterX(cell) - bandW / 2

  objects.push(
    buildText(
      {
        left: bandLeft,
        top: midY,
        text: label,
        width: labelW,
        fontFamily: font,
        fontSize: labelSize,
        fill: STUDIO_INK_MUTED,
        textAlign: 'right',
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
        left: bandLeft + labelW + INDEX_GAP,
        top: midY,
        text: display,
        width: textW,
        fontFamily: font,
        fontSize: textSize,
        originY: 'center',
        lineHeight: 1,
      },
      tag,
      role,
    ),
  )
}

/**
 * Stroked word grid — words fill cells by row/column.
 * Puzzle: blanked prompts (user writes on the underlines).
 * Answer key: revealed words in the same cells.
 */
export function drawMvItems(
  objects: StudioFabricObject[],
  field: Box,
  items: MvItem[],
  font: string,
  tag: StudioTag,
  options?: { forAnswerKey?: boolean },
): void {
  if (items.length === 0) return

  const forAnswerKey = options?.forAnswerKey === true
  const tableField = insetBox(field, STROKE_INSET)
  const table = fitMvTable(tableField, items.length, COLS)
  const contentMaxW = Math.max(24, table.cellW - CELL_PAD * 2 - INDEX_W - INDEX_GAP)
  const textSize = forAnswerKey
    ? sharedAnswerSize(items, contentMaxW, table.cellH)
    : sharedPromptSize(items, contentMaxW, table.cellH)
  const widestIndex = `${items.length}.`
  const labelSize = fitFontSizeToWidth(widestIndex, INDEX_W, textSize * 0.9, 10)
  const labelW = estimateTextBoxWidth(widestIndex, labelSize, INDEX_W)
  const bandW = labelW + INDEX_GAP + maxRunWidth(items, textSize, contentMaxW, forAnswerKey)
  const gridObjects: StudioFabricObject[] = []

  items.forEach((item, i) => {
    const row = Math.floor(i / table.cols)
    const col = i % table.cols
    if (row >= table.rows || col >= table.cols) return
    const cell = table.cellBox(row, col)
    const indexStyle = { font, textSize, labelSize, labelW, bandW, tag }
    if (forAnswerKey) {
      pushIndexedText(gridObjects, cell, i + 1, item.answer, {
        ...indexStyle,
        role: 'answer',
      })
      return
    }
    pushIndexedText(gridObjects, cell, i + 1, item.prompt, {
      ...indexStyle,
      role: 'prompt',
    })
    // Hidden answer for harvest / answer-key fallback (same cell as the blanked word).
    const displayAnswer = noWrapPrompt(item.answer)
    const answerW = Math.min(contentMaxW, estimateUppercaseWidth(displayAnswer, textSize))
    gridObjects.push(
      buildText(
        {
          left: boxCenterX(cell),
          top: boxCenterY(cell),
          text: displayAnswer,
          width: answerW,
          fontFamily: font,
          fontSize: textSize,
          textAlign: 'center',
          originX: 'center',
          originY: 'center',
          lineHeight: 1,
        },
        tag,
        'answer',
      ),
    )
  })

  gridObjects.push(
    ...drawGridLines(table.bounds, table.cellW, table.cols, table.rows, tag, {
      rowPitch: table.cellH,
    }),
  )
  objects.push(buildGroup(gridObjects, table.bounds, tag))
}
