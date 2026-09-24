import type {
  StudioConfig,
  StudioConfigLayoutContext,
} from '@/types/studio-template.types'
import type { RiddlesJokesMix } from '@/types/studio-riddles-jokes.types'
import { DPI, PDF_POINTS_PER_INCH } from '@/types/canvas-settings.types'
import { STUDIO_CONTENT_SAFE_INSET_X } from '@/constants/studio.constants'
import { contentBox, insetHorizontal, measureHeaderHeight, type Box } from '../studio-layout'
import {
  fabricTextHeight,
  wrapSafeWidth,
  wrapTextToWidth,
  type FontSpec,
} from '../studio-text-metrics'
import { MAX_ANSWER_CHARS, MAX_SETUP_CHARS } from './content'

/**
 * Everything a Riddles & Jokes page decides on the seller's behalf.
 *
 * The number that governs the page is the **text size**: the setups on the
 * puzzle page and the answers on the answer page share it, and every gap is
 * set against it. The search runs from generous large print down to a floor
 * that is still comfortable for an older reader. No trim can talk the page
 * into small type — it prints fewer items instead.
 *
 * About eight items is the aim, never the rule. The search first looks for a
 * page of at least six at a comfortable 16 pt or more, and only when a trim
 * cannot hold that does it allow the 15 pt floor. So a 6 x 9 page prints a
 * little under eight at a size a reader enjoys, rather than eight squeezed in.
 *
 * The page reserves a **line budget** for its setups, sized from a typical
 * setup rather than the longest one allowed: eight three-line setups would
 * leave most pages half empty, and an item that would overrun the budget is
 * simply passed over for the next one.
 *
 * The count is a promise made twice. The answer page prints the same items
 * under the same numbers, so a plan only stands if both pages fit.
 */

export const ptToPx = (pt: number) => Math.round((pt * DPI) / PDF_POINTS_PER_INCH)
export const pxToPt = (px: number) => Math.round((px * PDF_POINTS_PER_INCH) / DPI)

/** Large-print floor; the page prints fewer items rather than go below. */
export const TEXT_FONT_MIN = ptToPx(15)
/** Comfortable size tried first, down to this, before the floor is allowed. */
const TEXT_FONT_COMFORT = ptToPx(16)
const TEXT_FONT_MAX = ptToPx(18)

export const TEXT_LINE_HEIGHT = 1.22
/** Past three lines a setup stops being a quick question. */
export const MAX_SETUP_LINES = 3
/** Past two lines an answer stops being a punchline. */
export const MAX_ANSWER_LINES = 2

/** The page's target: enough to browse, few enough to stay large and airy. */
export const MAX_ITEMS_PER_PAGE = 8
/** A comfortable page holds at least this many before the floor size is tried. */
const COMFORT_MIN_ITEMS = 6
/** Blocks wider than this run questions across a letter page no eye tracks. */
const BLOCK_MAX_WIDTH = Math.round(DPI * 6)

export interface RjMetrics {
  font: number
  /** Column holding the item numbers. */
  numberW: number
  /** Space between two items, before any leftover height is shared out. */
  itemGap: number
}

export function rjMetrics(font: number): RjMetrics {
  return {
    font,
    numberW: Math.round(font * 1.9),
    itemGap: Math.round(font * 0.95),
  }
}

export const setupSpec = (font: string): FontSpec => ({ fontFamily: font })
export const answerSpec = (font: string): FontSpec => ({ fontFamily: font, fontWeight: 700 })

/** "1." — the number beside an item, on both pages. */
export const itemNumber = (index: number) => `${index + 1}.`

export interface RjPagePlan {
  /** Items this page prints. */
  count: number
  metrics: RjMetrics
  /** Width of one block — what gets centred. */
  blockWidth: number
  /** Text column, right of the number column. */
  textWidth: number
  /** Setup lines the whole page may use. */
  pageLines: number
  bottomGuard: number
}

/** A setup as it will be set: hard breaks Fabric has no reason to redo. */
export function breakSetup(text: string, plan: Pick<RjPagePlan, 'metrics' | 'textWidth'>, font: string) {
  const spec = setupSpec(font)
  return wrapTextToWidth(text, plan.metrics.font, wrapSafeWidth(plan.textWidth, spec), spec)
}

/** An answer as it will be set on the answer page, in bold. */
export function breakAnswer(text: string, plan: Pick<RjPagePlan, 'metrics' | 'textWidth'>, font: string) {
  const spec = answerSpec(font)
  return wrapTextToWidth(text, plan.metrics.font, wrapSafeWidth(plan.textWidth, spec), spec)
}

export function textHeight(lines: number, metrics: RjMetrics): number {
  return fabricTextHeight(lines, metrics.font, TEXT_LINE_HEIGHT)
}

/** Items holding `lines` lines each, with a plain gap between them. */
export function stackHeight(lines: readonly number[], metrics: RjMetrics): number {
  if (lines.length === 0) return 0
  const text = lines.reduce((sum, n) => sum + textHeight(n, metrics), 0)
  return text + (lines.length - 1) * metrics.itemGap
}

/**
 * `count` items using the whole line budget. Every item costs one glyph box
 * plus a full pitch per extra line, so any split of the same budget is the
 * same height; this one is simply the one the reserve is measured with.
 */
