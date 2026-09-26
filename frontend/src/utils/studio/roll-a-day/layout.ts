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
import { RD_FACES, RD_HEADINGS, RD_SIDES, type RdTable } from './content'

/**
 * Everything a Roll-a-Day page decides on the seller's behalf.
 *
 * The page is two six-row tables — Roll #1 for the morning, Roll #2 for the
 * afternoon — each row a die face beside one activity, then a line to note
 * the two rolls. The number that governs it is the **type size**: every gap,
 * die and box is set against it, and the search runs from roomy down to a
 * large-print floor, so no trim can talk the page into small type.
 *
 * Two stacked tables rather than a literal 6 × 6 grid: 36 cells would each
 * need a morning and an afternoon squeezed in, and the reader finds a result
 * faster by looking up one roll at a time.
 *
 * Planned with the longest activity the gates admit, so the form's note is a
 * promise: a real activity is at most that long, and one that still wraps
 * past its row is passed over for a spare rather than squeezed in. The
 * write-in line is the first thing a small trim gives up — before the type
 * drops below comfortable.
 */

export const ptToPx = (pt: number) => Math.round((pt * DPI) / PDF_POINTS_PER_INCH)
export const pxToPt = (px: number) => Math.round((px * PDF_POINTS_PER_INCH) / DPI)

/** Floor for every activity: large print, the same floor the Bucket List keeps. */
export const ACTIVITY_FONT_MIN = ptToPx(14)
/** What a page aims for before it gives up the write-in line. */
const ACTIVITY_FONT_COMFORT = ptToPx(16)
const ACTIVITY_FONT_MAX = ptToPx(20)
export const ACTIVITY_LINE_HEIGHT = 1.15
/** An activity that needs more lines than this is too long for a glance. */
export const MAX_ACTIVITY_LINES = 2
/** Heavier rule under a heading; row rules are hairlines. */
export const HEADING_RULE = 2
/** A die face smaller than a quarter inch is hard to count at a glance. */
export const DIE_MIN = Math.round(DPI * 0.25)

/** Past this a row runs wider than an eye tracks from die to activity. */
const BLOCK_MAX_WIDTH = Math.round(DPI * 6.5)

/**
 * The longest activity the gates admit, in wide letters. Never printed; a
 * test holds it to `MAX_ACTIVITY_CHARS`.
 */
export const ACTIVITY_PROBE = 'Wander down a meadow and hum along'

export const WRITE_IN_LABEL = 'I rolled:'
export const WRITE_IN_PARTS: readonly string[] = ['Morning', 'Afternoon']

export const boldSpec = (font: string): FontSpec => ({ fontFamily: font, fontWeight: 700 })
export const plainSpec = (font: string): FontSpec => ({ fontFamily: font })

export interface RdMetrics {
  font: number
  headFont: number
  /** Side of a die face. */
  die: number
  dieGap: number
  padY: number
  headH: number
  headGap: number
  sectionGap: number
  writeInGap: number
  /** Side of a box to write a rolled number in. */
  writeBox: number
  writeLabelGap: number
  writeItemGap: number
  topPad: number
  bottomGuard: number
}

export function rdMetrics(font: number): RdMetrics {
  const headFont = Math.round(font * 1.15)
  return {
    font,
    headFont,
    // About a line of type tall — a row is as tall as its text, not its die —
    // and never too small to count the pips.
    die: Math.max(DIE_MIN, Math.round(font * 1.2)),
    dieGap: Math.round(font * 0.7),
    padY: Math.round(font * 0.22),
    headH: fabricTextHeight(1, headFont),
    headGap: Math.round(font * 0.3),
    sectionGap: Math.round(font * 0.9),
    writeInGap: Math.round(font * 0.9),
    writeBox: Math.round(font * 1.4),
    writeLabelGap: Math.round(font * 0.4),
    writeItemGap: Math.round(font * 1.2),
    topPad: Math.round(font * 0.2),
    bottomGuard: Math.round(font * 0.5),
  }
}

export interface RdPagePlan {
  metrics: RdMetrics
  /** Lines every row reserves for its activity. */
  lines: number
  /** Width of everything below the header — what gets centred. */
  blockWidth: number
  /** Width an activity sets in, right of its die. */
  textWidth: number
  writeIn: boolean
  /** Natural height of the block at the reserved lines, before spacing is shared out. */
  height: number
}

/** A row: the die or the activity, whichever is taller, padded above and below. */
export const rowHeight = (lines: number, metrics: RdMetrics, padY = metrics.padY) =>
  Math.max(metrics.die, fabricTextHeight(lines, metrics.font, ACTIVITY_LINE_HEIGHT)) + 2 * padY

export const sectionHeight = (metrics: RdMetrics, rowH: number) =>
  metrics.headH + metrics.headGap + HEADING_RULE + RD_FACES.length * rowH

/** Height of the whole block with rows at `rowH` and gaps at their base. */
export function blockHeight(plan: Pick<RdPagePlan, 'metrics' | 'writeIn'>, rowH: number): number {
  const { metrics } = plan
  let height = metrics.topPad + 2 * sectionHeight(metrics, rowH) + metrics.sectionGap
  if (plan.writeIn) height += metrics.writeInGap + metrics.writeBox
  return height
}

