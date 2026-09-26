import type { StudioConfig, StudioConfigLayoutContext } from '@/types/studio-template.types'
import { DPI } from '@/types/canvas-settings.types'
import { STUDIO_CONTENT_SAFE_INSET_X } from '@/constants/studio.constants'
import { contentBox, insetHorizontal, measureHeaderHeight, type Box } from '../studio-layout'
import {
  fabricTextHeight,
  hugTextBoxWidth,
  measureRunWidth,
  wrapSafeWidth,
  wrapTextToWidth,
  type FontSpec,
} from '../studio-text-metrics'
import { ptToPx, pxToPt } from '../weeks-of-firsts/layout'
import { CBN_INSTRUCTION, cbnTitleFor, type CbnNumbered } from './content'

/**
 * Everything a Career By the Numbers page decides on the seller's behalf.
 *
 * Every question is one row: a numbered ring on the left, the question in
 * large print, then "About ________ cups" — the writing line, and the unit
 * set on the same baseline right after it, so a unit can never drift away
 * from its line. Every line in a set is the same length, long enough for a
 * seven-digit guess by hand, and starts at the same place under its question.
 * A row never splits across pages.
 *
 * The type size comes from the trim alone: the largest size (18 pt down to
 * 15 pt) at which a typical question sets in two lines, 15 pt with questions
 * wrapping to a third line on narrow trims, 14 pt only as a floor. A question
 * that would need a fourth line, or a unit too wide for its row, is passed
 * over for a spare, never shrunk. Pages are never squeezed: the set takes as
 * many pages as its rows need, spread evenly, and spare height widens the
 * gaps a little. Where the last page has room to spare, a small row of
 * line-art motifs closes it.
 */

export { ptToPx, pxToPt }

/** Large-print floor — nothing the retiree reads is smaller. */
export const PROMPT_FONT_MIN = ptToPx(14)
const PROMPT_FONT_COMFORT = ptToPx(15)
const PROMPT_FONT_MAX = ptToPx(18)
export const PROMPT_LINE_HEIGHT = 1.25
/** Past this a question stops being quick to read. */
export const MAX_PROMPT_LINES = 3

/** Room above a writing line for handwritten digits: wider than wide-ruled paper. */
export const ANSWER_ROW_MIN = Math.round(DPI * 0.45)
/** Room to write a seven-digit guess ("1,250,000") by hand. */
export const NUMBER_LINE_MIN = Math.round(DPI * 1.4)
/** Past this a line only invites a sentence. */
const NUMBER_LINE_MAX = Math.round(DPI * 2.4)
/** Shortest measure a question may wrap into. */
export const PROMPT_TEXT_MIN = Math.round(DPI * 2.6)
/** Smallest ring that still reads as a number badge. */
export const BADGE_MIN = Math.round(DPI * 0.34)
/** Past this a row runs wider than an eye tracks comfortably. */
const COLUMN_MAX_WIDTH = Math.round(DPI * 6.2)
/** How far spare height may widen the gap between rows, as a share of it. */
const GAP_STRETCH = 0.8

/** A typical question: at comfortable sizes it sets in two lines. */
const LINE_PROBE = 'On a typical workday, how many cups of tea or coffee kept you going?'
/** The widest distance unit: every trim keeps room for it. */
const UNIT_PROBE = 'kilometres'

export const ABOUT_LABEL = 'About'

export const plainSpec = (font: string): FontSpec => ({ fontFamily: font })

/** Where Fabric sets a single line's baseline, as a share of its font size. */
export const BASELINE = 0.908
export const baselineToTop = (baseline: number, fontSize: number) => baseline - fontSize * BASELINE

export interface CbnMetrics {
  font: number
  /** The answer row: the air above the writing line, and the line. */
  rowH: number
  /** The number ring's radius. */
  badgeR: number
  /** The ring's number: one digit, or the smaller size two digits need inside it. */
  numberFont: number
  numberFontWide: number
  /** Between the ring and the question. */
  badgeGap: number
  /** Between rows, before any stretch. */
  gap: number
  /** Between "About", the line and the unit. */
  labelGap: number
  /** Below the writing line, so a descender never touches the next row. */
  descent: number
  /** The motif row's icon size. */
  motif: number
}

