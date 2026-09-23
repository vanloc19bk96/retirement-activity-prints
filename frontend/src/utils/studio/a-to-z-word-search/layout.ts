import type { StudioConfig, StudioConfigLayoutContext } from '@/types/studio-template.types'
import { STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import { measureHeaderHeight, type Box } from '../studio-layout'
import { ANSWER_STROKE_PAD } from '../retirement-word-search/draw'
import {
  CELL_MAX,
  LETTER_MIN,
  maxGridSideFor,
  minGridSideFor,
  ptToPx,
  pxToPt,
  wordSearchContentBox,
} from '../retirement-word-search/layout'
import { ATOZ_WORD_COUNT, candidateDisplays } from './content'
import { GRID_LIST_GAP, minAtoZBandHeight } from './draw'
import { ATOZ_LEVELS, type AtoZLevel } from './levels'

/**
 * Everything an A to Z page decides on the seller's behalf.
 *
 * Two blocks compete for one column, and unlike every other word search in this
 * app, one of them cannot be made smaller. The puzzle is the alphabet: twenty-six
 * words, always, so the usual lever — print fewer — does not exist here. What is
 * left to decide is how many cells the grid gets and how big they are, and both
 * follow from how much height the band under it needs.
 *
 * The band is reserved against the solution page rather than the puzzle page,
 * because the solution's list is the taller of the two: twenty-six words in a few
 * columns, against twenty-six bare letters in thirteen. Reserving the larger of
 * the pair, and then positioning both pages against that same reservation, is
 * what puts the grid in the same place on the puzzle and on its answer page.
 *
 * None of it is on the form. A seller cannot answer "how many cells" without
 * knowing the trim, the heading and how long the words turn out to be, so the
 * page derives it and `atoZPrintNote` reports what came out — the form's help
 * line and the printed page are the same numbers.
 */

export { CELL_MAX, LETTER_MIN, ptToPx, pxToPt }

/**
 * Letter pitch floor, and why it is not the plain word search's.
 *
 * `LETTER_MIN` is the large-print promise and it is imported, not restated: the
 * grid letters on this page set at fourteen point like every other word search
 * in the library, and two games in one book that disagree about what 14 pt means
 * would be a worse fault than either getting it wrong alone.
 *
 * What differs is the air around the glyph. The plain word search spends a third
 * of each cell on it (a 0.66 letter-to-pitch ratio); twenty-six words need too
 * many cells for that to fit a 6 x 9 or a 7.5 x 9.25 interior, and a page that
 * refuses the app's own default trim is not a page. So this game runs a tighter
 * pitch — still comfortably more air than a printed crossword gives a letter —
 * and spends the difference on cells instead of on margins. The letters
 * themselves never shrink.
 */
const LETTER_PITCH_RATIO = 0.78
export const ATOZ_CELL_MIN = Math.ceil(LETTER_MIN / LETTER_PITCH_RATIO)

/** Letter height as a share of the cell pitch, once the pitch is roomy enough. */
const LETTER_RATIO = 0.66

/**
 * Cells a side, floor and ceiling, for a twenty-six word grid.
 *
 * Both come from the shared packing rules rather than from an opinion about this
 * page: `minGridSideFor` is the placement engine's reliable one-word-per-nine-
 * cells budget read backwards, and `maxGridSideFor` is where a grid stops being a
 * puzzle and starts being a haystack. For twenty-six words they work out at 16
 * and 20.
 */
export const ATOZ_MIN_SIDE = minGridSideFor(ATOZ_WORD_COUNT)
export const ATOZ_MAX_SIDE = maxGridSideFor(ATOZ_WORD_COUNT)

/**
 * Cells a side this page aims for before the trim is consulted.
 *
 * About twelve cells per word — comfortably inside the packing budget, which is
 * what twenty-six interlocking words need to place reliably and to read as a
 * puzzle rather than as a wall of letters. Larger trims stop here and spend
 * their extra width on bigger cells instead of more filler; smaller ones step
 * down towards the floor.
 */
export const ATOZ_TARGET_SIDE = Math.min(
  ATOZ_MAX_SIDE,
  Math.max(ATOZ_MIN_SIDE, Math.ceil(Math.sqrt(12 * ATOZ_WORD_COUNT))),
)

export interface AtoZPagePlan {
  /** Cells a side. */
  gridSide: number
  /** Letter pitch, in canvas pixels. */
  cell: number
  /** Size the grid letters print at. */
  letterFont: number
  /** Height both pages reserve for the band under the grid. */
  reservedBandHeight: number
  /** Longest a hidden word may be on this page (cannot exceed the grid). */
  maxWordLetters: number
}

function pageFont(config: StudioConfig): string {
  return String(config.fontFamily ?? STUDIO_DEFAULT_FONT)
}

/** The safe printable column every A to Z page lays out inside. */
export function atoZContentBox(page: StudioConfigLayoutContext): Box {
  return wordSearchContentBox(page)
}

/** What is left of the column once the title and instruction have been set. */
export function atoZBodyField(
  page: StudioConfigLayoutContext,
  config: StudioConfig,
  instruction: string,
): Box {
  const content = atoZContentBox(page)
  const headerHeight = measureHeaderHeight(config, instruction, content.width)
  return {
    ...content,
    top: content.top + headerHeight,
    height: Math.max(1, content.height - headerHeight),
  }
}

/**
 * Every word this page could hide at a given length ceiling, as printed.
 *
 * The band's column count turns on the widest of them, and it has to be known
 * before a single word has been drawn — so it is measured over the whole lexicon
 * rather than over one draw. The grid ceiling is used as the length bound here
 * because the real grid is always at least `ATOZ_MIN_SIDE` wide, which is longer
 * than any word a level admits; a pool measured at the ceiling therefore contains
 * every pool a real page can draw from.
 */
function worstCaseWords(level: AtoZLevel, maxLetters: number): string[] {
  return candidateDisplays({
    minLetters: level.minLetters,
    maxLetters,
    gridSide: ATOZ_MAX_SIDE,
  })
}

/**
 * Shortest word ceiling a level will accept before the page is refused.
 *
 * The longest words are what the challenging level is for, and XYLOPHONE — the
 * one X word most readers would name — is nine letters, so the ceiling cannot
 * simply be lowered to whatever fits everywhere. But a nine-letter answer is also
 * the widest cell the solution page has to print twenty-six of, and on a 6 x 9
 * interior that is the difference between three columns and four, which is the
 * difference between a puzzle and an error page.
 *
 * So the ceiling is walked down instead, no further than the gentle level's own —
 * six letters is still a proper hidden word, and every letter of the alphabet has
 * at least two of them in the lexicon. A tight trim prints a challenging puzzle
 * with slightly shorter words; a roomy one prints XYLOPHONE.
 */
const ATOZ_MIN_WORD_CEILING = 6

/**
 * Resolve grid size, cell pitch, word ceiling and the band reservation.
 *
 * Walks the level's word ceiling downwards, and at each ceiling measures the band
 * at its floor — smallest type, most columns, no caption — because that floor is
 * the only part of the page that is not negotiable: twenty-six answers have to
 * print somewhere on the solution page. Everything left over is the grid's, and
 * the grid takes as many cells as it can while keeping its pitch at or above the
 * large-print floor.
 *
 * Whatever the grid then leaves unused goes back to the band as its reservation,
 * so a roomy trim spends the slack on larger list type and on its caption rather
 * than on a hole between the two blocks.
 *
 * Returns null when twenty-six words will not fit at large print — a narrow trim,
 * a wide gutter, a three-line instruction. The form says so before generate is
 * ever pressed.
 */
export function planAtoZPage(options: {
  page: StudioConfigLayoutContext
  config: StudioConfig
  instruction: string
  level: AtoZLevel
}): AtoZPagePlan | null {
  const { page, config, instruction, level } = options
  const field = atoZBodyField(page, config, instruction)
  const font = pageFont(config)
  const shortestCeiling = Math.min(level.maxLetters, ATOZ_MIN_WORD_CEILING)

  for (let maxLetters = level.maxLetters; maxLetters >= shortestCeiling; maxLetters--) {
    const bandFloor = minAtoZBandHeight({
      bandWidth: field.width,
      font,
      worstWords: worstCaseWords(level, maxLetters),
    })
    if (bandFloor == null) continue

    // The grid is square, so its side is bounded by the narrower of the column
    // and what the band leaves of the column's height.
    const gridSpan = Math.min(field.width, field.height - bandFloor - GRID_LIST_GAP)
    const usable = gridSpan - ANSWER_STROKE_PAD * 2
    if (usable < ATOZ_MIN_SIDE * ATOZ_CELL_MIN) continue

    // As many cells as it takes to keep the pitch under its ceiling, never past
    // the point where the grid is more filler than puzzle, then stepped back
    // down until the pitch clears the large-print floor.
    let side = Math.min(
      ATOZ_MAX_SIDE,
      Math.max(ATOZ_TARGET_SIDE, Math.ceil(usable / CELL_MAX)),
    )
    while (side > ATOZ_MIN_SIDE && Math.floor(usable / side) < ATOZ_CELL_MIN) side -= 1

    const cell = Math.min(CELL_MAX, Math.floor(usable / side))
    if (cell < ATOZ_CELL_MIN) continue

    const gridHeight = cell * side + ANSWER_STROKE_PAD * 2
    return {
      gridSide: side,
      cell,
      letterFont: Math.max(LETTER_MIN, Math.round(cell * LETTER_RATIO)),
      // Everything the grid did not take. Never below the floor the grid was
      // sized against, because the grid can only be shorter than the span it
      // was given, not taller.
      reservedBandHeight: Math.max(bandFloor, field.height - gridHeight - GRID_LIST_GAP),
      // A word cannot be longer than the grid is wide, whatever the level says.
      maxWordLetters: Math.min(maxLetters, side),
    }
  }

  return null
}

export function atoZGridHeight(plan: AtoZPagePlan): number {
  return plan.cell * plan.gridSide + ANSWER_STROKE_PAD * 2
}

export interface AtoZPageBands {
  grid: Box
  band: Box
}

/**
 * Where the grid and the band sit in the body column.
 *
 * Both pages get the same pair of *boxes* — the grid at exactly the square the
 * plan sized it to, and under it the height the plan *reserved* rather than the
 * height this page's list happened to measure. That is what keeps the circles on
 * the solution page sitting over the same letters at the same pitch, and it lets
 * each page centre its own band inside the reserved box so the shorter of the two
 * reads as deliberate space rather than as a gap.
 *
 * The solution page's column is the taller of the two, because a key carries no
 * instruction line. That surplus is not given to either block — the grid cannot
 * grow without leaving the circles behind, and stretching the band would spread
 * twenty-six answers over a page they do not fill. It goes above the stack
 * instead, a third of it: hard against the heading reads as a page that ran out
 * of room, and dead centre reads as a page floating away from it.
 */
export function atoZPageBands(field: Box, plan: AtoZPagePlan): AtoZPageBands {
  const gridHeight = atoZGridHeight(plan)
  const slack = Math.max(
    0,
    field.height - gridHeight - GRID_LIST_GAP - plan.reservedBandHeight,
  )
  const top = field.top + Math.round(slack / 3)
  return {
    grid: { left: field.left, top, width: field.width, height: gridHeight },
    band: {
      left: field.left,
      top: top + gridHeight + GRID_LIST_GAP,
      width: field.width,
      height: plan.reservedBandHeight,
    },
  }
}

/** Height a band may occupy on either page before it overruns the column. */
export function atoZBandBudget(plan: AtoZPagePlan): number {
  return plan.reservedBandHeight
}

/** True when some easier level lays out on this page, and this one does not. */
function gentlerLevelFits(
  level: AtoZLevel,
  page: StudioConfigLayoutContext,
  config: StudioConfig,
): boolean {
  const index = ATOZ_LEVELS.indexOf(level)
  return ATOZ_LEVELS.slice(0, Math.max(0, index)).some((gentler) =>
    planAtoZPage({ page, config, instruction: gentler.instruction, level: gentler }),
  )
}

/** What this level prints on the page size currently set in Settings. */
export function atoZPrintNote(
  level: AtoZLevel,
  page: StudioConfigLayoutContext | undefined,
  config: StudioConfig,
  instruction: string,
): string {
  if (!page) {
    return `${ATOZ_WORD_COUNT} hidden words, one for every letter, plus an answer page that lists them all.`
  }

  const plan = planAtoZPage({ page, config, instruction, level })
  if (!plan) {
    // Only offer the lever that actually works. On the smaller trims no level
    // fits, and telling a seller to try a gentler one sends them round a loop
    // that ends where it started.
    return gentlerLevelFits(level, page, config)
      ? 'This page size is too small for this level — choose a gentler level, or a larger page in Settings.'
      : 'This page size is too small for an A to Z word search — twenty-six words need a wider grid. ' +
          'Choose a larger page in Settings.'
  }

  return (
    `${ATOZ_WORD_COUNT} hidden words on a ${plan.gridSide} × ${plan.gridSide} grid, ` +
    `letters at ${pxToPt(plan.letterFont)} pt, plus an answer page that lists every word.`
  )
}
