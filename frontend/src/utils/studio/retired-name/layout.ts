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
import {
  RN_LETTERS,
  RN_LETTERS_HEADING,
  RN_MONTHS,
  RN_MONTHS_HEADING,
  RN_MONTHS_SHORT,
  type RnExample,
} from './content'

/**
 * Everything a retired-name page decides on the seller's behalf.
 *
 * The page is two lookup tables — 26 letters and 12 months — plus a worked
 * example and a line to write the result on. The number that governs it is
 * the **type size** of the entries: every gap, rule and column is set against
 * it, and the search runs from roomy down to a floor, so no trim can talk the
 * page into small type.
 *
 * The seller never picks columns. At each size the plan tries, in order:
 *
 * - `side` — letters in two columns beside a single column of months, 13 rows
 *   against 12, balanced like a menu (wide trims at large type);
 * - `stacked` — letters above months, each spread over as many columns as the
 *   width takes (two to four for letters, one to three for months).
 *
 * Month names print in full, or as "Jan", "Feb"… when that is what lets the
 * months sit side by side. The example and the write-in line are the first
 * things a small trim gives up — before the type drops below comfortable, the
 * write-in goes; before it drops below the floor, the example goes.
 *
 * Planned with the longest names the gates admit, so the form's note is a
 * promise: a real name is at most that long, and one that still sets wider
 * than its column is passed over for a spare rather than squeezed in.
 */

export const ptToPx = (pt: number) => Math.round((pt * DPI) / PDF_POINTS_PER_INCH)
export const pxToPt = (px: number) => Math.round((px * PDF_POINTS_PER_INCH) / DPI)

/** Floor for every entry — the size crossword clues and word lists stop at too. */
export const NAME_FONT_MIN = ptToPx(12)
/** What a page aims for before it gives up the write-in line. */
const NAME_FONT_COMFORT = ptToPx(14)
const NAME_FONT_MAX = ptToPx(18)
/** Line height of the example lines when one wraps. */
export const EXAMPLE_LINE_HEIGHT = 1.15
/** Heavier rule under a section heading; row rules are hairlines. */
export const HEADING_RULE = 2

/** Past this a row runs wider than an eye tracks from key to name. */
const BLOCK_MAX_WIDTH = Math.round(DPI * 7)

/**
 * Widest names the gates admit, at their full length and in wide letters.
 * Never printed; a test holds them to the budgets in `content.ts`.
 */
export const FIRST_PROBE = 'Commodores'
export const LAST_PROBE = 'Wheelbarrow Whiz'
const EXAMPLE_LEAD_PROBE = 'Example: Frankie, born in September'
const exampleResultProbe = (month: string) => `M + ${month} = ${FIRST_PROBE} ${LAST_PROBE}`
/** An example that needs more lines than this is not worth its space. */
const EXAMPLE_MAX_LINES = 2

export const WRITE_IN_LABEL = 'My retired name:'

export type RnArrangement = 'side' | 'stacked'
export type RnMonthStyle = 'full' | 'short'

export const boldSpec = (font: string): FontSpec => ({ fontFamily: font, fontWeight: 700 })
export const plainSpec = (font: string): FontSpec => ({ fontFamily: font })

export interface RnMetrics {
  font: number
  headFont: number
  padY: number
  rowH: number
  keyGap: number
  gutter: number
  sideGap: number
  sectionGap: number
  headH: number
  headGap: number
  exampleGap: number
  exPadX: number
  exPadY: number
  exLineGap: number
  writeInGap: number
  writeInH: number
  topPad: number
  bottomGuard: number
}

export function rnMetrics(font: number): RnMetrics {
  const headFont = Math.round(font * 1.12)
  const padY = Math.round(font * 0.22)
  return {
    font,
    headFont,
    padY,
    rowH: fabricTextHeight(1, font) + 2 * padY,
    keyGap: Math.round(font * 0.5),
    gutter: Math.round(font * 1.0),
    sideGap: Math.round(font * 1.6),
    sectionGap: Math.round(font * 0.9),
    headH: fabricTextHeight(1, headFont),
    headGap: Math.round(font * 0.3),
    exampleGap: Math.round(font * 0.9),
    exPadX: Math.round(font * 0.8),
    exPadY: Math.round(font * 0.5),
    exLineGap: Math.round(font * 0.25),
    writeInGap: Math.round(font * 0.9),
    writeInH: fabricTextHeight(1, font),
    topPad: Math.round(font * 0.2),
    bottomGuard: Math.round(font * 0.5),
  }
}

