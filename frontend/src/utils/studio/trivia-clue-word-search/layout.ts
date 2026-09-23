import type { StudioConfig, StudioConfigLayoutContext } from '@/types/studio-template.types'
import { STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import { measureHeaderHeight, type Box } from '../studio-layout'
import { wrapSafeWidth, type FontSpec } from '../studio-text-metrics'
import { ANSWER_STROKE_PAD } from '../retirement-word-search/draw'
import {
  CELL_MAX,
  CELL_MIN,
  GRID_MAX_SIDE,
  GRID_MIN_SIDE,
  LETTER_MIN,
  maxGridSideFor,
  minGridSideFor,
  ptToPx,
  pxToPt,
  wordSearchContentBox,
} from '../retirement-word-search/layout'
import {
  CLUE_MAX_SIZE,
  CLUE_MIN_SIZE,
  GRID_LIST_GAP,
  MAX_CLUE_LINES,
  clueColumnWidth,
  listColumnsFor,
  listFontSpec,
  reserveListHeight,
} from './draw'
import { TRIVIA_LEVELS, type TriviaLevel } from './levels'

/**
 * Everything a trivia clue page decides on the seller's behalf.
 *
 * Two blocks compete for one column: a square letter grid that has to stay
 * readable, and a numbered clue list that has to stay large print. Unlike a
 * word bank, a clue is a sentence — it wraps, and ten of them is already a
 * third of a 6 x 9 page — so the clue count is the lever that moves both
 * blocks at once. Fewer clues is a shorter list, which is height the grid gets
 * back, and it is also a smaller grid floor.
 *
 * None of it is on the form. A seller cannot answer "how many clues" honestly
 * without knowing the trim, the heading and how long the clues turn out to be,
 * and neither could the lookup table that used to answer it for them. So the
 * count is derived here from the page in Settings, and `triviaPrintNote`
 * reports what came out — the form's help line and the printed page are the
 * same numbers.
 *
 * The large-print floors are imported from the plain word search rather than
 * restated. Two word searches facing each other in one book that disagree
 * about what 14 pt means is a worse fault than either getting it wrong alone.
 */

export { CELL_MAX, CELL_MIN, LETTER_MIN, ptToPx, pxToPt }

/** Letter height as a share of the cell pitch — matches the plain word search. */
const LETTER_RATIO = 0.66

export interface TriviaPagePlan {
  /** Cells a side. */
  gridSide: number
  /** Letter pitch, in canvas pixels. */
  cell: number
  /** Size the grid letters print at. */
  letterFont: number
  /** Clues this page prints — the level's target, lowered to fit. */
  clueCount: number
  /** Size the clue list is expected to set at, and the ceiling it fits up to. */
  clueFontSize: number
  /** Columns the clue list is reserved for. */
  clueColumns: number
  /** Upper bound on the clue block's height — what the grid was sized against. */
  reservedListHeight: number
  /** Width one clue is wrapped to, at the planned size. */
  clueWrapWidth: number
  /** Longest an answer may be on this page (cannot exceed the grid). */
  maxAnswerLetters: number
  /** True when the page forced the level's target down. */
  reducedByPage: boolean
}

function clueFontSpec(config: StudioConfig): FontSpec {
  return listFontSpec(String(config.fontFamily ?? STUDIO_DEFAULT_FONT))
}

/** The safe printable column every trivia page lays out inside. */
export function triviaContentBox(page: StudioConfigLayoutContext): Box {
  return wordSearchContentBox(page)
}

/** What is left of the column once the title and instruction have been set. */
export function triviaBodyField(
  page: StudioConfigLayoutContext,
  config: StudioConfig,
  instruction: string,
): Box {
  const content = triviaContentBox(page)
  const headerHeight = measureHeaderHeight(config, instruction, content.width)
  return {
    ...content,
    top: content.top + headerHeight,
    height: Math.max(1, content.height - headerHeight),
  }
}

/**
 * Resolve clue count, grid size and type sizes for one page.
 *
 * Walks the level's target downwards, and at each count walks the clue type
 * down from its ceiling. The first pair whose clue list provably fits *and*
 * leaves the grid at or above `CELL_MIN` wins, so the page spends its height on
 * clues first and on larger clue type second — a page with ten clues at 11 pt
 * is a better buy than one with seven at 14 pt.
 *
 * The clue block is reserved at its worst case: every clue budgeted at the
 * page's own line ceiling. No clue that would exceed it ever reaches the page,
 * because `selectTriviaEntries` drops it against the same wrap width. That is
 * what lets the form promise a grid size before a single clue has been written.
 *
 * Returns null when even the level's floor will not fit — a small trim with a
 * wide gutter and a two-line instruction. The form says so before generate is
 * ever pressed.
 */
export function planTriviaPage(options: {
  page: StudioConfigLayoutContext
  config: StudioConfig
  instruction: string
  level: TriviaLevel
}): TriviaPagePlan | null {
  const { page, config, instruction, level } = options
  const field = triviaBodyField(page, config, instruction)
  const spec = clueFontSpec(config)

  for (let clues = level.targetClues; clues >= level.minClues; clues--) {
    // Enough cells to interlock this many answers, or this count is too many.
    const floorSide = minGridSideFor(clues)
    if (floorSide > GRID_MAX_SIDE) continue

    for (let fontSize = CLUE_MAX_SIZE; fontSize >= CLUE_MIN_SIZE; fontSize--) {
      const clueColumns = listColumnsFor(field.width, fontSize, spec, clues)
      const listHeight = reserveListHeight({
        itemCount: clues,
        fontSize,
        columnCount: clueColumns,
        captioned: true,
      })

      // Everything the list does not take is the grid's, and the grid is
      // square, so its side is bounded by the narrower of the two.
      const gridSpan = Math.min(field.width, field.height - listHeight - GRID_LIST_GAP)
      const usable = gridSpan - ANSWER_STROKE_PAD * 2
      if (usable < GRID_MIN_SIDE * CELL_MIN) continue

      // Then as many more cells as it takes to keep the pitch under its
      // ceiling, up to the point where the grid stops being a puzzle and
      // starts being a haystack. Past that the spare width goes to the margins.
      const topSide = Math.min(GRID_MAX_SIDE, maxGridSideFor(clues))
      const side = Math.min(topSide, Math.max(floorSide, Math.ceil(usable / CELL_MAX)))
      const cell = Math.min(CELL_MAX, Math.floor(usable / side))
      if (cell < CELL_MIN) continue

      return {
        gridSide: side,
        cell,
        letterFont: Math.max(LETTER_MIN, Math.round(cell * LETTER_RATIO)),
        clueCount: clues,
        clueFontSize: fontSize,
        clueColumns,
        reservedListHeight: listHeight,
        clueWrapWidth: wrapSafeWidth(clueColumnWidth(field.width, clueColumns), spec),
        // An answer cannot be longer than the grid is wide, whatever the
        // level says.
        maxAnswerLetters: Math.min(level.maxLetters, side),
        reducedByPage: clues < level.targetClues,
      }
    }
  }

  return null
}

export interface TriviaPageBands {
  grid: Box
  list: Box
}

/**
 * Where the grid and the list actually sit in the body column.
 *
 * The grid takes exactly the square the plan sized it to; the list takes the
 * height it was *measured* at rather than the height that was reserved for it,
 * so a page whose clues came out short does not print a hole between the two.
 * Whatever neither wants becomes space, and it goes a third above the stack:
 * hard against the instruction reads as a page that ran out of room, and dead
 * centre reads as a page floating away from its heading.
 */
export function triviaPageBands(
  field: Box,
  plan: TriviaPagePlan,
  listHeight: number,
): TriviaPageBands {
  const gridHeight = triviaGridHeight(plan)
  const slack = Math.max(0, field.height - gridHeight - GRID_LIST_GAP - listHeight)
  const top = field.top + Math.round(slack / 3)
  return {
    grid: { left: field.left, top, width: field.width, height: gridHeight },
    list: {
      left: field.left,
      top: top + gridHeight + GRID_LIST_GAP,
      width: field.width,
      height: listHeight,
    },
  }
}

export function triviaGridHeight(plan: TriviaPagePlan): number {
  return plan.cell * plan.gridSide + ANSWER_STROKE_PAD * 2
}

/** Height the clue block may occupy on the puzzle page before it overruns. */
export function triviaListBudget(field: Box, plan: TriviaPagePlan): number {
  return Math.max(0, field.height - triviaGridHeight(plan) - GRID_LIST_GAP)
}

/** Lines one clue may take on this page — the ceiling the pool is filtered to. */
export const triviaMaxClueLines = MAX_CLUE_LINES

/** True when some easier level lays out on this page, and this one does not. */
function gentlerLevelFits(
  level: TriviaLevel,
  page: StudioConfigLayoutContext,
  config: StudioConfig,
): boolean {
  const index = TRIVIA_LEVELS.indexOf(level)
  return TRIVIA_LEVELS.slice(0, Math.max(0, index)).some((gentler) =>
    planTriviaPage({ page, config, instruction: gentler.instruction, level: gentler }),
  )
}

/** What this level prints on the page size currently set in Settings. */
export function triviaPrintNote(
  level: TriviaLevel,
  page: StudioConfigLayoutContext | undefined,
  config: StudioConfig,
  instruction: string,
): string {
  if (!page) {
    return `About ${level.targetClues} trivia clues to answer and find, plus a matching answer page.`
  }

  const plan = planTriviaPage({ page, config, instruction, level })
  if (!plan) {
    // Only offer the lever that actually works. On the smallest trims no level
    // fits, and telling a seller to try a gentler one sends them round a loop
    // that ends where it started.
    return gentlerLevelFits(level, page, config)
      ? 'This page size is too small for this level — choose a gentler level, or a larger page in Settings.'
      : 'This page size is too small for a trivia clue word search — choose a larger page in Settings.'
  }

  const note =
    `${plan.clueCount} clues on a ${plan.gridSide} × ${plan.gridSide} grid, ` +
    `grid letters at ${pxToPt(plan.letterFont)} pt and clues at ` +
    `${pxToPt(plan.clueFontSize)} pt, plus a matching answer page.`
  // Say what the page gives, then what to change if they want more. A page
  // holding fewer than the level aims for is not a fault to apologise for —
  // it is the trim doing its job, and the only useful reply is the lever.
  return plan.reducedByPage
    ? `${note} A larger page size in Settings fits more clues.`
    : note
}
