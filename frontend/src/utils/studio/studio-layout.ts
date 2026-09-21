import type {
  StudioConfig,
  StudioGenerateContext,
  StudioFabricObject,
} from '@/types/studio-template.types'
import type { StudioTag } from './studio-fabric-builders'
import { buildText } from './studio-fabric-builders'
import {
  hugTextBoxWidth,
  measureBlockWidth,
  type FontSpec,
} from './studio-text-metrics'
import {
  STUDIO_TITLE_SIZE,
  STUDIO_TITLE_TOP_INSET,
  STUDIO_TITLE_GAP,
  STUDIO_INSTRUCTION_SIZE,
  STUDIO_INSTRUCTION_GAP,
  STUDIO_INK_MUTED,
  STUDIO_DEFAULT_FONT,
} from '@/constants/studio.constants'

export interface Box {
  left: number
  top: number
  width: number
  height: number
}

export const boxRight = (b: Box) => b.left + b.width
export const boxBottom = (b: Box) => b.top + b.height
export const boxCenterX = (b: Box) => b.left + b.width / 2
export const boxCenterY = (b: Box) => b.top + b.height / 2

/**
 * Approximate Fabric textbox width from the glyph run.
 * Capped at maxWidth so long copy can still wrap inside the content column.
 * Spaces use a narrower advance — counting them as full glyphs (+1em pad) left fat boxes.
 */
/** Advance of the longest line in em units, including the anti-wrap pad. */
function textAdvanceUnits(text: string): number {
  let longestUnits = 0
  for (const line of text.split('\n')) {
    let units = 0
    for (const ch of line) {
      units += ch === ' ' || ch === '\u00a0' ? 0.3 : 0.52
    }
    longestUnits = Math.max(longestUnits, units)
  }
  // Small pad so Fabric does not soft-wrap early; keep selection hugging the run.
  return longestUnits + 0.35
}

export function estimateTextBoxWidth(
  text: string,
  fontSize: number,
  maxWidth: number,
): number {
  const estimated = Math.ceil(textAdvanceUnits(text) * fontSize)
  return Math.min(maxWidth, Math.max(fontSize, estimated))
}

/**
 * Line width for word-wrap break decisions (prose paragraphs).
 * Prefer this over estimateTextBoxWidth when choosing hard `\n` breaks —
 * the hug pad in estimateTextBoxWidth is for textbox widths only and causes
 * premature wraps (empty space before the column edge).
 */
export function estimateWrapLineWidth(text: string, fontSize: number): number {
  let units = 0
  for (const ch of text) {
    // Matches mixed-case serif advance (~0.49em avg) + typical space (~0.25em).
    units += ch === ' ' || ch === '\u00a0' ? 0.28 : 0.5
  }
  // Tiny safety so hard-wrapped lines still fit without a second Fabric soft wrap.
  return Math.ceil((units + 0.1) * fontSize)
}

/**
 * Largest font size (≤ preferred) whose glyph run still fits `maxWidth` on one line.
 * Use for labels that must never soft-wrap — widening the textbox is not an option.
 */
export function fitFontSizeToWidth(
  text: string,
  maxWidth: number,
  preferred: number,
  minimum = 8,
): number {
  const units = textAdvanceUnits(text)
  if (units <= 0 || maxWidth <= 0) return preferred
  // Never return larger than preferred — a floor above preferred (e.g. MIN_PRINT
  // vs a fitted body size) would inflate short labels past the surrounding type.
  const floor = Math.min(minimum, preferred)
  return Math.max(floor, Math.min(preferred, Math.floor(maxWidth / units)))
}

/**
 * Content-hugging width for spaced digit/letter runs (e.g. "5 4 6 8").
 * Digits/caps are wider than prose glyphs — prefer this over estimateTextBoxWidth for those runs.
 */
export function estimateSpacedRunWidth(
  text: string,
  fontSize: number,
  maxWidth: number,
  options?: { glyphEm?: number; spaceEm?: number; padPx?: number },
): number {
  const glyphEm = options?.glyphEm ?? 0.62
  const spaceEm = options?.spaceEm ?? 0.3
  const padPx = options?.padPx ?? 4
  let units = 0
  for (const ch of text) {
    units += ch === ' ' || ch === '\u00a0' ? spaceEm : glyphEm
  }
  const estimated = Math.ceil(units * fontSize + padPx)
  return Math.min(maxWidth, Math.max(fontSize, estimated))
}

/** Replace regular spaces with NBSP so one-line runs never soft-wrap. */
export function toNonBreakingSpaces(text: string): string {
  return text.replace(/ /g, '\u00a0')
}

/** Soft wrap count for a textbox capped at maxWidth (matches estimateTextBoxWidth metrics). */
export function estimateWrappedLines(
  text: string,
  fontSize: number,
  maxWidth: number,
): number {
  const width = Math.max(fontSize, maxWidth)
  let total = 0
  for (const line of text.split('\n')) {
    const natural = estimateTextBoxWidth(line, fontSize, Number.POSITIVE_INFINITY)
    total += Math.max(1, Math.ceil(natural / width))
  }
  return Math.max(1, total)
}