/** One lookup table: where it sits in the block and how its columns divide. */
export interface RnSection {
  heading: string
  /** The heading's size: a step up from the entries where the section is wide enough. */
  headFont: number
  /** Offset from the block's left edge. */
  left: number
  width: number
  cols: number
  rows: number
  colWidth: number
  /** Width of the bold key ("A", "September") every row starts with. */
  keyW: number
  /** Width a name sets in — the rest of its column. */
  valueW: number
}

export interface RnExamplePlan {
  /** Lines reserved for "Example: Pat, born in July". */
  leadLines: number
  /** Lines reserved for "P + July = Captain Porch Rocker". */
  resultLines: number
  innerWidth: number
  height: number
}

export interface RnPagePlan {
  metrics: RnMetrics
  arrangement: RnArrangement
  monthStyle: RnMonthStyle
  /** What each month's key prints as, January first. */
  monthLabels: readonly string[]
  /** Width of everything below the header — what gets centred. */
  blockWidth: number
  letters: RnSection
  months: RnSection
  example: RnExamplePlan | null
  writeIn: boolean
  /** Natural height of the block before leftover space is shared out. */
  height: number
}

export const sectionHeight = (section: Pick<RnSection, 'rows'>, metrics: RnMetrics, rowH = metrics.rowH) =>
  metrics.headH + metrics.headGap + HEADING_RULE + section.rows * rowH

/** Natural height of the whole block, rows at `rowH` and gaps at their base. */
export function blockHeight(
  plan: Pick<RnPagePlan, 'metrics' | 'arrangement' | 'letters' | 'months' | 'example' | 'writeIn'>,
  rowH = plan.metrics.rowH,
): number {
  const { metrics } = plan
  const letters = sectionHeight(plan.letters, metrics, rowH)
  const months = sectionHeight(plan.months, metrics, rowH)
  let height =
    metrics.topPad +
    (plan.arrangement === 'side' ? Math.max(letters, months) : letters + metrics.sectionGap + months)
  if (plan.example) height += metrics.exampleGap + plan.example.height
  if (plan.writeIn) height += metrics.writeInGap + metrics.writeInH
  return height
}

export const breakExampleLine = (text: string, width: number, fontSize: number, spec: FontSpec) =>
  wrapTextToWidth(text, fontSize, wrapSafeWidth(width, spec), spec)

/** Lines the example's two parts set in, lead then result. */
export function exampleLines(
  example: RnExample,
  plan: Pick<RnPagePlan, 'metrics'> & { example: Pick<RnExamplePlan, 'innerWidth'> },
  font: string,
): { lead: string[]; result: string[] } {
  const { metrics } = plan
  return {
    lead: breakExampleLine(example.lead, plan.example.innerWidth, metrics.font, plainSpec(font)),
    result: breakExampleLine(example.result, plan.example.innerWidth, metrics.font, boldSpec(font)),
  }
}

export function exampleHeight(leadLines: number, resultLines: number, metrics: RnMetrics): number {
  return (
    2 * metrics.exPadY +
    fabricTextHeight(leadLines, metrics.font, EXAMPLE_LINE_HEIGHT) +
    metrics.exLineGap +
    fabricTextHeight(resultLines, metrics.font, EXAMPLE_LINE_HEIGHT)
  )
}

interface HeadingWidths {
  /** At the heading size. */
  head: number
  /** At the entry size — the fallback when the section is narrow. */
  body: number
}

/** Measurements that depend only on the type size, shared by every candidate. */
interface SizeProbe {
  metrics: RnMetrics
  letterKeyW: number
  monthKeyW: Record<RnMonthStyle, number>
  firstW: number
  lastW: number
  headW: { letters: HeadingWidths; months: HeadingWidths }
  /** The example box a block of this width reserves, per month style. */
  example: Record<RnMonthStyle, RnExamplePlan>
}

function probeSize(font: number, fontFamily: string, blockWidth: number): SizeProbe {
  const metrics = rnMetrics(font)
  const bold = boldSpec(fontFamily)
  const plain = plainSpec(fontFamily)
  const widest = (labels: readonly string[]) =>
    Math.max(...labels.map((label) => hugTextBoxWidth(label, font, Infinity, bold)))
  const heading = (text: string): HeadingWidths => ({
    head: hugTextBoxWidth(text, metrics.headFont, Infinity, bold),
    body: hugTextBoxWidth(text, font, Infinity, bold),
  })
  const innerWidth = blockWidth - 2 * metrics.exPadX
  const example = (month: string): RnExamplePlan => {
    const lead = breakExampleLine(EXAMPLE_LEAD_PROBE, innerWidth, font, plain).length
    const result = breakExampleLine(exampleResultProbe(month), innerWidth, font, bold).length
    return { innerWidth, leadLines: lead, resultLines: result, height: exampleHeight(lead, result, metrics) }
  }
  return {
    metrics,
    letterKeyW: widest(RN_LETTERS),
    monthKeyW: { full: widest(RN_MONTHS), short: widest(RN_MONTHS_SHORT) },
    firstW: hugTextBoxWidth(FIRST_PROBE, font, Infinity, plain),
    lastW: hugTextBoxWidth(LAST_PROBE, font, Infinity, plain),
    headW: { letters: heading(RN_LETTERS_HEADING), months: heading(RN_MONTHS_HEADING) },
    example: { full: example('September'), short: example('Sep') },
  }
}

