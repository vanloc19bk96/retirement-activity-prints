import type {
  StudioConfig,
  StudioConfigLayoutContext,
} from '@/types/studio-template.types'
import { DPI, PDF_POINTS_PER_INCH } from '@/types/canvas-settings.types'
import { STUDIO_CONTENT_SAFE_INSET_X } from '@/constants/studio.constants'
import { contentBox, insetHorizontal, measureHeaderHeight, type Box } from '../studio-layout'
import {
  fabricTextHeight,
  hugTextBoxWidth,
  wrapSafeWidth,
  wrapTextToWidth,
  type FontSpec,
} from '../studio-text-metrics'
import { EON_EVER, EON_NEVER, MAX_STATEMENT_CHARS } from './content'

/**
 * Everything an Ever or Never page decides on the seller's behalf.
 *
 * The number that governs the page is the **statement type size**. Every gap,
 * checkbox and rule is set against it, and the search runs over it from large
 * print down to a floor — so no trim can talk the page into small type.
 *
 * A page is a ruled list. Each row is a number, the statement, and two
 * answers — a box and "Ever", a box and "Never". Where the trim is wide enough
 * the answers sit to the right of the statement, so both columns of boxes line
 * up down the page like a scorecard (`inline`); on a narrow trim that would
 * squeeze the statement into a sliver, so the answers go on their own line
 * under it (`stacked`). The seller never chooses: the plan tries both and
 * keeps whichever holds the most statements at the largest type.
 *
 * The page decides how many statements print. The form reports what the trim
 * produced (`eonPrintNote`), and generate lays out against the same plan, so
 * the two never disagree.
 */

export const ptToPx = (pt: number) => Math.round((pt * DPI) / PDF_POINTS_PER_INCH)
export const pxToPt = (px: number) => Math.round((px * PDF_POINTS_PER_INCH) / DPI)

/** Large-print floor for the statements — nothing on the page is smaller. */
export const STATEMENT_FONT_MIN = ptToPx(14)
/** What a page aims for before it trades size for another statement. */
const STATEMENT_FONT_COMFORT = ptToPx(16)
const STATEMENT_FONT_MAX = ptToPx(20)
export const STATEMENT_LINE_HEIGHT = 1.2

/** Past this a statement stops being a quick question and becomes a paragraph. */
export const MAX_STATEMENT_LINES = 3

/**
 * Ten statements a page at most — six with a story line. More would fit a
 * letter page, but a party book should feel roomy, not like a survey form.
 */
export const MAX_STATEMENTS_PER_PAGE = 10
const MAX_STATEMENTS_WITH_STORY = 6

/** Past this a row runs wider than an eye tracks back from the boxes. */
const BLOCK_MAX_WIDTH = Math.round(DPI * 6.2)
/** A writing line an older hand can use — wide-ruled paper. */
export const STORY_ROW_MIN = Math.round(DPI * 0.4)
/** Shortest measure a statement may wrap into. */
export const STATEMENT_TEXT_MIN = Math.round(DPI * 1.8)
/** Answers only go beside a statement that still gets this much measure. */
const INLINE_TEXT_MIN = Math.round(DPI * 2.6)

/** Longest number printed in the gutter. */
const NUMBER_PROBE = `${MAX_STATEMENTS_PER_PAGE}.`

/** Footer tally: "Total Evers: ____ out of 10". */
export const TALLY_LABEL = 'Total Evers:'
export const tallyOutOf = (count: number) => `out of ${count}`

export type EonArrangement = 'inline' | 'stacked'

export interface EonMetrics {
  font: number
  /** Width of the number gutter; numbers are right-aligned in it. */
  numberW: number
  numberGap: number
  check: number
  checkGap: number
  /** Space between the "Ever" answer and the "Never" box. */
  answerGap: number
  /** Space between the statement and the answers beside it (inline). */
  columnGap: number
  /** Space between the statement and the answers under it (stacked). */
  answerRowGap: number
  padY: number
  storyGap: number
  storyH: number
  tallyGap: number
  /** Width the "Ever" and "Never" labels are set in. */
  everW: number
  neverW: number
  /** Both answers, boxes and labels, side by side. */
  answersW: number
}

export const boldSpec = (font: string): FontSpec => ({ fontFamily: font, fontWeight: 700 })
export const statementSpec = (font: string): FontSpec => ({ fontFamily: font })

