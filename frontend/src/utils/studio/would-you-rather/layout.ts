import type {
  StudioConfig,
  StudioConfigLayoutContext,
} from '@/types/studio-template.types'
import { DPI, PDF_POINTS_PER_INCH } from '@/types/canvas-settings.types'
import { STUDIO_CONTENT_SAFE_INSET_X } from '@/constants/studio.constants'
import { contentBox, insetHorizontal, measureHeaderHeight, type Box } from '../studio-layout'
import {
  fabricTextHeight,
  wrapSafeWidth,
  wrapTextToWidth,
  type FontSpec,
} from '../studio-text-metrics'
import { MAX_OPTION_CHARS } from './content'

/**
 * Everything a Would You Rather page decides on the seller's behalf.
 *
 * The number that governs the page is the **choice type size**. Every gap,
 * box and checkbox is set against it, and the search runs over it from large
 * print down to a floor — so no trim can talk the page into small type.
 *
 * A question is always stacked: the lead, choice A in a box, a round "OR",
 * choice B in a box of exactly the same size, so neither choice looks like the
 * answer. Side-by-side boxes were measured on every KDP trim and never beat
 * this — they broke a choice into four short lines to gain nothing — so the
 * page does not offer them. Blocks are capped in width, so a letter page keeps
 * lines an eye can track.
 *
 * The page decides how many questions print. The form reports what the trim
 * produced (`wyrPrintNote`), and generate lays out against the same plan, so
 * the two never disagree.
 */

export const ptToPx = (pt: number) => Math.round((pt * DPI) / PDF_POINTS_PER_INCH)
export const pxToPt = (px: number) => Math.round((px * PDF_POINTS_PER_INCH) / DPI)

/** Large-print floor for the choices — nothing on the page is smaller. */
export const OPTION_FONT_MIN = ptToPx(14)
/** What a page aims for before it trades size for another question. */
const OPTION_FONT_COMFORT = ptToPx(16)
const OPTION_FONT_MAX = ptToPx(19)
export const OPTION_LINE_HEIGHT = 1.2

/** Past this a choice stops being a choice and becomes a paragraph. */
export const MAX_OPTION_LINES = 3

/**
 * Four questions a page at most — three with a writing line. More would fit a
 * letter page, but a conversation book should feel roomy, not like a form.
 */
export const MAX_QUESTIONS_PER_PAGE = 4
const MAX_QUESTIONS_WITH_REASON = 3

/** Past this a choice runs a line longer than an eye tracks comfortably. */
const BLOCK_MAX_WIDTH = Math.round(DPI * 5.2)
/** A writing line an older hand can use — wide-ruled paper. */
export const REASON_ROW_MIN = Math.round(DPI * 0.4)
/** Shortest text measure a choice may wrap into. */
export const OPTION_TEXT_MIN = Math.round(DPI * 1.6)

export interface WyrMetrics {
  font: number
  orFont: number
  padX: number
  padY: number
  check: number
  checkGap: number
  leadGap: number
  /** Height of the band between the boxes that holds the "OR". */
  orBand: number
  orDiameter: number
  reasonGap: number
  reasonH: number
  blockGap: number
  radius: number
}

export function wyrMetrics(font: number): WyrMetrics {
  const orFont = Math.max(ptToPx(12), Math.round(font * 0.8))
  const orDiameter = Math.round(orFont * 1.9)
  return {
    font,
    orFont,
    padX: Math.round(font * 0.6),
    padY: Math.round(font * 0.45),
    check: Math.round(font * 0.8),
    checkGap: Math.round(font * 0.5),
    leadGap: Math.round(font * 0.45),
    orBand: orDiameter + Math.round(font * 0.3),
    orDiameter,
    reasonGap: Math.round(font * 0.5),
    reasonH: Math.max(REASON_ROW_MIN, Math.round(font * 1.6)),
    blockGap: Math.round(font * 1.4),
    radius: Math.round(font * 0.35),
  }
}

export const leadSpec = (font: string): FontSpec => ({ fontFamily: font, fontWeight: 700 })
export const optionSpec = (font: string): FontSpec => ({ fontFamily: font })

export interface WyrPagePlan {
  /** Questions this page prints. */
  count: number
  metrics: WyrMetrics
  reasonLine: boolean
  /** Width of one question block and of each choice box — what gets centred. */
  blockWidth: number
  /** Width choice text wraps inside, right of the checkbox. */
  textWidth: number
  /** Lines each choice may use. A longer choice does not print. */
  optionLines: number
  bottomGuard: number
}

/** The choice as it will be set: hard breaks Fabric has no reason to redo. */
export function breakOption(
  text: string,
  plan: Pick<WyrPagePlan, 'metrics' | 'textWidth'>,
  font: string,
): string[] {
  const spec = optionSpec(font)
  return wrapTextToWidth(text, plan.metrics.font, wrapSafeWidth(plan.textWidth, spec), spec)
}

export function leadHeight(metrics: WyrMetrics): number {
  return fabricTextHeight(1, metrics.font)
}