interface Candidate {
  arrangement: RnArrangement
  letterCols: number
  monthCols: number
}

/**
 * Preference order within one type size: the balanced menu first, then the
 * stacked tables from fewest columns up. Fewer columns means longer, easier
 * lists; more columns is what lets a small trim keep its type size.
 */
const CANDIDATES: readonly Candidate[] = [
  { arrangement: 'side', letterCols: 2, monthCols: 1 },
  { arrangement: 'stacked', letterCols: 2, monthCols: 1 },
  { arrangement: 'stacked', letterCols: 2, monthCols: 2 },
  { arrangement: 'stacked', letterCols: 3, monthCols: 1 },
  { arrangement: 'stacked', letterCols: 3, monthCols: 2 },
  { arrangement: 'side', letterCols: 3, monthCols: 1 },
  { arrangement: 'stacked', letterCols: 4, monthCols: 2 },
  { arrangement: 'stacked', letterCols: 3, monthCols: 3 },
  { arrangement: 'stacked', letterCols: 4, monthCols: 3 },
]
const MONTH_STYLES: readonly RnMonthStyle[] = ['full', 'short']

/** Column need for `cols` columns of key + gap + name. */
const columnsNeed = (cols: number, keyW: number, nameW: number, metrics: RnMetrics) =>
  cols * (keyW + metrics.keyGap + nameW) + (cols - 1) * metrics.gutter

function section(
  heading: string,
  headW: HeadingWidths,
  left: number,
  width: number,
  cols: number,
  count: number,
  keyW: number,
  metrics: RnMetrics,
): RnSection {
  const colWidth = (width - (cols - 1) * metrics.gutter) / cols
  return {
    heading,
    headFont: headW.head <= width ? metrics.headFont : metrics.font,
    left,
    width,
    cols,
    rows: Math.ceil(count / cols),
    colWidth,
    keyW,
    valueW: colWidth - keyW - metrics.keyGap,
  }
}

function planAt(options: {
  field: Box
  size: SizeProbe
  candidate: Candidate
  monthStyle: RnMonthStyle
  example: boolean
  writeIn: boolean
}): RnPagePlan | null {
  const { field, size, candidate, monthStyle, example, writeIn } = options
  const { metrics } = size
  const blockWidth = Math.min(field.width, BLOCK_MAX_WIDTH)
  const monthKeyW = size.monthKeyW[monthStyle]
  const needL = columnsNeed(candidate.letterCols, size.letterKeyW, size.firstW, metrics)
  const needM = columnsNeed(candidate.monthCols, monthKeyW, size.lastW, metrics)

  let letters: RnSection
  let months: RnSection
  if (candidate.arrangement === 'side') {
    const spare = blockWidth - needL - metrics.sideGap - needM
    if (spare < 0) return null
    const widthL = needL + (spare * needL) / (needL + needM)
    letters = section(RN_LETTERS_HEADING, size.headW.letters, 0, widthL, candidate.letterCols, RN_LETTERS.length, size.letterKeyW, metrics)
    months = section(
      RN_MONTHS_HEADING,
      size.headW.months,
      widthL + metrics.sideGap,
      blockWidth - widthL - metrics.sideGap,
      candidate.monthCols,
      RN_MONTHS.length,
      monthKeyW,
      metrics,
    )
  } else {
    if (needL > blockWidth || needM > blockWidth) return null
    letters = section(RN_LETTERS_HEADING, size.headW.letters, 0, blockWidth, candidate.letterCols, RN_LETTERS.length, size.letterKeyW, metrics)
    months = section(RN_MONTHS_HEADING, size.headW.months, 0, blockWidth, candidate.monthCols, RN_MONTHS.length, monthKeyW, metrics)
  }

  // Headings stay on one line, at heading size where they can.
  if (size.headW.letters.body > letters.width || size.headW.months.body > months.width) return null

  const plan: RnPagePlan = {
    metrics,
    arrangement: candidate.arrangement,
    monthStyle,
    monthLabels: monthStyle === 'full' ? RN_MONTHS : RN_MONTHS_SHORT,
    blockWidth,
    letters,
    months,
    example: example ? size.example[monthStyle] : null,
    writeIn,
    height: 0,
  }
  if (
    plan.example &&
    Math.max(plan.example.leadLines, plan.example.resultLines) > EXAMPLE_MAX_LINES
  ) {
    return null
  }
  plan.height = blockHeight(plan)
  if (plan.height > field.height - metrics.bottomGuard) return null
  return plan
}

