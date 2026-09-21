import type { StudioFabricObject } from '@/types/studio-template.types'
import {
  boxCenterX,
  boxCenterY,
  columns,
  estimateTextBoxWidth,
  fitFontSizeToWidth,
  toNonBreakingSpaces,
  unionObjectBounds,
  type Box,
} from '../studio-layout'
import {
  buildText,
  buildLine,
  buildGroup,
  type StudioTag,
} from '../studio-fabric-builders'
import {
  STUDIO_DIGIT_FONT,
  STUDIO_INK,
  STUDIO_INK_MUTED,
  STUDIO_RULE_LIGHT,
  STUDIO_BODY_SIZE,
} from '@/constants/studio.constants'
import { createRng } from '../studio-rng'
import type { StudioConfig } from '@/types/studio-template.types'

const COL_GUTTER = 36
const NUMBER_COL_W = 40
const LINE_RIGHT_PAD = 10
const PREFERRED_COL_W = 340
const MIN_ROW_H = STUDIO_BODY_SIZE * 1.6
const MAX_ROW_H = STUDIO_BODY_SIZE * 2.4

export const PRODUCTIVE_LETTERS = [
  'F',
  'A',
  'S',
  'C',
  'L',
  'P',
  'B',
  'T',
  'M',
  'R',
  'G',
  'D',
  'N',
  'H',
  'W',
  'E',
  'I',
  'O',
] as const

export function clampLineCount(raw: unknown): number {
  const n = Math.round(Number(raw ?? 15))
  if (!Number.isFinite(n)) return 15
  return Math.min(30, Math.max(8, n))
}

export function clampTimeLimit(raw: unknown): number {
  const n = Number(raw ?? 60)
  if (n === 90 || n === 120) return n
  return 60
}

export function normalizeLetter(raw: unknown): string {
  const letter = String(raw ?? 'F')
    .trim()
    .toUpperCase()
    .slice(0, 1)
  if (letter >= 'A' && letter <= 'Z') return letter
  return 'F'
}

export function letterOptions(): { label: string; value: string }[] {
  return Array.from({ length: 26 }, (_, i) => {
    const letter = String.fromCharCode(65 + i)
    return { label: letter, value: letter }
  })
}

export function resolveLetters(config: StudioConfig, seed: number): string[] {
  const mode = String(config.letterMode ?? 'random')
  if (mode === 'fixed') return [normalizeLetter(config.fixedLetter)]
  return [createRng(seed).pick([...PRODUCTIVE_LETTERS])]
}

export function instructionFor(letter: string, timeLimit: number): string {
  return (
    `Set a timer for ${timeLimit} seconds. Write as many words as you can that begin with the ` +
    `letter ${letter}, one per line. No names of people or places, no repeats, and no plurals of ` +
    `a word you already used. When time is up, count how many you wrote`
  )
}

function writeInColumnCount(lineCount: number): number {
  return lineCount > 10 ? 3 : 2
}

function layoutWriteInGrid(field: Box, lineCount: number): {
  perCol: number
  rowH: number
  gridBox: Box
  colBoxes: Box[]
} {
  const cols = writeInColumnCount(lineCount)
  const perCol = Math.ceil(lineCount / cols)
  const rowH = Math.min(MAX_ROW_H, Math.max(MIN_ROW_H, field.height / perCol))
  const blockH = Math.min(perCol * rowH, field.height)
  const blockW = Math.min(
    field.width,
    cols * PREFERRED_COL_W + (cols - 1) * COL_GUTTER,
  )
  const gridBox: Box = {
    left: field.left + (field.width - blockW) / 2,
    top: field.top + (field.height - blockH) / 2,
    width: blockW,
    height: blockH,
  }
  return {
    perCol,
    rowH,
    gridBox,
    colBoxes: columns(gridBox, cols, COL_GUTTER),
  }
}

