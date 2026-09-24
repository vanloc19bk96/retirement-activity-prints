import type {
  StudioConfig,
  StudioConfigLayoutContext,
} from '@/types/studio-template.types'
import { DPI, PDF_POINTS_PER_INCH } from '@/types/canvas-settings.types'
import { STUDIO_CONTENT_SAFE_INSET_X } from '@/constants/studio.constants'
import { contentBox, insetHorizontal, measureHeaderHeight, type Box } from '../studio-layout'
import {
  fabricTextHeight,
  measureBlockWidth,
  wrapSafeWidth,
  wrapTextToWidth,
  type FontSpec,
} from '../studio-text-metrics'
import { MAX_QUESTION_CHARS, TOP_FIVE_ANSWER_COUNT, TOP_FIVE_MAX_SCORE } from './content'

/**
 * Everything a Top Five Guess page decides on the seller's behalf.
 *
 * The number that governs the page is the **row pitch**: the height of one
 * guess line, which has to hold a handwritten word. Every type size is set
 * against it, and the search runs over it — never over a point size — so no
 * trim can talk the page into lines a hand cannot write on.
 *
 * The page also decides how many questions print. It starts at the most a page
 * may hold and steps down until every block fits at the writing floor, and the
 * form reports what that produced (`topFivePrintNote`). Generate lays out
 * against the same plan, so the note and the printed page never disagree.
 */

export const ptToPx = (pt: number) => Math.round((pt * DPI) / PDF_POINTS_PER_INCH)
export const pxToPt = (px: number) => Math.round((px * PDF_POINTS_PER_INCH) / DPI)

/** Smallest guess line an older hand writes on comfortably — wide-ruled paper. */
export const ROW_MIN = Math.round(DPI * 0.36)
/** Past this a page of guess lines reads as a form rather than a puzzle. */
const ROW_MAX = Math.round(DPI * 0.5)
/**
 * A page holding one question may open its lines further — on a small trim
 * that one block would otherwise sit in a page of white.
 */
const ROW_MAX_SINGLE = Math.round(DPI * 0.6)

/** Large-print floor for the question; it is the headline of every block. */
export const QUESTION_FONT_MIN = ptToPx(14)
const QUESTION_FONT_MAX = ptToPx(19)
/** Labels and the answer page's answers. */
const TEXT_FONT_MIN = ptToPx(13)
const TEXT_FONT_MAX = ptToPx(16)
/** An answer page line may shrink this far to keep a long answer on one line. */
export const ANSWER_FONT_MIN = ptToPx(12)

export const QUESTION_LINE_HEIGHT = 1.2
/** Past three lines a question stops being a prompt and becomes a paragraph. */
export const MAX_QUESTION_LINES = 3
/**
 * Two blocks a page at most. A letter-size page can squeeze in a third at the
 * type floor, but two at a larger size is the better page for this reader, and
 * it keeps a book's pages alike whether the title is on or off.
 */
export const MAX_QUESTIONS_PER_PAGE = 2
/** A guess line shorter than this cannot take a four-word answer in handwriting. */
export const ANSWER_LINE_MIN = Math.round(DPI * 1.8)
/** Blocks wider than this run lines across a letter page no guess needs. */
const BLOCK_MAX_WIDTH = Math.round(DPI * 5.6)

export const RULE_HEIGHT = 1
export const POINTS_LABEL = 'pts'
/** "5 pts" … "1 pt" — the answer page's score for one rank. */
export const pointsText = (points: number) => `${points} ${points === 1 ? 'pt' : POINTS_LABEL}`
export const totalLabel = () => `/ ${TOP_FIVE_MAX_SCORE}`
export const TOTAL_WORD = 'Total'
/** Widest answer-page points label — "5 pts" at the top rank. */
const WIDEST_POINTS = `5 ${POINTS_LABEL}`

export interface TopFiveMetrics {
  pitch: number
  questionFont: number
  textFont: number
  /** Column holding the question number; zero when a page has one question. */
  indexW: number
  questionGap: number
  totalGap: number
  blockGap: number
  scoreRuleW: number
  /** Air between a guess line and the score column, and inside the column. */
  scoreGap: number
  labelGap: number
}

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value))

export function topFiveMetrics(pitch: number, numbered: boolean): TopFiveMetrics {
  const questionFont = clamp(Math.round(pitch * 0.52), QUESTION_FONT_MIN, QUESTION_FONT_MAX)
  const textFont = clamp(Math.round(pitch * 0.44), TEXT_FONT_MIN, TEXT_FONT_MAX)
  return {
    pitch,
    questionFont,
    textFont,
    indexW: numbered ? Math.round(questionFont * 1.6) : 0,
    questionGap: Math.round(pitch * 0.35),
    totalGap: Math.round(pitch * 0.3),
    blockGap: Math.round(pitch * 1.1),
    scoreRuleW: Math.round(pitch * 1.3),
    scoreGap: Math.round(pitch * 0.5),
    labelGap: Math.max(4, Math.round(textFont * 0.3)),
  }
}

export const questionSpec = (font: string): FontSpec => ({ fontFamily: font, fontWeight: 700 })

/** The question as it will be set: hard breaks Fabric has no reason to redo. */
export function breakQuestion(
  question: string,
  metrics: TopFiveMetrics,
  bandWidth: number,
  font: string,
): string[] {
  const spec = questionSpec(font)
  return wrapTextToWidth(question, metrics.questionFont, wrapSafeWidth(bandWidth, spec), spec)
}

