import type {
  StudioConfig,
  StudioConfigLayoutContext,
} from '@/types/studio-template.types'
import type { RetireeStyle } from '@/types/studio-retiree-quiz.types'
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
import {
  MAX_ANSWER_CHARS,
  MAX_DESCRIPTION_CHARS,
  MAX_QUESTIONS,
  MAX_QUESTION_CHARS,
  MIN_QUESTIONS,
  RQ_CONTINUE_LINE,
  RQ_FINISHED_LINE,
  RQ_JUST_FOR_FUN_LINE,
  RQ_RESULTS_HEADING,
  RQ_SCORING_HEADING,
  RQ_STYLES,
  RQ_STYLE_NAMES,
  RQ_STYLE_SHORT_NAMES,
  RQ_TIE_LINE,
  rqScoringSteps,
} from './content'

/**
 * Everything a What Kind of Retiree quiz decides on the seller's behalf.
 *
 * The number that governs the quiz is the **type size**. Questions and
 * answers share it, and every gap is set against it. It runs from generous
 * large print down to a floor that stays comfortable for an older reader, and
 * no trim can talk the page below that floor: it prints fewer questions to a
 * page instead.
 *
 * Each question reserves a fixed **line budget**, sized from a typical
 * question and typical answers rather than the longest allowed. Four two-line
 * answers under a three-line question would leave most pages half empty. A
 * question that needs more lines than its budget is passed over for a spare.
 *
 * The **question count** follows from the page: the quiz asks at least eight
 * questions and at most ten, and it takes as many as fill its last page, so
 * no quiz ends on a page with one question and a hand's width of paper.
 * Comfortable type comes first; the floor is only for trims too small for it.
 *
 * The **results** follow the quiz: a scoring grid, one row per question, and
 * the four write-ups. They share one page when both fit at a comfortable
 * size; otherwise the grid gets a page and the write-ups the next.
 */

export const ptToPx = (pt: number) => Math.round((pt * DPI) / PDF_POINTS_PER_INCH)
export const pxToPt = (px: number) => Math.round((px * PDF_POINTS_PER_INCH) / DPI)

/** Large-print floor for questions and answers; the page prints fewer rather than go below. */
export const QUIZ_FONT_MIN = ptToPx(14)
const QUIZ_FONT_MAX = ptToPx(17)
/** The results page may step a little smaller than the quiz to keep the grid whole, never below this. */
export const RESULTS_FONT_MIN = ptToPx(13)
/** Column heads under the grid's symbols. Dropped rather than set below this. */
const GRID_LABEL_FONT_MIN = ptToPx(10)

export const LINE_HEIGHT = 1.15
/** Past three lines a question becomes a paragraph. */
export const MAX_QUESTION_LINES = 3
/** Past two lines an answer is no longer something you circle at a glance. */
export const MAX_ANSWER_LINES = 2
/** A crowded page is one a reader gives up on. */
export const MAX_QUESTIONS_PER_PAGE = 5
/** A quiz that runs longer than this has stopped being a light activity. */
export const MAX_QUIZ_PAGES = 4
/**
 * Lines a question may use beyond one typical question and four typical
 * answers. Two leave room for most real questions; fewer are only used when
 * two would leave a page holding a single question.
 */
const SPARE_BLOCK_LINES = [2, 1, 0] as const
/** Blocks wider than this run lines across a letter page no eye tracks. */
const BLOCK_MAX_WIDTH = Math.round(DPI * 6)

export const bodySpec = (font: string): FontSpec => ({ fontFamily: font })
export const boldSpec = (font: string): FontSpec => ({ fontFamily: font, fontWeight: 700 })
export const italicSpec = (font: string): FontSpec => ({ fontFamily: font, fontStyle: 'italic' })

export const textHeight = (lines: number, size: number) => fabricTextHeight(lines, size, LINE_HEIGHT)

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

/** Lines as they will be set: hard breaks Fabric has no reason to redo. */
export function breakLines(text: string, size: number, width: number, spec: FontSpec): string[] {
  return wrapTextToWidth(text, size, wrapSafeWidth(width, spec), spec)
}

