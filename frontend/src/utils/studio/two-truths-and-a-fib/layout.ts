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
import {
  MAX_FACT_CHARS,
  MAX_STATEMENT_CHARS,
  MAX_TITLE_CHARS,
  TTF_STATEMENTS_PER_SET,
  ttfExplanation,
} from './content'

/**
 * Everything a Two Truths and a Fib page decides on the seller's behalf.
 *
 * The number that governs the page is the **statement size**: every other
 * size and gap is set against it, and the search runs over it from generous
 * large print down to a floor that is still comfortable for an older reader.
 * No trim can talk the page into small type — it prints fewer sets instead.
 *
 * Each set reserves a fixed **line budget** for its three statements, sized
 * from a typical statement rather than the longest one allowed: three
 * three-line statements would leave most pages half empty, and a set that
 * needs more lines than its budget is simply passed over for the next one.
 *
 * The page count is a promise made twice. The puzzle page and its answer page
 * print the same sets in the same places, and the answer page adds a short
 * correction under each set, so a plan only stands if both pages fit.
 */

export const ptToPx = (pt: number) => Math.round((pt * DPI) / PDF_POINTS_PER_INCH)
export const pxToPt = (px: number) => Math.round((px * PDF_POINTS_PER_INCH) / DPI)

/** Large-print floor for a statement; the page prints fewer sets rather than go below. */
export const STATEMENT_FONT_MIN = ptToPx(15)
const STATEMENT_FONT_MAX = ptToPx(18)
/** The answer page's correction may sit a little smaller than the statements, never below this. */
export const EXPLANATION_FONT_MIN = ptToPx(13)

export const STATEMENT_LINE_HEIGHT = 1.22
export const EXPLANATION_LINE_HEIGHT = 1.18
/** Past three lines a statement stops being a claim and becomes a paragraph. */
export const MAX_STATEMENT_LINES = 3
/** Past four lines a correction is a lecture. */
const MAX_EXPLANATION_LINES = 4

/**
 * Three sets a page at most. Each set is a heading and six or seven lines of
 * large print; a fourth only fits a letter page by dropping below the floor,
 * and a crowded fact page is one a reader gives up on.
 */
export const MAX_SETS_PER_PAGE = 3
/** Lines of statements a set may use beyond three typical statements. */
const SPARE_SET_LINES = 1
/** Blocks wider than this run statements across a letter page no eye tracks. */
const BLOCK_MAX_WIDTH = Math.round(DPI * 6)

export interface TtfMetrics {
  font: number
  titleFont: number
  explanationFont: number
  /** Column holding the row letters, and room for a pencil ring around one. */
  letterW: number
  titleGap: number
  rowGap: number
  blockGap: number
  explanationGap: number
  /** Radius of the answer ring drawn round the fib's letter. */
  ringR: number
}

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value))

export function ttfMetrics(font: number): TtfMetrics {
  return {
    font,
    // Same size as the statements: bold carries the heading, and a larger
    // size would push long titles off a 5 x 8 column.
    titleFont: font,
    explanationFont: clamp(Math.round(font * 0.9), EXPLANATION_FONT_MIN, font),
    letterW: Math.round(font * 2),
    titleGap: Math.round(font * 0.5),
    rowGap: Math.round(font * 0.6),
    blockGap: Math.round(font * 1.5),
    explanationGap: Math.round(font * 0.5),
    ringR: Math.round(font * 0.66),
  }
}

export const statementSpec = (font: string): FontSpec => ({ fontFamily: font })
export const boldSpec = (font: string): FontSpec => ({ fontFamily: font, fontWeight: 700 })

/** "1.  Early Telephones" — the set's heading, always one line. */
export const setHeading = (index: number, title: string) => `${index + 1}.  ${title}`

