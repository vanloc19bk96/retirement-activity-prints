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
import { MAX_IDEA_CHARS, blSectionCount } from './content'

/**
 * Everything a bucket-list page decides on the seller's behalf.
 *
 * The number that governs the list is the **idea type size**. Checkbox,
 * number gutter, heading and every gap are set against it, and the search
 * runs from large print down to a floor — so no trim can talk the list into
 * small type to save a page.
 *
 * A page is a single column: a theme heading with a rule under it, then rows
 * of a checkbox, the idea's number and the idea. Numbers run on across pages
 * (1 to 100, never restarting), a heading always keeps at least two ideas
 * with it, and a heading that carries on over a page says so. The list takes
 * as many pages as it needs at comfortable spacing; nothing is squeezed to
 * save one.
 */

export const ptToPx = (pt: number) => Math.round((pt * DPI) / PDF_POINTS_PER_INCH)
export const pxToPt = (px: number) => Math.round((px * PDF_POINTS_PER_INCH) / DPI)

/** Large-print floor for the ideas — nothing in the list is smaller. */
export const IDEA_FONT_MIN = ptToPx(14)
const IDEA_FONT_COMFORT = ptToPx(16)
const IDEA_FONT_MAX = ptToPx(18)
export const IDEA_LINE_HEIGHT = 1.2

/** Past this an idea stops being a line to tick and becomes a paragraph. */
export const MAX_IDEA_LINES = 3

/** Past this a row runs wider than an eye tracks back to its checkbox. */
const BLOCK_MAX_WIDTH = Math.round(DPI * 6.2)
/** Shortest measure an idea may wrap into. */
export const IDEA_TEXT_MIN = Math.round(DPI * 2.2)
/** A box a pen can tick without touching its sides: about 3/16 inch. */
export const CHECK_MIN = Math.round(DPI * 0.18)

/** Longest number printed in the gutter. */
const NUMBER_PROBE = '100.'
/** Printed after a heading that carries on from the page before … */
export const CONTINUED = ' (continued)'
/** … or this, where the long form would not sit on one line. */
export const CONTINUED_SHORT = ' (cont.)'
/** A heading as long as the service may send (24 characters), carrying on. */
const HEADING_PROBE = `Memories & Keepsakes Too${CONTINUED_SHORT}`

/** Closing section of write-in lines, where the last page has room for it. */
export const OWN_IDEAS_TITLE = 'Your Own Ideas'
/** A writing line an older hand can use — wide-ruled paper. */
export const WRITE_ROW_MIN = Math.round(DPI * 0.4)
const MIN_WRITE_ROWS = 3
const MAX_WRITE_ROWS = 8

/** The worst idea the content gate admits: every character it allows. */
const IDEA_PROBE = 'Walk the whole length of a historic canal towpath in spring '
  .repeat(2)
  .slice(0, MAX_IDEA_CHARS)
  .trim()

/**
 * Idea lengths a real list runs to, shortest to longest in tenths — most are
 * four to seven words. Used to judge how much a type size makes ideas wrap,
 * and for the form's page estimate.
 */
const TYPICAL_LENGTHS = [21, 26, 29, 30, 33, 35, 37, 39, 42, 45] as const
const SAMPLE_TEXT = 'Spend a slow afternoon sketching the little boats in a quiet harbour town'
const sampleIdea = (length: number) => SAMPLE_TEXT.slice(0, length).trim()
/** The median idea: big type is only worth it while this still sits on one line. */
const TYPICAL_IDEA = sampleIdea(35)

export interface BlMetrics {
  font: number
  headingFont: number
  check: number
  /** Between the checkbox and the number. */
  checkGap: number
  /** Width of the number gutter; numbers are right-aligned in it. */
  numberW: number
  /** Between the number and the idea. */
  numberGap: number
  /** Air under every row. */
  rowGap: number
  headingGapAbove: number
  headingRuleGap: number
  headingGapBelow: number
  ruleWeight: number
}

export const boldSpec = (font: string): FontSpec => ({ fontFamily: font, fontWeight: 700 })
export const ideaSpec = (font: string): FontSpec => ({ fontFamily: font })

