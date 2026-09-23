import type { StudioFabricObject } from '@/types/studio-template.types'
import type { Box } from '../studio-layout'
import type { StudioTag } from '../studio-fabric-builders'
import { drawLetterGrid } from '../retirement-word-search/draw'
import { formatAnswerLine, formatClueLine } from './content'
import {
  ANSWERS_CAPTION,
  CLUES_CAPTION,
  CLUE_MIN_SIZE,
  drawTriviaList,
  planTriviaList,
  type TriviaListPlan,
} from './draw'
import { triviaListBudget, triviaPageBands, type TriviaPagePlan } from './layout'
import type { TriviaPuzzle } from './place'

/**
 * Paint one trivia clue word search into the body column.
 *
 * Both bands come from the plan rather than from a share of the page, which is
 * what lets the form promise a grid size and a clue count before either exists.
 * `drawLetterGrid` re-fits a square to whatever box it is handed, so the grid
 * band is built at exactly `cell x side` plus the stroke pad and the re-fit is
 * a no-op — the plan stays the single source of the geometry.
 */

/** The numbered clues, as the puzzle page will set them, or null if they overrun. */
export function planClueBlock(options: {
  field: Box
  plan: TriviaPagePlan
  puzzle: TriviaPuzzle
  font: string
}): TriviaListPlan | null {
  const { field, plan, puzzle, font } = options
  return planTriviaList({
    lines: puzzle.entries.map((entry, index) => formatClueLine(index + 1, entry)),
    width: field.width,
    maxHeight: triviaListBudget(field, plan),
    font,
    preferredFontSize: plan.clueFontSize,
    minFontSize: CLUE_MIN_SIZE,
    caption: CLUES_CAPTION,
  })
}

/**
 * The numbered answers for the solution page.
 *
 * Numbering, order and column flow are the clue list's, because the solution is
 * only useful if a reader can run a finger down it beside the page they just
 * solved. Answers are short, so the block sets larger and shallower than the
 * clues did — and the circles on the grid above get the height that frees.
 */
export function planAnswerBlock(options: {
  field: Box
  plan: TriviaPagePlan
  puzzle: TriviaPuzzle
  font: string
}): TriviaListPlan | null {
  const { field, plan, puzzle, font } = options
  return planTriviaList({
    lines: puzzle.entries.map((entry, index) => formatAnswerLine(index + 1, entry)),
    width: field.width,
    maxHeight: triviaListBudget(field, plan),
    font,
    preferredFontSize: plan.clueFontSize,
    minFontSize: CLUE_MIN_SIZE,
    caption: ANSWERS_CAPTION,
  })
}

export function drawTriviaPuzzle(options: {
  field: Box
  plan: TriviaPagePlan
  puzzle: TriviaPuzzle
  /** Clue block on the puzzle page, answer block on the solution page. */
  list: TriviaListPlan
  font: string
  tag: StudioTag
  /** Solution page: the same grid with every answer circled. */
  forAnswerKey?: boolean
}): StudioFabricObject[] {
  const { field, plan, puzzle, list, font, tag } = options
  const bands = triviaPageBands(field, plan, list.height)
  return [
    drawLetterGrid(puzzle, bands.grid, font, tag, 'top', undefined, {
      minLetterSize: plan.letterFont,
      preferredFontSize: plan.letterFont,
    }),
    ...drawTriviaList(list, bands.list, font, tag),
  ]
}
