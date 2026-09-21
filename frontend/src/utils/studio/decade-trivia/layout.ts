/**
 * Decade Trivia page layout — pure geometry, no Fabric objects.
 *
 * The renderer in `draw.ts` only places what this file has already measured, so
 * there is exactly one source of truth for line counts and heights. Two rules
 * keep the page from ever colliding again:
 *
 * 1. Every height comes from `fabricTextHeight`, which includes Fabric's
 *    font-size multiplier (`FABRIC_FONT_SIZE_MULT`). Under-reserving that is
 *    what let wrapped prompts run into the options below them.
 * 2. Blocks are stacked by their own measured height plus a non-negative gap,
 *    so overlap is structurally impossible — the worst case is a short page,
 *    never text on top of text.
 */

import type { TriviaItem } from '@/types/studio-decade-trivia.types'
import { DPI, PDF_POINTS_PER_INCH } from '@/types/canvas-settings.types'
import type { Box } from '../studio-layout'
import {
  fabricLinePitch,
  fabricTextHeight,
  measureRunWidth,
  wrapSafeWidth,
  wrapTextToWidth,
  type FontSpec,
} from '../studio-text-metrics'
import { isMultipleChoice, promptTextFor, usesInlineWriteIn } from './content'
import { optionLetter } from './labels'

/** Print points to editor canvas px (logical DPI). */
export function pt(points: number): number {
  return (points * DPI) / PDF_POINTS_PER_INCH
}

// Amazon KDP large-print band. 16pt is the usual body target; 14pt is the floor
// a large-print book may claim, and 12pt is only for the densest 8-question page.
const PREFERRED_PT = 16
const MAX_BOOK_PT = 18
const MIN_BOOK_PT = 14
const HARD_FLOOR_PT = 12
/**
 * Only reached when a dense page on a small trim cannot hold the floor even
 * with the gaps closed. Still legible; the questions-per-page help text steers
 * authors away from needing it.
 */
const ABSOLUTE_FLOOR_PT = 10

export const LARGE_PRINT = pt(PREFERRED_PT)
export const MAX_PRINT = pt(MAX_BOOK_PT)
export const MIN_PRINT = pt(MIN_BOOK_PT)
export const HARD_MIN_PRINT = pt(HARD_FLOOR_PT)
export const ABSOLUTE_MIN_PRINT = pt(ABSOLUTE_FLOOR_PT)

/** Prompt leading — roomy enough that two wrapped lines still read as one sentence. */
export const PROMPT_LINE_HEIGHT = 1.22
/** Option leading, applied to the option font. */
const OPTION_LINE_HEIGHT = 1.2

/** Options print a touch smaller than the question so the question leads the eye. */
const OPTION_SIZE_RATIO = 0.9
const OPTION_SIZE_MIN_RATIO = 0.78

/** Air between question blocks. Always wider than the gap inside a block. */
const MIN_BLOCK_GAP = pt(12)
const MAX_BLOCK_GAP = pt(30)
/**
 * Gap from the last prompt line down to the first option row, in question ems.
 * Comfortably smaller than MIN_BLOCK_GAP so a question and its options still
 * read as one unit, but wide enough that large print does not look jammed.
 */
const PROMPT_TO_OPTIONS = 0.75
/** Gutter between the A|B and C|D columns. */
const OPTION_COL_GUTTER = 22
/** Width of the A-D marker slot, in option ems — fits the letter plus its ring. */
const MARKER_SLOT_EMS = 1.5
/** Gap from the marker slot to the option body. */
const MARKER_TO_BODY_EMS = 0.3
/** Answer-ring radius relative to the option font size. */
export const MARKER_RING_RATIO = 0.62

/** Clearance under the prompt for handwriting, before the write-in rule. */
const WRITE_RULE_GAP_RATIO = 1.35
const WRITE_RULE_MIN_GAP = pt(18)
/** Air under the rule so the next question does not crowd it. */
const WRITE_RULE_AFTER_RATIO = 0.45

/** Keep the packed stack off the bottom margin guide. */
export const BODY_BOTTOM_PAD = 24