export function blMetrics(font: number, fontFamily: string, blockWidth: number): BlMetrics {
  const bold = boldSpec(fontFamily)
  // Headings a size up from the ideas, down to the ideas' own size if the
  // longest heading would not otherwise sit on one line.
  let headingFont = Math.round(font * 1.2)
  while (headingFont > font && hugTextBoxWidth(HEADING_PROBE, headingFont, Infinity, bold) > blockWidth) {
    headingFont--
  }
  return {
    font,
    headingFont,
    check: Math.max(CHECK_MIN, Math.round(font * 0.95)),
    checkGap: Math.round(font * 0.55),
    numberW: hugTextBoxWidth(NUMBER_PROBE, font, Infinity, bold),
    numberGap: Math.round(font * 0.4),
    rowGap: Math.round(font * 0.55),
    headingGapAbove: Math.round(font * 0.9),
    headingRuleGap: Math.round(font * 0.2),
    headingGapBelow: Math.round(font * 0.55),
    ruleWeight: 2,
  }
}

export interface BlPagePlan {
  metrics: BlMetrics
  /** Width of the list — what gets centred. */
  blockWidth: number
  /** Offset of the idea column from the block's left edge. */
  textLeft: number
  /** Width an idea wraps inside. */
  textWidth: number
  /** Lines an idea may use. A longer one does not print. */
  ideaLines: number
  bottomGuard: number
}

/** The idea as it will be set: hard breaks Fabric has no reason to redo. */
export function breakIdea(
  text: string,
  plan: Pick<BlPagePlan, 'metrics' | 'textWidth'>,
  font: string,
): string[] {
  const spec = ideaSpec(font)
  return wrapTextToWidth(text, plan.metrics.font, wrapSafeWidth(plan.textWidth, spec), spec)
}

export const ideaHeight = (lines: number, metrics: BlMetrics) =>
  fabricTextHeight(lines, metrics.font, IDEA_LINE_HEIGHT)

/** One row and the air under it. */
export const rowHeight = (lines: number, metrics: BlMetrics) =>
  Math.max(ideaHeight(lines, metrics), metrics.check) + metrics.rowGap

/** One write-in line, tall enough to write on. */
export const writeRowHeight = (metrics: BlMetrics) => Math.max(WRITE_ROW_MIN, rowHeight(1, metrics))

/** A heading, its rule and the air round it. No air above at the top of a page. */
export const headingHeight = (metrics: BlMetrics, atTop: boolean) =>
  (atTop ? 0 : metrics.headingGapAbove) +
  fabricTextHeight(1, metrics.headingFont) +
  metrics.headingRuleGap +
  metrics.ruleWeight +
  metrics.headingGapBelow

/** The two page bodies a list lays out in: under title and instruction, then under the title. */
export interface BlFields {
  first: Box
  laterHeight: number
}

/** Height a page gives its list. */
export const usableHeight = (plan: BlPagePlan, fields: BlFields) => (page: number) =>
  (page === 0 ? fields.first.height : fields.laterHeight) - plan.bottomGuard

function planAt(
  fields: BlFields,
  font: number,
  fontFamily: string,
  ideaLines: number,
  typicalOnOneLine: boolean,
): BlPagePlan | null {
  const blockWidth = Math.min(fields.first.width, BLOCK_MAX_WIDTH)
  const metrics = blMetrics(font, fontFamily, blockWidth)
  const textLeft = metrics.check + metrics.checkGap + metrics.numberW + metrics.numberGap
  const textWidth = blockWidth - textLeft
  if (textWidth < IDEA_TEXT_MIN) return null
  if (breakIdea(IDEA_PROBE, { metrics, textWidth }, fontFamily).length > ideaLines) return null
  if (typicalOnOneLine && breakIdea(TYPICAL_IDEA, { metrics, textWidth }, fontFamily).length > 1) return null
  if (hugTextBoxWidth(HEADING_PROBE, metrics.headingFont, Infinity, boldSpec(fontFamily)) > blockWidth) {
    return null
  }
  const plan: BlPagePlan = {
    metrics,
    blockWidth,
    textLeft,
    textWidth,
    ideaLines,
    bottomGuard: Math.round(font * 0.4),
  }
  // A page must hold a heading and a few of the longest ideas, or the list
  // would crumble into a page per heading.
  const usable = usableHeight(plan, fields)
  const worst = rowHeight(ideaLines, metrics)
  if (headingHeight(metrics, true) + 2 * worst > usable(0)) return null
  if (headingHeight(metrics, true) + 4 * worst > usable(1)) return null
  return plan
}