export interface TtfPagePlan {
  /** Sets this page prints. */
  count: number
  metrics: TtfMetrics
  /** Width of one block — what gets centred. */
  blockWidth: number
  /** Statement column, right of the letter column. */
  textWidth: number
  /** Statement lines one set may use across its three rows. */
  setLines: number
  /** Correction lines each set reserves on the answer page. */
  explanationLines: number
  bottomGuard: number
}

/** A statement as it will be set: hard breaks Fabric has no reason to redo. */
export function breakStatement(text: string, plan: Pick<TtfPagePlan, 'metrics' | 'textWidth'>, font: string) {
  const spec = statementSpec(font)
  return wrapTextToWidth(text, plan.metrics.font, wrapSafeWidth(plan.textWidth, spec), spec)
}

export function breakExplanation(
  text: string,
  plan: Pick<TtfPagePlan, 'metrics' | 'textWidth'>,
  font: string,
) {
  const spec = statementSpec(font)
  return wrapTextToWidth(text, plan.metrics.explanationFont, wrapSafeWidth(plan.textWidth, spec), spec)
}

/** True when the heading sets on one line across the block. */
export function headingFits(heading: string, metrics: TtfMetrics, blockWidth: number, font: string) {
  const spec = boldSpec(font)
  return measureBlockWidth(heading, metrics.titleFont, spec) <= wrapSafeWidth(blockWidth, spec)
}

export function statementHeight(lines: number, metrics: TtfMetrics): number {
  return fabricTextHeight(lines, metrics.font, STATEMENT_LINE_HEIGHT)
}

export function titleHeight(metrics: TtfMetrics): number {
  return fabricTextHeight(1, metrics.titleFont)
}

export function explanationHeight(lines: number, metrics: TtfMetrics): number {
  return fabricTextHeight(lines, metrics.explanationFont, EXPLANATION_LINE_HEIGHT)
}

/** Heading plus three rows holding `rowLines` lines between them. */
export function puzzleBlockHeight(rowLines: readonly number[], metrics: TtfMetrics): number {
  const rows = rowLines.reduce((sum, lines) => sum + statementHeight(lines, metrics), 0)
  return titleHeight(metrics) + metrics.titleGap + rows + (rowLines.length - 1) * metrics.rowGap
}

export function answerBlockHeight(
  rowLines: readonly number[],
  explanationLines: number,
  metrics: TtfMetrics,
): number {
  return (
    puzzleBlockHeight(rowLines, metrics) +
    metrics.explanationGap +
    explanationHeight(explanationLines, metrics)
  )
}

/**
 * Three rows using the whole line budget. Every row costs one glyph box plus
 * a full pitch per extra line, so any split of the same budget is the same
 * height; this one is simply the one the reserve is measured with.
 */
function budgetRows(setLines: number): number[] {
  const rows = Array.from({ length: TTF_STATEMENTS_PER_SET }, () => 1)
  for (let extra = setLines - TTF_STATEMENTS_PER_SET, i = 0; extra > 0; extra--, i++) {
    rows[i % rows.length]! += 1
  }
  return rows
}

/** A statement of everyday length; sets the per-set line budget. */
const TYPICAL_STATEMENT = 'The first telephone directory was printed in 1878 for fifty homes.'
/** The longest statement the gate admits, built of ordinary words. */
const STATEMENT_PROBE = 'The early telephone exchange was busy '.repeat(4).slice(0, MAX_STATEMENT_CHARS).trim()
const TITLE_PROBE = 'Early Telephone Exchanges Now'.repeat(2).slice(0, MAX_TITLE_CHARS).trim()
const FACT_PROBE = 'The first telephone directory was printed '.repeat(4).slice(0, MAX_FACT_CHARS).trim()

