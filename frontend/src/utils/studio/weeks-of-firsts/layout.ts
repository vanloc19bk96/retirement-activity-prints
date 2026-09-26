import type { StudioConfig, StudioConfigLayoutContext } from '@/types/studio-template.types'
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
import { MAX_IDEA_CHARS, WF_WEEKS, type WfWeek } from './content'

/**
 * Everything a 52 Weeks of Firsts page decides on the seller's behalf.
 *
 * Every week is one framed card: "Week 12" and a date line across the top,
 * the week's idea under it, then ruled lines for notes. A card never splits
 * across pages, and every card in the book has the same shape, so a reader
 * learns the page once.
 *
 * The numbers that govern it are the **type size** and the **writing lines**
 * a week gets. The search runs from large print (18 pt) down to a 14 pt floor
 * and picks how many weeks share a page — at most three — so that every week
 * keeps at least the writing space chosen in the form. Fewer weeks per page
 * win over smaller type; more writing room wins over fewer pages.
 *
 * The first page opens with a line for the day the reader began, since the
 * weeks carry numbers, not dates. Space a page cannot fill with a whole card
 * is never left as a gap: on the first page it becomes a short "Firsts I'm
 * Looking Forward To" box (or a line or two more for each week there), and on
 * the last a "Looking Back" box to close the year.
 */

export const ptToPx = (pt: number) => Math.round((pt * DPI) / PDF_POINTS_PER_INCH)
export const pxToPt = (px: number) => Math.round((px * PDF_POINTS_PER_INCH) / DPI)

/** Large-print floor for the weekly ideas — nothing on the page is smaller. */
export const IDEA_FONT_MIN = ptToPx(14)
const IDEA_FONT_COMFORT = ptToPx(16)
const IDEA_FONT_MAX = ptToPx(18)
export const IDEA_LINE_HEIGHT = 1.2
/** Past this a weekly idea stops being a prompt and becomes a paragraph. */
export const MAX_IDEA_LINES = 3

/** Where Fabric sets a single line's baseline, as a share of its font size. */
const BASELINE = 0.908

/** A writing line an older hand can use: wider than wide-ruled paper. */
export const NOTE_PITCH_MIN = Math.round(DPI * 0.36)
/** Past this a card runs wider than an eye tracks comfortably. */
const BLOCK_MAX_WIDTH = Math.round(DPI * 6.5)
/** Shortest measure an idea may wrap into. */
export const IDEA_TEXT_MIN = Math.round(DPI * 2.6)
/** Room to hand-write a full date: "14 September 2027". */
export const DATE_LINE_MIN = Math.round(DPI * 1.25)
const DATE_LINE_MAX = Math.round(DPI * 1.9)
export const MAX_WEEKS_PER_PAGE = 3
const MAX_NOTE_LINES = 22
/** A reflection box shorter than this is a stray line, not a place to write. */
export const BOX_MIN_LINES = 3

export type WfWritingSpace = 'comfortable' | 'roomy'

export const WF_WRITING_SPACES: readonly {
  value: WfWritingSpace
  label: string
  minLines: number
}[] = [
  { value: 'comfortable', label: 'Comfortable', minLines: 5 },
  { value: 'roomy', label: 'Roomy', minLines: 9 },
]

export function parseWfSpace(raw: unknown): WfWritingSpace {
  return WF_WRITING_SPACES.some((space) => space.value === raw) ? (raw as WfWritingSpace) : 'comfortable'
}

export const minLinesFor = (space: WfWritingSpace) =>
  WF_WRITING_SPACES.find((s) => s.value === space)!.minLines

export const WEEK_LABEL = 'Week'
/** The widest week label, for measuring the header row. */
const WEEK_PROBE = `${WEEK_LABEL} 52`
export const DATE_LABEL = 'Date:'
export const START_LABEL = 'I began my year of firsts on:'
export const START_LABEL_SHORT = 'I began on:'
export const AHEAD_TITLE = 'Firsts I’m Looking Forward To'
export const AHEAD_TITLE_SHORT = 'Looking Ahead'
export const BACK_TITLE = 'Looking Back on My Year of Firsts'
export const BACK_TITLE_SHORT = 'Looking Back'
/** Written-on prompts that open the closing box, where the width allows. */
export const BACK_PROMPTS: readonly string[] = [
  'My favourite first:',
  'One I’d happily do again:',
  'Next, I’d like to try:',
]