/** Centered write-in grid; one group so the sheet moves as a unit. */
export function drawWriteInLines(
  objects: StudioFabricObject[],
  field: Box,
  lineCount: number,
  _font: string,
  tag: StudioTag,
): number {
  const { perCol, rowH, gridBox, colBoxes } = layoutWriteInGrid(field, lineCount)
  const labelSize = STUDIO_BODY_SIZE * 0.9
  // Gutter sized to the widest index so "30." never wraps and all rules align.
  const numberColW = Math.max(
    NUMBER_COL_W,
    estimateTextBoxWidth(`${lineCount}.`, labelSize, Number.POSITIVE_INFINITY) + 8,
  )
  const parts: StudioFabricObject[] = []

  for (let i = 0; i < lineCount; i++) {
    const col = colBoxes[Math.floor(i / perCol)]
    if (!col) continue
    const y = col.top + (i % perCol) * rowH
    const label = `${i + 1}.`
    parts.push(
      buildText(
        {
          left: col.left,
          top: y,
          text: label,
          width: estimateTextBoxWidth(label, labelSize, numberColW),
          fontFamily: STUDIO_DIGIT_FONT,
          fontSize: labelSize,
          fill: STUDIO_INK_MUTED,
        },
        tag,
        'decoration',
      ),
    )
    const lineY = y + STUDIO_BODY_SIZE
    if (lineY > gridBox.top + gridBox.height) continue
    parts.push(
      buildLine(
        {
          x1: col.left + numberColW,
          y1: lineY,
          x2: col.left + col.width - LINE_RIGHT_PAD,
          y2: lineY,
          stroke: STUDIO_RULE_LIGHT,
        },
        tag,
        'structure',
      ),
    )
  }

  const bounds = unionObjectBounds(parts)
  if (!bounds) return gridBox.height
  const centeredLeft = field.left + Math.max(0, (field.width - bounds.width) / 2)
  const dx = centeredLeft - bounds.left
  const shifted = parts.map((part) => ({
    ...part,
    left: (part.left ?? 0) + dx,
    ...(part.type === 'line'
      ? { x1: Number(part.x1) + dx, x2: Number(part.x2) + dx }
      : {}),
  }))
  objects.push(
    buildGroup(shifted, { ...bounds, left: centeredLeft }, tag, 'structure'),
  )

  return gridBox.height
}

const EXAMPLE_INTRO = 'Sample answers, many more are valid:'
const EXAMPLE_MIN_SIZE = 14

function fitExampleFontSize(
  labels: string[],
  maxColW: number,
  preferred: number,
): number {
  let size = preferred
  for (const label of labels) {
    size = Math.min(
      size,
      fitFontSizeToWidth(label, maxColW, size, EXAMPLE_MIN_SIZE),
    )
  }
  return size
}

/** Hidden intro — sits in the letter-banner slot on the solution page. */
export function drawExampleIntro(
  objects: StudioFabricObject[],
  field: Box,
  font: string,
  tag: StudioTag,
): void {
  const introSize = STUDIO_BODY_SIZE * 0.85
  const introText = toNonBreakingSpaces(EXAMPLE_INTRO)
  objects.push(
    buildText(
      {
        left: boxCenterX(field),
        top: boxCenterY(field),
        text: introText,
        width: estimateTextBoxWidth(introText, introSize, field.width),
        fontFamily: font,
        fontSize: introSize,
        fill: STUDIO_INK_MUTED,
        textAlign: 'center',
        originX: 'center',
        originY: 'center',
      },
      tag,
      'answer',
    ),
  )
}

/** Hidden reference list — same columns/rows as the write-in grid. */
export function drawExampleAnswers(
  objects: StudioFabricObject[],
  field: Box,
  examples: string[],
  font: string,
  tag: StudioTag,
): void {
  const words = examples.map((w) => w.trim()).filter(Boolean)
  if (!words.length || field.height < 48) return

  const { perCol, rowH, colBoxes } = layoutWriteInGrid(field, words.length)
  const labels = words.map((word, i) => toNonBreakingSpaces(`${i + 1}. ${word}`))
  const maxColW = colBoxes[0]?.width ?? field.width
  const fontSize = Math.min(
    rowH,
    fitExampleFontSize(labels, maxColW, STUDIO_BODY_SIZE * 0.9),
  )
  const gridParts: StudioFabricObject[] = []

  labels.forEach((label, i) => {
    const col = colBoxes[Math.floor(i / perCol)]
    if (!col) return
    const y = col.top + (i % perCol) * rowH
    gridParts.push(
      buildText(
        {
          left: col.left,
          top: y,
          text: label,
          width: estimateTextBoxWidth(label, fontSize, col.width),
          fontFamily: font,
          fontSize,
          fill: STUDIO_INK,
        },
        tag,
        'answer',
      ),
    )
  })

  const bounds = unionObjectBounds(gridParts)
  if (!bounds) return
  const centeredLeft = field.left + Math.max(0, (field.width - bounds.width) / 2)
  const dx = centeredLeft - bounds.left
  const shifted = gridParts.map((part) => ({
    ...part,
    left: (part.left ?? 0) + dx,
  }))
  objects.push(
    buildGroup(shifted, { ...bounds, left: centeredLeft }, tag, 'answer'),
  )
}