export function cbnMetrics(font: number): CbnMetrics {
  const badgeR = Math.max(Math.ceil(BADGE_MIN / 2), Math.round(font * 0.85))
  return {
    font,
    rowH: Math.max(ANSWER_ROW_MIN, Math.round(font * 1.9)),
    badgeR,
    numberFont: Math.round(badgeR * 0.95),
    numberFontWide: Math.round(badgeR * 0.78),
    badgeGap: Math.round(font * 0.7),
    gap: Math.round(font * 1.1),
    labelGap: Math.round(font * 0.4),
    descent: Math.round(font * 0.3),
    motif: Math.round(font * 1.4),
  }
}

/** The writing line of a row whose top is `top`, and the baseline its words sit on. */
export const rowLineY = (top: number, metrics: CbnMetrics) => top + metrics.rowH - 2
export const rowBaseline = (top: number, metrics: CbnMetrics) =>
  rowLineY(top, metrics) - Math.round(metrics.font * 0.12)

export const firstLineHeight = (metrics: CbnMetrics) => fabricTextHeight(1, metrics.font, PROMPT_LINE_HEIGHT)

/** How far the question sits below a row's top so its first line centres on the ring. */
export const textInset = (metrics: CbnMetrics) =>
  Math.max(0, Math.round(metrics.badgeR - firstLineHeight(metrics) / 2))

export interface CbnPlan {
  metrics: CbnMetrics
  /** Width of every row — what gets centred. */
  columnWidth: number
  /** From a row's left edge to its question, "About" and line. */
  textOffset: number
  /** The question's measure. */
  textWidth: number
  /** "About" as set. */
  aboutW: number
  /** From a row's left edge to its writing line. */
  lineOffset: number
  /** The widest unit a row has room for beside a line of the minimum length. */
  unitRoom: number
  bottomGuard: number
}

/**
 * Greedy wrap, then the narrowest measure that still takes no more lines —
 * so the lines come out close in length and a question never ends on one
 * lonely word ("…laughing with / coworkers?").
 */
function breakText(text: string, font: number, width: number, fontFamily: string): string[] {
  const spec = plainSpec(fontFamily)
  const safe = wrapSafeWidth(width, spec)
  const lines = wrapTextToWidth(text, font, safe, spec)
  if (lines.length < 2) return lines
  let lo = Math.max(...text.split(' ').map((word) => measureRunWidth(word, font, spec)))
  let hi = safe
  for (let step = 0; step < 12 && hi - lo > 1; step++) {
    const mid = (lo + hi) / 2
    if (wrapTextToWidth(text, font, mid, spec).length <= lines.length) hi = mid
    else lo = mid
  }
  const balanced = wrapTextToWidth(text, font, hi, spec)
  return balanced.length === lines.length ? balanced : lines
}

/** The question as it will be set: hard breaks Fabric has no reason to redo. */
export const breakQuestion = (text: string, plan: Pick<CbnPlan, 'metrics' | 'textWidth'>, font: string) =>
  breakText(text, plan.metrics.font, plan.textWidth, font)

export const labelWidth = (text: string, font: number, fontFamily: string) =>
  hugTextBoxWidth(text, font, Infinity, plainSpec(fontFamily))

export const unitWidth = (unit: string, plan: Pick<CbnPlan, 'metrics'>, font: string) =>
  labelWidth(unit, plan.metrics.font, font)

function planAt(width: number, font: number, fontFamily: string, twoLineProbe: boolean): CbnPlan | null {
  const columnWidth = Math.min(width, COLUMN_MAX_WIDTH)
  const metrics = cbnMetrics(font)
  const textOffset = 2 * metrics.badgeR + metrics.badgeGap
  const textWidth = columnWidth - textOffset
  if (textWidth < PROMPT_TEXT_MIN) return null
  if (twoLineProbe && breakText(LINE_PROBE, font, textWidth, fontFamily).length > 2) return null
  const aboutW = Math.ceil(labelWidth(ABOUT_LABEL, font, fontFamily))
  const unitRoom = Math.floor(textWidth - aboutW - 2 * metrics.labelGap - NUMBER_LINE_MIN)
  if (unitRoom < labelWidth(UNIT_PROBE, font, fontFamily)) return null
  return {
    metrics,
    columnWidth,
    textOffset,
    textWidth,
    aboutW,
    lineOffset: textOffset + aboutW + metrics.labelGap,
    unitRoom,
    bottomGuard: Math.round(font * 0.4),
  }
}

/**
 * Search order: 18 down to 15 pt while a typical question still sets in two
 * lines; then 15 pt with questions wrapping a line more on narrow trims; the
 * 14 pt floor only when nothing else fits the column.
 */