/** The worst idea the gate admits: every character it allows, in wide words. */
const IDEA_PROBE = 'Walk the whole length of a historic canal towpath with a flask of tea'
  .slice(0, MAX_IDEA_CHARS)
  .trim()

export const boldSpec = (font: string): FontSpec => ({ fontFamily: font, fontWeight: 700 })
export const plainSpec = (font: string): FontSpec => ({ fontFamily: font })

export interface WfMetrics {
  font: number
  headFont: number
  /** Inside a card, left, right and top. */
  pad: number
  bottomPad: number
  /** Week label and date line, down to just under the date line. */
  headerH: number
  headGap: number
  /** Between a label and the line written on after it. */
  labelGap: number
  /** One writing line and the air above it. */
  pitch: number
  cardGap: number
  radius: number
  /** Height of the "I began on" row. */
  startH: number
  /** Between the bold "I began" label and its line: a bold run needs more air. */
  startGap: number
}

export function wfMetrics(font: number): WfMetrics {
  const headFont = Math.round(font * 1.15)
  return {
    font,
    headFont,
    pad: Math.round(font * 0.75),
    bottomPad: Math.round(font * 0.6),
    headerH: Math.ceil(
      Math.max(fabricTextHeight(1, headFont), headFont * BASELINE + Math.round(font * 0.12) + 2),
    ),
    headGap: Math.round(font * 0.45),
    labelGap: Math.round(font * 0.35),
    pitch: Math.max(NOTE_PITCH_MIN, Math.round(font * 1.8)),
    cardGap: Math.round(font * 0.8),
    radius: Math.round(font * 0.45),
    startH: Math.round(font * 1.7),
    startGap: Math.round(font * 0.6),
  }
}

/** Where the date line and a label's baseline sit in a row whose letters start at `top`. */
export const headBaseline = (top: number, metrics: WfMetrics) => top + metrics.headFont * BASELINE
export const baselineToTop = (baseline: number, fontSize: number) => baseline - fontSize * BASELINE

export interface WfPlan {
  metrics: WfMetrics
  /** Width of every card — what gets centred. */
  blockWidth: number
  /** Width inside a card: the idea's measure and the notes lines' length. */
  innerWidth: number
  dateLabelW: number
  dateLineW: number
  /** "I began my year of firsts on:", or the short form on a narrow trim. */
  startLabel: string
  /** Lines every idea may use; the card reserves them all. */
  ideaLines: number
  /** Writing lines on a standard card. */
  lines: number
  /** The fewest writing lines any week may have — the form's choice. */
  minLines: number
  /** Weeks on every page after the first. */
  perPage: number
  bottomGuard: number
}

/** The idea as it will be set: hard breaks Fabric has no reason to redo. */
export function breakIdea(text: string, plan: Pick<WfPlan, 'metrics' | 'innerWidth'>, font: string): string[] {
  const spec = plainSpec(font)
  return wrapTextToWidth(text, plan.metrics.font, wrapSafeWidth(plan.innerWidth, spec), spec)
}

const ideaHeight = (plan: Pick<WfPlan, 'metrics' | 'ideaLines'>) =>
  fabricTextHeight(plan.ideaLines, plan.metrics.font, IDEA_LINE_HEIGHT)

/** Everything in a card but its writing lines. */
export const cardFixed = (plan: Pick<WfPlan, 'metrics' | 'ideaLines'>) => {
  const { metrics } = plan
  return metrics.pad + metrics.headerH + metrics.headGap + ideaHeight(plan) + metrics.bottomPad
}

export const cardHeight = (plan: Pick<WfPlan, 'metrics' | 'ideaLines'>, lines: number) =>
  Math.ceil(cardFixed(plan) + lines * plan.metrics.pitch)