export function eonMetrics(font: number, fontFamily: string): EonMetrics {
  const bold = boldSpec(fontFamily)
  const check = Math.round(font * 0.85)
  const checkGap = Math.round(font * 0.4)
  const answerGap = Math.round(font * 1.1)
  const everW = hugTextBoxWidth(EON_EVER, font, Infinity, bold)
  const neverW = hugTextBoxWidth(EON_NEVER, font, Infinity, bold)
  return {
    font,
    numberW: hugTextBoxWidth(NUMBER_PROBE, font, Infinity, bold),
    numberGap: Math.round(font * 0.5),
    check,
    checkGap,
    answerGap,
    columnGap: Math.round(font * 1.1),
    answerRowGap: Math.round(font * 0.4),
    padY: Math.round(font * 0.55),
    storyGap: Math.round(font * 0.3),
    storyH: Math.max(STORY_ROW_MIN, Math.round(font * 1.6)),
    tallyGap: Math.round(font * 0.9),
    everW,
    neverW,
    answersW: 2 * (check + checkGap) + everW + answerGap + neverW,
  }
}

export interface EonPagePlan {
  /** Statements this page prints. */
  count: number
  metrics: EonMetrics
  arrangement: EonArrangement
  storyLine: boolean
  /** Width of the ruled list — what gets centred. */
  blockWidth: number
  /** Offset of the statement column from the block's left edge. */
  textLeft: number
  /** Width a statement wraps inside. */
  textWidth: number
  /** Lines each statement may use. A longer one does not print. */
  statementLines: number
  /** Width of the tally footer at its widest count. */
  tallyWidth: number
  bottomGuard: number
}

/** The statement as it will be set: hard breaks Fabric has no reason to redo. */
export function breakStatement(
  text: string,
  plan: Pick<EonPagePlan, 'metrics' | 'textWidth'>,
  font: string,
): string[] {
  const spec = statementSpec(font)
  return wrapTextToWidth(text, plan.metrics.font, wrapSafeWidth(plan.textWidth, spec), spec)
}

export function statementHeight(lines: number, metrics: EonMetrics): number {
  return fabricTextHeight(lines, metrics.font, STATEMENT_LINE_HEIGHT)
}

/** One line of "Ever" / "Never" labels; the boxes are shorter than it. */
export function answerHeight(metrics: EonMetrics): number {
  return fabricTextHeight(1, metrics.font)
}

/** Statement and answers, without padding or the story line. */
export function rowContentHeight(
  lines: number,
  plan: Pick<EonPagePlan, 'metrics' | 'arrangement'>,
): number {
  const { metrics } = plan
  const text = statementHeight(lines, metrics)
  return plan.arrangement === 'inline'
    ? Math.max(text, answerHeight(metrics))
    : text + metrics.answerRowGap + answerHeight(metrics)
}

export function storyHeight(plan: Pick<EonPagePlan, 'metrics' | 'storyLine'>): number {
  return plan.storyLine ? plan.metrics.storyGap + plan.metrics.storyH : 0
}

/** One row between its rules, at the plan's padding. */
export function rowHeight(
  lines: number,
  plan: Pick<EonPagePlan, 'metrics' | 'arrangement' | 'storyLine'>,
): number {
  return 2 * plan.metrics.padY + rowContentHeight(lines, plan) + storyHeight(plan)
}

export function tallyHeight(metrics: EonMetrics): number {
  return metrics.tallyGap + fabricTextHeight(1, metrics.font)
}

/** The worst statement the content gate admits: every character it allows. */
const STATEMENT_PROBE = `${'Ever spent a sunny weekday afternoon painting the garden fence '
  .repeat(2)
  .slice(0, MAX_STATEMENT_CHARS - 1)
  .trim()}?`

function planAt(options: {
  field: Box
  count: number
  font: number
  storyLine: boolean
  fontFamily: string
  arrangement: EonArrangement
}): EonPagePlan | null {
  const { field, count, font, storyLine, fontFamily, arrangement } = options
  const metrics = eonMetrics(font, fontFamily)
  const blockWidth = Math.min(field.width, BLOCK_MAX_WIDTH)
  const textLeft = metrics.numberW + metrics.numberGap
  const column = blockWidth - textLeft
  const textWidth =
    arrangement === 'inline' ? column - metrics.columnGap - metrics.answersW : column
  if (textWidth < (arrangement === 'inline' ? INLINE_TEXT_MIN : STATEMENT_TEXT_MIN)) return null
  // Stacked answers sit under the statement, so they need its measure.
  if (arrangement === 'stacked' && metrics.answersW > column) return null

  const statementLines = breakStatement(STATEMENT_PROBE, { metrics, textWidth }, fontFamily).length
  if (statementLines > MAX_STATEMENT_LINES) return null

  const bold = boldSpec(fontFamily)
  const tallyWidth =
    hugTextBoxWidth(TALLY_LABEL, font, Infinity, bold) +
    hugTextBoxWidth(tallyOutOf(MAX_STATEMENTS_PER_PAGE), font, Infinity, statementSpec(fontFamily)) +
    2 * metrics.checkGap +
    Math.round(font * 3)
  if (tallyWidth > blockWidth) return null

  const bottomGuard = Math.round(font * 0.6)
  const stack =
    count * rowHeight(statementLines, { metrics, arrangement, storyLine }) + tallyHeight(metrics)
  if (stack > field.height - bottomGuard) return null

  return {
    count,
    metrics,
    arrangement,
    storyLine,
    blockWidth,
    textLeft,
    textWidth,
    statementLines,
    tallyWidth,
    bottomGuard,
  }
}