interface SearchPass {
  example: boolean
  writeIn: boolean
  floor: number
}

/**
 * Extras first, then type size: a page keeps its worked example as long as
 * the tables still fit at the floor, and its write-in line as long as the
 * type stays comfortable.
 */
const SEARCH_PASSES: readonly SearchPass[] = [
  { example: true, writeIn: true, floor: NAME_FONT_COMFORT },
  { example: true, writeIn: false, floor: NAME_FONT_COMFORT },
  { example: true, writeIn: true, floor: NAME_FONT_MIN },
  { example: true, writeIn: false, floor: NAME_FONT_MIN },
  { example: false, writeIn: false, floor: NAME_FONT_MIN },
]

/**
 * Type a page will give up to print "September" rather than "Sep": about a
 * point. Full month names read more easily; a whole size step does not.
 */
const FULL_MONTH_TRADE = 2

/** The largest, roomiest page this field holds. */
export function planRnPage(field: Box, fontFamily: string): RnPagePlan | null {
  const blockWidth = Math.min(field.width, BLOCK_MAX_WIDTH)
  const sizes = new Map<number, SizeProbe>()
  const sizeAt = (font: number) => {
    let size = sizes.get(font)
    if (!size) {
      size = probeSize(font, fontFamily, blockWidth)
      sizes.set(font, size)
    }
    return size
  }
  const firstAt = (
    pass: SearchPass,
    fonts: readonly number[],
    styles: readonly RnMonthStyle[],
  ): RnPagePlan | null => {
    for (const font of fonts) {
      const size = sizeAt(font)
      const writeIn =
        pass.writeIn &&
        hugTextBoxWidth(WRITE_IN_LABEL, font, Infinity, boldSpec(fontFamily)) + font * 6 <= blockWidth
      if (pass.writeIn && !writeIn) continue
      for (const candidate of CANDIDATES) {
        for (const monthStyle of styles) {
          const plan = planAt({ field, size, candidate, monthStyle, example: pass.example, writeIn })
          if (plan) return plan
        }
      }
    }
    return null
  }
  const descending = (from: number, to: number) =>
    Array.from({ length: Math.max(0, from - to + 1) }, (_, i) => from - i)

  for (const pass of SEARCH_PASSES) {
    const best = firstAt(pass, descending(NAME_FONT_MAX, pass.floor), MONTH_STYLES)
    if (!best) continue
    if (best.monthStyle === 'short') {
      const floor = Math.max(pass.floor, best.metrics.font - FULL_MONTH_TRADE)
      const full = firstAt(pass, descending(best.metrics.font - 1, floor), ['full'])
      if (full) return full
    }
    return best
  }
  return null
}

/** The safe printable column every retired-name page lays out inside. */
export function rnContentBox(page: StudioConfigLayoutContext): Box {
  return insetHorizontal(contentBox(page), STUDIO_CONTENT_SAFE_INSET_X)
}

/** What is left of the column once the title and instruction have been set. */
export function rnBodyField(
  page: StudioConfigLayoutContext,
  config: StudioConfig,
  instruction: string,
): Box {
  const content = rnContentBox(page)
  const headerHeight = measureHeaderHeight(config, instruction, content.width)
  return {
    ...content,
    top: content.top + headerHeight,
    height: Math.max(1, content.height - headerHeight),
  }
}

/** The page these settings make, measured before a name exists. */
export function rnWorstCasePlan(options: {
  page: StudioConfigLayoutContext
  config: StudioConfig
  instruction: string
  font: string
}): RnPagePlan | null {
  const { page, config, instruction, font } = options
  return planRnPage(rnBodyField(page, config, instruction), font)
}

/** What a page prints on the trim currently in Settings. */
export function rnPrintNote(options: {
  page: StudioConfigLayoutContext | undefined
  config: StudioConfig
  instruction: string
  font: string
}): string {
  const { page } = options
  if (!page) return 'All 26 letters and 12 months on one page, fitted to your page size.'
  const plan = rnWorstCasePlan({ ...options, page })
  if (!plan) {
    return 'This page size is too small for a retired-name table — choose a larger one in Settings.'
  }
  const extras = plan.example ? ', with a worked example' : ''
  return `All 26 letters and 12 months on one page in ${pxToPt(plan.metrics.font)} pt type${extras}.`
}