/** The lines an activity sets in, as the page will print them. */
export function breakActivity(
  text: string,
  plan: Pick<RdPagePlan, 'metrics' | 'textWidth'>,
  font: string,
): string[] {
  const spec = plainSpec(font)
  return wrapTextToWidth(text, plan.metrics.font, wrapSafeWidth(plan.textWidth, spec), spec)
}

/** Lines the tallest activity on this table takes — what every row is drawn at. */
export function rdRowLines(table: RdTable, plan: RdPagePlan, font: string): number {
  const all = [...table.morning, ...table.afternoon]
  return Math.max(1, ...all.map((entry) => breakActivity(entry.activity, plan, font).length))
}

/** "I rolled:  Morning ☐   Afternoon ☐" across the block. */
export function writeInWidth(metrics: RdMetrics, font: string): number {
  const bold = boldSpec(font)
  const plain = plainSpec(font)
  const label = hugTextBoxWidth(WRITE_IN_LABEL, metrics.font, Infinity, bold)
  const parts = WRITE_IN_PARTS.map(
    (part) =>
      hugTextBoxWidth(part, metrics.font, Infinity, plain) + metrics.writeLabelGap + metrics.writeBox,
  )
  return (
    label +
    2 * metrics.writeLabelGap +
    parts.reduce((sum, width) => sum + width, 0) +
    (parts.length - 1) * metrics.writeItemGap
  )
}

interface SearchPass {
  writeIn: boolean
  floor: number
}

/** Write-in first while the type stays comfortable; then type size over the write-in. */
const SEARCH_PASSES: readonly SearchPass[] = [
  { writeIn: true, floor: ACTIVITY_FONT_COMFORT },
  { writeIn: false, floor: ACTIVITY_FONT_COMFORT },
  { writeIn: true, floor: ACTIVITY_FONT_MIN },
  { writeIn: false, floor: ACTIVITY_FONT_MIN },
]

function planAt(field: Box, fontFamily: string, font: number, writeIn: boolean): RdPagePlan | null {
  const metrics = rdMetrics(font)
  const blockWidth = Math.min(field.width, BLOCK_MAX_WIDTH)
  const textWidth = blockWidth - metrics.die - metrics.dieGap
  const bold = boldSpec(fontFamily)
  if (RD_SIDES.some((side) => hugTextBoxWidth(RD_HEADINGS[side], metrics.headFont, Infinity, bold) > blockWidth)) {
    return null
  }
  const lines = breakActivity(ACTIVITY_PROBE, { metrics, textWidth }, fontFamily).length
  if (lines > MAX_ACTIVITY_LINES) return null
  if (writeIn && writeInWidth(metrics, fontFamily) > blockWidth) return null
  const plan: RdPagePlan = { metrics, lines, blockWidth, textWidth, writeIn, height: 0 }
  plan.height = blockHeight(plan, rowHeight(lines, metrics))
  return plan.height <= field.height - metrics.bottomGuard ? plan : null
}

/** The largest, roomiest page this field holds. */
export function planRdPage(field: Box, fontFamily: string): RdPagePlan | null {
  for (const pass of SEARCH_PASSES) {
    for (let font = ACTIVITY_FONT_MAX; font >= pass.floor; font--) {
      const plan = planAt(field, fontFamily, font, pass.writeIn)
      if (plan) return plan
    }
  }
  return null
}

/** The safe printable column every Roll-a-Day page lays out inside. */
export function rdContentBox(page: StudioConfigLayoutContext): Box {
  return insetHorizontal(contentBox(page), STUDIO_CONTENT_SAFE_INSET_X)
}

/** What is left of the column once the title and instruction have been set. */
export function rdBodyField(
  page: StudioConfigLayoutContext,
  config: StudioConfig,
  instruction: string,
): Box {
  const content = rdContentBox(page)
  const headerHeight = measureHeaderHeight(config, instruction, content.width)
  return {
    ...content,
    top: content.top + headerHeight,
    height: Math.max(1, content.height - headerHeight),
  }
}

/** The page these settings make, measured before an activity exists. */
export function rdWorstCasePlan(options: {
  page: StudioConfigLayoutContext
  config: StudioConfig
  instruction: string
  font: string
}): RdPagePlan | null {
  const { page, config, instruction, font } = options
  return planRdPage(rdBodyField(page, config, instruction), font)
}

/** What a page prints on the trim currently in Settings. */
export function rdPrintNote(options: {
  page: StudioConfigLayoutContext | undefined
  config: StudioConfig
  instruction: string
  font: string
}): string {
  const { page } = options
  if (!page) return 'Six morning and six afternoon ideas on one page, fitted to your page size.'
  const plan = rdWorstCasePlan({ ...options, page })
  if (!plan) {
    return 'This page size is too small for a Roll-a-Day table — choose a larger one in Settings.'
  }
  const extras = plan.writeIn ? ', with boxes to note your rolls' : ''
  return `Six morning and six afternoon ideas in ${pxToPt(plan.metrics.font)} pt type${extras}.`
}