/** True when the text sets on one line in `width`. */
export function fitsOneLine(text: string, size: number, width: number, spec: FontSpec): boolean {
  return measureBlockWidth(text, size, spec) <= wrapSafeWidth(width, spec)
}

/** True when wrapping kept every word whole — no word was split to fit. */
const wordsWhole = (lines: readonly string[], text: string) =>
  lines.join(' ').replace(/\s+/g, ' ') === text.replace(/\s+/g, ' ')

/* ------------------------------------------------------------------ *
 * The quiz pages
 * ------------------------------------------------------------------ */

export interface RqQuizMetrics {
  font: number
  /** Column holding "10." beside the question. */
  numberW: number
  /** Column holding the answer letter, with room for a pencil ring. */
  letterW: number
  questionGap: number
  rowGap: number
  blockGap: number
  footerFont: number
  footerGap: number
}

export function rqQuizMetrics(font: number, family: string): RqQuizMetrics {
  return {
    font,
    numberW: Math.ceil(measureBlockWidth('10.', font, boldSpec(family)) + font * 0.5),
    letterW: Math.round(font * 1.6),
    questionGap: Math.round(font * 0.45),
    rowGap: Math.round(font * 0.3),
    blockGap: Math.round(font * 1.2),
    footerFont: clamp(Math.round(font * 0.85), RESULTS_FONT_MIN, font),
    footerGap: Math.round(font * 0.6),
  }
}

export interface RqQuizPlan {
  metrics: RqQuizMetrics
  /** Width of one question block — what gets centred. */
  blockWidth: number
  /** Question column, right of the number. */
  questionWidth: number
  /** Answer column, right of the number and the letter. */
  answerWidth: number
  /** Questions a quiz page holds. */
  perPage: number
  /** Questions the quiz prints. */
  count: number
  /** Quiz pages, before the results. */
  pages: number
  /** Lines one question may use across its question and four answers. */
  blockLines: number
  /** Height reserved at the foot of every quiz page for its continue line. */
  footerHeight: number
  footerLines: number
  bottomGuard: number
}

export function breakQuestion(text: string, plan: Pick<RqQuizPlan, 'metrics' | 'questionWidth'>, font: string) {
  return breakLines(text, plan.metrics.font, plan.questionWidth, boldSpec(font))
}

export function breakAnswer(text: string, plan: Pick<RqQuizPlan, 'metrics' | 'answerWidth'>, font: string) {
  return breakLines(text, plan.metrics.font, plan.answerWidth, bodySpec(font))
}

/**
 * Lines one question needs on this geometry — its question and four answers —
 * or null when a row runs past its own limit.
 */
export function questionLineCount(
  question: string,
  answers: readonly string[],
  plan: Pick<RqQuizPlan, 'metrics' | 'questionWidth' | 'answerWidth'>,
  font: string,
): number | null {
  const questionLines = breakQuestion(question, plan, font).length
  if (questionLines > MAX_QUESTION_LINES) return null
  let total = questionLines
  for (const answer of answers) {
    const lines = breakAnswer(answer, plan, font).length
    if (lines > MAX_ANSWER_LINES) return null
    total += lines
  }
  return total
}

/** A question of `questionLines` over four answers holding `answerLines` lines. */
export function questionBlockHeight(
  questionLines: number,
  answerLines: readonly number[],
  metrics: RqQuizMetrics,
): number {
  const answers = answerLines.reduce((sum, lines) => sum + textHeight(lines, metrics.font), 0)
  return (
    textHeight(questionLines, metrics.font) +
    metrics.questionGap +
    answers +
    (answerLines.length - 1) * metrics.rowGap
  )
}

/**
 * A block using its whole line budget. Every row costs one glyph box plus a
 * full pitch per extra line, so any split of the same budget is the same
 * height; this one is simply the one the reserve is measured with.
 */
function budgetHeight(blockLines: number, metrics: RqQuizMetrics): number {
  const rows = [1, 1, 1, 1, 1]
  for (let extra = blockLines - rows.length, i = 0; extra > 0; extra--, i++) rows[i % rows.length]! += 1
  return questionBlockHeight(rows[0]!, rows.slice(1), metrics)
}