export function questionHeight(lines: number, metrics: TopFiveMetrics): number {
  return fabricTextHeight(lines, metrics.questionFont, QUESTION_LINE_HEIGHT)
}

/** One block: question, five guess lines, the total line. */
export function blockHeight(lines: number, metrics: TopFiveMetrics): number {
  return (
    questionHeight(lines, metrics) +
    metrics.questionGap +
    TOP_FIVE_ANSWER_COUNT * metrics.pitch +
    metrics.totalGap +
    fabricTextHeight(1, metrics.textFont)
  )
}

export interface TopFivePagePlan {
  /** Questions this page prints. */
  count: number
  metrics: TopFiveMetrics
  /** Width of one block, number column included — what gets centred. */
  blockWidth: number
  /** Question and guess-line band, right of the number column. */
  bandWidth: number
  scoreColumnW: number
  answerLineW: number
  /** Question lines each block may use. A longer question does not print. */
  questionLines: number
  bottomGuard: number
  /** Answer-page type size — the largest every printed answer fits at. */
  answerFont: number
}

function scoreColumnWidth(metrics: TopFiveMetrics, font: string): number {
  const spec = { fontFamily: font }
  const labels = Math.max(
    measureBlockWidth(POINTS_LABEL, metrics.textFont, spec),
    measureBlockWidth(totalLabel(), metrics.textFont, spec),
  )
  const answerPoints = measureBlockWidth(WIDEST_POINTS, metrics.textFont, { ...spec, fontWeight: 700 })
  return Math.ceil(Math.max(metrics.scoreRuleW + metrics.labelGap + labels, answerPoints) + 2)
}

/** The worst question the content gate admits: every character it allows. */
const QUESTION_PROBE = 'Name something wonderful '.repeat(4).slice(0, MAX_QUESTION_CHARS).trim()

function planAt(field: Box, count: number, pitch: number, font: string): TopFivePagePlan | null {
  const metrics = topFiveMetrics(pitch, count > 1)
  const blockWidth = Math.min(field.width, BLOCK_MAX_WIDTH)
  const bandWidth = blockWidth - metrics.indexW
  const scoreColumnW = scoreColumnWidth(metrics, font)
  const answerLineW = Math.floor(bandWidth - scoreColumnW - metrics.scoreGap)
  if (answerLineW < ANSWER_LINE_MIN) return null

  const questionLines = breakQuestion(QUESTION_PROBE, metrics, bandWidth, font).length
  if (questionLines > MAX_QUESTION_LINES) return null

  const bottomGuard = Math.round(pitch * 0.6)
  const stack = count * blockHeight(questionLines, metrics) + (count - 1) * metrics.blockGap
  if (stack > field.height - bottomGuard) return null

  return {
    count,
    metrics,
    blockWidth,
    bandWidth,
    scoreColumnW,
    answerLineW,
    questionLines,
    bottomGuard,
    answerFont: metrics.textFont,
  }
}

/**
 * The fullest, roomiest page this field holds.
 *
 * Count comes before pitch: the floor is already large print, so two questions
 * at the floor serve a book better than one at the ceiling with half a page of
 * white under it.
 */
export function planTopFivePage(field: Box, font: string): TopFivePagePlan | null {
  for (let count = MAX_QUESTIONS_PER_PAGE; count >= 1; count--) {
    const ceiling = count === 1 ? ROW_MAX_SINGLE : ROW_MAX
    for (let pitch = ceiling; pitch >= ROW_MIN; pitch--) {
      const plan = planAt(field, count, pitch, font)
      if (plan) return plan
    }
  }
  return null
}

/** The safe printable column every Top Five page lays out inside. */
export function topFiveContentBox(page: StudioConfigLayoutContext): Box {
  return insetHorizontal(contentBox(page), STUDIO_CONTENT_SAFE_INSET_X)
}

/** What is left of the column once the title and instruction have been set. */
export function topFiveBodyField(
  page: StudioConfigLayoutContext,
  config: StudioConfig,
  instruction: string,
): Box {
  const content = topFiveContentBox(page)
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
 * Probed with the longest question the gate admits, so the count is a promise:
 * every real question is at most that long, and a real question that still
 * breaks onto more lines than the probe is left off rather than squeezed in.
 */
export function topFiveWorstCasePlan(options: {
  page: StudioConfigLayoutContext
  config: StudioConfig
  instruction: string
  font: string
}): TopFivePagePlan | null {
  const { page, config, instruction, font } = options
  return planTopFivePage(topFiveBodyField(page, config, instruction), font)
}

/** What a page prints on the trim currently in Settings. */
export function topFivePrintNote(options: {
  page: StudioConfigLayoutContext | undefined
  config: StudioConfig
  instruction: string
  font: string
}): string {
  const { page } = options
  const tail = 'five guess lines each, plus a matching answer page.'
  if (!page) return `Up to ${MAX_QUESTIONS_PER_PAGE} questions a page, ${tail}`

  const plan = topFiveWorstCasePlan({ ...options, page })
  if (!plan) {
    return 'This page size is too small for a Top Five Guess page — choose a larger one in Settings.'
  }
  const questions = plan.count === 1 ? '1 question a page' : `${plan.count} questions a page`
  return `${questions}, questions at ${pxToPt(plan.metrics.questionFont)} pt, ${tail}`
}