export function planCbn(width: number, fontFamily: string): CbnPlan | null {
  for (let font = PROMPT_FONT_MAX; font >= PROMPT_FONT_COMFORT; font--) {
    const plan = planAt(width, font, fontFamily, true)
    if (plan) return plan
  }
  for (let font = PROMPT_FONT_COMFORT; font >= PROMPT_FONT_MIN; font--) {
    const plan = planAt(width, font, fontFamily, false)
    if (plan) return plan
  }
  return null
}

/** Whether a question and its unit fit a row of this plan. */
export const fitsRow = (q: { question: string; unit: string }, plan: CbnPlan, font: string) =>
  breakQuestion(q.question, plan, font).length <= MAX_PROMPT_LINES && unitWidth(q.unit, plan, font) <= plan.unitRoom

/**
 * One writing-line length for the whole set: as long as the widest unit
 * allows, never past the comfortable maximum. `fitsRow` already kept every
 * unit within `unitRoom`, so this is never below `NUMBER_LINE_MIN`.
 */
export function answerLineWidth(plan: CbnPlan, units: readonly string[], font: string): number {
  const widest = Math.max(0, ...units.map((unit) => unitWidth(unit, plan, font)))
  const room = plan.textWidth - plan.aboutW - 2 * plan.metrics.labelGap - Math.ceil(widest)
  return Math.min(NUMBER_LINE_MAX, Math.floor(room))
}

export const questionTextHeight = (plan: Pick<CbnPlan, 'metrics'>, lines: number) =>
  fabricTextHeight(lines, plan.metrics.font, PROMPT_LINE_HEIGHT)

/** A whole row: the question and its answer line beside the ring. */
export function rowHeight(plan: Pick<CbnPlan, 'metrics'>, lines: number): number {
  const { metrics } = plan
  const text = textInset(metrics) + questionTextHeight(plan, lines) + metrics.rowH + metrics.descent
  return Math.ceil(Math.max(text, 2 * metrics.badgeR))
}

/** The safe printable column every page lays out inside. */
export function cbnContentBox(page: StudioConfigLayoutContext): Box {
  return insetHorizontal(contentBox(page), STUDIO_CONTENT_SAFE_INSET_X)
}

/** The page bodies: under the title and how-to, then under the title alone. */
export interface CbnFields {
  first: Box
  laterHeight: number
}

export interface CbnLayout {
  plan: CbnPlan
  title: string
  instruction: string
  fields: CbnFields
}

/**
 * The pages these settings make, measured before a question exists: the type
 * size is fixed by the trim, so the form's note is what prints.
 */
export function cbnLayout(options: {
  page: StudioConfigLayoutContext
  config: StudioConfig
  font: string
  name: string
}): CbnLayout | null {
  const { page, config, font, name } = options
  const content = cbnContentBox(page)
  const plan = planCbn(content.width, font)
  if (!plan) return null
  const title = cbnTitleFor(config.title, name)
  const instruction = config.showInstructions === false ? '' : CBN_INSTRUCTION
  const withTitle = { ...config, title }
  const firstH = measureHeaderHeight(withTitle, instruction, content.width)
  const laterH = measureHeaderHeight(withTitle, '', content.width)
  return {
    plan,
    title,
    instruction,
    fields: {
      first: { ...content, top: content.top + firstH, height: Math.max(1, content.height - firstH) },
      laterHeight: Math.max(1, content.height - laterH),
    },
  }
}

/** Height a page gives its rows. */
export const usableHeight = (plan: Pick<CbnPlan, 'bottomGuard'>, fields: CbnFields) => (page: number) =>
  (page === 0 ? fields.first.height : fields.laterHeight) - plan.bottomGuard

/** One question, broken to its row's measure and measured. */
export interface FittedCbnQuestion extends CbnNumbered {
  lines: string[]
  height: number
}

export const fitCbnQuestions = (questions: readonly CbnNumbered[], plan: CbnPlan, font: string): FittedCbnQuestion[] =>
  questions.map((q) => {
    const lines = breakQuestion(q.question, plan, font)
    return { ...q, lines, height: rowHeight(plan, lines.length) }
  })

/** One row on a page, its top measured from the page body's top. */
export interface CbnBlock {
  top: number
  height: number
  question: FittedCbnQuestion
}

