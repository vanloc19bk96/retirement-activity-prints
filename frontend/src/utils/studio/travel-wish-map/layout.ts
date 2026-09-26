import type {
  StudioConfig,
  StudioConfigLayoutContext,
} from '@/types/studio-template.types'
import { DPI, PDF_POINTS_PER_INCH } from '@/types/canvas-settings.types'
import { STUDIO_CONTENT_SAFE_INSET_X } from '@/constants/studio.constants'
import { contentBox, insetHorizontal, measureHeaderHeight, type Box } from '../studio-layout'
import { fabricTextHeight, hugTextBoxWidth, type FontSpec } from '../studio-text-metrics'
import { WHY_LABEL, twmAllNames, twmModeSpec, type TwmMode, type TwmSection } from './content'

/**
 * Everything a Travel Wish Map page decides on the seller's behalf.
 *
 * One column of entries. An entry is a checkbox, the destination in bold on
 * one line, then its writing lines — the first opening with "Why I want
 * to go:". Every entry is the same height, so the pages read as one even
 * list; headings group the entries and are repeated, marked as continued,
 * when a group runs over a page.
 *
 * The number that governs the page is the **name type size**: checkbox,
 * label, heading and every gap are set against it, and the search runs from
 * large print down to a 14 pt floor, only as far as the longest name the
 * mode could print needs. Writing lines never close up below wide-ruled
 * paper. A list takes as many pages as it needs; nothing is squeezed to save
 * one.
 */

export const ptToPx = (pt: number) => Math.round((pt * DPI) / PDF_POINTS_PER_INCH)
export const pxToPt = (px: number) => Math.round((px * PDF_POINTS_PER_INCH) / DPI)

/** Large-print floor: no text on the page is smaller. */
export const NAME_FONT_MIN = ptToPx(14)
const NAME_FONT_COMFORT = ptToPx(16)
const NAME_FONT_WIDE = ptToPx(18)
/** A column this wide gets the bigger size. */
const WIDE_BLOCK = Math.round(DPI * 5.5)

/** Past this a writing line runs wider than a hand comfortably travels. */
const BLOCK_MAX_WIDTH = Math.round(DPI * 6.2)
/** A box a pen can tick without touching its sides. */
export const CHECK_MIN = Math.round(DPI * 0.2)
/** A writing line an older hand can use — no closer than wide-ruled paper. */
export const PITCH_MIN = Math.round(DPI * 0.38)
/** The shortest stretch of line left after "Why I want to go:". */
export const FIRST_LINE_MIN = Math.round(DPI * 1.4)

export type TwmSpace = 'standard' | 'roomy'

export const TWM_SPACES: readonly { value: TwmSpace; label: string; lines: number }[] = [
  { value: 'standard', label: 'Two lines per place', lines: 2 },
  { value: 'roomy', label: 'Three lines per place', lines: 3 },
]

export function parseTwmSpace(raw: unknown): TwmSpace {
  return TWM_SPACES.some((s) => s.value === raw) ? (raw as TwmSpace) : 'standard'
}

export const spaceLines = (space: TwmSpace) => TWM_SPACES.find((s) => s.value === space)!.lines

/** Printed after a heading that carries on from the page before … */
export const CONTINUED = ' (continued)'
/** … or this, where the long form would not sit on one line. */
export const CONTINUED_SHORT = ' (cont.)'

/** Closing write-in entries, where the last page has room for them. */
export const OWN_PLACES_TITLE = 'More Places on My List'
const MIN_WRITE_INS = 2
const MAX_WRITE_INS = 4

/** Where a letter's baseline sits below the top of its line box. */
const BASELINE = 0.908

export const boldSpec = (font: string): FontSpec => ({ fontFamily: font, fontWeight: 700 })
export const plainSpec = (font: string): FontSpec => ({ fontFamily: font })
export const baselineToTop = (baseline: number, fontSize: number) => baseline - fontSize * BASELINE

export interface TwmMetrics {
  /** The destination names. */
  font: number
  /** "Why I want to go:" — a step down from the names, never below the floor. */
  labelFont: number
  headingFont: number
  check: number
  checkGap: number
  /** Between the name and the first writing line's space. */
  nameGap: number
  /** One writing line to the next. */
  pitch: number
  /** Between the label and the start of its line. */
  labelGap: number
  /** Air under every entry. */
  entryGap: number
  headingGapAbove: number
  headingRuleGap: number
  headingGapBelow: number
  ruleWeight: number
}

export interface TwmPlan {
  metrics: TwmMetrics
  /** Width of the list — what gets centred. */
  blockWidth: number
  /** Where names and lines start, from the block's left edge. */
  textLeft: number
  textWidth: number
  /** Writing lines under each destination. */
  lines: number
  labelWidth: number
  bottomGuard: number
}

/** The name row: tall enough for the name or its box. */
export const nameRowHeight = (m: TwmMetrics) => Math.max(fabricTextHeight(1, m.font), m.check)