/** Everyday lengths; they set the per-question line budget. */
const TYPICAL_QUESTION = 'It is a free Tuesday with nothing planned. What sounds best?'
const TYPICAL_ANSWER = 'Fix that squeaky cupboard door'
/** The longest text the gates admit, built of ordinary words. */
const QUESTION_PROBE = 'Which weekend plan sounds like more fun to you '.repeat(3).slice(0, MAX_QUESTION_CHARS - 1).trim() + '?'
const ANSWER_PROBE = 'Invite the neighbors over for a picnic '.repeat(2).slice(0, MAX_ANSWER_CHARS).trim()

/** One question's four answers, in grid order — for measuring before letters are dealt. */
export type RqMeasurable = { question: string; answers: readonly string[] }

function quizPlanAt(
  field: Box,
  size: number,
  font: string,
  questions?: readonly RqMeasurable[],
): Omit<RqQuizPlan, 'count' | 'pages'> | null {
  const metrics = rqQuizMetrics(size, font)
  const blockWidth = Math.min(field.width, BLOCK_MAX_WIDTH)
  const questionWidth = blockWidth - metrics.numberW
  const answerWidth = questionWidth - metrics.letterW
  const geometry = { metrics, questionWidth, answerWidth }

  if (breakQuestion(QUESTION_PROBE, geometry, font).length > MAX_QUESTION_LINES) return null
  if (breakAnswer(ANSWER_PROBE, geometry, font).length > MAX_ANSWER_LINES) return null

  const footerLines = Math.max(
    ...[RQ_CONTINUE_LINE, RQ_FINISHED_LINE].map(
      (line) => breakLines(line, metrics.footerFont, blockWidth, italicSpec(font)).length,
    ),
  )
  if (footerLines > 2) return null
  const footerHeight = metrics.footerGap + textHeight(footerLines, metrics.footerFont)

  const typical =
    breakQuestion(TYPICAL_QUESTION, geometry, font).length +
    4 * breakAnswer(TYPICAL_ANSWER, geometry, font).length
  const bottomGuard = Math.round(size * 0.3)
  const usable = field.height - bottomGuard - footerHeight
  const capacity = (lines: number) =>
    Math.min(
      MAX_QUESTIONS_PER_PAGE,
      Math.floor((usable + metrics.blockGap) / (budgetHeight(lines, metrics) + metrics.blockGap)),
    )
  const budgets = SPARE_BLOCK_LINES.map((spare) =>
    Math.min(MAX_QUESTION_LINES + 4 * MAX_ANSWER_LINES, typical + spare),
  )
  let blockLines = budgets.find((lines) => capacity(lines) >= 2) ?? budgets[0]!
  if (questions) {
    // Real questions: the budget must hold at least the quiz minimum of them.
    const needed = questions
      .map((q) => questionLineCount(q.question, q.answers, geometry, font))
      .filter((lines): lines is number => lines !== null)
      .sort((a, b) => a - b)
    if (needed.length < MIN_QUESTIONS) return null
    blockLines = Math.max(blockLines, needed[MIN_QUESTIONS - 1]!)
  }
  const perPage = capacity(blockLines)
  if (perPage < 1) return null

  return {
    metrics,
    blockWidth,
    questionWidth,
    answerWidth,
    perPage,
    blockLines,
    footerHeight,
    footerLines,
    bottomGuard,
  }
}

/** Pages the quiz needs at this capacity, and the questions that fill them. */
function pagesFor(perPage: number): { pages: number; count: number } {
  const pages = Math.ceil(MIN_QUESTIONS / perPage)
  return { pages, count: Math.min(MAX_QUESTIONS, perPage * pages) }
}

/** Comfortable reading size. Below it the quiz only goes when no comfortable size fits. */
const QUIZ_FONT_COMFORT = ptToPx(15)

/**
 * The roomiest quiz these fields hold.
 *
 * Sizes are tried in two tiers: comfortable (15 pt and up) first, then the
 * large-print floor. Within a tier the fewest pages wins, then the largest
 * type. So a trim prints three questions a page at 15 pt rather than four at
 * the floor to save a page, and only a trim too small for comfortable type
 * steps down — never to fit more questions on a page that already holds a
 * sensible number.
 *
 * Given real `questions`, each size's line budget is widened until at least
 * the quiz minimum of them fit, so the density follows the text actually
 * written rather than a typical length.
 */