export interface CbnPage {
  blocks: CbnBlock[]
  /** The closing motif row's top, on the last page only and only where it has room. */
  motifTop: number | null
}

/**
 * Lay the set's rows over as many pages as they need.
 *
 * Rows are spread as evenly as the pages allow — each page takes its fair
 * share of what is left, the first (which also carries the how-to) often a
 * little less — and every page shares one gap between rows, widened a little
 * where every page has room. The last page closes with the motif row when it
 * has a gap and a motif's height to spare. Returns null when a page cannot
 * hold a single row.
 */
export function paginateCbn(
  questions: readonly FittedCbnQuestion[],
  plan: CbnPlan,
  usable: (page: number) => number,
): CbnPage[] | null {
  const { metrics } = plan
  const n = questions.length
  if (n === 0) return null

  const measure = (from: number, to: number) => ({
    total: questions.slice(from, to).reduce((sum, q) => sum + q.height, 0),
    gaps: Math.max(0, to - from - 1),
  })
  const fits = (page: number, from: number, to: number) => {
    const { total, gaps } = measure(from, to)
    return total + gaps * metrics.gap <= usable(page)
  }
  /** Page by page, each taking at most `share(page, left)` of the rows left. */
  const split = (share: (page: number, left: number) => number): number[] | null => {
    const counts: number[] = []
    for (let from = 0; from < n; ) {
      const page = counts.length
      const most = share(page, n - from)
      let take = 0
      while (take < most && from + take < n && fits(page, from, from + take + 1)) take++
      if (take === 0) return null
      counts.push(take)
      from += take
    }
    return counts
  }

  const greedy = split(() => n)
  if (!greedy) return null
  const pageCount = greedy.length
  const even = split((page, left) => Math.ceil(left / Math.max(1, pageCount - page)))
  const counts = even && even.length === pageCount ? even : greedy

  // One gap for the whole set: widened while every page still has room.
  let stretch = metrics.gap * GAP_STRETCH
  counts.reduce((from, count, page) => {
    const { total, gaps } = measure(from, from + count)
    if (gaps > 0) stretch = Math.min(stretch, (usable(page) - total) / gaps - metrics.gap)
    return from + count
  }, 0)
  const gap = metrics.gap + Math.max(0, Math.floor(stretch))

  const pages: CbnPage[] = []
  counts.reduce((from, count, page) => {
    let y = 0
    const blocks = questions.slice(from, from + count).map((question) => {
      const block = { top: y, height: question.height, question }
      y += question.height + gap
      return block
    })
    const bottom = y - gap
    const last = page === counts.length - 1
    const motifTop = last && bottom + gap + metrics.motif <= usable(page) ? bottom + gap : null
    pages.push({ blocks, motifTop })
    return from + count
  }, 0)
  return pages
}

/** A typical set, for the form's note: two-line and three-line questions. */
const SAMPLE_QUESTIONS: readonly string[] = [
  'About how many cups of tea or coffee kept you going over your whole career?',
  'In a typical week, how many times were you asked where something was kept?',
  'How many pens went missing from your desk over the years?',
]

/** What these settings print on the trim currently in Settings. */
export function cbnPrintNote(options: {
  page: StudioConfigLayoutContext | undefined
  config: StudioConfig
  font: string
  name: string
  count: number
}): string {
  const { page, count } = options
  const tooSmall = 'This page size is too small for Career By the Numbers — choose a larger one in Settings.'
  if (!page) return `${count} questions, each with a line for a best guess. Pages are fitted to your trim.`
  const layout = cbnLayout({ ...options, page })
  if (!layout) return tooSmall
  const { plan } = layout
  const sample: FittedCbnQuestion[] = Array.from({ length: count }, (_, i) => {
    const question = SAMPLE_QUESTIONS[i % SAMPLE_QUESTIONS.length]!
    const lines = breakQuestion(question, plan, options.font)
    return {
      question,
      unit: 'cups',
      theme: '',
      tone: 'playful',
      shape: '',
      concept: '',
      number: i + 1,
      lines,
      height: rowHeight(plan, lines.length),
    }
  })
  const pages = paginateCbn(sample, plan, usableHeight(plan, layout.fields))?.length
  if (!pages) return tooSmall
  const span = pages === 1 ? 'one page' : `about ${pages} pages`
  return `${count} questions on ${span} in ${pxToPt(plan.metrics.font)} pt large print, each with a line for a best guess. Fresh questions every time, never repeated within your book.`
}
