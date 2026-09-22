import type {
  StudioConfig,
  StudioConfigLayoutContext,
} from '@/types/studio-template.types'
import type { MissingVowelsItem } from '@/types/studio-missing-vowels.types'
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
import { worstCaseItems } from './content'
import { toSlots } from './mask'
import type { MissingVowelsLevel } from './levels'

/**
 * Everything a missing-vowels page decides on the seller's behalf.
 *
 * The number that governs this page is not a point size. It is how much room a
 * hand needs to write one capital vowel above a short rule — every other
 * measurement on the sheet is set against that. Having it the other way round
 * is what let the old table promise eighteen rows on any trim and then shrink
 * them until the puzzle set at twelve point with nowhere to write.
 *
 * So the search runs over *slot pitch*, and the letters, the clue and the row
 * number take their sizes from it. The page also decides how many rows print:
 * start at the level's target and step down until every row still fits at the
 * writing floor. The form reports what came out (`missingVowelsPrintNote`) and
 * generate lays out against the same plan, so the note and the printed page can
 * never disagree.
 */

export function ptToPx(pt: number): number {
  return Math.round((pt * DPI) / PDF_POINTS_PER_INCH)
}

export function pxToPt(px: number): number {
  return Math.round((px * PDF_POINTS_PER_INCH) / DPI)
}

/**
 * Smallest slot a reader can still write a capital into, in inches.
 *
 * Measured from a ballpoint and an older hand rather than from type. Below
 * about a quarter inch the letters a solver writes start touching the printed
 * consonants either side of them, and an answer they cannot read back is an
 * answer they cannot check.
 */
const SLOT_HAND_MIN_INCHES = 0.26
/** Past this a page of short words reads as a poster rather than a puzzle. */
const SLOT_MAX_INCHES = 0.38


/**
 * Gap between two words, as a share of slot pitch.
 *
 * Wider than a letter slot on purpose. A word break and a blank are both empty
 * space on this row, and the only thing telling them apart is the writing rule
 * under the blank — a gap the same width as a slot invites a reader to count
 * one letter too many. At 1.3 the break reads as a break at a glance.
 */
const WORD_GAP_RATIO = 1.3

/** Printed letters against slot pitch. Air either side of the glyph. */
const LETTER_RATIO = 0.8
/** Clue prose against slot pitch. Secondary, but never below large-print comfort. */
const CLUE_RATIO = 0.66
/** Column holding the row number, as a share of slot pitch. */
const INDEX_RATIO = 1.5
/** Height reserved above each rule for the vowel a solver writes there. */
const WRITE_ROOM_RATIO = 1.05
/** Lift of a printed or written letter off the baseline rules. */
const LETTER_LIFT_RATIO = 0.1
/** Air between the letter row and the clue under it. */
const CLUE_GAP_RATIO = 0.34
/** Rule length against slot pitch — the gap keeps the blanks countable. */
export const RULE_RATIO = 0.8
/** Air between two rows, as a share of slot pitch. */
const GUTTER_RATIO = 0.85
/** Leading inside a wrapped clue. */
export const CLUE_LINE_HEIGHT = 1.25

/**
 * Point size the printed letters may never fall below.
 *
 * This book is bought for its large print. The form this page replaces offered
 * a "Standard" style that set the puzzle at twelve point, which is the one
 * thing a large-print buyer is paying not to get — so the choice is gone and
 * the floor is structural instead. Sixteen point is the size the large-print
 * publishing guidance settles on, and everything else on the row is measured
 * against the slot that produces it.
 */
export const MIN_LETTER_PT = 16

/**
 * The floor is whichever is larger: room for a hand, or room for the type.
 *
 * They are close, and which one binds depends on the ratios above — writing it
 * as a maximum means changing `LETTER_RATIO` can never quietly drop the page
 * below the size it is sold at.
 */
export const SLOT_MIN_W = Math.max(
  Math.round(DPI * SLOT_HAND_MIN_INCHES),
  Math.ceil(ptToPx(MIN_LETTER_PT) / LETTER_RATIO),
)
export const SLOT_MAX_W = Math.round(DPI * SLOT_MAX_INCHES)