function budgetRows(pageLines: number, count: number): number[] {
  const rows = Array.from({ length: count }, () => 1)
  for (let extra = pageLines - count, i = 0; extra > 0; extra--, i++) rows[i % count]! += 1
  return rows
}

/** A setup of everyday length; sets the page's line budget. */
const TYPICAL_SETUP = 'What do you call a gardener who finally has time for every weed?'
/** The longest setup the gate admits, built of ordinary words. */
const SETUP_PROBE = 'Why did the retired gardener plant a whole row '.repeat(3).slice(0, MAX_SETUP_CHARS).trim()
const ANSWER_PROBE = 'Because every single day in the garden '.repeat(3).slice(0, MAX_ANSWER_CHARS).trim()

function planAt(
  puzzleField: Box,
  answerHeight: number,
  count: number,
  size: number,
  font: string,
): RjPagePlan | null {
  const metrics = rjMetrics(size)
  const blockWidth = Math.min(puzzleField.width, BLOCK_MAX_WIDTH)
  const textWidth = blockWidth - metrics.numberW
  const geometry = { metrics, textWidth }

  if (breakSetup(SETUP_PROBE, geometry, font).length > MAX_SETUP_LINES) return null
  if (breakAnswer(ANSWER_PROBE, geometry, font).length > MAX_ANSWER_LINES) return null

  const typical = breakSetup(TYPICAL_SETUP, geometry, font).length
  const pageLines = Math.min(count * MAX_SETUP_LINES, count * typical + Math.ceil(count / 3))
  const bottomGuard = Math.round(size * 0.6)
  const puzzleStack = stackHeight(budgetRows(pageLines, count), metrics)
  const answerStack = stackHeight(Array.from({ length: count }, () => MAX_ANSWER_LINES), metrics)
  if (puzzleStack > puzzleField.height - bottomGuard) return null
  if (answerStack > answerHeight - bottomGuard) return null

  return { count, metrics, blockWidth, textWidth, pageLines, bottomGuard }
}

/**
 * The fullest, roomiest page these fields hold.
 *
 * Two passes: at least six items at a comfortable size first, then anything
 * down to the floor. Within a pass count comes before size — the floor is
 * already large print, so a fuller page at the smaller size serves a book
 * better than a sparse one at the largest.
 */
export function planRjPage(puzzleField: Box, answerHeight: number, font: string): RjPagePlan | null {
  const passes = [
    { minCount: COMFORT_MIN_ITEMS, floor: TEXT_FONT_COMFORT },
    { minCount: 1, floor: TEXT_FONT_MIN },
  ]
  for (const pass of passes) {
    for (let count = MAX_ITEMS_PER_PAGE; count >= pass.minCount; count--) {
      for (let size = TEXT_FONT_MAX; size >= pass.floor; size--) {
        const plan = planAt(puzzleField, answerHeight, count, size, font)
        if (plan) return plan
      }
    }
  }
  return null
}

/** The safe printable column every page of this game lays out inside. */
export function rjContentBox(page: StudioConfigLayoutContext): Box {
  return insetHorizontal(contentBox(page), STUDIO_CONTENT_SAFE_INSET_X)
}

/** What is left of the column once the title and instruction have been set. */
export function rjBodyField(
  page: StudioConfigLayoutContext,
  config: StudioConfig,
  instruction: string,
): Box {
  const content = rjContentBox(page)
  const headerHeight = measureHeaderHeight(config, instruction, content.width)
  return {
    ...content,
    top: content.top + headerHeight,
    height: Math.max(1, content.height - headerHeight),
  }
}

/**
 * The page these settings make, measured before an item exists.
 *
 * The answer page carries the same title but no instruction, so its field is
 * measured on its own.
 */
export function rjWorstCasePlan(options: {
  page: StudioConfigLayoutContext
  config: StudioConfig
  instruction: string
  font: string
}): RjPagePlan | null {
  const { page, config, instruction, font } = options
  const puzzleField = rjBodyField(page, config, instruction)
  const answerField = rjBodyField(page, config, '')
  return planRjPage(puzzleField, answerField.height, font)
}

function itemNoun(mix: RiddlesJokesMix, count: number): string {
  if (mix === 'riddles') return count === 1 ? 'riddle' : 'riddles'
  if (mix === 'jokes') return count === 1 ? 'joke' : 'jokes'
  return count === 1 ? 'riddle or joke' : 'riddles and jokes'
}

/** What a page prints on the trim currently in Settings. */
export function rjPrintNote(options: {
  page: StudioConfigLayoutContext | undefined
  config: StudioConfig
  instruction: string
  font: string
  mix: RiddlesJokesMix
}): string {
  const { page, mix } = options
  const tail = 'plus an answer page.'
  if (!page) return `Up to ${MAX_ITEMS_PER_PAGE} ${itemNoun(mix, 2)} a page, ${tail}`

  const plan = rjWorstCasePlan({ ...options, page })
  if (!plan) {
    return 'This page size is too small for a Riddles & Jokes page — choose a larger one in Settings.'
  }
  return `${plan.count} ${itemNoun(mix, plan.count)} a page at ${pxToPt(plan.metrics.font)} pt, ${tail}`
}
