import type {
  StudioConfig,
  StudioConfigLayoutContext,
} from '@/types/studio-template.types'
import { DPI, PDF_POINTS_PER_INCH } from '@/types/canvas-settings.types'
import { STUDIO_CONTENT_SAFE_INSET_X } from '@/constants/studio.constants'
import { contentBox, insetHorizontal, measureHeaderHeight, type Box } from '../studio-layout'
import {
  fabricTextHeight,
  measureRunWidth,
  wrapSafeWidth,
  wrapTextToWidth,
  type FontSpec,
} from '../studio-text-metrics'
import { PC_OPTION_COUNT, answerProbes, questionProbes } from './content'

/**
 * Everything a Price Check page decides on the seller's behalf.
 *
 * The number that governs the page is the **text size**: questions and the
 * four prices under each one share it, the italic fact under each answer sits
 * a step below it, and every gap is set against it. The search runs from generous large print down to a
 * floor that is still comfortable for an older reader. No trim can talk the
 * page into small type — it prints fewer questions instead.
 *
 * Each question is its wording (up to three lines) with its four prices on one
 * row beneath it — or two rows of two when a narrow trim cannot hold four
 * across. The page reserves a **line budget** for the wording, sized from a
 * typical question, and a question that would overrun it is passed over.
 *
 * The count is a promise made twice: the answer page sets every question
 * again, its right letter ringed and the fact written beneath, so each answer
 * block is taller than its question and a plan only stands if both pages fit.
 */

export const ptToPx = (pt: number) => Math.round((pt * DPI) / PDF_POINTS_PER_INCH)
export const pxToPt = (px: number) => Math.round((px * PDF_POINTS_PER_INCH) / DPI)

/** Large-print floor; the page prints fewer questions rather than go below. */
export const TEXT_FONT_MIN = ptToPx(15)
/** Comfortable size tried first, down to this, before the floor is allowed. */
const TEXT_FONT_COMFORT = ptToPx(16)
const TEXT_FONT_MAX = ptToPx(18)
/** The fact under a ringed answer is a note, and may sit a little smaller. */
export const EXPLANATION_FONT_MIN = ptToPx(13)

export const TEXT_LINE_HEIGHT = 1.22
/** Past three lines a question stops being quick to read. */
export const MAX_QUESTION_LINES = 3
/** Past two lines an answer-key entry stops being a glance. */
export const MAX_ANSWER_LINES = 2

/** A page of eight is plenty; most trims print five to seven. */
export const MAX_QUESTIONS_PER_PAGE = 8
/** A comfortable page holds at least this many before the floor size is tried. */
const COMFORT_MIN_QUESTIONS = 4
/** Blocks wider than this run questions across a letter page no eye tracks. */
const BLOCK_MAX_WIDTH = Math.round(DPI * 6)

