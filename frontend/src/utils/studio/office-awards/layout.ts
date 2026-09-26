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
import { oaDisplayAward, oaInstruction, oaTitleFor, type OaNumbered } from './content'

/**
 * Everything an Office Awards page decides on the seller's behalf.
 *
 * Every award is one framed card: a numbered rosette on the left, the award
 * title in bold large print, then "Winner: ________" — and, when the seller
 * asks for it, "Why: ________" for a quick reason. A card never splits across
 * pages, and every card on a page is the same width, centred in the column.
 *
 * The type size comes from the trim alone: the largest size (18 pt down to
 * 15 pt) at which a typical title reads on one line, 15 pt with titles
 * wrapping to a second line on narrow trims, 14 pt only as a floor. A title
 * that would need a third line is passed over for a spare, never shrunk.
 * Pages are never squeezed: the set takes as many pages as its cards need,
 * spread evenly, and spare height widens the gaps a little.
 */

export { ptToPx, pxToPt }

/** Large-print floor — nothing a coworker reads is smaller. */
export const AWARD_FONT_MIN = ptToPx(14)
const AWARD_FONT_COMFORT = ptToPx(15)
const AWARD_FONT_MAX = ptToPx(18)
export const AWARD_LINE_HEIGHT = 1.2
/** Past this an award stops being a title and becomes a sentence. */
export const MAX_AWARD_LINES = 2

/** A writing row an older hand can use: wider than wide-ruled paper. */
export const ROW_PITCH_MIN = Math.round(DPI * 0.4)
/** Room to write a first name and surname by hand. */
export const NAME_LINE_MIN = Math.round(DPI * 1.9)
/** Shortest measure a title may wrap into. */
export const AWARD_TEXT_MIN = Math.round(DPI * 2.6)
/** Smallest rosette that still reads as a badge with a number in it. */
export const BADGE_MIN = Math.round(DPI * 0.42)
/** Past this a card runs wider than an eye tracks comfortably. */
const CARD_MAX_WIDTH = Math.round(DPI * 6.5)
/** How far spare height may widen the gap between cards, as a share of it. */
const GAP_STRETCH = 0.8

/** A typical award: at comfortable sizes it sets on one line. */
const LINE_PROBE = 'Keeper of the Spare Phone Charger'

export const WINNER_LABEL = 'Winner:'
export const WHY_LABEL = 'Why:'

export const boldSpec = (font: string): FontSpec => ({ fontFamily: font, fontWeight: 700 })
export const plainSpec = (font: string): FontSpec => ({ fontFamily: font })

/** Where Fabric sets a single line's baseline, as a share of its font size. */
export const BASELINE = 0.908
export const baselineToTop = (baseline: number, fontSize: number) => baseline - fontSize * BASELINE

export interface OaMetrics {
  font: number
  /** One writing row: its line and the air above it. */
  rowH: number
  padX: number
  padY: number
  radius: number
  /** The rosette's outer radius. */
  badgeR: number
  /** How far the rosette's ribbon tails hang below its circle. */
  tail: number
  /** The rosette's number: one digit, or the smaller size two digits need inside the ring. */
  numberFont: number
  numberFontWide: number
  /** Between the rosette and the title. */
  badgeGap: number
  /** Between cards, before any stretch. */
  gap: number
  /** Between a label and the line written on after it. */
  labelGap: number
  /** Below the last writing line, so a descender never touches the frame. */
  descent: number
}

export function oaMetrics(font: number): OaMetrics {
  const badgeR = Math.max(Math.ceil(BADGE_MIN / 2), Math.round(font * 1.05))
  return {
    font,
    rowH: Math.max(ROW_PITCH_MIN, Math.round(font * 1.9)),
    padX: Math.round(font * 0.8),
    padY: Math.round(font * 0.7),
    radius: Math.round(font * 0.45),
    badgeR,
    tail: Math.round(badgeR * 0.8),
    numberFont: Math.round(badgeR * 0.95),
    numberFontWide: Math.round(badgeR * 0.78),
    badgeGap: Math.round(font * 0.8),
    gap: Math.round(font * 0.8),
    labelGap: Math.round(font * 0.4),
    descent: Math.round(font * 0.3),
  }
}

/** The writing line of a row whose top is `top`, and the baseline its label sits on. */
export const rowLineY = (top: number, metrics: OaMetrics) => top + metrics.rowH - 2
export const rowBaseline = (top: number, metrics: OaMetrics) =>
  rowLineY(top, metrics) - Math.round(metrics.font * 0.12)

export const badgeHeight = (metrics: OaMetrics) => 2 * metrics.badgeR + metrics.tail