function planAt(
  puzzleField: Box,
  answerHeight: number,
  count: number,
  size: number,
  font: string,
): TtfPagePlan | null {
  const metrics = ttfMetrics(size)
  const blockWidth = Math.min(puzzleField.width, BLOCK_MAX_WIDTH)
  const textWidth = blockWidth - metrics.letterW
  const geometry = { metrics, textWidth }

  if (breakStatement(STATEMENT_PROBE, geometry, font).length > MAX_STATEMENT_LINES) return null
  if (!headingFits(setHeading(MAX_SETS_PER_PAGE - 1, TITLE_PROBE), metrics, blockWidth, font)) {
    return null
  }
  const explanationLines = breakExplanation(ttfExplanation('B', FACT_PROBE), geometry, font).length
  if (explanationLines > MAX_EXPLANATION_LINES) return null

  const typical = breakStatement(TYPICAL_STATEMENT, geometry, font).length
  const setLines = Math.min(
    TTF_STATEMENTS_PER_SET * MAX_STATEMENT_LINES,
    TTF_STATEMENTS_PER_SET * typical + SPARE_SET_LINES,
  )
  const rows = budgetRows(setLines)
  const bottomGuard = Math.round(size * 0.6)
  const gaps = (count - 1) * metrics.blockGap
  const puzzleStack = count * puzzleBlockHeight(rows, metrics) + gaps
  const answerStack = count * answerBlockHeight(rows, explanationLines, metrics) + gaps
  if (puzzleStack > puzzleField.height - bottomGuard) return null
  if (answerStack > answerHeight - bottomGuard) return null

  return { count, metrics, blockWidth, textWidth, setLines, explanationLines, bottomGuard }
}

/**
 * The fullest, roomiest page these fields hold.
 *
 * Count comes before size: the floor is already large print, so three sets at
 * the floor serve a book better than two at the ceiling with a third of the
 * page left white.
 */
export function planTtfPage(puzzleField: Box, answerHeight: number, font: string): TtfPagePlan | null {
  for (let count = MAX_SETS_PER_PAGE; count >= 1; count--) {
    for (let size = STATEMENT_FONT_MAX; size >= STATEMENT_FONT_MIN; size--) {
      const plan = planAt(puzzleField, answerHeight, count, size, font)
      if (plan) return plan
    }
  }
  return null
}

/** The safe printable column every page of this game lays out inside. */
export function ttfContentBox(page: StudioConfigLayoutContext): Box {
  return insetHorizontal(contentBox(page), STUDIO_CONTENT_SAFE_INSET_X)
}

/** What is left of the column once the title and instruction have been set. */
export function ttfBodyField(
  page: StudioConfigLayoutContext,
  config: StudioConfig,
  instruction: string,
): Box {
  const content = ttfContentBox(page)
  const headerHeight = measureHeaderHeight(config, instruction, content.width)
  return {
    ...content,
    top: content.top + headerHeight,
    height: Math.max(1, content.height - headerHeight),
  }
}

/**
 * The page these settings make, measured before a set exists.
 *
 * The answer page carries the same title but no instruction, so its field is
 * measured on its own.
 */
export function ttfWorstCasePlan(options: {
  page: StudioConfigLayoutContext
  config: StudioConfig
  instruction: string
  font: string
}): TtfPagePlan | null {
  const { page, config, instruction, font } = options
  const puzzleField = ttfBodyField(page, config, instruction)
  const answerField = ttfBodyField(page, config, '')
  return planTtfPage(puzzleField, answerField.height, font)
}

/** What a page prints on the trim currently in Settings. */
export function ttfPrintNote(options: {
  page: StudioConfigLayoutContext | undefined
  config: StudioConfig
  instruction: string
  font: string
}): string {
  const { page } = options
  const tail = 'plus an answer page that explains every fib.'
  if (!page) return `Up to ${MAX_SETS_PER_PAGE} puzzles a page, ${tail}`

  const plan = ttfWorstCasePlan({ ...options, page })
  if (!plan) {
    return 'This page size is too small for a Two Truths and a Fib page — choose a larger one in Settings.'
  }
  const sets = plan.count === 1 ? '1 puzzle a page' : `${plan.count} puzzles a page`
  return `${sets} at ${pxToPt(plan.metrics.font)} pt, ${tail}`
}