export function planRqQuiz(
  field: Box,
  font: string,
  questions?: readonly RqMeasurable[],
): RqQuizPlan | null {
  const tiers: [number, number][] = [
    [QUIZ_FONT_MAX, QUIZ_FONT_COMFORT],
    [QUIZ_FONT_COMFORT - 1, QUIZ_FONT_MIN],
  ]
  for (const [high, low] of tiers) {
    const plans: RqQuizPlan[] = []
    for (let size = high; size >= low; size--) {
      const plan = quizPlanAt(field, size, font, questions)
      if (!plan) continue
      const { pages, count } = pagesFor(plan.perPage)
      if (pages > MAX_QUIZ_PAGES) continue
      plans.push({ ...plan, pages, count })
    }
    if (plans.length === 0) continue
    const fewest = Math.min(...plans.map((plan) => plan.pages))
    return plans.find((plan) => plan.pages === fewest) ?? null
  }
  return null
}

/* ------------------------------------------------------------------ *
 * The results pages
 * ------------------------------------------------------------------ */

export interface RqResultsMetrics {
  font: number
  headingFont: number
  headingGap: number
  sectionGap: number
  stepNumberW: number
  stepGap: number
  gridGap: number
  /** Grid geometry. */
  numberColW: number
  cellW: number
  gridW: number
  headerH: number
  rowH: number
  totalRowH: number
  symbolSize: number
  labelFont: number
  /** Column heads under the symbols; empty when they cannot be set whole. */
  labels: Record<RetireeStyle, string[]> | null
  tieGap: number
  nameFont: number
  styleGap: number
  symbolColW: number
  descriptionGap: number
  funFont: number
}

function gridLabels(
  cellW: number,
  labelFont: number,
  font: string,
): Record<RetireeStyle, string[]> | null {
  const spec = boldSpec(font)
  const out = {} as Record<RetireeStyle, string[]>
  for (const style of RQ_STYLES) {
    const label = RQ_STYLE_SHORT_NAMES[style]
    const lines = breakLines(label, labelFont, cellW - 4, spec)
    if (lines.length > 2 || !wordsWhole(lines, label)) return null
    out[style] = lines
  }
  return out
}

function resultsMetrics(size: number, width: number, font: string): RqResultsMetrics | null {
  const numberColW = Math.ceil(measureBlockWidth('Total', Math.round(size * 0.8), boldSpec(font)) + size)
  const cellW = Math.min(Math.floor((width - numberColW) / 4), Math.round(size * 5.5))
  // The reader rings one letter per row; the cell must hold a pencil ring.
  if (cellW < Math.round(size * 2.2)) return null
  const labelFont = Math.max(GRID_LABEL_FONT_MIN, Math.round(size * 0.72))
  const labels = gridLabels(cellW, labelFont, font)
  const symbolSize = Math.round(size * 1.0)
  const labelLines = labels ? Math.max(...RQ_STYLES.map((style) => labels[style].length)) : 0
  const pad = Math.round(size * 0.45)
  const headerH =
    pad * 2 + symbolSize + (labels ? Math.round(size * 0.3) + textHeight(labelLines, labelFont) : 0)
  return {
    font: size,
    headingFont: Math.round(size * 1.2),
    headingGap: Math.round(size * 0.6),
    sectionGap: Math.round(size * 1.6),
    stepNumberW: Math.ceil(measureBlockWidth('3.', size, boldSpec(font)) + size * 0.5),
    stepGap: Math.round(size * 0.35),
    gridGap: Math.round(size * 0.9),
    numberColW,
    cellW,
    gridW: numberColW + cellW * 4,
    headerH,
    rowH: Math.round(size * 1.7),
    totalRowH: Math.round(size * 2.1),
    symbolSize,
    labelFont,
    labels,
    tieGap: Math.round(size * 0.7),
    nameFont: Math.round(size * 1.08),
    styleGap: Math.round(size * 0.9),
    symbolColW: Math.round(size * 1.7),
    descriptionGap: Math.round(size * 0.25),
    funFont: clamp(Math.round(size * 0.85), RESULTS_FONT_MIN, size),
  }
}

