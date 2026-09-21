import type { StudioFabricObject } from '@/types/studio-template.types'
import {
  boxCenterX,
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
import { FABRIC_FONT_SIZE_MULT } from '../studio-text-metrics'
import {
  STUDIO_DIGIT_FONT,
  STUDIO_INK,
  STUDIO_INK_MUTED,
  STUDIO_RULE_LIGHT,
  STUDIO_BODY_SIZE,
} from '@/constants/studio.constants'

const COL_GUTTER = 36
const NUMBER_COL_W = 40
const LINE_RIGHT_PAD = 10
const PREFERRED_COL_W = 340
const MIN_ROW_H = STUDIO_BODY_SIZE * 1.6
const MAX_ROW_H = STUDIO_BODY_SIZE * 2.4

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

export function instructionFor(category: string, timeLimit: number): string {
  return (
    `Set a timer for ${timeLimit} seconds. Write as many different ` +
    `${category.toLowerCase()} as you can before time runs out, one per line. ` +
    `Don’t worry about spelling. When the timer ends, count how many you wrote`
  )
}

/**
 * Bold uppercase serif runs wider than estimateTextBoxWidth's 0.55em factor.
 * Under-estimating width makes Fabric wrap (e.g. "FLY") before the safe edge.
 */
const BANNER_ADVANCE = 0.72
const PREFERRED_BANNER_SIZE = STUDIO_BODY_SIZE * 1.1
const MIN_BANNER_SIZE = STUDIO_BODY_SIZE * 0.75

/** Shrink banner type so the category prefers a single line inside maxWidth. */
export function fitCategoryBannerSize(text: string, maxWidth: number): number {
  if (maxWidth <= 0 || text.length === 0) return MIN_BANNER_SIZE
  const fitted = maxWidth / (text.length * BANNER_ADVANCE + 1)
  return Math.max(MIN_BANNER_SIZE, Math.min(PREFERRED_BANNER_SIZE, fitted))
}

/** Content-sized width; caps at maxWidth so wrap only starts at the safe edge. */
export function estimateCategoryBannerWidth(
  text: string,
  fontSize: number,
  maxWidth: number,
): number {
  const estimated = Math.ceil(text.length * fontSize * BANNER_ADVANCE + fontSize)
  return Math.min(maxWidth, Math.max(fontSize, estimated))
}

/** Centered write-in grid; returns the block height used. */
export function drawWriteInLines(
  objects: StudioFabricObject[],
  field: Box,
  lineCount: number,
  _font: string,
  tag: StudioTag,
): number {
  const cols = lineCount > 10 ? 3 : 2
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
  const colBoxes = columns(gridBox, cols, COL_GUTTER)
  const parts: StudioFabricObject[] = []

  for (let i = 0; i < lineCount; i++) {
    const col = colBoxes[Math.floor(i / perCol)]
    if (!col) continue
    const y = col.top + (i % perCol) * rowH
    const label = `${i + 1}.`
    const labelSize = STUDIO_BODY_SIZE * 0.9
    parts.push(
      buildText(
        {
          left: col.left,
          top: y,
          text: label,
          width: estimateTextBoxWidth(label, labelSize, NUMBER_COL_W),
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
          x1: col.left + NUMBER_COL_W,
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
  if (!bounds) return blockH
  // Re-center shrink-wrapped columns; one group so the sheet moves as a unit.
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

  return blockH
}

const EXAMPLE_INTRO = 'Sample answers, many more are valid:'
const EXAMPLE_COL_GUTTER = 48
const EXAMPLE_MIN_SIZE = 14
const EXAMPLE_MAX_SIZE = STUDIO_BODY_SIZE * 0.95
const EXAMPLE_INTRO_GAP = 20

function exampleColumnCount(wordCount: number): number {
  if (wordCount > 24) return 3
  if (wordCount > 10) return 2
  return 1
}

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

/** Hidden reference list — revealed alone on the solution page. */
export function drawExampleAnswers(
  objects: StudioFabricObject[],
  field: Box,
  examples: string[],
  font: string,
  tag: StudioTag,
): void {
  const words = examples.map((w) => w.trim()).filter(Boolean)
  if (!words.length || field.height < 48) return

  const labels = words.map((word, i) => toNonBreakingSpaces(`${i + 1}. ${word}`))
  const cols = exampleColumnCount(labels.length)
  const perCol = Math.ceil(labels.length / cols)
  const introSize = STUDIO_BODY_SIZE * 0.85
  const introH = introSize * 1.35
  const listH = Math.max(1, field.height - introH - EXAMPLE_INTRO_GAP)
  const maxColW = (field.width - EXAMPLE_COL_GUTTER * (cols - 1)) / cols
  // Row height first so every answer fits; font never taller than its row.
  const rowH = listH / perCol
  const preferred = Math.min(
    EXAMPLE_MAX_SIZE,
    Math.max(EXAMPLE_MIN_SIZE, rowH * 0.75),
  )
  const fontSize = Math.min(
    // Fabric draws a line into a `fontSize x mult` glyph box, so a font sized
    // to the row itself would put one row's descenders in the next row's caps.
    rowH / FABRIC_FONT_SIZE_MULT,
    fitExampleFontSize(labels, maxColW, preferred),
  )
  const usedColW = Math.min(
    maxColW,
    Math.max(
      ...labels.map((label) => estimateTextBoxWidth(label, fontSize, maxColW)),
    ),
  )
  const blockW = usedColW * cols + EXAMPLE_COL_GUTTER * (cols - 1)
  const blockH = perCol * rowH
  const stackH = introH + EXAMPLE_INTRO_GAP + blockH
  const stackTop = field.top + Math.max(0, (field.height - stackH) / 2)

  const introText = toNonBreakingSpaces(EXAMPLE_INTRO)
  objects.push(
    buildText(
      {
        left: boxCenterX(field),
        top: stackTop + introH / 2,
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

  const gridBox: Box = {
    left: field.left + (field.width - blockW) / 2,
    top: stackTop + introH + EXAMPLE_INTRO_GAP,
    width: blockW,
    height: blockH,
  }
  const colBoxes = columns(gridBox, cols, EXAMPLE_COL_GUTTER)
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
          width: estimateTextBoxWidth(label, fontSize, usedColW),
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
  // Re-center shrink-wrapped columns in the body (group stays one movable unit).
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