/** A reflection box: a title, then writing lines. */
const boxFixed = (metrics: WfMetrics) =>
  metrics.pad + fabricTextHeight(1, metrics.headFont) + metrics.bottomPad

export const boxLines = (metrics: WfMetrics, height: number) =>
  Math.min(MAX_NOTE_LINES, Math.floor((height - boxFixed(metrics)) / metrics.pitch))

export const boxMinHeight = (metrics: WfMetrics) =>
  Math.ceil(boxFixed(metrics) + BOX_MIN_LINES * metrics.pitch)

/** The two page bodies a year lays out in: under title and instruction, then under the title. */
export interface WfFields {
  first: Box
  laterHeight: number
}

/** Height a page gives its cards. */
export const usableHeight = (plan: Pick<WfPlan, 'bottomGuard'>, fields: WfFields) => (page: number) =>
  (page === 0 ? fields.first.height : fields.laterHeight) - plan.bottomGuard

function planAt(
  fields: WfFields,
  font: number,
  fontFamily: string,
  ideaLines: number,
  perPage: number,
  minLines: number,
): WfPlan | null {
  const blockWidth = Math.min(fields.first.width, BLOCK_MAX_WIDTH)
  const metrics = wfMetrics(font)
  const innerWidth = blockWidth - 2 * metrics.pad
  if (innerWidth < IDEA_TEXT_MIN) return null
  if (breakIdea(IDEA_PROBE, { metrics, innerWidth }, fontFamily).length > ideaLines) return null

  const bold = boldSpec(fontFamily)
  const plain = plainSpec(fontFamily)
  const weekW = hugTextBoxWidth(WEEK_PROBE, metrics.headFont, Infinity, bold)
  const dateLabelW = hugTextBoxWidth(DATE_LABEL, font, Infinity, plain)
  const dateRoom = innerWidth - weekW - metrics.font - dateLabelW - metrics.labelGap
  if (dateRoom < DATE_LINE_MIN) return null

  const startRoom = (label: string) =>
    blockWidth - hugTextBoxWidth(label, font, Infinity, bold) - metrics.startGap
  const startLabel = startRoom(START_LABEL) >= DATE_LINE_MIN ? START_LABEL : START_LABEL_SHORT
  if (startRoom(startLabel) < DATE_LINE_MIN) return null

  const base = { metrics, ideaLines, bottomGuard: Math.round(font * 0.4) }
  const usable = usableHeight(base, fields)
  const slot = Math.floor((usable(1) - (perPage - 1) * metrics.cardGap) / perPage)
  const lines = Math.min(MAX_NOTE_LINES, Math.floor((slot - cardFixed(base)) / metrics.pitch))
  if (lines < minLines) return null
  // The first page must still hold one whole week under its "I began" row —
  // shorter than the rest when a week has a page to itself, never below the
  // chosen writing space.
  if (metrics.startH + metrics.cardGap + cardHeight(base, minLines) > usable(0)) return null

  return {
    ...base,
    blockWidth,
    innerWidth,
    dateLabelW,
    dateLineW: Math.min(DATE_LINE_MAX, dateRoom),
    startLabel,
    lines,
    minLines,
    perPage,
  }
}

/**
 * Search order: large print (18 down to 16 pt) with the longest idea on two
 * lines, as many weeks per page as keep the chosen writing space; then down
 * to the 14 pt floor; only then three idea lines, on the narrowest trims.
 */
const SEARCH_PASSES: readonly (readonly [number, number, number])[] = [
  [2, IDEA_FONT_MAX, IDEA_FONT_COMFORT],
  [2, IDEA_FONT_COMFORT - 1, IDEA_FONT_MIN],
  [3, IDEA_FONT_COMFORT, IDEA_FONT_MIN],
]

export function planWeeksOfFirsts(
  fields: WfFields,
  fontFamily: string,
  space: WfWritingSpace,
): WfPlan | null {
  const minLines = minLinesFor(space)
  for (const [ideaLines, from, to] of SEARCH_PASSES) {
    for (let perPage = MAX_WEEKS_PER_PAGE; perPage >= 1; perPage--) {
      for (let font = from; font >= to; font--) {
        const plan = planAt(fields, font, fontFamily, ideaLines, perPage, minLines)
        if (plan) return plan
      }
    }
  }
  return null
}