export interface OaPlan {
  metrics: OaMetrics
  /** Width of every card — what gets centred. */
  cardWidth: number
  /** From a card's left edge to its title and labels. */
  textOffset: number
  /** The title's measure. */
  textWidth: number
  /** From a card's left edge to its writing lines. */
  lineOffset: number
  /** Every writing line's length. */
  lineW: number
  /** "Winner:" alone, or "Winner:" and "Why:". */
  rows: 1 | 2
  bottomGuard: number
}

/**
 * Greedy wrap, then — for a title that takes two lines — the break that
 * keeps the lines closest in length, so a title never ends on one lonely
 * word ("Always First to Lend a / Hand").
 */
function breakText(text: string, font: number, width: number, fontFamily: string): string[] {
  const spec = boldSpec(fontFamily)
  const safe = wrapSafeWidth(width, spec)
  const lines = wrapTextToWidth(text, font, safe, spec)
  if (lines.length !== 2) return lines
  const words = text.split(' ')
  let best = lines
  let bestWidth = Math.max(...lines.map((line) => measureRunWidth(line, font, spec)))
  for (let cut = 1; cut < words.length; cut++) {
    const pair = [words.slice(0, cut).join(' '), words.slice(cut).join(' ')]
    const widest = Math.max(...pair.map((line) => measureRunWidth(line, font, spec)))
    if (widest <= safe && widest < bestWidth) {
      best = pair
      bestWidth = widest
    }
  }
  return best
}

/** The title as it will be set: hard breaks Fabric has no reason to redo. */
export const breakAward = (text: string, plan: Pick<OaPlan, 'metrics' | 'textWidth'>, font: string) =>
  breakText(text, plan.metrics.font, plan.textWidth, font)

export const labelWidth = (text: string, font: number, fontFamily: string) =>
  hugTextBoxWidth(text, font, Infinity, plainSpec(fontFamily))

function planAt(width: number, font: number, fontFamily: string, oneLineProbe: boolean, rows: 1 | 2): OaPlan | null {
  const cardWidth = Math.min(width, CARD_MAX_WIDTH)
  const metrics = oaMetrics(font)
  const textOffset = metrics.padX + 2 * metrics.badgeR + metrics.badgeGap
  const textWidth = cardWidth - textOffset - metrics.padX
  if (textWidth < AWARD_TEXT_MIN) return null
  if (oneLineProbe && breakText(LINE_PROBE, font, textWidth, fontFamily).length > 1) return null
  const labelW = Math.ceil(
    Math.max(labelWidth(WINNER_LABEL, font, fontFamily), rows === 2 ? labelWidth(WHY_LABEL, font, fontFamily) : 0),
  )
  const lineW = textWidth - labelW - metrics.labelGap
  if (lineW < NAME_LINE_MIN) return null
  return {
    metrics,
    cardWidth,
    textOffset,
    textWidth,
    lineOffset: textOffset + labelW + metrics.labelGap,
    lineW,
    rows,
    bottomGuard: Math.round(font * 0.4),
  }
}

/**
 * Search order: 18 down to 15 pt while a typical title still reads on one
 * line; then 15 pt with titles wrapping a line more on narrow trims; the 14
 * pt floor only when nothing else fits the column.
 */
export function planOa(width: number, fontFamily: string, rows: 1 | 2): OaPlan | null {
  for (let font = AWARD_FONT_MAX; font >= AWARD_FONT_COMFORT; font--) {
    const plan = planAt(width, font, fontFamily, true, rows)
    if (plan) return plan
  }
  for (let font = AWARD_FONT_COMFORT; font >= AWARD_FONT_MIN; font--) {
    const plan = planAt(width, font, fontFamily, false, rows)
    if (plan) return plan
  }
  return null
}

export const awardTextHeight = (plan: Pick<OaPlan, 'metrics'>, lines: number) =>
  fabricTextHeight(lines, plan.metrics.font, AWARD_LINE_HEIGHT)

/** A whole card: the title and its writing rows beside the rosette, inside the frame's padding. */
export function cardHeight(plan: Pick<OaPlan, 'metrics' | 'rows'>, lines: number): number {
  const { metrics } = plan
  const text = awardTextHeight(plan, lines) + plan.rows * metrics.rowH + metrics.descent
  return Math.ceil(2 * metrics.padY + Math.max(text, badgeHeight(metrics)))
}

/** The safe printable column every page lays out inside. */
export function oaContentBox(page: StudioConfigLayoutContext): Box {
  return insetHorizontal(contentBox(page), STUDIO_CONTENT_SAFE_INSET_X)
}

/** The page bodies: under the title and how-to, then under the title alone. */
export interface OaFields {
  first: Box
  laterHeight: number
}

