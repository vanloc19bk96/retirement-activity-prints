import type {
  StudioConfig,
  StudioConfigLayoutContext,
} from '@/types/studio-template.types'
import { DPI, PDF_POINTS_PER_INCH } from '@/types/canvas-settings.types'
import { STUDIO_CONTENT_SAFE_INSET_X } from '@/constants/studio.constants'
import {
  contentBox,
  insetHorizontal,
  measureHeaderHeight,
  type Box,
} from '../studio-layout'
import {
  fabricTextHeight,
  wrapSafeWidth,
  wrapTextToWidth,
  type FontSpec,
} from '../studio-text-metrics'
import {
  answerSlotUnits,
  pictureRebusWorstCase,
  type PictureRebusPuzzle,
} from './content'
import type { PictureRebusLevel } from './levels'

/**
 * Everything a picture rebus page decides on the seller's behalf.
 *
 * The page is a stack of identical rows, and a row is three things: the
 * pictures, a line of writing slots the length of the answer, and — on the
 * gentle level — a hint between them. Nothing about their sizes is a question a
 * seller can usefully answer. "How big should the pictures be" depends on how
 * long the longest answer in the level is, because the slots under the pictures
 * are what really sets the column width; "how many puzzles per page" depends on
 * both of those and on the heading. So the page works all of it out, and
 * `pictureRebusPrintNote` reports what came out, so the form's help line and the
 * printed page can never disagree.
 *
 * The plan is measured once against the *worst* puzzle the level can deal —
 * longest answer, most pictures, longest hint — and every page of a run is laid
 * out to it. Fitting each page to its own puzzles would give a book of pages
 * whose pictures change size from sheet to sheet, which is the one thing a
 * reader notices without being able to say why.
 */

export function ptToPx(pt: number): number {
  return Math.round((pt * DPI) / PDF_POINTS_PER_INCH)
}

export function pxToPt(px: number): number {
  return Math.round((px * PDF_POINTS_PER_INCH) / DPI)
}

/**
 * Smallest a picture may print, in inches.
 *
 * This is the whole game's floor, not a nicety. A rebus asks a reader to name
 * what they are looking at, and a line drawing of a pinecone at half an inch is
 * a smudge that could be anything — at which point the puzzle has no answer, it
 * has a guess. Roughly three fifths of an inch is where the curated line icons
 * stay unambiguous in print at a single ink weight.
 */
const ICON_MIN_INCHES = 0.58
/**
 * Largest a picture may print.
 *
 * Past this an 8.5 x 11 interior spends a third of its column on two drawings
 * and holds three puzzles, and the page reads as a poster rather than as an
 * activity. Big enough to see across a room is not the goal; big enough to name
 * without leaning in is.
 */
const ICON_MAX_INCHES = 0.86

export const ICON_MIN = Math.round(DPI * ICON_MIN_INCHES)
export const ICON_MAX = Math.round(DPI * ICON_MAX_INCHES)

/**
 * Writing slot pitch, in inches — measured from a hand, not from type.
 *
 * Below about a quarter inch an older hand's capitals start touching the
 * letters either side, and an answer a solver cannot read back is an answer
 * they cannot check. The ceiling stops a page of short answers printing slots a
 * thumb wide.
 */
const SLOT_MIN_INCHES = 0.25
const SLOT_MAX_INCHES = 0.34

export const SLOT_MIN_W = Math.round(DPI * SLOT_MIN_INCHES)
export const SLOT_MAX_W = Math.round(DPI * SLOT_MAX_INCHES)

/**
 * Most puzzles one page will hold.
 *
 * A cap rather than a fit: an 8.5 x 11 page has room for ten rows at the icon
 * floor, and ten shrunken rebuses is a worse page than eight generous ones.
 * Eight also divides evenly into two columns, which is what keeps the wide
 * trims from printing a lopsided last column.
 */
export const MAX_ITEMS_PER_PAGE = 8
/** Below three the sheet is a page of white space with a heading on it. */
export const MIN_ITEMS_PER_PAGE = 3

/** Two columns first, then one. A column has to hold the longest answer. */
const COLUMN_CHOICES = [2, 1] as const
/** Two columns of two is a layout; two columns of one is a gap. */
const MIN_ROWS_PER_COLUMN = 2

/** Air between columns, as a share of the printable column. */
const COLUMN_GUTTER_SHARE = 0.045

/** Ink weight of a picture, against its size — Lucide draws 2 in a 24 box. */
const ICON_STROKE_RATIO = 0.055
const ICON_STROKE_MIN = 2.2
const ICON_STROKE_MAX = 5

/** Width of the "+" cell between two pictures, against picture size. */
const PLUS_WIDTH_RATIO = 0.42
/** Air either side of the "+". */
const PLUS_GAP_RATIO = 0.16
const PLUS_FONT_RATIO = 0.46