/** The safe printable column every page lays out inside. */
export function wfContentBox(page: StudioConfigLayoutContext): Box {
  return insetHorizontal(contentBox(page), STUDIO_CONTENT_SAFE_INSET_X)
}

/** What is left of the column once the title (and instruction) have been set. */
export function wfBodyField(page: StudioConfigLayoutContext, config: StudioConfig, instruction: string): Box {
  const content = wfContentBox(page)
  const headerHeight = measureHeaderHeight(config, instruction, content.width)
  return { ...content, top: content.top + headerHeight, height: Math.max(1, content.height - headerHeight) }
}

export function wfFields(page: StudioConfigLayoutContext, config: StudioConfig, instruction: string): WfFields {
  return {
    first: wfBodyField(page, config, instruction),
    laterHeight: wfBodyField(page, config, '').height,
  }
}

/**
 * The year these settings make, measured before an idea exists.
 *
 * Probed with the longest idea the gate admits, so the type size is a
 * promise: every real idea is at most that long, and one that still breaks
 * onto more lines than the card reserved is passed over for a spare.
 */
export function wfWorstCasePlan(options: {
  page: StudioConfigLayoutContext
  config: StudioConfig
  instruction: string
  font: string
  space: WfWritingSpace
}): WfPlan | null {
  const { page, config, instruction, font, space } = options
  return planWeeksOfFirsts(wfFields(page, config, instruction), font, space)
}

/** One week, broken to its card's measure. */
export interface FittedWfWeek extends WfWeek {
  lines: string[]
}

export const fitWfWeeks = (weeks: readonly WfWeek[], plan: WfPlan, font: string): FittedWfWeek[] =>
  weeks.map((week) => ({ ...week, lines: breakIdea(week.idea, plan, font) }))

/** Everything a page prints below its title, with tops measured from the page body's top. */
export type WfBlock =
  | { kind: 'start'; top: number; height: number }
  | { kind: 'card'; top: number; height: number; lines: number; week: FittedWfWeek }
  | { kind: 'box'; role: 'ahead' | 'back'; top: number; height: number; lines: number }

export interface WfPage {
  blocks: WfBlock[]
}

/**
 * Stack cards from `top` down, `gap` apart. Returns the blocks and the bottom
 * of the last card.
 */
function stack(
  weeks: readonly FittedWfWeek[],
  plan: WfPlan,
  top: number,
  gap: number,
  lines: number,
): { blocks: WfBlock[]; bottom: number } {
  const height = cardHeight(plan, lines)
  const blocks: WfBlock[] = []
  let y = top
  weeks.forEach((week, i) => {
    if (i > 0) y += gap
    blocks.push({ kind: 'card', top: y, height, lines, week })
    y += height
  })
  return { blocks, bottom: y }
}

/** Weeks a page body of `room` holds at the standard card size. */
const capacity = (plan: WfPlan, room: number) =>
  Math.min(
    plan.perPage,
    Math.floor((room + plan.metrics.cardGap) / (cardHeight(plan, plan.lines) + plan.metrics.cardGap)),
  )

/**
 * Lay the fifty-two weeks over as many pages as they need.
 *
 * Every page after the first holds the same number of weeks at the same
 * positions — the spare height spread between the cards — so the pages read
 * as one book. The first page opens with the "I began" row; if it cannot hold
 * a full page of weeks, the room left becomes a "Looking forward" box when it
 * is tall enough to write in, or a line or two more for each week there. The
 * last page's leftover closes the year with a "Looking back" box when it fits.
 * Returns null when a page cannot hold even one week.
 */