/**
 * Clues wrap, and a page has to reserve their height before they are written.
 *
 * Two lines is the ceiling the worst-case probe reserves and the content gate
 * enforces, which is what lets the form promise a row count the page keeps: a
 * real clue can be shorter than the promise, never longer.
 */
export const MAX_CLUE_LINES = 2

/**
 * Weight of a writing rule.
 *
 * Heavier than the hairline the anagram rules its slots with, because these
 * rules are sparse: three or four of them scattered under a row of printed
 * capitals, rather than one continuous run. A hairline in that company reads as
 * a speck of dirt instead of an invitation to write.
 */
export const RULE_HEIGHT = 2

/**
 * Share of the level's aim a page must reach before the form stops suggesting
 * a larger trim. A page one or two rows short is the ordinary cost of a small
 * trim and needs no comment; half the aim is worth telling a seller about.
 */
const NUDGE_BELOW_SHARE = 0.6

/**
 * Air kept under the last writing rule.
 *
 * The stack used to be centred in the whole body, which let the bottom rule
 * land within a pixel or two of the safe line — and a pixel of clearance is not
 * clearance. Studio plans a page with estimated glyph widths when no canvas is
 * available and with real ones in the browser, so the two disagree slightly
 * about where a wrapped clue ends; with nothing in reserve, that difference is
 * the last row crossing the margin. It also simply looks wrong: a rule touching
 * the trim edge reads as a printing fault.
 */
const BOTTOM_GUARD_RATIO = 0.6

/** Space between two columns of rows, as a share of slot pitch. */
const COLUMN_GUTTER_RATIO = 1.4

/**
 * Two columns first, then one.
 *
 * A column has to hold the longest answer in the band at a writable slot pitch,
 * which a 6 x 9 trim cannot do twice over — so most pages end up single-column
 * and only the wide trims double up rather than running a short row of letters
 * across a column built for prose.
 */
const COLUMN_CHOICES = [2, 1] as const

/** Below this many rows, a second column is a gap rather than a layout. */
const MIN_ROWS_PER_COLUMN = 4

/**
 * Measures a clue may be broken to, as shares of the band.
 *
 * The narrowest one that still holds every clue in `MAX_CLUE_LINES` wins. This
 * is what keeps a row a block instead of a left-aligned smear: left to the full
 * band, the clue sets the row's width at the page measure while the letters
 * above it occupy the first two thirds, and the whole sheet reads as pushed
 * against the left margin.
 */
const CLUE_MEASURE_STEPS = [0.5, 0.6, 0.7, 0.8, 0.9, 1] as const

/** A clue narrower than this reads as a column of single words. */
const MIN_CLUE_MEASURE_SHARE = 0.45

export interface MissingVowelsMetrics {
  /** Pitch from one letter slot to the next. */
  slotW: number
  /** Width of the gap between two words of one answer. */
  wordGapW: number
  letterFont: number
  clueFont: number
  indexFont: number
  indexW: number
  /** Height above each rule, for the letter a solver writes. */
  writeRoom: number
  /** Lift of a glyph off the rules, so ink does not sit on ink. */
  letterLift: number
  clueGap: number
  gutter: number
}

export function missingVowelsMetrics(slotW: number): MissingVowelsMetrics {
  const letterFont = Math.max(1, Math.round(slotW * LETTER_RATIO))
  return {
    slotW,
    wordGapW: Math.round(slotW * WORD_GAP_RATIO),
    letterFont,
    clueFont: Math.max(1, Math.round(slotW * CLUE_RATIO)),
    // The number sits beside the letters, so it reads as part of that line.
    indexFont: letterFont,
    indexW: Math.round(slotW * INDEX_RATIO),
    writeRoom: Math.round(slotW * WRITE_ROOM_RATIO),
    letterLift: Math.round(slotW * LETTER_LIFT_RATIO),
    clueGap: Math.round(slotW * CLUE_GAP_RATIO),
    gutter: Math.round(slotW * GUTTER_RATIO),
  }
}

/**
 * Width one answer's slots occupy.
 *
 * Depends only on the answer, never on which letters are blanked — a blank and
 * a printed consonant are the same slot — so a page can be planned from the
 * answers alone, before a single vowel has been removed.
 */