export interface RqScoringLayout {
  steps: string[][]
  tie: string[]
  height: number
}

export interface RqWriteUpsLayout {
  /** Description lines per style, in grid order. */
  descriptions: Record<RetireeStyle, string[]>
  fun: string[]
  height: number
}

export interface RqResultsPlan {
  metrics: RqResultsMetrics
  /** True when the grid and the write-ups share one page. */
  onePage: boolean
  blockWidth: number
  scoring: RqScoringLayout
  writeUps: RqWriteUpsLayout
  bottomGuard: number
}

const headingHeight = (metrics: RqResultsMetrics) =>
  fabricTextHeight(1, metrics.headingFont) + metrics.headingGap

export function gridHeight(metrics: RqResultsMetrics, count: number): number {
  return metrics.headerH + count * metrics.rowH + metrics.totalRowH
}

function scoringLayout(
  metrics: RqResultsMetrics,
  width: number,
  count: number,
  resultsBelow: boolean,
  font: string,
): RqScoringLayout | null {
  const { font: size } = metrics
  if (!fitsOneLine(RQ_SCORING_HEADING, metrics.headingFont, width, boldSpec(font))) return null
  const steps = rqScoringSteps(resultsBelow).map((step) =>
    breakLines(step, size, width - metrics.stepNumberW, bodySpec(font)),
  )
  const tie = breakLines(RQ_TIE_LINE, size, width, italicSpec(font))
  const stepsH =
    steps.reduce((sum, lines) => sum + textHeight(lines.length, size), 0) +
    (steps.length - 1) * metrics.stepGap
  const height =
    headingHeight(metrics) +
    stepsH +
    metrics.gridGap +
    gridHeight(metrics, count) +
    metrics.tieGap +
    textHeight(tie.length, size)
  return { steps, tie, height }
}

function writeUpsLayout(
  metrics: RqResultsMetrics,
  width: number,
  descriptions: Readonly<Record<RetireeStyle, string>>,
  font: string,
): RqWriteUpsLayout | null {
  const { font: size } = metrics
  if (!fitsOneLine(RQ_RESULTS_HEADING, metrics.headingFont, width, boldSpec(font))) return null
  // The symbol leads the name; the write-up runs the full width below both.
  const nameW = width - metrics.symbolColW
  const lines = {} as Record<RetireeStyle, string[]>
  let height = headingHeight(metrics)
  RQ_STYLES.forEach((style, index) => {
    lines[style] = breakLines(descriptions[style], size, width, bodySpec(font))
    height +=
      fabricTextHeight(1, metrics.nameFont) +
      metrics.descriptionGap +
      textHeight(lines[style].length, size) +
      (index < RQ_STYLES.length - 1 ? metrics.styleGap : 0)
  })
  if (RQ_STYLES.some((style) => !fitsOneLine(RQ_STYLE_NAMES[style], metrics.nameFont, nameW, boldSpec(font)))) {
    return null
  }
  const fun = breakLines(RQ_JUST_FOR_FUN_LINE, metrics.funFont, width, italicSpec(font))
  height += metrics.styleGap + textHeight(fun.length, metrics.funFont)
  return { descriptions: lines, fun, height }
}

/**
 * The results pages for these write-ups, largest type first.
 *
 * At each size the shared page is tried before the split, and the first size
 * that holds either wins: a roomy two-page result beats a cramped single one.
 * `promised` pins a plan the form already reported, so the page prints what
 * the note said whenever the real write-ups allow it.
 */