/** One destination and the air under it. Every entry is this tall. */
export const entryHeight = (plan: TwmPlan) =>
  nameRowHeight(plan.metrics) + plan.metrics.nameGap + plan.lines * plan.metrics.pitch + plan.metrics.entryGap

/** A write-in entry: a line for the place, then the same writing lines. */
export const writeInHeight = (plan: TwmPlan) =>
  (plan.lines + 1) * plan.metrics.pitch + plan.metrics.entryGap

/** A heading, its rule and the air round it. No air above at the top of a page. */
export const headingHeight = (m: TwmMetrics, atTop: boolean) =>
  (atTop ? 0 : m.headingGapAbove) + fabricTextHeight(1, m.headingFont) + m.headingRuleGap + m.ruleWeight + m.headingGapBelow

/** Headings a mode can print, carrying on — the longest decides the heading size. */
function headingProbes(mode: TwmMode): string[] {
  return [...twmModeSpec(mode).groups.map((g) => `${g.title}${CONTINUED_SHORT}`), OWN_PLACES_TITLE]
}

export function twmMetrics(font: number, fontFamily: string, blockWidth: number, mode: TwmMode): TwmMetrics {
  const bold = boldSpec(fontFamily)
  const labelFont = Math.max(NAME_FONT_MIN, font - ptToPx(2))
  const probes = headingProbes(mode)
  let headingFont = Math.round(font * 1.2)
  while (
    headingFont > font &&
    probes.some((probe) => hugTextBoxWidth(probe, headingFont, Infinity, bold) > blockWidth)
  ) {
    headingFont--
  }
  return {
    font,
    labelFont,
    headingFont,
    check: Math.max(CHECK_MIN, Math.round(font * 1.0)),
    checkGap: Math.round(font * 0.6),
    nameGap: Math.round(font * 0.1),
    pitch: Math.max(PITCH_MIN, Math.round(labelFont * 1.9)),
    labelGap: Math.round(labelFont * 0.35),
    entryGap: Math.round(font * 1.1),
    headingGapAbove: Math.round(font * 0.6),
    headingRuleGap: Math.round(font * 0.2),
    headingGapBelow: Math.round(font * 0.6),
    ruleWeight: 2,
  }
}

/** The two page bodies a list lays out in: under title and instruction, then under the title. */
export interface TwmFields {
  first: Box
  laterHeight: number
}

/** Height a page gives its list. */
export const usableHeight = (plan: TwmPlan, fields: TwmFields) => (page: number) =>
  (page === 0 ? fields.first.height : fields.laterHeight) - plan.bottomGuard

/** Widest a name may set: the longest the mode could ever print must fit. */
const longestNameWidth = (mode: TwmMode, font: number, fontFamily: string) =>
  Math.max(...twmAllNames(mode).map((name) => hugTextBoxWidth(name, font, Infinity, boldSpec(fontFamily))))

function planAt(
  fields: TwmFields,
  font: number,
  fontFamily: string,
  mode: TwmMode,
  lines: number,
): TwmPlan | null {
  const blockWidth = Math.min(fields.first.width, BLOCK_MAX_WIDTH)
  const metrics = twmMetrics(font, fontFamily, blockWidth, mode)
  const textLeft = metrics.check + metrics.checkGap
  const textWidth = blockWidth - textLeft
  if (longestNameWidth(mode, font, fontFamily) > textWidth) return null
  const labelWidth = hugTextBoxWidth(WHY_LABEL, metrics.labelFont, Infinity, plainSpec(fontFamily))
  if (labelWidth + metrics.labelGap + FIRST_LINE_MIN > textWidth) return null
  if (
    headingProbes(mode).some(
      (probe) => hugTextBoxWidth(probe, metrics.headingFont, Infinity, boldSpec(fontFamily)) > blockWidth,
    )
  ) {
    return null
  }
  const plan: TwmPlan = {
    metrics,
    blockWidth,
    textLeft,
    textWidth,
    lines,
    labelWidth,
    bottomGuard: Math.round(font * 0.3),
  }
  // A first page must hold a heading and an entry, and a later page two, or
  // the list would crumble into a page per destination.
  const usable = usableHeight(plan, fields)
  if (headingHeight(metrics, true) + entryHeight(plan) > usable(0)) return null
  if (headingHeight(metrics, true) + 2 * entryHeight(plan) > usable(1)) return null
  return plan
}

/**
 * Largest type the trim allows: 18 pt on a wide column, 16 pt otherwise,
 * stepping down to the 14 pt floor only where the longest name needs it.
 */
export function planTravelWishMap(
  fields: TwmFields,
  fontFamily: string,
  mode: TwmMode,
  space: TwmSpace,
): TwmPlan | null {
  const blockWidth = Math.min(fields.first.width, BLOCK_MAX_WIDTH)
  const from = blockWidth >= WIDE_BLOCK ? NAME_FONT_WIDE : NAME_FONT_COMFORT
  for (let font = from; font >= NAME_FONT_MIN; font--) {
    const plan = planAt(fields, font, fontFamily, mode, spaceLines(space))
    if (plan) return plan
  }
  return null
}