/** Column holding the row number, against picture size. */
const INDEX_RATIO = 0.42
const INDEX_FONT_RATIO = 0.34
/** A row number below this stops being findable at a glance. */
const INDEX_FONT_MIN = ptToPx(12)

/** Air between the pictures and what is written under them. */
const ICON_SLOT_GAP_RATIO = 0.14
/**
 * Height reserved above each rule for the letter a solver writes there.
 *
 * Just over the glyph box of the answer letters themselves, and no more. The
 * space above a rule looks empty on a blank page but it is not free: every
 * pixel of it widens the gap between a puzzle's pictures and its own answer
 * line, and past a point the line reads as belonging to the puzzle below it.
 */
const WRITE_ROOM_RATIO = 0.88
/** Rule length against slot pitch — the gap keeps the slots countable. */
export const RULE_RATIO = 0.78
/** Hairline under every slot — thin enough not to compete with a written letter. */
export const RULE_HEIGHT = 1

const HINT_FONT_RATIO = 0.62
/** Large-print floor for the hint. Below this it is decoration, not help. */
const HINT_FONT_MIN = ptToPx(11)
const HINT_GAP_RATIO = 0.34
export const HINT_LINE_HEIGHT = 1.25
/** A hint that needs three lines is a definition, and stops being a hint. */
const MAX_HINT_LINES = 2

/**
 * Air between two rows, against picture size.
 *
 * Deliberately larger than anything inside a row. A rebus row is three stacked
 * parts with white space between them, so the only thing telling a reader where
 * one puzzle ends is that the gap there is bigger — set this too close to the
 * internal gaps and a page of four puzzles reads as four sets of pictures above
 * somebody else's answer line.
 */
const ROW_GUTTER_RATIO = 0.75

/**
 * Air kept under the last rule.
 *
 * Without it the bottom writing rule lands within a pixel of the safe line,
 * which prints as a rule sitting on the trim edge and reads as a printing
 * fault. Studio also plans with estimated glyph widths when no canvas is
 * available and with real ones in the browser; with nothing in reserve, that
 * difference is the last row crossing the margin.
 */
const BOTTOM_GUARD_RATIO = 0.6

export interface PictureRebusMetrics {
  iconSize: number
  iconStroke: number
  /** Ink overhang either side of a picture's box, from its own stroke. */
  iconPad: number
  plusWidth: number
  plusGap: number
  plusFont: number
  indexWidth: number
  indexFont: number
  slotWidth: number
  ruleWidth: number
  answerFont: number
  writeRoom: number
  iconSlotGap: number
  hintFont: number
  hintGap: number
  rowGutter: number
}

export interface PictureRebusPagePlan {
  /** Puzzles this page prints. */
  itemCount: number
  columns: number
  rowsPerColumn: number
  metrics: PictureRebusMetrics
  /** Height of one row, identical for every row on every page of a run. */
  rowHeight: number
  /** Drawn width of one column, row number included — what gets centred. */
  columnWidth: number
  columnGutter: number
  /** Width the pictures and slots are centred in, right of the row number. */
  bandWidth: number
  /** Hint lines every row reserves, so rows keep a common height. */
  hintLineCount: number
  showHint: boolean
  bottomGuard: number
}

export function pictureRebusMetrics(options: {
  iconSize: number
  slotWidth: number
}): PictureRebusMetrics {
  const { iconSize, slotWidth } = options
  return {
    iconSize,
    iconStroke: Math.min(
      ICON_STROKE_MAX,
      Math.max(ICON_STROKE_MIN, Math.round(iconSize * ICON_STROKE_RATIO * 10) / 10),
    ),
    iconPad: Math.ceil(iconSize * ICON_STROKE_RATIO),
    plusWidth: Math.round(iconSize * PLUS_WIDTH_RATIO),
    plusGap: Math.round(iconSize * PLUS_GAP_RATIO),
    plusFont: Math.round(iconSize * PLUS_FONT_RATIO),
    indexWidth: Math.round(iconSize * INDEX_RATIO),
    indexFont: Math.max(INDEX_FONT_MIN, Math.round(iconSize * INDEX_FONT_RATIO)),
    slotWidth,
    ruleWidth: Math.round(slotWidth * RULE_RATIO),
    answerFont: Math.max(1, Math.round(slotWidth * 0.74)),
    writeRoom: Math.round(slotWidth * WRITE_ROOM_RATIO),
    iconSlotGap: Math.round(iconSize * ICON_SLOT_GAP_RATIO),
    hintFont: Math.max(HINT_FONT_MIN, Math.round(slotWidth * HINT_FONT_RATIO)),
    hintGap: Math.round(slotWidth * HINT_GAP_RATIO),
    rowGutter: Math.round(iconSize * ROW_GUTTER_RATIO),
  }
}