export interface OptionCell {
  letter: string
  text: string
  correct: boolean
  /** Centre of the letter glyph and of the answer ring. */
  markerCx: number
  markerCy: number
  bodyLeft: number
  bodyWidth: number
  /** Vertical centre of the option row. */
  centerY: number
}

export interface QuestionBlock {
  item: TriviaItem
  /** 1-based number printed in the gutter. */
  index: number
  /** Exact bounds of everything this block draws. */
  box: Box
  numberText: string
  numberRight: number
  numberTop: number
  /** Text column: prompt, options and rules all start here. */
  textLeft: number
  textWidth: number
  promptLines: string[]
  promptTop: number
  promptHeight: number
  /** Inline write-in only: same sentence with the answer in place. */
  solutionLines?: string[]
  solutionHeight?: number
  options?: OptionCell[]
  writeRule?: { y: number; left: number; width: number }
  /** Top of the revealed answer for a write-in rule (solution page only). */
  answerTop?: number
}

export interface TriviaPageLayout {
  fontSize: number
  optionSize: number
  optionColumns: 1 | 2
  blockGap: number
  blocks: QuestionBlock[]
}

interface PlanInput {
  items: TriviaItem[]
  area: Box
  font: FontSpec
}

/** Font ladder, largest first. Anything below MIN_PRINT is a last resort. */
function fontLadder(area: Box, floor: number): number[] {
  // A taller trim can open up a little; never past the large-print ceiling.
  const start = Math.min(MAX_PRINT, Math.max(LARGE_PRINT, area.height * 0.043))
  const sizes: number[] = []
  for (let size = start; size >= floor - 0.01; size -= 0.5) {
    sizes.push(Math.round(size * 100) / 100)
  }
  if (sizes.length === 0) sizes.push(floor)
  return sizes
}

function numberGutterWidth(count: number, fontSize: number, font: FontSpec): number {
  const widest = `${count}.`
  return Math.ceil(measureRunWidth(widest, fontSize, font)) + Math.round(fontSize * 0.5)
}

/**
 * Largest option size (within the readable band) at which every option on the
 * page still fits one line in `columnWidth`. Returns null when even the floor
 * cannot do it, which is the signal to fall back to a single column.
 */
function fitOptionSize(
  items: TriviaItem[],
  columnWidth: number,
  fontSize: number,
  font: FontSpec,
): number | null {
  const preferred = fontSize * OPTION_SIZE_RATIO
  const floor = fontSize * OPTION_SIZE_MIN_RATIO
  const bodyWidth = (size: number) =>
    columnWidth - size * (MARKER_SLOT_EMS + MARKER_TO_BODY_EMS)

  for (let size = preferred; size >= floor - 0.01; size -= 0.5) {
    // Keep options clear of the column edge — flush runs look cramped and are
    // the first to soft-wrap (or expand past the guide) when Fabric measures
    // wider than the planner. Pad matches wrapSafeWidth's exact-mode band.
    const measure = bodyWidth(size) - Math.max(12, columnWidth * 0.08)
    if (measure <= size) continue
    const fits = items.every(
      (item) =>
        !isMultipleChoice(item) ||
        (item.options ?? [])
          .slice(0, 4)
          .every((opt) => measureRunWidth(opt, size, font) <= measure),
    )
    if (fits) return Math.round(size * 100) / 100
  }
  return null
}

function optionRowCount(optionCount: number, columns: 1 | 2): number {
  return columns === 2 ? Math.ceil(optionCount / 2) : optionCount
}

/** Height of one block at a candidate size — must never under-report. */
function blockHeight(
  item: TriviaItem,
  promptLineCount: number,
  solutionLineCount: number,
  fontSize: number,
  optionSize: number,
  columns: 1 | 2,
): number {
  const promptHeight = fabricTextHeight(promptLineCount, fontSize, PROMPT_LINE_HEIGHT)

  if (isMultipleChoice(item)) {
    const rows = optionRowCount(Math.min(4, item.options?.length ?? 0), columns)
    const pitch = fabricLinePitch(optionSize, OPTION_LINE_HEIGHT)
    // Rows before the last take a full pitch; the last takes its glyph box.
    const optionsHeight = (rows - 1) * pitch + fabricTextHeight(1, optionSize)
    return promptHeight + fontSize * PROMPT_TO_OPTIONS + optionsHeight
  }

  if (usesInlineWriteIn(item)) {
    // Puzzle and solution share the slot; reserve whichever wraps longer.
    return Math.max(
      promptHeight,
      fabricTextHeight(solutionLineCount, fontSize, PROMPT_LINE_HEIGHT),
    )
  }

  const ruleGap = Math.max(WRITE_RULE_MIN_GAP, fontSize * WRITE_RULE_GAP_RATIO)
  return promptHeight + ruleGap + fontSize * WRITE_RULE_AFTER_RATIO
}

