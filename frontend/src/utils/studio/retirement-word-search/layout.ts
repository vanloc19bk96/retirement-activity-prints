import type { StudioConfig, StudioConfigLayoutContext } from '@/types/studio-template.types'
import { DPI, PDF_POINTS_PER_INCH } from '@/types/canvas-settings.types'
import {
  STUDIO_CONTENT_SAFE_INSET_X,
  STUDIO_DEFAULT_FONT,
} from '@/constants/studio.constants'
import {
  contentBox,
  insetHorizontal,
  measureHeaderHeight,
  type Box,
} from '../studio-layout'
import type { FontSpec } from '../studio-text-metrics'
import {
  ANSWER_STROKE_PAD,
  bankBandHeight,
  bankColumnInnerWidth,
  wordBankColumnCount,
} from './draw'
import { worstBankEntryWidth } from './content'
import type { WordSearchLevel } from './levels'

/**
 * Everything a word search page decides on the seller's behalf.
 *
 * A word search page is two stacked blocks competing for one column: a square
 * letter grid that has to stay readable, and a word bank that has to stay
 * large print. The old sheet resolved that competition with a lookup table —
 * `difficulty x printStyle` gave a grid size and a word count — and that table
 * never saw the trim. The same 12 x 12 grid was printed on a 5 x 8 interior,
 * where it sets at about nine point, and on 8.5 x 11, where it leaves a third
 * of the page empty.
 *
 * So the grid is derived here instead. The floor is a type size, not a hand
 * width: nothing is written into a word search cell, it is only read, and the
 * number that decides whether an older reader can read it is the letter's
 * point size. `LETTER_MIN` is the large-print promise, `CELL_MIN` is the
 * letter pitch that keeps it, and everything else — cells a side, word count,
 * bank columns — is searched against those two.
 *
 * The form reports what came out (`wordSearchPrintNote`) and generate lays out
 * against the same plan, so the note and the printed page cannot disagree.
 */

export function ptToPx(pt: number): number {
  return Math.round((pt * DPI) / PDF_POINTS_PER_INCH)
}

export function pxToPt(px: number): number {
  return Math.round((px * PDF_POINTS_PER_INCH) / DPI)
}

/**
 * Large-print floor for the grid letters.
 *
 * KDP will print anything. An activity book sold to readers in their seventies
 * that sets its grid at ten point comes back as a one-star review about the
 * type, not about the puzzles.
 */
export const LETTER_MIN = ptToPx(14)

/** Letter height as a share of the cell pitch — leaves air around the glyph. */
const LETTER_RATIO = 0.66

/**
 * Letter pitch floor and ceiling, in canvas pixels.
 *
 * The floor is `LETTER_MIN` divided back out through `LETTER_RATIO`: it is the
 * pitch at which the letters are still 14 pt, and not a separate opinion about
 * spacing. The ceiling is where a grid stops reading as a puzzle and starts
 * reading as a wall chart — past about four tenths of an inch the eye has to
 * travel between neighbouring letters to see a word at all.
 */
export const CELL_MIN = Math.ceil(LETTER_MIN / LETTER_RATIO)
export const CELL_MAX = Math.round(DPI * 0.44)

/** Word bank floor and ceiling — the same large-print promise as the grid. */
export const BANK_MIN_FONT = ptToPx(13)
export const BANK_MAX_FONT = ptToPx(16)

/** Air between the grid and the word bank. */
export const GRID_BANK_GAP = 20

/**
 * Below nine cells a side there is no room to interlock a publishable word
 * list; above sixteen the clue-free grid starts to look like a data table and
 * the cells fall under the pitch ceiling on every trim this app supports.
 */
export const GRID_MIN_SIDE = 9
export const GRID_MAX_SIDE = 16

/**
 * Fewest cells a side that hold `words` comfortably.
 *
 * `packingBudget` in the shared placement engine calls one word per nine cells
 * the reliable ceiling for a square grid; this is that rule read backwards. A
 * grid at exactly this size is a dense puzzle, which is what a small trim gets;
 * a larger trim ends up above it because the pitch ceiling forces more cells in.
 */
export function minGridSideFor(words: number): number {
  return Math.max(GRID_MIN_SIDE, Math.ceil(3 * Math.sqrt(Math.max(1, words))))
}

