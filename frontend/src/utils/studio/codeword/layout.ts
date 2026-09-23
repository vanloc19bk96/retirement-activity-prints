import type {
  StudioConfig,
  StudioConfigLayoutContext,
} from '@/types/studio-template.types'
import { DPI } from '@/types/canvas-settings.types'
import { STUDIO_CONTENT_SAFE_INSET_X } from '@/constants/studio.constants'
import {
  contentBox,
  insetHorizontal,
  measureHeaderHeight,
  type Box,
} from '../studio-layout'
import { STUDIO_AUTO_PAGE_TITLE_SAMPLE } from '../studio-page-header'
import { ptToPx, pxToPt } from '../retirement-word-search/layout'
import {
  GRID_KEY_GAP,
  STARTER_CAPTION_MAX_SIZE,
  codewordCellMetrics,
  minCodewordKeyHeight,
  starterCaptionHeight,
} from './draw'
import { CODEWORD_LEVELS, type CodewordLevel } from './levels'

/**
 * Everything a codeword page decides on the seller's behalf.
 *
 * Three blocks compete for one column — a grid, a starter line and a key strip
 * — and only one of them can be made smaller. The key has to hold one writing
 * box per number; the starter line is a single line that may not wrap. So the
 * grid is what is derived, and it is derived from a floor that is about a hand
 * rather than about type: a codeword cell is written into, not read, and the
 * number that decides whether an older reader can use it is how wide the square
 * is, not what point size anything sets at.
 *
 * None of this is on the form. A seller cannot answer "how many cells" without
 * knowing the trim, the heading and how the words happen to interlock, so the
 * page works it out and `codewordPrintNote` reports what came out — the form's
 * help line and the printed page are always the same numbers.
 */

export { ptToPx, pxToPt }

/**
 * Smallest cell a reader can still write a capital into, in inches.
 *
 * A third of an inch is about where a capital written with a ballpoint stops
 * touching the rules on either side — the same reasoning as the crossword's
 * floor, a shade wider because a codeword cell also carries a printed number
 * along its foot and the writing space is only what is left above it.
 */
const GRID_MIN_CELL_INCHES = 0.33

export const CODEWORD_MIN_CELL = Math.round(DPI * GRID_MIN_CELL_INCHES)

/**
 * Ceiling on one cell, matching the crossword's: left uncapped, a compact grid
 * on an 8.5 x 11 interior inflates into a wall chart with half a page of white
 * under it.
 */
export const CODEWORD_MAX_CELL = Math.round(DPI * 0.5)

/**
 * The pitch this page would rather print at than add another cell.
 *
 * The floor above is where a capital stops fitting; this is where writing one
 * stops being a chore. Between the two the page prefers the roomier grid: a
 * fourteen-cell codeword at the floor and a thirteen-cell one at this pitch
 * hold nearly the same number of words, and for the reader this book is sold to
 * the second is plainly the better page.
 */
const GRID_COMFORT_CELL_INCHES = 0.36

export const CODEWORD_COMFORT_CELL = Math.round(DPI * GRID_COMFORT_CELL_INCHES)

/**
 * Cells a side, floor and ceiling.
 *
 * Below nine there is no room to interlock enough words for the crossings to
 * carry a clue-free puzzle. Above fifteen the numbers reach three digits'
 * worth of width in a cell that has not grown, and the grid stops reading as a
 * puzzle and starts reading as a spreadsheet.
 */
export const CODEWORD_MIN_SIDE = 9
export const CODEWORD_MAX_SIDE = 15

/**
 * Words a square interlocking grid of `side` cells holds.
 *
 * The crossword's own figure, and it is measured rather than chosen: the packer
 * crops to the cells it used, and a run of N words of four to nine letters
 * settles at roughly N + 2 cells a side. Asking a grid for more than this is
 * how a build spends seconds backtracking and then gives up — which is exactly
 * what a 5 x 8 interior did before this bound existed, and it spent eight
 * seconds doing it.
 */
export function wordsForGridSide(side: number): number {
  return side - 2
}

export interface CodewordPagePlan {
  /** Column left for the puzzle once the title and instruction have been set. */
  field: Box
  /** Cells a side the packer may use. */
  maxGridSide: number
  /** Words this page aims to interlock. */
  targetWords: number
  /** Cell the grid is expected to print at. */
  gridCell: number
  /** Floor every page holds its cells at. */
  minGridCell: number
}

/** The safe printable column every codeword page lays out inside. */
export function codewordContentBox(page: StudioConfigLayoutContext): Box {
  return insetHorizontal(contentBox(page), STUDIO_CONTENT_SAFE_INSET_X)
}

/**
 * The heading this page will really carry.
 *
 * A draft with "Page title" on and the text left blank is not an untitled page:
 * generate falls back to the theme, and a book run stamps "Game N". Measuring
 * the draft as written would let the form promise a grid the printed page — one
 * title line shorter — cannot hold, and the smallest trims are exactly where
 * that line is the difference.
 */