/** The safe printable column every page lays out inside. */
export function twmContentBox(page: StudioConfigLayoutContext): Box {
  return insetHorizontal(contentBox(page), STUDIO_CONTENT_SAFE_INSET_X)
}

function bodyField(page: StudioConfigLayoutContext, config: StudioConfig, instruction: string): Box {
  const content = twmContentBox(page)
  const headerHeight = measureHeaderHeight(config, instruction, content.width)
  return { ...content, top: content.top + headerHeight, height: Math.max(1, content.height - headerHeight) }
}

export function twmFields(
  page: StudioConfigLayoutContext,
  config: StudioConfig,
  instruction: string,
): TwmFields {
  return {
    first: bodyField(page, config, instruction),
    laterHeight: bodyField(page, config, '').height,
  }
}

export type TwmBlock =
  | { kind: 'heading'; title: string; continued: boolean; own?: boolean }
  | { kind: 'entry'; name: string; group: string }
  | { kind: 'write' }

export interface TwmPage {
  blocks: TwmBlock[]
  /** Height the blocks take, from the top of the page body. */
  height: number
}

/**
 * Flow the list over as many pages as it needs.
 *
 * A heading only starts where it and its first entry fit, so it is never
 * stranded at the foot of a page. A group that runs over is headed again on
 * the next page, marked as continued, and does not leave one entry alone
 * there when it can send another across with it. Where the last page has
 * room for at least two, the list closes with write-in entries for places of
 * the reader's own — never on a page of their own. Returns null when even an
 * empty page cannot hold a heading and an entry.
 */
export function paginateTravelWishMap(
  sections: readonly TwmSection[],
  plan: TwmPlan,
  usable: (page: number) => number,
  options: { writeIn?: boolean } = {},
): TwmPage[] | null {
  const { metrics } = plan
  const entryH = entryHeight(plan)
  const pages: TwmPage[] = []
  let blocks: TwmBlock[] = []
  let y = 0
  const flush = () => {
    pages.push({ blocks, height: y })
    blocks = []
    y = 0
  }

  for (const section of sections) {
    const { names } = section
    let i = 0
    let continued = false
    while (i < names.length) {
      if (y > 0 && y + headingHeight(metrics, false) + entryH > usable(pages.length)) flush()
      const heading = headingHeight(metrics, y === 0)
      if (y === 0 && heading + entryH > usable(pages.length)) return null
      blocks.push({ kind: 'heading', title: section.title, continued })
      y += heading

      let placed = 0
      while (i < names.length && y + entryH <= usable(pages.length)) {
        blocks.push({ kind: 'entry', name: names[i]!, group: section.key })
        y += entryH
        i++
        placed++
      }
      if (i < names.length) {
        if (names.length - i === 1 && placed >= 3) {
          blocks.pop()
          i--
          y -= entryH
        }
        flush()
        continued = true
      }
    }
  }
  if (blocks.length > 0) {
    if (options.writeIn !== false) {
      const room = usable(pages.length) - y - headingHeight(metrics, false)
      const count = Math.min(MAX_WRITE_INS, Math.floor(room / writeInHeight(plan)))
      if (count >= MIN_WRITE_INS) {
        blocks.push({ kind: 'heading', title: OWN_PLACES_TITLE, continued: false, own: true })
        y += headingHeight(metrics, false)
        for (let n = 0; n < count; n++) blocks.push({ kind: 'write' })
        y += count * writeInHeight(plan)
      }
    }
    flush()
  }
  return pages
}

/** A list of the right shape for this mode, for the form's page estimate. */
function sampleSections(mode: TwmMode): TwmSection[] {
  return twmModeSpec(mode).groups.map((g) => ({
    key: g.key,
    title: g.title,
    names: g.names.slice(0, g.quota ?? g.names.length),
  }))
}

/** What a list prints on the trim currently in Settings. */
export function twmPrintNote(options: {
  page: StudioConfigLayoutContext | undefined
  config: StudioConfig
  instruction: string
  font: string
  mode: TwmMode
  space: TwmSpace
}): string {
  const { page, config, instruction, font, mode, space } = options
  const spec = twmModeSpec(mode)
  const count = spec.groups.reduce((sum, g) => sum + (g.quota ?? g.names.length), 0)
  const what = `${count} ${spec.noun} under ${spec.groups.length} ${spec.groupNoun}`
  if (!page) return `${what}, fitted to your page size.`

  const fields = twmFields(page, config, instruction)
  const plan = planTravelWishMap(fields, font, mode, space)
  if (!plan) return 'This page size is too small for a travel wish map — choose a larger one in Settings.'
  const pages = paginateTravelWishMap(sampleSections(mode), plan, usableHeight(plan, fields), { writeIn: false })
  const spread = pages ? `${pages.length} pages` : 'several pages'
  return `${what} — ${spread} in ${pxToPt(plan.metrics.font)} pt large print.`
}
