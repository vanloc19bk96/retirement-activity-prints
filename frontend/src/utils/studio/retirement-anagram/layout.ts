import type {
  StudioConfig,
  StudioConfigLayoutContext,
} from '@/types/studio-template.types'
import type { RetirementAnagramItem } from '@/types/studio-retirement-anagram.types'
import { DPI, PDF_POINTS_PER_INCH } from '@/types/canvas-settings.types'
import { STUDIO_CONTENT_SAFE_INSET_X } from '@/constants/studio.constants'
import {
  contentBox,
  insetHorizontal,
  measureHeaderHeight,
  toNonBreakingSpaces,
  type Box,
} from '../studio-layout'
import {
  fabricTextHeight,
  hugTextBoxWidth,
  wrapSafeWidth,
  wrapTextToWidth,
  type FontSpec,
} from '../studio-text-metrics'
import { worstCaseItems } from './content'
import type { AnagramLevel } from './levels'

/**
 * Everything an anagram page decides on the seller's behalf.
 *
 * The number that governs this page is not a point size. It is how much room a
 * hand needs to write one capital letter above a short rule — every other
 * measurement on the sheet is set against that. Having it the other way round
 * is what let the old table promise twelve words on any trim and then shrink
 * its rows until the letters set at nine point.
 *
 * So the search runs over *slot pitch*, and the scramble, the clue and the
 * index take their sizes from it. The page also decides how many words print:
 * start at the level's target and step down until every row still fits at the
 * writing floor. The form reports what came out (`anagramPrintNote`) and
 * generate lays out against the same plan, so the note and the printed page
 * can never disagree.
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
 * about a quarter inch the letters a solver writes start touching the ones
 * either side of them, and an answer they cannot read back is an answer they
 * cannot check.
 */
const SLOT_MIN_INCHES = 0.26
/** Past this a page of short words reads as a poster rather than a puzzle. */
const SLOT_MAX_INCHES = 0.36

export const SLOT_MIN_W = Math.round(DPI * SLOT_MIN_INCHES)
export const SLOT_MAX_W = Math.round(DPI * SLOT_MAX_INCHES)

/** Scrambled capitals against slot pitch. The row's headline — set it largest. */
const SCRAMBLE_RATIO = 0.82
/** Clue prose against slot pitch. Secondary, but never below large-print comfort. */
const CLUE_RATIO = 0.7
/** Column holding the row number, as a share of slot pitch. */
const INDEX_RATIO = 1.5
/** Height reserved above each rule for the letter a solver writes there. */
const WRITE_ROOM_RATIO = 0.95
/** Air between the scrambled letters and the clue under them. */
const CLUE_GAP_RATIO = 0.3
/** Rule length against slot pitch — the gap keeps the slots countable. */
export const RULE_RATIO = 0.78
/** Air between two rows, as a share of slot pitch. */
const GUTTER_RATIO = 0.9
/** Leading inside a wrapped clue. */
export const CLUE_LINE_HEIGHT = 1.25

/**
 * Clues wrap, and a page has to reserve their height before they are written.
 *
 * Two lines is the ceiling the worst-case probe reserves and the content gate
 * enforces, which is what lets the form promise a word count the page keeps: a
 * real clue can be shorter than the promise, never longer.
 */
export const MAX_CLUE_LINES = 2

/** Hairline under every slot — thin enough not to compete with a written letter. */
export const RULE_HEIGHT = 1

/**
 * Share of the level's aim a page must reach before the form stops suggesting
 * a larger trim. A page one or two words short is the ordinary cost of a small
 * trim and needs no comment; half the aim is worth telling a seller about.
 */
const NUDGE_BELOW_SHARE = 0.6

/**
 * Air kept under the last writing rule.
 *
 * The stack used to be centred in the whole body, which let the bottom rule
 * land within a pixel or two of the safe line — and a pixel of clearance is
 * not clearance. Studio plans a page with estimated glyph widths when no canvas
 * is available and with real ones in the browser, so the two disagree slightly
 * about where a wrapped clue ends; with nothing in reserve, that difference is
 * the last row crossing the margin. It also simply looks wrong: a rule touching
 * the trim edge reads as a printing fault.
 */