/** Height of a picture's box, its own ink included. */
export function iconBoxHeight(metrics: PictureRebusMetrics): number {
  return metrics.iconSize + metrics.iconPad * 2
}

/** Width of one puzzle's picture row: the pictures, and the "+" between them. */
export function iconBandWidth(
  iconCount: number,
  metrics: PictureRebusMetrics,
): number {
  const joins = Math.max(0, iconCount - 1)
  return (
    iconCount * metrics.iconSize +
    joins * (metrics.plusWidth + metrics.plusGap * 2) +
    metrics.iconPad * 2
  )
}

/** Width of one puzzle's slot row. */
export function slotBandWidth(answer: string, metrics: PictureRebusMetrics): number {
  return Math.ceil(answerSlotUnits(answer) * metrics.slotWidth)
}

export function rowHeightFor(options: {
  metrics: PictureRebusMetrics
  showHint: boolean
  hintLineCount: number
}): number {
  const { metrics, showHint, hintLineCount } = options
  const hintBlock = showHint
    ? metrics.hintGap +
      fabricTextHeight(hintLineCount, metrics.hintFont, HINT_LINE_HEIGHT)
    : 0
  return (
    iconBoxHeight(metrics) +
    hintBlock +
    metrics.iconSlotGap +
    metrics.writeRoom +
    RULE_HEIGHT
  )
}

/** The safe printable column every picture rebus page lays out inside. */
export function pictureRebusContentBox(page: StudioConfigLayoutContext): Box {
  return insetHorizontal(contentBox(page), STUDIO_CONTENT_SAFE_INSET_X)
}

/** What is left of the column once the title and instruction have been set. */
export function pictureRebusBodyField(
  page: StudioConfigLayoutContext,
  config: StudioConfig,
  instruction: string,
): Box {
  const content = pictureRebusContentBox(page)
  const headerHeight = measureHeaderHeight(config, instruction, content.width)
  return {
    ...content,
    top: content.top + headerHeight,
    height: Math.max(1, content.height - headerHeight),
  }
}

function planAt(options: {
  field: Box
  worst: PictureRebusPuzzle
  count: number
  columns: number
  iconSize: number
  showHint: boolean
  columnGutter: number
  spec: FontSpec
}): PictureRebusPagePlan | null {
  const { field, worst, count, columns, iconSize, showHint, columnGutter, spec } =
    options

  const columnSpan = (field.width - columnGutter * (columns - 1)) / columns
  const probe = pictureRebusMetrics({ iconSize, slotWidth: SLOT_MAX_W })
  const available = Math.floor(columnSpan - probe.indexWidth)
  if (available <= 0) return null

  // Slots before pictures: the answer is the widest thing a row draws, and its
  // pitch has a hard floor a hand needs. A column that cannot hold the longest
  // answer at that floor is not a column, whatever the pictures would fit in.
  const units = answerSlotUnits(worst.answer)
  const slotWidth = Math.min(SLOT_MAX_W, Math.floor(available / units))
  if (slotWidth < SLOT_MIN_W) return null

  const metrics = pictureRebusMetrics({ iconSize, slotWidth })
  const pictures = iconBandWidth(worst.icons.length, metrics)
  if (pictures > available) return null

  const bandWidth = Math.max(pictures, slotBandWidth(worst.answer, metrics))

  let hintLineCount = 1
  if (showHint) {
    const lines = wrapTextToWidth(
      worst.hint,
      metrics.hintFont,
      wrapSafeWidth(bandWidth, spec),
      spec,
    )
    if (lines.length > MAX_HINT_LINES) return null
    hintLineCount = lines.length
  }

  const rowHeight = rowHeightFor({ metrics, showHint, hintLineCount })
  const rowsPerColumn = Math.ceil(count / columns)
  const bottomGuard = Math.round(slotWidth * BOTTOM_GUARD_RATIO)
  const stack =
    rowHeight * rowsPerColumn + metrics.rowGutter * Math.max(0, rowsPerColumn - 1)
  if (stack > field.height - bottomGuard) return null

  return {
    itemCount: count,
    columns,
    rowsPerColumn,
    metrics,
    rowHeight,
    columnWidth: metrics.indexWidth + bandWidth,
    columnGutter: columns > 1 ? columnGutter : 0,
    bandWidth,
    hintLineCount,
    showHint,
    bottomGuard,
  }
}