export interface OaLayout {
  plan: OaPlan
  title: string
  instruction: string
  fields: OaFields
}

/**
 * The pages these settings make, measured before an award exists: the type
 * size is fixed by the trim, so the form's note is what prints.
 */
export function oaLayout(options: {
  page: StudioConfigLayoutContext
  config: StudioConfig
  font: string
  name: string
  reasonLine: boolean
}): OaLayout | null {
  const { page, config, font, name, reasonLine } = options
  const content = oaContentBox(page)
  const plan = planOa(content.width, font, reasonLine ? 2 : 1)
  if (!plan) return null
  const title = oaTitleFor(config.title, name)
  const instruction = config.showInstructions === false ? '' : oaInstruction(name, reasonLine)
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

/** Height a page gives its cards. */
export const usableHeight = (plan: Pick<OaPlan, 'bottomGuard'>, fields: OaFields) => (page: number) =>
  (page === 0 ? fields.first.height : fields.laterHeight) - plan.bottomGuard

/** One award, as this book prints it, broken to its card's measure and measured. */
export interface FittedOaAward extends OaNumbered {
  /** The title as printed: the retiree's name in place of "the Retiree". */
  display: string
  lines: string[]
  height: number
}

export const fitOaAwards = (
  awards: readonly OaNumbered[],
  plan: OaPlan,
  font: string,
  name: string,
): FittedOaAward[] =>
  awards.map((a) => {
    const display = oaDisplayAward(a.award, name)
    const lines = breakAward(display, plan, font)
    return { ...a, display, lines, height: cardHeight(plan, lines.length) }
  })

/** One card on a page, its top measured from the page body's top. */
export interface OaBlock {
  top: number
  height: number
  award: FittedOaAward
}

export interface OaPage {
  blocks: OaBlock[]
}

/**
 * Lay the set's cards over as many pages as they need.
 *
 * Cards are spread as evenly as the pages allow — each page takes its fair
 * share of what is left, the first (which also carries the how-to) often a
 * little less — and every page shares one gap between cards, widened a
 * little where every page has room. Returns null when a page cannot hold a
 * single card.
 */
export function paginateOa(
  awards: readonly FittedOaAward[],
  plan: OaPlan,
  usable: (page: number) => number,
): OaPage[] | null {
  const { metrics } = plan
  const n = awards.length
  if (n === 0) return null

  const measure = (from: number, to: number) => ({
    total: awards.slice(from, to).reduce((sum, a) => sum + a.height, 0),
    gaps: Math.max(0, to - from - 1),
  })
  const fits = (page: number, from: number, to: number) => {
    const { total, gaps } = measure(from, to)
    return total + gaps * metrics.gap <= usable(page)
  }
  /** Page by page, each taking at most `share(page, left)` of the cards left. */
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

  const pages: OaPage[] = []
  counts.reduce((from, count) => {
    let y = 0
    const blocks = awards.slice(from, from + count).map((award) => {
      const block = { top: y, height: award.height, award }
      y += award.height + gap
      return block
    })
    pages.push({ blocks })
    return from + count
  }, 0)
  return pages
}

/** A typical set, for the form's note: one-line and two-line titles. */
const SAMPLE_AWARDS: readonly string[] = [
  'Calmest Voice on a Busy Shift',
  'Most Likely to Know Where Every Spare Key Is Kept',
  'Keeper of the Emergency Snack Drawer',
]

/** What these settings print on the trim currently in Settings. */
export function oaPrintNote(options: {
  page: StudioConfigLayoutContext | undefined
  config: StudioConfig
  font: string
  name: string
  count: number
  reasonLine: boolean
}): string {
  const { page, count } = options
  const tooSmall = 'This page size is too small for Office Awards — choose a larger one in Settings.'
  if (!page) return `${count} awards, each with a line for the winner’s name. Pages are fitted to your trim.`
  const layout = oaLayout({ ...options, page })
  if (!layout) return tooSmall
  const { plan } = layout
  const sample: FittedOaAward[] = Array.from({ length: count }, (_, i) => {
    const award = SAMPLE_AWARDS[i % SAMPLE_AWARDS.length]!
    const lines = breakAward(award, plan, options.font)
    return {
      award,
      display: award,
      theme: '',
      tone: 'playful',
      shape: '',
      concept: '',
      number: i + 1,
      lines,
      height: cardHeight(plan, lines.length),
    }
  })
  const pages = paginateOa(sample, plan, usableHeight(plan, layout.fields))?.length
  if (!pages) return tooSmall
  const span = pages === 1 ? 'one page' : `about ${pages} pages`
  return `${count} awards on ${span} in ${pxToPt(plan.metrics.font)} pt large print. Fresh awards every time, never repeated within your book.`
}