export function maxStatementsPerPage(storyLine: boolean): number {
  return storyLine ? MAX_STATEMENTS_WITH_STORY : MAX_STATEMENTS_PER_PAGE
}

/**
 * Search order: [fewest statements, smallest type] per pass.
 *
 * The first pass keeps the type at a comfortable size and takes the most
 * statements that allows — four is already a page worth playing, so a small
 * trim keeps its comfortable type rather than shrinking for a fifth row. A
 * page that cannot hold four that way sets them at the large-print floor
 * instead, then tries three the same way; two lonely statements read as a
 * page left unfinished. Only then does a page settle for fewer.
 */
const SEARCH_PASSES: readonly (readonly [number, number])[] = [
  [4, STATEMENT_FONT_COMFORT],
  [4, STATEMENT_FONT_MIN],
  [3, STATEMENT_FONT_COMFORT],
  [3, STATEMENT_FONT_MIN],
  [1, STATEMENT_FONT_COMFORT],
  [1, STATEMENT_FONT_MIN],
]

/** Answers beside the statement read best; under it is the fallback. */
const ARRANGEMENTS: readonly EonArrangement[] = ['inline', 'stacked']

/** The fullest, roomiest page this field holds. Within a count, the largest type wins. */
export function planEonPage(
  field: Box,
  options: { storyLine: boolean; fontFamily: string },
): EonPagePlan | null {
  const cap = maxStatementsPerPage(options.storyLine)
  for (const [minCount, floor] of SEARCH_PASSES) {
    for (let count = cap; count >= Math.min(minCount, cap); count--) {
      for (let font = STATEMENT_FONT_MAX; font >= floor; font--) {
        for (const arrangement of ARRANGEMENTS) {
          const plan = planAt({ field, count, font, arrangement, ...options })
          if (plan) return plan
        }
      }
    }
  }
  return null
}

/** The safe printable column every Ever or Never page lays out inside. */
export function eonContentBox(page: StudioConfigLayoutContext): Box {
  return insetHorizontal(contentBox(page), STUDIO_CONTENT_SAFE_INSET_X)
}

/** What is left of the column once the title and instruction have been set. */
export function eonBodyField(
  page: StudioConfigLayoutContext,
  config: StudioConfig,
  instruction: string,
): Box {
  const content = eonContentBox(page)
  const headerHeight = measureHeaderHeight(config, instruction, content.width)
  return {
    ...content,
    top: content.top + headerHeight,
    height: Math.max(1, content.height - headerHeight),
  }
}

/**
 * The page these settings make, measured before a statement exists.
 *
 * Probed with the longest statement the gate admits, so the count is a
 * promise: every real statement is at most that long, and one that still
 * breaks onto more lines than the probe is left off rather than squeezed in.
 */
export function eonWorstCasePlan(options: {
  page: StudioConfigLayoutContext
  config: StudioConfig
  instruction: string
  font: string
  storyLine: boolean
}): EonPagePlan | null {
  const { page, config, instruction, font, storyLine } = options
  return planEonPage(eonBodyField(page, config, instruction), { storyLine, fontFamily: font })
}

/** What a page prints on the trim currently in Settings. */
export function eonPrintNote(options: {
  page: StudioConfigLayoutContext | undefined
  config: StudioConfig
  instruction: string
  font: string
  storyLine: boolean
}): string {
  const { page, storyLine } = options
  if (!page) return `Up to ${maxStatementsPerPage(storyLine)} statements a page, fitted to your page size.`

  const plan = eonWorstCasePlan({ ...options, page })
  if (!plan) {
    return 'This page size is too small for an Ever or Never page — choose a larger one in Settings.'
  }
  const statements = plan.count === 1 ? '1 statement a page' : `${plan.count} statements a page`
  return `${statements}, in ${pxToPt(plan.metrics.font)} pt large print.`
}