/**
 * The fullest, roomiest page this level can make on this trim.
 *
 * Count comes first and picture size second, because the floor the search stops
 * at is already a large-print floor: eight puzzles at six tenths of an inch
 * serve a book better than five at the ceiling with a hand's width of white
 * space between them. Within a count the largest picture that fits wins, so a
 * page never prints smaller than it had to.
 *
 * Returns null when even three puzzles cannot be set at the floor — the form
 * says so before generate is ever pressed.
 */
export function planPictureRebusPage(options: {
  page: StudioConfigLayoutContext
  config: StudioConfig
  level: PictureRebusLevel
  instruction: string
  font: string
}): PictureRebusPagePlan | null {
  const { page, config, level, instruction, font } = options
  const worst = pictureRebusWorstCase(level)
  if (!worst) return null

  const field = pictureRebusBodyField(page, config, instruction)
  if (field.width <= 0 || field.height <= 0) return null

  const spec: FontSpec = { fontFamily: font }
  const columnGutter = Math.round(field.width * COLUMN_GUTTER_SHARE)

  for (let count = MAX_ITEMS_PER_PAGE; count >= MIN_ITEMS_PER_PAGE; count--) {
    for (const columns of COLUMN_CHOICES) {
      // Balanced columns only. A trailing half-empty column reads as a page
      // that ran out of puzzles rather than as a two-column layout.
      if (columns > 1 && (count % columns !== 0 || count / columns < MIN_ROWS_PER_COLUMN)) {
        continue
      }
      for (let iconSize = ICON_MAX; iconSize >= ICON_MIN; iconSize -= 2) {
        const plan = planAt({
          field,
          worst,
          count,
          columns,
          iconSize,
          showHint: level.showHint,
          columnGutter,
          spec,
        })
        if (plan) return plan
      }
    }
  }
  return null
}

export interface PictureRebusRowBox {
  /** Left edge of the row, where the number sits. */
  left: number
  top: number
}

/**
 * Where each row sits in the body column.
 *
 * Leftover height is spread between the rows before the block is centred, up to
 * one gutter each: centring alone leaves four puzzles clumped in the middle of
 * an 8.5 x 11 page with a hand's width of white above and below. The columns
 * are centred on their drawn width rather than pushed to the margins, so a page
 * of short answers does not read as though it slipped left.
 *
 * Numbering runs down a column before moving across, so a solver reads 1, 2, 3
 * in the order a hand moves down the page.
 */
export function pictureRebusRowBoxes(
  field: Box,
  plan: PictureRebusPagePlan,
): PictureRebusRowBox[] {
  const { metrics, rowHeight, itemCount, columns, rowsPerColumn } = plan

  const usableHeight = Math.max(0, field.height - plan.bottomGuard)
  const content = rowHeight * rowsPerColumn
  const gaps = Math.max(0, rowsPerColumn - 1)
  const slack = Math.max(0, usableHeight - content - metrics.rowGutter * gaps)
  const spread = gaps > 0 ? Math.min(slack / (gaps + 1), metrics.rowGutter) : 0
  const gutter = metrics.rowGutter + spread
  const stackHeight = content + gutter * gaps
  const stackTop = field.top + Math.max(0, (usableHeight - stackHeight) / 2)

  const totalWidth =
    plan.columnWidth * columns + plan.columnGutter * Math.max(0, columns - 1)
  const originX = field.left + Math.max(0, (field.width - totalWidth) / 2)

  const boxes: PictureRebusRowBox[] = []
  for (let index = 0; index < itemCount; index++) {
    const column = Math.floor(index / rowsPerColumn)
    const rowInColumn = index % rowsPerColumn
    boxes.push({
      left: originX + column * (plan.columnWidth + plan.columnGutter),
      top: stackTop + rowInColumn * (rowHeight + gutter),
    })
  }
  return boxes
}

/** What this level prints on the page size currently set in Settings. */
export function pictureRebusPrintNote(options: {
  level: PictureRebusLevel
  page: StudioConfigLayoutContext | undefined
  config: StudioConfig
  instruction: string
  font: string
}): string {
  const { level, page, config, instruction, font } = options
  const help = level.showHint ? ', each with a short hint' : ''

  if (!page) {
    return `Two pictures make one word${help}. Every page comes with a matching answer page.`
  }

  const plan = planPictureRebusPage({ page, config, level, instruction, font })
  if (!plan) {
    return (
      'This page size is too small for picture puzzles — the pictures would ' +
      'print below large-print size. Choose a larger page in Settings.'
    )
  }

  const puzzles = `${plan.itemCount} ${plan.itemCount === 1 ? 'puzzle' : 'puzzles'} a page`
  const shape = plan.columns > 1 ? ' in two columns' : ''
  const size = `pictures at ${Math.round((plan.metrics.iconSize / DPI) * 100) / 100} in`
  return `${puzzles}${shape}${help}, ${size}, plus a matching answer page.`
}