export interface PcMetrics {
  font: number
  /** Column holding the question numbers. */
  numberW: number
  /** Room for a choice's letter, the answer ring round it, and the space before its price. */
  letterW: number
  /** Between a question's last line and its prices. */
  optionGap: number
  /** Between two rows of prices when they sit two by two. */
  optionRowGap: number
  /** Between two questions, before leftover height is shared out. */
  itemGap: number
  /** Between two answers: each already ends in its own fact line. */
  answerGap: number
  /** The italic fact under a ringed answer. */
  explanationFont: number
  /** Between the prices and the fact beneath them, clear of the ring. */
  explanationGap: number
  /** Radius of the answer ring drawn round the right letter. */
  ringR: number
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

export function pcMetrics(font: number): PcMetrics {
  return {
    font,
    numberW: Math.round(font * 1.9),
    letterW: Math.round(font * 1.35),
    optionGap: Math.round(font * 0.5),
    optionRowGap: Math.round(font * 0.45),
    itemGap: Math.round(font * 1.05),
    answerGap: Math.round(font * 0.85),
    explanationFont: clamp(Math.round(font * 0.9), EXPLANATION_FONT_MIN, font),
    explanationGap: Math.round(font * 0.5),
    ringR: Math.round(font * 0.6),
  }
}

export const textSpec = (font: string): FontSpec => ({ fontFamily: font })
export const boldSpec = (font: string): FontSpec => ({ fontFamily: font, fontWeight: 700 })
export const italicSpec = (font: string): FontSpec => ({ fontFamily: font, fontStyle: 'italic' })

/** "1." — the number beside a question, on both pages. */
export const itemNumber = (index: number) => `${index + 1}.`

export interface PcPagePlan {
  /** Questions this page prints. */
  count: number
  metrics: PcMetrics
  /** Width of one block — what gets centred. */
  blockWidth: number
  /** Text column, right of the number column. */
  textWidth: number
  /** Prices per row: four across, or two by two on a narrow column. */
  columns: 2 | 4
  /** Question lines the whole page may use. */
  pageLines: number
  /** Lines the longest fact under an answer can take at this size. */
  answerLines: number
  bottomGuard: number
}

type Geometry = Pick<PcPagePlan, 'metrics' | 'textWidth'>

/** A question as it will be set: hard breaks Fabric has no reason to redo. */
export function breakQuestion(text: string, plan: Geometry, font: string) {
  const spec = textSpec(font)
  return wrapTextToWidth(text, plan.metrics.font, wrapSafeWidth(plan.textWidth, spec), spec)
}

/**
 * The fact under an answer as it will be set: one line when it fits, otherwise
 * its two halves on a line each. A half that cannot hold one line is returned
 * wrapped, so the caller sees it run long and passes it over.
 */
export function breakAnswer(parts: readonly [string, string], plan: Geometry, font: string) {
  const spec = italicSpec(font)
  const size = plan.metrics.explanationFont
  const width = wrapSafeWidth(plan.textWidth, spec)
  const whole = parts.join(' ')
  if (measureRunWidth(whole, size, spec) <= width) return [whole]
  return parts.flatMap((part) => wrapTextToWidth(part, size, width, spec))
}

export function textHeight(lines: number, metrics: PcMetrics): number {
  return fabricTextHeight(lines, metrics.font, TEXT_LINE_HEIGHT)
}

export function explanationHeight(lines: number, metrics: PcMetrics): number {
  return fabricTextHeight(lines, metrics.explanationFont, TEXT_LINE_HEIGHT)
}

export const optionRows = (columns: number) => Math.ceil(PC_OPTION_COUNT / columns)

export function optionsHeight(columns: number, metrics: PcMetrics): number {
  const rows = optionRows(columns)
  return rows * fabricTextHeight(1, metrics.font) + (rows - 1) * metrics.optionRowGap
}

/** One question: its wording, the gap, its prices. */
export function questionBlockHeight(lines: number, columns: number, metrics: PcMetrics): number {
  return textHeight(lines, metrics) + metrics.optionGap + optionsHeight(columns, metrics)
}

/** One answer: the question again, its prices with the right letter ringed, and the fact. */
export function answerBlockHeight(
  lines: number,
  answerLines: number,
  columns: number,
  metrics: PcMetrics,
): number {
  return (
    questionBlockHeight(lines, columns, metrics) +
    metrics.explanationGap +
    explanationHeight(answerLines, metrics)
  )
}

/** Questions holding `lines` lines each, with a plain gap between them. */
export function puzzleStackHeight(lines: readonly number[], columns: number, metrics: PcMetrics): number {
  if (lines.length === 0) return 0
  const blocks = lines.reduce((sum, n) => sum + questionBlockHeight(n, columns, metrics), 0)
  return blocks + (lines.length - 1) * metrics.itemGap
}

/** The same questions as answers, each fact taking `answerLines` lines. */
export function answerStackHeight(
  lines: readonly number[],
  answerLines: number,
  columns: number,
  metrics: PcMetrics,
): number {
  if (lines.length === 0) return 0
  const blocks = lines.reduce((sum, n) => sum + answerBlockHeight(n, answerLines, columns, metrics), 0)
  return blocks + (lines.length - 1) * metrics.answerGap
}

/** Every question costs one glyph box plus a full pitch per extra line, so any split is the same height. */
function budgetRows(pageLines: number, count: number): number[] {
  const rows = Array.from({ length: count }, () => 1)
  for (let extra = pageLines - count, i = 0; extra > 0; extra--, i++) rows[i % count]! += 1
  return rows
}

/** A question of everyday length; sets the page's line budget. */
const TYPICAL_QUESTION = 'In 1975, about how much did a gallon of regular gasoline cost in the U.S.?'
/** The widest price a choice can show, and the letter beside it. */
const PRICE_PROBE = '$88.88'

let probeCache: { questions: string[]; answers: [string, string][] } | null = null
function probes() {
  probeCache ??= { questions: questionProbes(), answers: answerProbes() }
  return probeCache
}

/** Four across when each cell holds a letter, the widest price and some air. */
function columnsFor(metrics: PcMetrics, textWidth: number, font: string): 2 | 4 | null {
  const price = measureRunWidth(PRICE_PROBE, metrics.font, textSpec(font))
  const need = metrics.letterW + price + metrics.font * 0.5
  if (need * 4 <= textWidth) return 4
  if (need * 2 <= textWidth) return 2
  return null
}

/**
 * What a text size allows in this column, independent of the question count:
 * the price layout, whether every wording and answer fits its line limit, and
 * how many lines a typical question takes. `null` when the size cannot print
 * every item the dataset holds.
 */
function sizeFit(width: number, size: number, font: string) {
  const metrics = pcMetrics(size)
  const blockWidth = Math.min(width, BLOCK_MAX_WIDTH)
  const textWidth = blockWidth - metrics.numberW
  const geometry = { metrics, textWidth }
  const columns = columnsFor(metrics, textWidth, font)
  if (!columns) return null

  const { questions, answers } = probes()
  if (questions.some((q) => breakQuestion(q, geometry, font).length > MAX_QUESTION_LINES)) return null
  const answerLines = Math.max(...answers.map((a) => breakAnswer(a, geometry, font).length))
  if (answerLines > MAX_ANSWER_LINES) return null

  const typical = breakQuestion(TYPICAL_QUESTION, geometry, font).length
  return { metrics, blockWidth, textWidth, columns, typical, answerLines }
}

function planAt(
  fit: NonNullable<ReturnType<typeof sizeFit>>,
  puzzleField: Box,
  answerHeight: number,
  count: number,
): PcPagePlan | null {
  const { metrics, columns, typical, answerLines } = fit
  const pageLines = Math.min(count * MAX_QUESTION_LINES, count * typical + Math.ceil(count / 3))
  const bottomGuard = Math.round(metrics.font * 0.6)
  const rows = budgetRows(pageLines, count)
  const puzzleStack = puzzleStackHeight(rows, columns, metrics)
  const answerStack = answerStackHeight(rows, answerLines, columns, metrics)
  if (puzzleStack > puzzleField.height - bottomGuard) return null
  if (answerStack > answerHeight - bottomGuard) return null

  const { blockWidth, textWidth } = fit
  return { count, metrics, blockWidth, textWidth, columns, pageLines, answerLines, bottomGuard }
}

/**
 * The fullest, roomiest page these fields hold.
 *
 * Two passes: at least four questions at a comfortable size first, then
 * anything down to the floor. Within a pass count comes before size — the
 * floor is already large print.
 */
export function planPcPage(puzzleField: Box, answerHeight: number, font: string): PcPagePlan | null {
  const fits = new Map<number, ReturnType<typeof sizeFit>>()
  const fitAt = (size: number) => {
    if (!fits.has(size)) fits.set(size, sizeFit(puzzleField.width, size, font))
    return fits.get(size)!
  }
  const passes = [
    { minCount: COMFORT_MIN_QUESTIONS, floor: TEXT_FONT_COMFORT },
    { minCount: 1, floor: TEXT_FONT_MIN },
  ]
  for (const pass of passes) {
    for (let count = MAX_QUESTIONS_PER_PAGE; count >= pass.minCount; count--) {
      for (let size = TEXT_FONT_MAX; size >= pass.floor; size--) {
        const fit = fitAt(size)
        const plan = fit && planAt(fit, puzzleField, answerHeight, count)
        if (plan) return plan
      }
    }
  }
  return null
}

/** The safe printable column every page of this game lays out inside. */
export function pcContentBox(page: StudioConfigLayoutContext): Box {
  return insetHorizontal(contentBox(page), STUDIO_CONTENT_SAFE_INSET_X)
}

/** What is left of the column once the title and instruction have been set. */
export function pcBodyField(
  page: StudioConfigLayoutContext,
  config: StudioConfig,
  instruction: string,
): Box {
  const content = pcContentBox(page)
  const headerHeight = measureHeaderHeight(config, instruction, content.width)
  return {
    ...content,
    top: content.top + headerHeight,
    height: Math.max(1, content.height - headerHeight),
  }
}

/**
 * The page these settings make, measured before a question exists.
 *
 * The answer page carries the same title but no instruction, so its field is
 * measured on its own.
 */
export function pcWorstCasePlan(options: {
  page: StudioConfigLayoutContext
  config: StudioConfig
  instruction: string
  font: string
}): PcPagePlan | null {
  const { page, config, instruction, font } = options
  const puzzleField = pcBodyField(page, config, instruction)
  const answerField = pcBodyField(page, config, '')
  return planPcPage(puzzleField, answerField.height, font)
}

/** What a page prints on the trim currently in Settings. */
export function pcPrintNote(options: {
  page: StudioConfigLayoutContext | undefined
  config: StudioConfig
  instruction: string
  font: string
}): string {
  const { page } = options
  const tail = 'plus an answer page.'
  if (!page) return `Up to ${MAX_QUESTIONS_PER_PAGE} questions a page, ${tail}`

  const plan = pcWorstCasePlan({ ...options, page })
  if (!plan) {
    return 'This page size is too small for a Price Check page — choose a larger one in Settings.'
  }
  const questions = plan.count === 1 ? '1 question a page' : `${plan.count} questions a page`
  return `${questions} at ${pxToPt(plan.metrics.font)} pt, ${tail}`
}