interface Measured {
  promptLines: string[]
  solutionLines: string[]
  height: number
}

function measureAll(
  input: PlanInput,
  fontSize: number,
  optionSize: number,
  columns: 1 | 2,
  textWidth: number,
): Measured[] {
  const wrapWidth = wrapSafeWidth(textWidth, input.font)
  return input.items.map((item) => {
    const text = promptTextFor(item)
    const promptLines = wrapTextToWidth(text.prompt, fontSize, wrapWidth, input.font)
    const inline = usesInlineWriteIn(item)
    const solutionLines = inline
      ? wrapTextToWidth(text.solution, fontSize, wrapWidth, input.font)
      : []
    return {
      promptLines,
      solutionLines,
      height: blockHeight(
        item,
        promptLines.length,
        solutionLines.length || 1,
        fontSize,
        optionSize,
        columns,
      ),
    }
  })
}

interface Candidate {
  fontSize: number
  optionSize: number
  columns: 1 | 2
  gutter: number
  textWidth: number
  measured: Measured[]
  contentHeight: number
}

function candidateAt(input: PlanInput, fontSize: number): Candidate {
  const gutter = numberGutterWidth(input.items.length, fontSize, input.font)
  const textWidth = Math.max(fontSize * 4, input.area.width - gutter)
  const twoColWidth = (textWidth - OPTION_COL_GUTTER) / 2

  let columns: 1 | 2 = 2
  let optionSize = fitOptionSize(input.items, twoColWidth, fontSize, input.font)
  if (optionSize == null) {
    // A long option is more readable full width than shrunk into half a column.
    columns = 1
    optionSize =
      fitOptionSize(input.items, textWidth, fontSize, input.font) ??
      Math.round(fontSize * OPTION_SIZE_MIN_RATIO * 100) / 100
  }

  const measured = measureAll(input, fontSize, optionSize, columns, textWidth)
  const contentHeight = measured.reduce((sum, m) => sum + m.height, 0)
  return { fontSize, optionSize, columns, gutter, textWidth, measured, contentHeight }
}