export function slotRunWidth(answer: string, metrics: MissingVowelsMetrics): number {
  let width = 0
  for (const slot of toSlots(answer)) {
    width += slot.gap ? metrics.wordGapW : metrics.slotW
  }
  return width
}

export interface MissingVowelsRowPlan {
  /** Clue as it will be set, already broken to the column. */
  clueLines: string[]
}

export interface MissingVowelsPagePlan {
  /** Rows this page prints — never more than the level asked for. */
  itemCount: number
  /** Columns of rows. Two on a trim wide enough to write in both. */
  columns: number
  /** Rows down one column; the last column may stop short of it. */
  rowsPerColumn: number
  metrics: MissingVowelsMetrics
  rows: MissingVowelsRowPlan[]
  /** Clue lines every row reserves, so the rows keep a common height. */
  clueLineCount: number
  /** Height of one row, identical for every row on the page. */
  rowHeight: number
  /** Drawn width of one column, row number included — what gets centred. */
  columnWidth: number
  columnGutter: number
  /** Width the letters and the clue are drawn in, right of the row number. */
  bandWidth: number
  /** Air kept under the last rule so it never sits on the safe line. */
  bottomGuard: number
  /** True when the page could not hold the level's target. */
  reducedByPage: boolean
}

interface FittedClues {
  measure: number
  lineCount: number
  rows: MissingVowelsRowPlan[]
}

function breakClues(options: {
  items: readonly MissingVowelsItem[]
  count: number
  measure: number
  clueFont: number
  spec: FontSpec
}): FittedClues | null {
  const { items, count, measure, clueFont, spec } = options
  const wrapAt = wrapSafeWidth(measure, spec)
  const rows: MissingVowelsRowPlan[] = []
  let lineCount = 1

  for (let i = 0; i < count; i++) {
    const lines = wrapTextToWidth(items[i]!.clue, clueFont, wrapAt, spec)
    if (lines.length > MAX_CLUE_LINES) return null
    lineCount = Math.max(lineCount, lines.length)
    rows.push({ clueLines: lines })
  }
  return { measure, lineCount, rows }
}

/**
 * Break every clue to the narrowest measure that costs it no extra line.
 *
 * Two bad layouts sit either side of this. Give the clue the whole band and a
 * short one stops two thirds of the way across, leaving the letters — which are
 * narrower still — pinned to the left of a wide empty column; that is the sheet
 * reading as though it slipped off the page. Squeeze the clue to the width of
 * the letters instead and it breaks onto a second and third line, which buys
 * the balance back by making every row taller and the page emptier.
 *
 * So: find the fewest lines any measure can achieve, then take the narrowest
 * measure that still achieves it. The row is that measure wide — not the
 * longest glyph run — so the wrap pad stays in the box and Fabric leaves the
 * planned breaks alone. `drawMissingVowelsRows` centres that block.
 *
 * Returns null when even the full band needs more lines than a row reserves —
 * the caller then drops to a smaller pitch or fewer rows rather than printing a
 * clue over the row below.
 */
function fitClues(options: {
  items: readonly MissingVowelsItem[]
  count: number
  contentWidth: number
  bandWidth: number
  clueFont: number
  spec: FontSpec
}): FittedClues | null {
  const { items, count, contentWidth, bandWidth, clueFont, spec } = options
  const widest = breakClues({ items, count, measure: bandWidth, clueFont, spec })
  if (!widest) return null

  const floor = Math.max(contentWidth, Math.round(bandWidth * MIN_CLUE_MEASURE_SHARE))
  const measures = [
    ...new Set(
      CLUE_MEASURE_STEPS.map((share) => Math.round(bandWidth * share)).filter(
        (measure) => measure >= floor && measure < bandWidth,
      ),
    ),
  ].sort((a, b) => a - b)

  for (const measure of measures) {
    const fitted = breakClues({ items, count, measure, clueFont, spec })
    if (fitted && fitted.lineCount <= widest.lineCount) return fitted
  }
  return widest
}