/**
 * Search order: type above a comfortable 16 pt only while a typical idea
 * still sits on one line — a list that wraps every other row is tiring to
 * scan, however big its type. Then 16 pt down to the 14 pt floor with the
 * longest idea on two lines; only then three lines on the narrowest trims.
 */
const SEARCH_PASSES: readonly (readonly [number, number, number, boolean])[] = [
  [2, IDEA_FONT_MAX, IDEA_FONT_COMFORT + 1, true],
  [2, IDEA_FONT_COMFORT, IDEA_FONT_MIN, false],
  [3, IDEA_FONT_COMFORT, IDEA_FONT_MIN, false],
]

export function planBucketList(fields: BlFields, fontFamily: string): BlPagePlan | null {
  for (const [lines, from, to, typical] of SEARCH_PASSES) {
    for (let font = from; font >= to; font--) {
      const plan = planAt(fields, font, fontFamily, lines, typical)
      if (plan) return plan
    }
  }
  return null
}

/** The safe printable column every bucket-list page lays out inside. */
export function blContentBox(page: StudioConfigLayoutContext): Box {
  return insetHorizontal(contentBox(page), STUDIO_CONTENT_SAFE_INSET_X)
}

/** What is left of the column once the title (and instruction) have been set. */
export function blBodyField(
  page: StudioConfigLayoutContext,
  config: StudioConfig,
  instruction: string,
): Box {
  const content = blContentBox(page)
  const headerHeight = measureHeaderHeight(config, instruction, content.width)
  return {
    ...content,
    top: content.top + headerHeight,
    height: Math.max(1, content.height - headerHeight),
  }
}

export function blFields(
  page: StudioConfigLayoutContext,
  config: StudioConfig,
  instruction: string,
): BlFields {
  return {
    first: blBodyField(page, config, instruction),
    laterHeight: blBodyField(page, config, '').height,
  }
}

/**
 * The list these settings make, measured before an idea exists.
 *
 * Probed with the longest idea the gate admits, so the type size is a
 * promise: every real idea is at most that long, and one that still breaks
 * onto more lines than the probe is passed over for a spare.
 */
export function blWorstCasePlan(options: {
  page: StudioConfigLayoutContext
  config: StudioConfig
  instruction: string
  font: string
}): BlPagePlan | null {
  const { page, config, instruction, font } = options
  return planBucketList(blFields(page, config, instruction), font)
}

/** One idea, numbered for the whole list and broken to its column. */
export interface FittedBlIdea {
  /** 1 for the first idea of the list, whatever page it lands on. */
  number: number
  idea: string
  lines: string[]
}

export interface FittedBlSection {
  key: string
  title: string
  ideas: FittedBlIdea[]
}

export type BlBlock =
  | { kind: 'heading'; title: string; continued: boolean; own?: boolean }
  | { kind: 'row'; item: FittedBlIdea }
  | { kind: 'write' }

export interface BlPage {
  blocks: BlBlock[]
  /** Height the blocks take, from the top of the page body. */
  height: number
}

/**
 * Flow the sections over as many pages as they need.
 *
 * A heading only starts where it and its next two ideas fit, so it is never
 * stranded at the foot of a page. A heading that runs over a page is repeated
 * at the top of the next, marked as continued, and does not leave a single
 * idea alone there when it can send one more across with it. Where the last
 * page has room, the list closes with a few write-in lines for the reader's
 * own ideas — never on a page of their own. Returns null when even an empty
 * page cannot hold a heading and one idea.
 */