export function optionTextHeight(lines: number, metrics: WyrMetrics): number {
  return fabricTextHeight(lines, metrics.font, OPTION_LINE_HEIGHT)
}

export function boxHeight(lines: number, metrics: WyrMetrics): number {
  return 2 * metrics.padY + optionTextHeight(lines, metrics)
}

/** One question: the lead, both boxes and the OR, and the writing line. */
export function blockHeight(
  lines: number,
  plan: Pick<WyrPagePlan, 'metrics' | 'reasonLine'>,
): number {
  const { metrics } = plan
  const reason = plan.reasonLine ? metrics.reasonGap + metrics.reasonH : 0
  return (
    leadHeight(metrics) +
    metrics.leadGap +
    2 * boxHeight(lines, metrics) +
    metrics.orBand +
    reason
  )
}

/** The worst choice the content gate admits: every character it allows. */
const OPTION_PROBE = 'Spend a whole summer painting '.repeat(3).slice(0, MAX_OPTION_CHARS).trim()

function planAt(options: {
  field: Box
  count: number
  font: number
  reasonLine: boolean
  fontFamily: string
}): WyrPagePlan | null {
  const { field, count, font, reasonLine, fontFamily } = options
  const metrics = wyrMetrics(font)
  const blockWidth = Math.min(field.width, BLOCK_MAX_WIDTH)
  const textWidth = blockWidth - 2 * metrics.padX - metrics.check - metrics.checkGap
  if (textWidth < OPTION_TEXT_MIN) return null

  const optionLines = breakOption(OPTION_PROBE, { metrics, textWidth }, fontFamily).length
  if (optionLines > MAX_OPTION_LINES) return null

  const bottomGuard = Math.round(font * 0.6)
  const stack =
    count * blockHeight(optionLines, { metrics, reasonLine }) + (count - 1) * metrics.blockGap
  if (stack > field.height - bottomGuard) return null

  return { count, metrics, reasonLine, blockWidth, textWidth, optionLines, bottomGuard }
}

export function maxQuestionsPerPage(reasonLine: boolean): number {
  return reasonLine ? MAX_QUESTIONS_WITH_REASON : MAX_QUESTIONS_PER_PAGE
}

/**
 * Search order: [fewest questions, smallest type] per pass.
 *
 * The first pass keeps the choices at a comfortable size and takes the most
 * questions that allows. A page that cannot hold two questions that way may
 * set them at the large-print floor instead — one lonely question on a 5 x 8
 * reads as a page left unfinished. Only then does a page fall to one.
 */
const SEARCH_PASSES: readonly (readonly [number, number])[] = [
  [2, OPTION_FONT_COMFORT],
  [2, OPTION_FONT_MIN],
  [1, OPTION_FONT_COMFORT],
  [1, OPTION_FONT_MIN],
]

/** The fullest, roomiest page this field holds. Within a count, the largest type wins. */
export function planWyrPage(
  field: Box,
  options: { reasonLine: boolean; fontFamily: string },
): WyrPagePlan | null {
  const cap = maxQuestionsPerPage(options.reasonLine)
  for (const [minCount, floor] of SEARCH_PASSES) {
    for (let count = cap; count >= minCount; count--) {
      for (let font = OPTION_FONT_MAX; font >= floor; font--) {
        const plan = planAt({ field, count, font, ...options })
        if (plan) return plan
      }
    }
  }
  return null
}

/** The safe printable column every Would You Rather page lays out inside. */
export function wyrContentBox(page: StudioConfigLayoutContext): Box {
  return insetHorizontal(contentBox(page), STUDIO_CONTENT_SAFE_INSET_X)
}

/** What is left of the column once the title and instruction have been set. */
export function wyrBodyField(
  page: StudioConfigLayoutContext,
  config: StudioConfig,
  instruction: string,
): Box {
  const content = wyrContentBox(page)
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
 * Probed with the longest choice the gate admits, so the count is a promise:
 * every real choice is at most that long, and one that still breaks onto more
 * lines than the probe is left off rather than squeezed in.
 */
export function wyrWorstCasePlan(options: {
  page: StudioConfigLayoutContext
  config: StudioConfig
  instruction: string
  font: string
  reasonLine: boolean
}): WyrPagePlan | null {
  const { page, config, instruction, font, reasonLine } = options
  return planWyrPage(wyrBodyField(page, config, instruction), { reasonLine, fontFamily: font })
}

/** What a page prints on the trim currently in Settings. */
export function wyrPrintNote(options: {
  page: StudioConfigLayoutContext | undefined
  config: StudioConfig
  instruction: string
  font: string
  reasonLine: boolean
}): string {
  const { page, reasonLine } = options
  if (!page) return `Up to ${maxQuestionsPerPage(reasonLine)} questions a page, fitted to your page size.`

  const plan = wyrWorstCasePlan({ ...options, page })
  if (!plan) {
    return 'This page size is too small for a Would You Rather page — choose a larger one in Settings.'
  }
  const questions = plan.count === 1 ? '1 question a page' : `${plan.count} questions a page`
  return `${questions}, in ${pxToPt(plan.metrics.font)} pt large print.`
}