const BOTTOM_GUARD_RATIO = 0.6

/** Space between two columns of words, as a share of slot pitch. */
const COLUMN_GUTTER_RATIO = 1.3

/**
 * Two columns first, then one.
 *
 * A column has to hold the longest answer in the band at a writable slot pitch,
 * which a 6 x 9 trim cannot do twice over — so most pages end up single-column
 * and the wide ones double up rather than running a short row of letters across
 * a column built for prose.
 */
const COLUMN_CHOICES = [2, 1] as const

/** Below this many words, a second column is a gap rather than a layout. */
const MIN_ROWS_PER_COLUMN = 3

/**
 * Measures a clue may be broken to, as shares of the band.
 *
 * The narrowest one that still holds every clue in `MAX_CLUE_LINES` wins. This
 * is what keeps a row a block instead of a left-aligned smear: left to the full
 * band, the clue sets the row's width at the page measure while the letters and
 * the slots under it occupy the first third, and the whole sheet reads as
 * pushed against the left margin.
 */
const CLUE_MEASURE_STEPS = [0.5, 0.6, 0.7, 0.8, 0.9, 1] as const

/** A clue narrower than this reads as a column of single words. */
const MIN_CLUE_MEASURE_SHARE = 0.45

export interface AnagramMetrics {
  /** Pitch from one letter slot to the next. */
  slotW: number
  scrambleFont: number
  clueFont: number
  indexFont: number
  indexW: number
  writeRoom: number
  clueGap: number
  gutter: number
}

export function anagramMetrics(slotW: number): AnagramMetrics {
  const scrambleFont = Math.max(1, Math.round(slotW * SCRAMBLE_RATIO))
  return {
    slotW,
    scrambleFont,
    clueFont: Math.max(1, Math.round(slotW * CLUE_RATIO)),
    // The index sits beside the scramble, so it reads as part of that line.
    indexFont: scrambleFont,
    indexW: Math.round(slotW * INDEX_RATIO),
    writeRoom: Math.round(slotW * WRITE_ROOM_RATIO),
    clueGap: Math.round(slotW * CLUE_GAP_RATIO),
    gutter: Math.round(slotW * GUTTER_RATIO),
  }
}

/** Letters spaced out so a scramble reads as loose letters, not as a word. */
export function spacedLetters(letters: string): string {
  return toNonBreakingSpaces([...letters].join(' '))
}

/**
 * Width of a spaced letter run.
 *
 * Order does not change it: every letter is measured as its own word, so a
 * scramble is exactly as wide as the answer it was shuffled from. That is what
 * lets the page be planned from the answers alone, before any shuffling has
 * happened.
 */
export function spacedRunWidth(
  letters: string,
  fontSize: number,
  maxWidth: number,
  spec: FontSpec,
): number {
  return hugTextBoxWidth(spacedLetters(letters), fontSize, maxWidth, spec)
}

export interface AnagramRowPlan {
  /** Clue as it will be set, already broken to the column. */
  clueLines: string[]
}

export interface AnagramPagePlan {
  /** Words this page prints — never more than the level asked for. */
  itemCount: number
  /** Columns of words. Two on a trim wide enough to write in both. */
  columns: number
  /** Rows down one column; the last column may stop short of it. */
  rowsPerColumn: number
  metrics: AnagramMetrics
  rows: AnagramRowPlan[]
  /** Clue lines every row reserves, so the rows keep a common height. */
  clueLineCount: number
  /** Height of one row, identical for every row on the page. */
  rowHeight: number
  /** Drawn width of one column, row number included — what gets centred. */
  columnWidth: number
  columnGutter: number
  /** Width the three bands of a row are drawn in, right of the row number. */
  bandWidth: number
  /** Air kept under the last rule so it never sits on the safe line. */
  bottomGuard: number
  /** True when the page could not hold the level's target. */
  reducedByPage: boolean
}