const INSTRUCTION_LINE_HEIGHT = STUDIO_INSTRUCTION_SIZE * 1.35

/**
 * Study & Recall Grid study copy — longest line sets the shared instruction textbox width
 * so other templates (e.g. Symbol Hunt) match that band.
 */
export const STUDIO_INSTRUCTION_WIDTH_SAMPLE =
  'Study the grid. Then turn the page\nand fill in the blanks from memory'

/** Content-hugging instruction width used by Study & Recall Grid. */
export function studyStyleInstructionWidth(maxWidth: number): number {
  return estimateTextBoxWidth(
    STUDIO_INSTRUCTION_WIDTH_SAMPLE,
    STUDIO_INSTRUCTION_SIZE,
    maxWidth,
  )
}

function instructionStripHeight(text: string, maxWidth: number): number {
  const lines = estimateWrappedLines(text, STUDIO_INSTRUCTION_SIZE, maxWidth)
  return Math.ceil(lines * INSTRUCTION_LINE_HEIGHT) + STUDIO_INSTRUCTION_GAP
}

/**
 * Centered instruction band (Study & Recall style). Equal top/bottom gaps.
 * Pass `width` to lock the textbox (e.g. studyStyleInstructionWidth).
 */
export function drawInstructionBand(
  body: Box,
  instruction: string,
  font: string,
  tag: StudioTag,
  options?: { width?: number },
): { objects: StudioFabricObject[]; body: Box } {
  const textWidth =
    options?.width ??
    estimateTextBoxWidth(instruction, STUDIO_INSTRUCTION_SIZE, body.width)
  const lines = estimateWrappedLines(instruction, STUDIO_INSTRUCTION_SIZE, textWidth)
  const textH = Math.ceil(lines * INSTRUCTION_LINE_HEIGHT)
  const topGap = STUDIO_INSTRUCTION_GAP
  const stripH = topGap + textH + STUDIO_INSTRUCTION_GAP
  const [strip, rest] = splitTop(body, stripH)

  return {
    objects: [
      buildText(
        {
          left: boxCenterX(strip),
          top: strip.top + topGap,
          text: instruction,
          width: textWidth,
          fontSize: STUDIO_INSTRUCTION_SIZE,
          fontFamily: font,
          fill: STUDIO_INK_MUTED,
          textAlign: 'center',
          originX: 'center',
        },
        tag,
        'decoration',
      ),
    ],
    body: rest,
  }
}

export {
  objectExtent,
  unionObjectBounds,
  textObjectHeight,
} from './studio-object-bounds'

/** The safe printable area. Every generator starts here. */
export function contentBox(ctx: StudioGenerateContext): Box {
  const { margin, pageWidth, pageHeight } = ctx
  return {
    left: margin.left,
    top: margin.top,
    width: pageWidth - margin.left - margin.right,
    height: pageHeight - margin.top - margin.bottom,
  }
}

export function insetBox(box: Box, by: number): Box {
  return {
    left: box.left + by,
    top: box.top + by,
    width: box.width - by * 2,
    height: box.height - by * 2,
  }
}

export function insetHorizontal(box: Box, by: number): Box {
  return {
    ...box,
    left: box.left + by,
    width: box.width - by * 2,
  }
}

export function splitTop(box: Box, amount: number): [Box, Box] {
  return [
    { ...box, height: amount },
    { ...box, top: box.top + amount, height: box.height - amount },
  ]
}

export function splitLeft(box: Box, amount: number): [Box, Box] {
  return [
    { ...box, width: amount },
    { ...box, left: box.left + amount, width: box.width - amount },
  ]
}

export function columns(box: Box, n: number, gutter = 0): Box[] {
  const w = (box.width - gutter * (n - 1)) / n
  return Array.from({ length: n }, (_, i) => ({
    ...box,
    left: box.left + i * (w + gutter),
    width: w,
  }))
}

export function rows(box: Box, n: number, gutter = 0): Box[] {
  const h = (box.height - gutter * (n - 1)) / n
  return Array.from({ length: n }, (_, i) => ({
    ...box,
    top: box.top + i * (h + gutter),
    height: h,
  }))
}

export function fitSquareGrid(box: Box, cols: number, rowCount: number) {
  const cell = Math.floor(Math.min(box.width / cols, box.height / rowCount))
  const gridW = cell * cols
  const gridH = cell * rowCount
  const originX = box.left + (box.width - gridW) / 2
  const originY = box.top + (box.height - gridH) / 2
  return {
    cell,
    origin: { left: originX, top: originY },
    bounds: { left: originX, top: originY, width: gridW, height: gridH } as Box,
    cellBox: (r: number, c: number): Box => ({
      left: originX + c * cell,
      top: originY + r * cell,
      width: cell,
      height: cell,
    }),
  }
}

/** Marks the heading drawHeader stamps, so the answer key can re-fit it. */
export const STUDIO_HEADER_TITLE_TAG = 'title'

/** Titles shrink rather than bleed; below this they stop being readable at all. */
const STUDIO_TITLE_MIN_SIZE = 10