export function paginateWeeksOfFirsts(
  weeks: readonly FittedWfWeek[],
  plan: WfPlan,
  usable: (page: number) => number,
  options: { boxes?: boolean } = {},
): WfPage[] | null {
  const { metrics } = plan
  const boxes = options.boxes !== false
  const standard = cardHeight(plan, plan.lines)
  const pages: WfPage[] = []

  // The first page.
  const start: WfBlock = { kind: 'start', top: 0, height: metrics.startH }
  const firstTop = metrics.startH + metrics.cardGap
  const firstRoom = usable(0) - firstTop
  // When a week has a page to itself, the first page's week is simply shorter.
  const standardFits = capacity(plan, firstRoom)
  const firstCount = Math.min(weeks.length, Math.max(1, standardFits))
  const firstWeeks = weeks.slice(0, firstCount)
  const leftover = firstRoom - (firstCount * standard + (firstCount - 1) * metrics.cardGap)
  if (
    boxes &&
    standardFits >= 1 &&
    firstCount < plan.perPage &&
    leftover - metrics.cardGap >= boxMinHeight(metrics)
  ) {
    const height = leftover - metrics.cardGap
    const ahead: WfBlock = { kind: 'box', role: 'ahead', top: firstTop, height, lines: boxLines(metrics, height) }
    const cards = stack(firstWeeks, plan, firstTop + height + metrics.cardGap, metrics.cardGap, plan.lines)
    pages.push({ blocks: [start, ahead, ...cards.blocks] })
  } else {
    // Each week here takes an equal share of the room as writing lines, and
    // whatever is left under a line's height goes between the cards.
    const share = Math.floor((firstRoom - (firstCount - 1) * metrics.cardGap) / firstCount)
    const lines = Math.min(MAX_NOTE_LINES, Math.floor((share - cardFixed(plan)) / metrics.pitch))
    if (lines < plan.minLines) return null
    const used = firstCount * cardHeight(plan, lines)
    const gap = firstCount > 1 ? Math.floor((firstRoom - used) / (firstCount - 1)) : metrics.cardGap
    pages.push({ blocks: [start, ...stack(firstWeeks, plan, firstTop, gap, lines).blocks] })
  }

  // Every later page: the same weeks per page at the same positions.
  const perPage = capacity(plan, usable(1))
  if (perPage < 1) return null
  const spreadGap =
    perPage > 1 ? Math.floor((usable(1) - perPage * standard) / (perPage - 1)) : metrics.cardGap
  for (let i = firstCount; i < weeks.length; i += perPage) {
    const cards = stack(weeks.slice(i, i + perPage), plan, 0, spreadGap, plan.lines)
    pages.push({ blocks: cards.blocks })
  }

  const last = pages.at(-1)!
  const bottom = Math.max(...last.blocks.map((b) => b.top + b.height))
  const room = usable(pages.length - 1) - bottom - metrics.cardGap
  if (boxes && pages.length > 1 && room >= boxMinHeight(metrics)) {
    const top = bottom + metrics.cardGap
    last.blocks.push({ kind: 'box', role: 'back', top, height: room, lines: boxLines(metrics, room) })
  }
  return pages
}

/** What a year prints on the trim currently in Settings. */
export function wfPrintNote(options: {
  page: StudioConfigLayoutContext | undefined
  config: StudioConfig
  instruction: string
  font: string
  space: WfWritingSpace
}): string {
  const { page, config, instruction, font, space } = options
  if (!page) return `${WF_WEEKS} weekly pages of prompts and writing space, fitted to your page size.`
  const fields = wfFields(page, config, instruction)
  const plan = planWeeksOfFirsts(fields, font, space)
  if (!plan) return 'This page size is too small for 52 Weeks of Firsts — choose a larger one in Settings.'
  const blank: FittedWfWeek[] = Array.from({ length: WF_WEEKS }, (_, i) => ({
    idea: '',
    concept: '',
    area: '',
    week: i + 1,
    lines: [],
  }))
  const pages = paginateWeeksOfFirsts(blank, plan, usableHeight(plan, fields))?.length
  const per = plan.perPage === 1 ? 'A full page for each week' : `${plan.perPage} weeks per page`
  const spread = pages ? `${pages} pages` : 'several pages'
  return `${per}, ${plan.lines} writing lines each — ${spread} in ${pxToPt(plan.metrics.font)} pt large print.`
}