interface FittedClues {
  measure: number
  lineCount: number
  rows: AnagramRowPlan[]
}

function breakClues(options: {
  items: readonly RetirementAnagramItem[]
  count: number
  measure: number
  clueFont: number
  spec: FontSpec
}): FittedClues | null {
  const { items, count, measure, clueFont, spec } = options
  const wrapAt = wrapSafeWidth(measure, spec)
  const rows: AnagramRowPlan[] = []
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
 * short one stops two thirds of the way across, leaving the letters and the
 * slots — which are narrower still — pinned to the left of a wide empty column;
 * that is the sheet reading as though it slipped off the page. Squeeze the clue
 * to the width of the slots instead and it breaks onto a second and third line,
 * which buys the balance back by making every row taller and the page emptier.
 *
 * So: find the fewest lines any measure can achieve, then take the narrowest
 * measure that still achieves it. The row is that measure wide — not the
 * longest glyph run — so the wrap pad stays in the box and Fabric leaves the
 * planned breaks alone. `drawAnagramRows` centres that block.
 *
 * Returns null when even the full band needs more lines than a row reserves —
 * the caller then drops to a smaller pitch or fewer words rather than printing
 * a clue over the slots.
 */
function fitClues(options: {
  items: readonly RetirementAnagramItem[]
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

export function rowHeightFor(metrics: AnagramMetrics, clueLineCount: number): number {
  const { scrambleFont, clueFont, clueGap, writeRoom } = metrics
  return (
    fabricTextHeight(1, scrambleFont) +
    clueGap +
    fabricTextHeight(clueLineCount, clueFont, CLUE_LINE_HEIGHT) +
    writeRoom +
    RULE_HEIGHT
  )
}

/**
 * Shape the page is held to, so every sheet of one run matches.
 *
 * Without it the real page re-derives its own pitch from the words it was
 * handed, and a page of short clues comes out at 21 pt in one column beside a
 * page of long ones at 16 pt in two. Each is a good page; together they are not
 * a book. Generate measures the worst case once and pins this.
 */
export interface AnagramPageLock {
  slotW: number
  columns: number
}

function planAt(options: {
  field: Box
  items: readonly RetirementAnagramItem[]
  count: number
  spec: FontSpec
  /** Clue lines to reserve regardless of the clues handed in (worst-case probe). */
  minClueLines?: number
  lock?: AnagramPageLock
}): AnagramPagePlan | null {
  const { field, items, count, spec, minClueLines = 1, lock } = options
  const columnChoices = lock ? [lock.columns] : COLUMN_CHOICES
  const maxSlot = lock ? lock.slotW : SLOT_MAX_W
  const minSlot = lock ? lock.slotW : SLOT_MIN_W

  for (const columns of columnChoices) {
    // A second column has to earn itself: three words stacked beside two is a
    // gap down the middle of the page, not a layout.
    if (!lock && columns > 1 && count < columns * MIN_ROWS_PER_COLUMN) continue

    for (let slotW = maxSlot; slotW >= minSlot; slotW--) {
      const metrics = anagramMetrics(slotW)
      const columnGutter = columns > 1 ? Math.round(slotW * COLUMN_GUTTER_RATIO) : 0
      const columnSpan = (field.width - columnGutter * (columns - 1)) / columns
      const bandWidth = Math.floor(columnSpan - metrics.indexW)
      if (bandWidth <= 0) continue

      // Slots are the widest thing a row draws; the scramble shares their
      // letters but is set loose rather than on the pitch, so both are checked.
      let contentWidth = 0
      let fits = true
      for (let i = 0; i < count; i++) {
        const item = items[i]!
        const slotsW = item.answer.length * metrics.slotW
        const scrambleW = spacedRunWidth(
          item.answer,
          metrics.scrambleFont,
          Number.POSITIVE_INFINITY,
          spec,
        )
        if (slotsW > bandWidth || scrambleW > bandWidth) {
          fits = false
          break
        }
        contentWidth = Math.max(contentWidth, slotsW, scrambleW)
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
      // so Fabric has air before it would re-wrap. Hugging the glyph run (plus
      // two pixels) throws that pad away, and the last word of a planned line
      // lands on a row the layout did not reserve: "the" sitting alone under
      // "Small wooden house in", then "woods" on the writing rules.
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
 * The fullest, roomiest page these words can make.
 *
 * Count comes before pitch: the floor is already large print, so eight words at
 * the floor serve a book better than five at the ceiling with a hand's width of
 * white space between them.
 */
export function planAnagramPage(options: {
  field: Box
  items: readonly RetirementAnagramItem[]
  target: number
  spec: FontSpec
  minClueLines?: number
  lock?: AnagramPageLock
}): AnagramPagePlan | null {
  const { field, items, target, spec, minClueLines, lock } = options
  const want = Math.min(target, items.length)
  for (let count = want; count >= 1; count--) {
    const plan = planAt({ field, items, count, spec, minClueLines, lock })
    if (plan) return { ...plan, reducedByPage: count < target }
  }
  return null
}

/** The shape a worst-case plan pins the real pages of that run to. */
export function anagramPageLock(plan: AnagramPagePlan): AnagramPageLock {
  return { slotW: plan.metrics.slotW, columns: plan.columns }
}

/** The safe printable column every anagram page lays out inside. */
export function anagramContentBox(page: StudioConfigLayoutContext): Box {
  return insetHorizontal(contentBox(page), STUDIO_CONTENT_SAFE_INSET_X)
}

/** What is left of the column once the title and instruction have been set. */
export function anagramBodyField(
  page: StudioConfigLayoutContext,
  config: StudioConfig,
  instruction: string,
): Box {
  const content = anagramContentBox(page)
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
 * * The form's note is a promise. A note that says eight and prints six is a
 *   bug report; measuring the worst case is what makes the promise keepable.
 * * A book wants pages that match. Left to fit whatever it was handed, one page
 *   would print eight short words and the next six long ones, and a reader
 *   flicking through sees an uneven book. Generate caps itself here, so every
 *   page of one run holds the same number of words.
 */
export function anagramWorstCasePlan(options: {
  level: AnagramLevel
  page: StudioConfigLayoutContext
  config: StudioConfig
  instruction: string
  font: string
}): AnagramPagePlan | null {
  const { level, page, config, instruction, font } = options
  return planAnagramPage({
    field: anagramBodyField(page, config, instruction),
    items: worstCaseItems(level, level.targetItems),
    target: level.targetItems,
    spec: { fontFamily: font },
    minClueLines: MAX_CLUE_LINES,
  })
}

/** What this level prints on the page size currently set in Settings. */
export function anagramPrintNote(options: {
  level: AnagramLevel
  page: StudioConfigLayoutContext | undefined
  config: StudioConfig
  instruction: string
  font: string
}): string {
  const { level, page, config, instruction, font } = options
  const band = `${level.minLetters}–${level.maxLetters} letters`
  const starter = level.firstLetterGiven ? ', first letter filled in' : ''

  if (!page) {
    return `About ${level.targetItems} words a page, ${band}${starter}, plus a matching answer page.`
  }

  const plan = anagramWorstCasePlan({ level, page, config, instruction, font })
  if (!plan) {
    return 'This page size is too small for an anagram page at this level — choose a larger one in Settings, or a gentler level.'
  }

  const words = `${plan.itemCount} ${plan.itemCount === 1 ? 'word' : 'words'} a page`
  const size = `letters at ${pxToPt(plan.metrics.scrambleFont)} pt`
  const shape = plan.columns > 1 ? ' in two columns' : ''
  const note = `${words}${shape}, ${band}, ${size}${starter}, plus a matching answer page.`
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