export function paginateBucketList(
  sections: readonly FittedBlSection[],
  plan: BlPagePlan,
  usable: (page: number) => number,
  options: { writeIn?: boolean } = {},
): BlPage[] | null {
  const { metrics } = plan
  const pages: BlPage[] = []
  let blocks: BlBlock[] = []
  let y = 0
  const flush = () => {
    pages.push({ blocks, height: y })
    blocks = []
    y = 0
  }
  const rowH = (item: FittedBlIdea) => rowHeight(item.lines.length, metrics)

  for (const section of sections) {
    const { ideas } = section
    let i = 0
    let continued = false
    while (i < ideas.length) {
      const keep = ideas.slice(i, i + 2).reduce((sum, item) => sum + rowH(item), 0)
      if (y > 0 && y + headingHeight(metrics, false) + keep > usable(pages.length)) flush()
      const heading = headingHeight(metrics, y === 0)
      if (y === 0 && heading + rowH(ideas[i]!) > usable(pages.length)) return null
      blocks.push({ kind: 'heading', title: section.title, continued })
      y += heading

      let placed = 0
      while (i < ideas.length && y + rowH(ideas[i]!) <= usable(pages.length)) {
        blocks.push({ kind: 'row', item: ideas[i]! })
        y += rowH(ideas[i]!)
        i++
        placed++
      }
      if (i < ideas.length) {
        if (ideas.length - i === 1 && placed >= 3) {
          blocks.pop()
          i--
          y -= rowH(ideas[i]!)
        }
        flush()
        continued = true
      }
    }
  }
  if (blocks.length > 0) {
    if (options.writeIn !== false) {
      const room = usable(pages.length) - y - headingHeight(metrics, false)
      const lines = Math.min(MAX_WRITE_ROWS, Math.floor(room / writeRowHeight(metrics)))
      if (lines >= MIN_WRITE_ROWS) {
        blocks.push({ kind: 'heading', title: OWN_IDEAS_TITLE, continued: false, own: true })
        y += headingHeight(metrics, false)
        for (let line = 0; line < lines; line++) blocks.push({ kind: 'write' })
        y += lines * writeRowHeight(metrics)
      }
    }
    flush()
  }
  return pages
}

/** Number every idea for the whole list and break it to the plan's column. */
export function numberBlSections(
  sections: readonly { key: string; title: string; items: readonly { idea: string }[] }[],
  plan: BlPagePlan,
  font: string,
): FittedBlSection[] {
  let number = 0
  return sections.map((section) => ({
    key: section.key,
    title: section.title,
    ideas: section.items.map((item) => ({
      number: ++number,
      idea: item.idea,
      lines: breakIdea(item.idea, plan, font),
    })),
  }))
}

function typicalLines(plan: BlPagePlan, font: string): number[] {
  return TYPICAL_LENGTHS.map((length) =>
    Math.min(plan.ideaLines, breakIdea(sampleIdea(length), plan, font).length),
  )
}

/** Pages a list of this length takes with typical ideas, for the form's note. */
function estimatePages(plan: BlPagePlan, fields: BlFields, count: number, font: string): number | null {
  const headings = blSectionCount(count)
  const base = Math.floor(count / headings)
  const extra = count % headings
  const lines = typicalLines(plan, font)
  let number = 0
  const sections: FittedBlSection[] = Array.from({ length: headings }, (_, s) => ({
    key: `s${s}`,
    title: 'Heading',
    ideas: Array.from({ length: base + (s < extra ? 1 : 0) }, () => {
      number++
      // Spread the lengths through the list the way a real one mixes them.
      return { number, idea: '', lines: new Array(lines[(number * 7) % lines.length]!).fill('') }
    }),
  }))
  return paginateBucketList(sections, plan, usableHeight(plan, fields), { writeIn: false })?.length ?? null
}

/** What a list prints on the trim currently in Settings. */
export function blPrintNote(options: {
  page: StudioConfigLayoutContext | undefined
  config: StudioConfig
  instruction: string
  font: string
  count: number
}): string {
  const { page, config, instruction, font, count } = options
  const headings = blSectionCount(count)
  if (!page) return `${count} ideas under about ${headings} themed headings, fitted to your page size.`

  const fields = blFields(page, config, instruction)
  const plan = planBucketList(fields, font)
  if (!plan) return 'This page size is too small for a bucket list — choose a larger one in Settings.'
  const pages = estimatePages(plan, fields, count, font)
  const spread = pages ? `about ${pages} pages` : 'several pages'
  return `${count} ideas under about ${headings} themed headings — ${spread} in ${pxToPt(plan.metrics.font)} pt large print.`
}