function place(input: PlanInput, candidate: Candidate): TriviaPageLayout {
  const { area, items } = input
  const { fontSize, optionSize, columns, gutter, textWidth, measured } = candidate

  const gapCount = Math.max(0, items.length - 1)
  const slack = area.height - candidate.contentHeight - gapCount * MIN_BLOCK_GAP
  // Leftover height widens the gaps; a shortfall closes them. Never negative —
  // that is what would put one block on top of the next.
  const blockGap =
    gapCount === 0
      ? 0
      : Math.max(0, Math.min(MAX_BLOCK_GAP, MIN_BLOCK_GAP + slack / gapCount))

  const stackHeight = candidate.contentHeight + gapCount * blockGap
  // Any space left after the gap cap becomes equal air above and below.
  let top = area.top + Math.max(0, (area.height - stackHeight) / 2)

  const textLeft = area.left + gutter
  const columnWidth = columns === 2 ? (textWidth - OPTION_COL_GUTTER) / 2 : textWidth
  const markerSlot = optionSize * MARKER_SLOT_EMS
  const optionPitch = fabricLinePitch(optionSize, OPTION_LINE_HEIGHT)
  const optionLineHeight = fabricTextHeight(1, optionSize)

  const blocks = items.map((item, i) => {
    const m = measured[i]!
    const promptHeight = fabricTextHeight(m.promptLines.length, fontSize, PROMPT_LINE_HEIGHT)
    const numberText = `${i + 1}.`

    const block: QuestionBlock = {
      item,
      index: i + 1,
      box: { left: area.left, top, width: area.width, height: m.height },
      numberText,
      // Right-aligned in the gutter so 1. and 10. share one text column.
      numberRight: textLeft - Math.round(fontSize * 0.35),
      numberTop: top,
      textLeft,
      textWidth,
      promptLines: m.promptLines,
      promptTop: top,
      promptHeight,
    }

    if (isMultipleChoice(item)) {
      const optionsTop = top + promptHeight + fontSize * PROMPT_TO_OPTIONS
      const answer = item.answer.trim().toLowerCase()
      block.options = (item.options ?? []).slice(0, 4).map((opt, oi) => {
        const col = columns === 2 ? oi % 2 : 0
        const row = columns === 2 ? Math.floor(oi / 2) : oi
        const colLeft = textLeft + col * (columnWidth + OPTION_COL_GUTTER)
        const rowTop = optionsTop + row * optionPitch
        return {
          letter: optionLetter(oi),
          text: opt,
          correct: opt.trim().toLowerCase() === answer,
          markerCx: colLeft + markerSlot / 2,
          markerCy: rowTop + optionLineHeight / 2,
          bodyLeft: colLeft + markerSlot + optionSize * MARKER_TO_BODY_EMS,
          bodyWidth: Math.max(
            optionSize,
            columnWidth - markerSlot - optionSize * MARKER_TO_BODY_EMS,
          ),
          centerY: rowTop + optionLineHeight / 2,
        }
      })
    } else if (usesInlineWriteIn(item)) {
      block.solutionLines = m.solutionLines
      block.solutionHeight = fabricTextHeight(
        m.solutionLines.length,
        fontSize,
        PROMPT_LINE_HEIGHT,
      )
    } else {
      const ruleGap = Math.max(WRITE_RULE_MIN_GAP, fontSize * WRITE_RULE_GAP_RATIO)
      const ruleY = top + promptHeight + ruleGap
      block.writeRule = { y: ruleY, left: textLeft, width: area.left + area.width - textLeft }
      // The revealed answer sits on the rule, its glyph box clearing it.
      block.answerTop = ruleY - fabricTextHeight(1, fontSize) - 2
    }

    top += m.height + (i < items.length - 1 ? blockGap : 0)
    return block
  })

  return { fontSize, optionSize, optionColumns: columns, blockGap, blocks }
}

/**
 * Fit the questions to the body area: the largest readable type whose measured
 * stack fits, then leftover height spread evenly between blocks.
 */
export function planTriviaPage(input: PlanInput): TriviaPageLayout {
  const { items, area } = input
  if (items.length === 0) {
    return {
      fontSize: LARGE_PRINT,
      optionSize: LARGE_PRINT,
      optionColumns: 2,
      blockGap: 0,
      blocks: [],
    }
  }

  const gapCount = Math.max(0, items.length - 1)
  const cache = new Map<number, Candidate>()
  const at = (size: number): Candidate => {
    let candidate = cache.get(size)
    if (!candidate) {
      candidate = candidateAt(input, size)
      cache.set(size, candidate)
    }
    return candidate
  }
  const fits = (candidate: Candidate, gap: number): boolean =>
    candidate.contentHeight + gapCount * gap <= area.height

  // Preference order: readable type with generous air, then readable type with
  // tighter air, and only then type below the large-print floor. Bigger text
  // with a snug rhythm beats small text with loose gaps in a print book.
  const readable = fontLadder(area, HARD_MIN_PRINT)
  for (const gap of [MIN_BLOCK_GAP, MIN_BLOCK_GAP * 0.55]) {
    for (const size of readable) {
      const candidate = at(size)
      if (fits(candidate, gap)) return place(input, candidate)
    }
  }

  for (let size = HARD_MIN_PRINT - 0.5; size >= ABSOLUTE_MIN_PRINT - 0.01; size -= 0.5) {
    const candidate = at(Math.round(size * 100) / 100)
    if (fits(candidate, MIN_BLOCK_GAP * 0.55)) return place(input, candidate)
  }

  // Beyond this the page is over-specified; gaps close and the stack still
  // cannot overlap, because blocks are placed by their own measured heights.
  return place(input, at(ABSOLUTE_MIN_PRINT))
}