export function planRqResults(options: {
  field: Box
  count: number
  descriptions: Readonly<Record<RetireeStyle, string>>
  font: string
  startSize: number
  promised?: Pick<RqResultsPlan, 'onePage' | 'metrics'>
}): RqResultsPlan | null {
  const { field, count, descriptions, font, startSize, promised } = options
  const blockWidth = Math.min(field.width, BLOCK_MAX_WIDTH)

  const attempt = (size: number, onePage: boolean): RqResultsPlan | null => {
    const metrics = resultsMetrics(size, blockWidth, font)
    if (!metrics) return null
    const bottomGuard = Math.round(size * 0.5)
    const usable = field.height - bottomGuard
    const scoring = scoringLayout(metrics, blockWidth, count, onePage, font)
    const writeUps = writeUpsLayout(metrics, blockWidth, descriptions, font)
    if (!scoring || !writeUps) return null
    const fits = onePage
      ? scoring.height + metrics.sectionGap + writeUps.height <= usable
      : scoring.height <= usable && writeUps.height <= usable
    return fits ? { metrics, onePage, blockWidth, scoring, writeUps, bottomGuard } : null
  }

  if (promised) {
    const kept = attempt(promised.metrics.font, promised.onePage)
    if (kept) return kept
  }
  for (let size = startSize; size >= RESULTS_FONT_MIN; size--) {
    const plan = attempt(size, true) ?? attempt(size, false)
    if (plan) return plan
  }
  return null
}

/** A write-up of the longest length the gate admits, built of ordinary words. */
const DESCRIPTION_PROBE = 'You love a slow morning and a long walk with friends. '
  .repeat(5)
  .slice(0, MAX_DESCRIPTION_CHARS - 1)
  .trim()
  .concat('.')
export const RQ_DESCRIPTION_PROBES = Object.fromEntries(
  RQ_STYLES.map((style) => [style, DESCRIPTION_PROBE]),
) as Record<RetireeStyle, string>

/* ------------------------------------------------------------------ *
 * The whole quiz
 * ------------------------------------------------------------------ */

/** The safe printable column every page of this game lays out inside. */
export function rqContentBox(page: StudioConfigLayoutContext): Box {
  return insetHorizontal(contentBox(page), STUDIO_CONTENT_SAFE_INSET_X)
}

/** What is left of the column once the title and instruction have been set. */
export function rqBodyField(page: StudioConfigLayoutContext, config: StudioConfig, instruction: string): Box {
  const content = rqContentBox(page)
  const headerHeight = measureHeaderHeight(config, instruction, content.width)
  return {
    ...content,
    top: content.top + headerHeight,
    height: Math.max(1, content.height - headerHeight),
  }
}

export interface RqBookPlan {
  quiz: RqQuizPlan
  results: RqResultsPlan
}

/**
 * The quiz these settings make, measured before a question exists.
 *
 * The first quiz page carries the instruction, so every quiz page is planned
 * on that shorter field and later pages simply breathe more. The results
 * pages carry the title but no instruction, and are planned with write-ups of
 * the longest allowed length.
 */
export function rqWorstCasePlan(options: {
  page: StudioConfigLayoutContext
  config: StudioConfig
  instruction: string
  font: string
}): RqBookPlan | null {
  const { page, config, instruction, font } = options
  const quiz = planRqQuiz(rqBodyField(page, config, instruction), font)
  if (!quiz) return null
  const results = planRqResults({
    field: rqBodyField(page, config, ''),
    count: quiz.count,
    descriptions: RQ_DESCRIPTION_PROBES,
    font,
    startSize: quiz.metrics.font,
  })
  return results ? { quiz, results } : null
}

/** What the quiz prints on the trim currently in Settings. */
export function rqPrintNote(options: {
  page: StudioConfigLayoutContext | undefined
  config: StudioConfig
  instruction: string
  font: string
}): string {
  const { page } = options
  if (!page) {
    return `${MIN_QUESTIONS} to ${MAX_QUESTIONS} questions in large print, then a scoring grid and a write-up for every style.`
  }
  const plan = rqWorstCasePlan({ ...options, page })
  if (!plan) {
    return 'This page size is too small for a What Kind of Retiree quiz — choose a larger one in Settings.'
  }
  const { quiz, results } = plan
  const pages = quiz.pages === 1 ? '1 page' : `${quiz.pages} pages`
  const tail = results.onePage
    ? 'then one page to score it and read the results.'
    : 'then a scoring page and a results page.'
  return `${quiz.count} questions on ${pages} at ${pxToPt(quiz.metrics.font)} pt, ${tail}`
}
