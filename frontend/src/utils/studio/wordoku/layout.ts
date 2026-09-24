import type {
  StudioConfig,
  StudioConfigLayoutContext,
} from '@/types/studio-template.types'
import { DPI } from '@/types/canvas-settings.types'
import { STUDIO_INSTRUCTION_SIZE } from '@/constants/studio.constants'
import { fitFontSizeToWidth, measureHeaderHeight, type Box } from '../studio-layout'
import { fabricTextHeight } from '../studio-text-metrics'
import { snapGridInField } from '../studio-grid-rules'
import { ptToPx, pxToPt, wordSearchContentBox } from '../retirement-word-search/layout'
import { longestWordokuHint } from './content'
import { WORDOKU_SIZE, type WordokuLevel } from './levels'

/**
 * Everything a Word-oku page decides on the seller's behalf.
 *
 * The page is one centred column of three blocks, all sized off the grid cell:
 *
 *   letter bank    the nine letters, alphabetical, in one framed strip
 *   grid           9×9, bold 3×3 boxes, the diagonal shaded and outlined
 *   hidden word    a one-line label, then nine shaded write-in boxes
 *
 * Tying every block to the cell is what keeps the page balanced on every trim:
 * the bank's letters, the grid's letters and the answer boxes stay in the same
 * proportion to one another whether the grid came out two inches or six. The
 * cell is the largest that fits the column's width *and* leaves room for the
 * two blocks around it, capped at the same share of the page width the number
 * Sudoku uses so the two puzzles read as one series in a mixed book.
 *
 * Nothing here is on the form. "How big should the cells be" is not a question
 * a seller can answer without knowing the trim and the heading; the page works
 * it out and `wordokuPrintNote` reports what came out.
 */

export { ptToPx, pxToPt }

/**
 * Hard large-print floor for the grid letters. Below it the page is refused
 * with a "pick a larger page" message rather than printed small.
 */
export const WORDOKU_LETTER_MIN = ptToPx(14)

/** Where the form starts suggesting a larger page for clearer letters. */
const WORDOKU_COMFORT_PT = 16

/** Same share of the page width as the 9×9 number Sudoku — one series look. */
const MAX_CELL_RATIO = 0.085

/** Grid letter size as a share of the cell. Caps are wide; W and M need air. */
const LETTER_CELL_RATIO = 0.6

/** Letter bank: strip height, letter pitch and side padding, in cells. */
const BANK_HEIGHT = 1
const BANK_PITCH = 0.9
const BANK_PAD_X = 0.35
const BANK_LETTER_RATIO = 0.55

/** Hidden-word boxes, in cells. Nine boxes plus gaps stay narrower than the grid. */
const WORD_BOX = 0.86
const WORD_BOX_GAP = 0.14
const WORD_LETTER_RATIO = 0.6

/** Vertical air between blocks, in cells. */
const GAP_BANK_GRID = 0.5
const GAP_GRID_LABEL = 0.45
const GAP_LABEL_BOXES = 0.22

/**
 * Air the stack always leaves in the body column, split above and below.
 *
 * Without it the tightest trims fill the column to its last pixel and the
 * answer boxes print flush on the safe-area edge — inside the margin, and the
 * first thing a seller squints at in the preview.
 */
const STACK_GUARD = 24

/** The label beside the answer boxes never drops below this. */
const LABEL_MIN = ptToPx(10)

/**
 * The diagonal and hidden-word boxes' tint: roughly 15% black.
 *
 * Grey rather than a colour so it survives a black-and-white interior exactly
 * as it looks on screen, and dark enough that KDP's press does not wash it out
 * (tints under ~10% can vanish). Letters stay near-black on it, so contrast is
 * never the price of the highlight — and the inset outline drawn on top means
 * the diagonal still reads if a printer drops the tint altogether.
 */
export const WORDOKU_SHADE = '#D9D9D9'

export interface WordokuLetterBankPlan {
  frame: Box
  pitch: number
  font: number
}

export interface WordokuWordRowPlan {
  labelTop: number
  labelFont: number
  labelWidth: number
  boxesTop: number
  boxesLeft: number
  box: number
  gap: number
  font: number
  width: number
}

export interface WordokuPagePlan {
  cell: number
  /** Integer-aligned grid bounds. */
  grid: Box
  cellBox: (row: number, col: number) => Box
  letterFont: number
  bank: WordokuLetterBankPlan
  word: WordokuWordRowPlan
  /** Every block together — centred in the body column. */
  stack: Box
}

/** The safe printable column every Word-oku page lays out inside. */
export function wordokuContentBox(page: StudioConfigLayoutContext): Box {
  return wordSearchContentBox(page)
}

/**
 * What is left of the column once the title and instruction have been set.
 *
 * Both pages are measured against the *puzzle* instruction, so the solution —
 * which prints no instruction — still puts the grid exactly where the puzzle
 * had it. A reader flipping back and forth checks cell by cell against the same
 * spot on the page.
 */
export function wordokuBodyField(
  page: StudioConfigLayoutContext,
  config: StudioConfig,
  instruction: string,
): Box {
  const content = wordokuContentBox(page)
  const headerHeight = measureHeaderHeight(config, instruction, content.width)
  return {
    ...content,
    top: content.top + headerHeight,
    height: Math.max(1, content.height - headerHeight),
  }
}