export function rowHeightFor(
  metrics: MissingVowelsMetrics,
  clueLineCount: number,
): number {
  const { clueFont, clueGap, writeRoom } = metrics
  return (
    writeRoom +
    RULE_HEIGHT +
    clueGap +
    fabricTextHeight(clueLineCount, clueFont, CLUE_LINE_HEIGHT)
  )
}

/**
 * Shape the page is held to, so every sheet of one run matches.
 *
 * Without it the real page re-derives its own pitch from the words it was
 * handed, and a page of short answers comes out at 24 pt in one column beside a
 * page of long ones at 18 pt in two. Each is a good page; together they are not
 * a book. Generate measures the worst case once and pins this.
 */
export interface MissingVowelsPageLock {
  slotW: number
  columns: number
}

function planAt(options: {
  field: Box
  items: readonly MissingVowelsItem[]
  count: number
  spec: FontSpec
  /** Clue lines to reserve regardless of the clues handed in (worst-case probe). */
  minClueLines?: number
  lock?: MissingVowelsPageLock
}): MissingVowelsPagePlan | null {
  const { field, items, count, spec, minClueLines = 1, lock } = options
  const columnChoices = lock ? [lock.columns] : COLUMN_CHOICES
  const maxSlot = lock ? lock.slotW : SLOT_MAX_W
  const minSlot = lock ? lock.slotW : SLOT_MIN_W

  for (const columns of columnChoices) {
    // A second column has to earn itself: four rows stacked beside three is a
    // gap down the middle of the page, not a layout.
    if (!lock && columns > 1 && count < columns * MIN_ROWS_PER_COLUMN) continue

    for (let slotW = maxSlot; slotW >= minSlot; slotW--) {
      const metrics = missingVowelsMetrics(slotW)
      const columnGutter = columns > 1 ? Math.round(slotW * COLUMN_GUTTER_RATIO) : 0
      const columnSpan = (field.width - columnGutter * (columns - 1)) / columns
      const bandWidth = Math.floor(columnSpan - metrics.indexW)
      if (bandWidth <= 0) continue

      // The slot run is the widest thing a row draws; a clue that will not fit
      // beside it is handled by fitClues, which may wrap it onto a second line.
      let contentWidth = 0
      let fits = true
      for (let i = 0; i < count; i++) {
        const runW = slotRunWidth(items[i]!.answer, metrics)
        if (runW > bandWidth) {
          fits = false
          break
        }
        contentWidth = Math.max(contentWidth, runW)
      }
      if (!fits) continue

      const clues = fitClues({
        items,
        count,
        contentWidth,
        bandWidth,
        clueFont: metrics.clueFont,
        spec,
      })
      if (!clues) continue

      const clueLineCount = Math.max(minClueLines, clues.lineCount)
      const rowHeight = rowHeightFor(metrics, clueLineCount)
      const rowsPerColumn = Math.ceil(count / columns)
      const stack =
        rowHeight * rowsPerColumn + metrics.gutter * Math.max(0, rowsPerColumn - 1)
      const bottomGuard = Math.round(slotW * BOTTOM_GUARD_RATIO)
      if (stack > field.height - bottomGuard) continue

      // Size the box to the wrap *measure*, not to the longest line. Lines are
      // broken at wrapSafeWidth(measure) — several percent inside that edge —
      // so Fabric has air before it would re-wrap. Hugging the glyph run throws
      // that pad away, and the last word of a planned line lands on a row the
      // layout did not reserve.
      const drawnWidth = Math.max(contentWidth, clues.measure)
      return {
        itemCount: count,
        columns,
        rowsPerColumn,
        metrics,
        rows: clues.rows,
        clueLineCount,
        rowHeight,
        columnWidth: metrics.indexW + drawnWidth,
        columnGutter,
        bandWidth: drawnWidth,
        bottomGuard,
        reducedByPage: false,
      }
    }
  }
  return null
}

/**
 * The fullest, roomiest page these rows can make.
 *
 * Count comes before pitch: the floor is already large print, so nine rows at
 * the floor serve a book better than six at the ceiling with a hand's width of
 * white space between them.
 */