/**
 * Most cells a side before the grid is more filler than puzzle.
 *
 * Without a ceiling here, a wide trim spends all its width on cells: ten
 * gentle words landed on a sixteen-square grid, where four fifths of the
 * letters belong to no word at all. That is not a gentler page — it is a
 * larger haystack — and it looks like a page that ran out of things to say.
 * About one word per fifteen cells is where a grid still reads as a puzzle;
 * past that the column's spare width belongs in the margins instead.
 */
export function maxGridSideFor(words: number): number {
  return Math.max(
    minGridSideFor(words),
    Math.ceil(Math.sqrt(15 * Math.max(1, words))),
  )
}

export interface WordBankPlan {
  /** Columns the bank is split into at the large-print floor. */
  columns: number
  rows: number
  /** Floor the bank's type is fitted up from. */
  minFont: number
}

export interface WordSearchPagePlan {
  /** Cells a side. */
  gridSide: number
  /** Letter pitch, in canvas pixels. */
  cell: number
  /** Size the grid letters print at. */
  letterFont: number
  /** Words this page prints — the level's target, lowered to fit. */
  wordCount: number
  bank: WordBankPlan
  /** Longest a listed word may be on this page (cannot exceed the grid). */
  maxWordLetters: number
  /** Widest a bank entry may print before Fabric would wrap it. */
  maxEntryWidth: number
  /** True when the page forced the level's target down. */
  reducedByPage: boolean
}

/** The safe printable column every word search page lays out inside. */
export function wordSearchContentBox(page: StudioConfigLayoutContext): Box {
  return insetHorizontal(contentBox(page), STUDIO_CONTENT_SAFE_INSET_X)
}

/** What is left of the column once the title and instruction have been set. */
export function wordSearchBodyField(
  page: StudioConfigLayoutContext,
  config: StudioConfig,
  instruction: string,
): Box {
  const content = wordSearchContentBox(page)
  const headerHeight = measureHeaderHeight(config, instruction, content.width)
  return {
    ...content,
    top: content.top + headerHeight,
    height: Math.max(1, content.height - headerHeight),
  }
}

function bankFontSpec(config: StudioConfig): FontSpec {
  return {
    fontFamily: String(config.fontFamily ?? STUDIO_DEFAULT_FONT),
    fontWeight: 'normal',
  }
}

/**
 * Columns the bank holds once the widest admissible entry is accounted for.
 *
 * `wordBankColumnCount` only looks at how many words there are. A ten-letter
 * entry still has to fit its column on one line, so columns are given up until
 * it provably does — which is the same walk `drawWordList` makes with the real
 * words, against the same measure.
 */
function bankColumnsFor(
  wordCount: number,
  bandWidth: number,
  worstEntryWidth: number,
): number {
  let colCount = Math.min(wordBankColumnCount(wordCount), Math.max(1, wordCount))
  while (colCount > 1 && bankColumnInnerWidth(bandWidth, colCount) < worstEntryWidth) {
    colCount -= 1
  }
  return colCount
}

/**
 * Resolve word count, grid size and type sizes for one page.
 *
 * Walks the level's target downwards; the first count whose bank sets at the
 * large-print floor *and* leaves the grid at or above `CELL_MIN` wins. Fewer
 * words is the right lever for both halves at once: it shortens the bank, which
 * hands height back to the grid, and it lowers the grid's own floor.
 *
 * Returns null when even the level's minimum will not fit — a small trim with a
 * wide gutter and a three-line instruction. The form says so before generate is
 * ever pressed.
 */