/** The label over the answer boxes. The hint is a theme, never the word. */
export function wordokuWordLabel(hint: string): string {
  return hint ? `Hidden word · Hint: ${hint}` : 'Hidden word'
}

function labelFontFor(cell: number, label: string, width: number): number {
  const preferred = Math.min(STUDIO_INSTRUCTION_SIZE, Math.max(LABEL_MIN, Math.round(cell * 0.5)))
  return fitFontSizeToWidth(label, width, preferred, LABEL_MIN)
}

function stackHeight(cell: number, labelFont: number): number {
  const label = Math.ceil(fabricTextHeight(1, labelFont))
  return Math.ceil(
    cell * (BANK_HEIGHT + GAP_BANK_GRID + WORDOKU_SIZE + GAP_GRID_LABEL + GAP_LABEL_BOXES + WORD_BOX) +
      label,
  )
}

/**
 * Lay the three blocks out in `field`, or null when the grid letters would
 * print below the large-print floor.
 *
 * Sized against the longest label the word list can print rather than this
 * page's own, so every Word-oku in a book lands on identical geometry whatever
 * its hint — a series whose grid shifts a few pixels from page to page reads
 * as sloppy even when nobody can say why.
 */
export function planWordokuPage(options: {
  field: Box
  pageWidth: number
}): WordokuPagePlan | null {
  const { field, pageWidth } = options
  const label = wordokuWordLabel(longestWordokuHint())
  const maxCell = Math.min(
    Math.floor(pageWidth * MAX_CELL_RATIO),
    Math.floor(field.width / WORDOKU_SIZE),
  )
  let cell = maxCell
  let labelFont = labelFontFor(cell, label, field.width)
  while (cell > 1 && stackHeight(cell, labelFont) + STACK_GUARD > field.height) {
    cell--
    labelFont = labelFontFor(cell, label, field.width)
  }
  const letterFont = Math.round(cell * LETTER_CELL_RATIO)
  if (letterFont < WORDOKU_LETTER_MIN) return null

  const height = stackHeight(cell, labelFont)
  const top = Math.round(field.top + (field.height - height) / 2)
  const centerX = field.left + field.width / 2

  const bankWidth = Math.round(cell * (BANK_PITCH * WORDOKU_SIZE + BANK_PAD_X * 2))
  const bankFrame: Box = {
    left: Math.round(centerX - bankWidth / 2),
    top,
    width: bankWidth,
    height: Math.round(cell * BANK_HEIGHT),
  }

  const gridTop = top + Math.round(cell * (BANK_HEIGHT + GAP_BANK_GRID))
  const snapped = snapGridInField(
    { left: field.left, top: gridTop, width: field.width, height: cell * WORDOKU_SIZE },
    WORDOKU_SIZE,
    WORDOKU_SIZE,
  )

  const labelTop = snapped.bounds.top + snapped.bounds.height + Math.round(cell * GAP_GRID_LABEL)
  const labelHeight = Math.ceil(fabricTextHeight(1, labelFont))
  const box = Math.round(cell * WORD_BOX)
  const gap = Math.round(cell * WORD_BOX_GAP)
  const rowWidth = box * WORDOKU_SIZE + gap * (WORDOKU_SIZE - 1)
  const boxesTop = labelTop + labelHeight + Math.round(cell * GAP_LABEL_BOXES)

  return {
    cell: snapped.cell,
    grid: snapped.bounds,
    cellBox: snapped.cellBox,
    letterFont,
    bank: {
      frame: bankFrame,
      pitch: Math.round(cell * BANK_PITCH),
      font: Math.round(cell * BANK_LETTER_RATIO),
    },
    word: {
      labelTop,
      labelFont,
      labelWidth: field.width,
      boxesTop,
      boxesLeft: Math.round(centerX - rowWidth / 2),
      box,
      gap,
      font: Math.round(box * WORD_LETTER_RATIO),
      width: rowWidth,
    },
    stack: {
      left: Math.min(bankFrame.left, snapped.bounds.left),
      top,
      width: Math.max(bankFrame.width, snapped.bounds.width, rowWidth),
      height: boxesTop + box - top,
    },
  }
}

function formatInches(px: number): string {
  return (Math.round((px / DPI) * 10) / 10).toFixed(1)
}

/**
 * What this level will actually print on the page size the seller has chosen.
 *
 * Cell size, letter size and clue count are all decided for them, so the form
 * owes them a plain sentence about the result rather than the knobs.
 */
export function wordokuPrintNote(
  level: WordokuLevel,
  layout: StudioConfigLayoutContext | undefined,
  config: StudioConfig,
  instruction: string,
): string {
  const shape =
    `9×9 letter grid, about ${level.targetClues} letters filled in, ` +
    'with a hidden retirement word on the shaded diagonal.'
  if (!layout) return `${shape} Every puzzle has one solution and gets its own answer page.`

  const field = wordokuBodyField(layout, config, instruction)
  const plan = planWordokuPage({ field, pageWidth: layout.pageWidth })
  if (!plan) {
    return `${shape} This page size is too small to print the letters at large-print size — pick a larger page in Settings.`
  }
  const letterPt = pxToPt(plan.letterFont)
  const measurements = `Prints ${formatInches(plan.grid.width)} in wide with ${letterPt} pt letters`
  if (letterPt < WORDOKU_COMFORT_PT) {
    return `${shape} ${measurements} — a larger page size in Settings gives bigger, clearer letters.`
  }
  return `${shape} ${measurements}, plus a matching answer page.`
}