export function planMissingVowelsPage(options: {
  field: Box
  items: readonly MissingVowelsItem[]
  target: number
  spec: FontSpec
  minClueLines?: number
  lock?: MissingVowelsPageLock
}): MissingVowelsPagePlan | null {
  const { field, items, target, spec, minClueLines, lock } = options
  const want = Math.min(target, items.length)
  for (let count = want; count >= 1; count--) {
    const plan = planAt({ field, items, count, spec, minClueLines, lock })
    if (plan) return { ...plan, reducedByPage: count < target }
  }
  return null
}

/** The shape a worst-case plan pins the real pages of that run to. */
export function missingVowelsPageLock(
  plan: MissingVowelsPagePlan,
): MissingVowelsPageLock {
  return { slotW: plan.metrics.slotW, columns: plan.columns }
}

/** The safe printable column every missing-vowels page lays out inside. */
export function missingVowelsContentBox(page: StudioConfigLayoutContext): Box {
  return insetHorizontal(contentBox(page), STUDIO_CONTENT_SAFE_INSET_X)
}

/** What is left of the column once the title and instruction have been set. */
export function missingVowelsBodyField(
  page: StudioConfigLayoutContext,
  config: StudioConfig,
  instruction: string,
): Box {
  const content = missingVowelsContentBox(page)
  const headerHeight = measureHeaderHeight(config, instruction, content.width)
  return {
    ...content,
    top: content.top + headerHeight,
    height: Math.max(1, content.height - headerHeight),
  }
}

/**
 * The page this level makes, measured before a single word exists.
 *
 * Probed with the longest answer the band allows beside a clue filling the
 * whole two-line budget. Two things depend on that being the worst case rather
 * than a typical one:
 *
 * * The form's note is a promise. A note that says ten and prints eight is a
 *   bug report; measuring the worst case is what makes the promise keepable.
 * * A book wants pages that match. Left to fit whatever it was handed, one page
 *   would print ten short words and the next seven long ones, and a reader
 *   flicking through sees an uneven book. Generate caps itself here, so every
 *   page of one run holds the same number of rows.
 */
export function missingVowelsWorstCasePlan(options: {
  level: MissingVowelsLevel
  page: StudioConfigLayoutContext
  config: StudioConfig
  instruction: string
  font: string
}): MissingVowelsPagePlan | null {
  const { level, page, config, instruction, font } = options
  return planMissingVowelsPage({
    field: missingVowelsBodyField(page, config, instruction),
    items: worstCaseItems(level, level.targetItems),
    target: level.targetItems,
    spec: { fontFamily: font },
    minClueLines: MAX_CLUE_LINES,
  })
}

/** What this level prints on the page size currently set in Settings. */
export function missingVowelsPrintNote(options: {
  level: MissingVowelsLevel
  page: StudioConfigLayoutContext | undefined
  config: StudioConfig
  instruction: string
  font: string
}): string {
  const { level, page, config, instruction, font } = options
  const band = `${level.minLetters}–${level.maxLetters} letters`
  const shape = level.maxWords > 1 ? ', words and short phrases' : ', single words'

  if (!page) {
    return `About ${level.targetItems} puzzles a page, ${band}${shape}, plus a matching answer page.`
  }

  const plan = missingVowelsWorstCasePlan({ level, page, config, instruction, font })
  if (!plan) {
    return 'This page size is too small for a missing-vowels page at this level — choose a larger one in Settings, or a gentler level.'
  }

  const rows = `${plan.itemCount} ${plan.itemCount === 1 ? 'puzzle' : 'puzzles'} a page`
  const size = `letters at ${pxToPt(plan.metrics.letterFont)} pt`
  const columns = plan.columns > 1 ? ' in two columns' : ''
  const note = `${rows}${columns}, ${band}${shape}, ${size}, plus a matching answer page.`
  // Say what the page gives, then what to change if they want more. A page
  // holding fewer than the level aims for is not a fault to apologise for — it
  // is the trim doing its job, and the only useful reply is the lever.
  //
  // Only when the shortfall is worth acting on, though. The target is an aim,
  // not an entitlement, and a nudge printed under every level on every trim is
  // read as a warning about the page rather than as the advice it is.
  return plan.itemCount < level.targetItems * NUDGE_BELOW_SHARE
    ? `${note} A larger page size in Settings fits more per page.`
    : note
}