export function planWordSearchPage(options: {
  page: StudioConfigLayoutContext
  config: StudioConfig
  instruction: string
  level: WordSearchLevel
}): WordSearchPagePlan | null {
  const { page, config, instruction, level } = options
  const field = wordSearchBodyField(page, config, instruction)
  const spec = bankFontSpec(config)
  const worstEntry = worstBankEntryWidth(level.maxLetters, BANK_MIN_FONT, spec)

  for (let words = level.targetWords; words >= level.minWords; words--) {
    const columns = bankColumnsFor(words, field.width, worstEntry)
    const rows = Math.ceil(words / columns)
    const bankHeight = bankBandHeight(rows, BANK_MIN_FONT)

    // Everything the bank does not take is the grid's, and the grid is square,
    // so its side is bounded by the narrower of the two.
    const gridSpan = Math.min(field.width, field.height - bankHeight - GRID_BANK_GAP)
    const usable = gridSpan - ANSWER_STROKE_PAD * 2
    if (usable < GRID_MIN_SIDE * CELL_MIN) continue

    // Enough cells to hold the words, or this count is simply too many.
    const floorSide = minGridSideFor(words)
    if (floorSide > GRID_MAX_SIDE) continue

    // Then as many more cells as it takes to keep the pitch under its ceiling,
    // up to the point where the grid stops being a grid. Past that the column
    // is wider than the puzzle wants to be, and the extra goes to the margins
    // rather than into more filler.
    const topSide = Math.min(GRID_MAX_SIDE, maxGridSideFor(words))
    const side = Math.min(topSide, Math.max(floorSide, Math.ceil(usable / CELL_MAX)))
    const cell = Math.min(CELL_MAX, Math.floor(usable / side))
    if (cell < CELL_MIN) continue

    return {
      gridSide: side,
      cell,
      letterFont: Math.max(LETTER_MIN, Math.round(cell * LETTER_RATIO)),
      wordCount: words,
      bank: { columns, rows, minFont: BANK_MIN_FONT },
      // A word cannot be longer than the grid is wide, whatever the level says.
      maxWordLetters: Math.min(level.maxLetters, side),
      maxEntryWidth: bankColumnInnerWidth(field.width, columns),
      reducedByPage: words < level.targetWords,
    }
  }

  return null
}

export interface WordSearchPageBands {
  grid: Box
  bank: Box
}

/**
 * Where the grid and the bank actually sit in the body column.
 *
 * The grid takes exactly the square the plan sized it to; the bank takes the
 * rest, so a roomy trim spends its spare height on larger bank type rather than
 * on a gap. The stack is nudged down by a third of whatever is still left over:
 * hard against the instruction reads as a page that ran out of room, and dead
 * centre reads as a page floating away from its heading.
 */
export function wordSearchPageBands(
  field: Box,
  plan: WordSearchPagePlan,
): WordSearchPageBands {
  const gridHeight = plan.cell * plan.gridSide + ANSWER_STROKE_PAD * 2
  const bankHeight = Math.max(
    bankBandHeight(plan.bank.rows, plan.bank.minFont),
    Math.min(
      field.height - gridHeight - GRID_BANK_GAP,
      bankBandHeight(plan.bank.rows, BANK_MAX_FONT),
    ),
  )
  const slack = Math.max(0, field.height - gridHeight - GRID_BANK_GAP - bankHeight)
  const top = field.top + Math.round(slack / 3)

  return {
    grid: { left: field.left, top, width: field.width, height: gridHeight },
    bank: {
      left: field.left,
      top: top + gridHeight + GRID_BANK_GAP,
      width: field.width,
      height: bankHeight,
    },
  }
}

/** Solution page: the same grid, centred in the column the bank has vacated. */
export function wordSearchSolutionBand(field: Box, plan: WordSearchPagePlan): Box {
  const gridHeight = plan.cell * plan.gridSide + ANSWER_STROKE_PAD * 2
  return {
    left: field.left,
    top: field.top + Math.max(0, Math.round((field.height - gridHeight) / 2)),
    width: field.width,
    height: gridHeight,
  }
}

/** What this level prints on the page size currently set in Settings. */
export function wordSearchPrintNote(
  level: WordSearchLevel,
  page: StudioConfigLayoutContext | undefined,
  config: StudioConfig,
  instruction: string,
): string {
  if (!page) {
    return `About ${level.targetWords} words to find, plus a matching answer page.`
  }

  const plan = planWordSearchPage({ page, config, instruction, level })
  if (!plan) {
    return (
      'This page size is too small for a word search at this level — ' +
      'choose a larger one in Settings, or a gentler level.'
    )
  }

  const note =
    `${plan.wordCount} words on a ${plan.gridSide} × ${plan.gridSide} grid, ` +
    `letters at ${pxToPt(plan.letterFont)} pt, plus a matching answer page.`
  // Say what the page gives, then what to change if they want more. A page
  // holding fewer than the level aims for is not a fault to apologise for —
  // it is the trim doing its job, and the only useful reply is the lever.
  return plan.reducedByPage
    ? `${note} A larger page size in Settings fits more words.`
    : note
}