function headerConfig(config: StudioConfig): StudioConfig {
  if (config.showTitle === false) return config
  if (String(config.title ?? '').trim()) return config
  return { ...config, title: STUDIO_AUTO_PAGE_TITLE_SAMPLE }
}

/** What is left of the column once the title and instruction have been set. */
export function codewordBodyField(
  page: StudioConfigLayoutContext,
  config: StudioConfig,
  instruction: string,
): Box {
  const content = codewordContentBox(page)
  const headerHeight = measureHeaderHeight(headerConfig(config), instruction, content.width)
  return {
    ...content,
    top: content.top + headerHeight,
    height: Math.max(1, content.height - headerHeight),
  }
}

/**
 * Resolve grid ceiling, word target and cell pitch for one page.
 *
 * The key strip and the starter line are measured at their floors first — the
 * strip at twenty-six boxes of the smallest type, the line at the largest size
 * it may print, because that is the tallest either block can ever be on this
 * page. Everything left is the grid's, and the grid takes as many cells as it
 * can while keeping every one of them at or above the writable floor.
 *
 * Returns null when a codeword will not fit at all — a narrow trim, a wide
 * gutter, a three-line instruction. The form says so before generate is ever
 * pressed, rather than printing a grid nobody can write in.
 */
export function planCodewordPage(options: {
  page: StudioConfigLayoutContext
  config: StudioConfig
  instruction: string
  level: CodewordLevel
}): CodewordPagePlan | null {
  const { page, config, instruction, level } = options
  const field = codewordBodyField(page, config, instruction)

  const keyFloor = minCodewordKeyHeight(field.width)
  if (keyFloor == null) return null
  const captionFloor = starterCaptionHeight(STARTER_CAPTION_MAX_SIZE)

  const gridSpan = Math.min(
    field.width,
    field.height - keyFloor - captionFloor - GRID_KEY_GAP,
  )
  if (gridSpan < CODEWORD_MIN_SIDE * CODEWORD_MIN_CELL) return null

  let maxGridSide = Math.min(
    CODEWORD_MAX_SIDE,
    Math.floor(gridSpan / CODEWORD_MIN_CELL),
  )
  if (maxGridSide < CODEWORD_MIN_SIDE) return null
  // A grid that cannot hold even this level's floor is not a tight page, it is
  // the wrong page: refusing here is what stops generate from spending seconds
  // backtracking towards a grid that was never going to close.
  if (wordsForGridSide(maxGridSide) < level.minWords) return null

  // Spend spare width on bigger squares rather than on more of them, down to
  // the point where the level would lose words it cannot do without.
  while (
    maxGridSide > CODEWORD_MIN_SIDE &&
    Math.floor(gridSpan / maxGridSide) < CODEWORD_COMFORT_CELL &&
    wordsForGridSide(maxGridSide - 1) >= level.minWords
  ) {
    maxGridSide -= 1
  }

  return {
    field,
    maxGridSide,
    // The packer is asked for the level's target and keeps whatever interlocks;
    // a narrow grid simply cannot hold the whole target, so the ask is trimmed
    // rather than left to fail and retry against itself.
    targetWords: Math.max(
      level.minWords,
      Math.min(level.targetWords, wordsForGridSide(maxGridSide)),
    ),
    gridCell: Math.min(CODEWORD_MAX_CELL, Math.floor(gridSpan / maxGridSide)),
    minGridCell: CODEWORD_MIN_CELL,
  }
}

/** True when some easier level lays out on this page, and this one does not. */
function gentlerLevelFits(
  level: CodewordLevel,
  page: StudioConfigLayoutContext,
  config: StudioConfig,
  instruction: string,
): boolean {
  const index = CODEWORD_LEVELS.indexOf(level)
  return CODEWORD_LEVELS.slice(0, Math.max(0, index)).some((gentler) =>
    planCodewordPage({ page, config, instruction, level: gentler }),
  )
}

/** The plain sentence the form owes the seller in place of the knobs it drops. */
export function codewordPrintNote(
  level: CodewordLevel,
  page: StudioConfigLayoutContext | undefined,
  config: StudioConfig,
  instruction: string,
): string {
  if (!page) {
    return (
      `About ${level.targetWords} interlocking words and ` +
      `${level.starterLetters} letters given, plus a solution page.`
    )
  }

  const plan = planCodewordPage({ page, config, instruction, level })
  if (!plan) {
    return gentlerLevelFits(level, page, config, instruction)
      ? 'This page size is too small for this level — choose a gentler level, or a larger page in Settings.'
      : 'This page size is too small for a codeword — the grid and the number key need a wider column. ' +
          'Choose a larger page in Settings.'
  }

  const numberPt = pxToPt(codewordCellMetrics(plan.gridCell).numberSize)
  return (
    `About ${plan.targetWords} interlocking words on a grid up to ` +
    `${plan.maxGridSide} × ${plan.maxGridSide}, numbers at ${numberPt} pt, ` +
    `${level.starterLetters} letters given, plus a solution page with the whole code.`
  )
}