export interface FittedHeaderTitle {
  /** NBSP-joined — a header title always renders on one line. */
  text: string
  fontSize: number
  width: number
}

/** True when the heading is the one drawHeader stamped (any fitted size). */
export function isStudioHeaderTitle(obj: StudioFabricObject): boolean {
  return obj.data?.studioHeader === STUDIO_HEADER_TITLE_TAG
}

/**
 * Size + textbox width that keep a heading on one line inside `columnWidth`.
 *
 * Measured, not estimated: bold serif caps run wider than the 0.52em factor in
 * estimateTextBoxWidth, and the estimate is what let the answer key's longer
 * "Solution Game N" bleed past the safe margin on a 5 x 8 trim (~252pt column).
 * Falls below the 60% comfort floor only when the column leaves no other way to
 * fit — a small heading beats one printed outside the safe area.
 */
export function fitHeaderTitle(
  title: string,
  columnWidth: number,
  fontFamily: string = STUDIO_DEFAULT_FONT,
): FittedHeaderTitle {
  const text = toNonBreakingSpaces(title.trim())
  const spec: FontSpec = { fontFamily, fontWeight: 700 }
  const max = Math.max(1, columnWidth)
  const fits = (size: number) =>
    hugTextBoxWidth(text, size, Number.POSITIVE_INFINITY, spec) <= max

  let fontSize = STUDIO_TITLE_SIZE
  if (text && !fits(fontSize)) {
    // Width scales linearly with size — jump close, then step onto the exact fit.
    const measured = measureBlockWidth(text, STUDIO_TITLE_SIZE, spec)
    const scaled =
      measured > 0 ? Math.floor((STUDIO_TITLE_SIZE * max) / measured) : fontSize
    fontSize = Math.min(STUDIO_TITLE_SIZE, Math.max(STUDIO_TITLE_MIN_SIZE, scaled))
    while (fontSize > STUDIO_TITLE_MIN_SIZE && !fits(fontSize)) fontSize -= 1
    while (fontSize < STUDIO_TITLE_SIZE && fits(fontSize + 1)) fontSize += 1
  }

  return {
    text,
    fontSize,
    width: hugTextBoxWidth(text, fontSize, max, spec),
  }
}

/**
 * Vertical space reserved by drawHeader for the given config + instruction.
 * Pass contentWidth when the instruction may wrap (defaults to a single line).
 */
export function measureHeaderHeight(
  config: StudioConfig,
  instructionText: string,
  contentWidth = Number.POSITIVE_INFINITY,
): number {
  const title = String(config.title ?? '').trim()
  const showInstructions = config.showInstructions !== false && Boolean(instructionText)
  if (!title && !showInstructions) return 0

  let height = STUDIO_TITLE_TOP_INSET
  if (title) height += STUDIO_TITLE_SIZE + STUDIO_TITLE_GAP
  if (showInstructions) height += instructionStripHeight(instructionText, contentWidth)
  return height
}

export function drawHeader(
  box: Box,
  config: StudioConfig,
  tag: StudioTag,
  instructionText: string,
): { objects: StudioFabricObject[]; body: Box } {
  const objects: StudioFabricObject[] = []
  let body = box

  const title = String(config.title ?? '').trim()
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)
  const showInstructions = config.showInstructions !== false && Boolean(instructionText)

  if (title || showInstructions) {
    ;[, body] = splitTop(body, STUDIO_TITLE_TOP_INSET)
  }

  if (title) {
    const [titleStrip, rest] = splitTop(body, STUDIO_TITLE_SIZE + STUDIO_TITLE_GAP)
    // NBSP keeps “Game 1” on one line; a long title shrinks rather than
    // bleed past the content column.
    const fitted = fitHeaderTitle(title, titleStrip.width, font)
    objects.push({
      ...buildText(
        {
          left: boxCenterX(titleStrip),
          top: titleStrip.top + (STUDIO_TITLE_SIZE - fitted.fontSize) / 2,
          text: fitted.text,
          width: fitted.width,
          fontSize: fitted.fontSize,
          fontFamily: font,
          fontWeight: 700,
          textAlign: 'center',
          originX: 'center',
        },
        tag,
        'decoration',
      ),
      // Lets buildAnswerPage find the heading after it has been fitted smaller.
      data: { studioHeader: STUDIO_HEADER_TITLE_TAG },
    })
    body = rest
  }

  if (showInstructions) {
    const stripH = instructionStripHeight(instructionText, body.width)
    const [instStrip, rest] = splitTop(body, stripH)
    objects.push(
      buildText(
        {
          left: boxCenterX(instStrip),
          top: instStrip.top,
          text: instructionText,
          width: estimateTextBoxWidth(
            instructionText,
            STUDIO_INSTRUCTION_SIZE,
            instStrip.width,
          ),
          fontSize: STUDIO_INSTRUCTION_SIZE,
          fontFamily: font,
          fill: STUDIO_INK_MUTED,
          textAlign: 'center',
          originX: 'center',
        },
        tag,
        'decoration',
      ),
    )
    body = rest
  }

  return { objects, body }
}
