import type { StudioFabricObject } from '@/types/studio-template.types'
import type { WordSearchPuzzle } from '@/utils/puzzles/word-search-core'
import type { Box } from '../studio-layout'
import type { StudioTag } from '../studio-fabric-builders'
import { drawLetterGrid, drawWordList } from './draw'
import {
  BANK_MAX_FONT,
  wordSearchPageBands,
  wordSearchSolutionBand,
  type WordSearchPagePlan,
} from './layout'

/**
 * Paint one word search into the body column.
 *
 * Both bands come from the plan rather than from a share of the page, which is
 * what lets the form promise a grid size and a word count before either exists.
 * `drawLetterGrid` re-fits a square to whatever box it is handed, so the grid
 * band is built at exactly `cell x side` plus the stroke pad and the fit is a
 * no-op — the plan stays the single source of the geometry.
 */
export function drawWordSearchPuzzle(options: {
  field: Box
  plan: WordSearchPagePlan
  puzzle: WordSearchPuzzle
  font: string
  tag: StudioTag
  /** Solution page: the grid alone, centred, with every word circled. */
  forAnswerKey?: boolean
}): StudioFabricObject[] {
  const { field, plan, puzzle, font, tag, forAnswerKey = false } = options
  const letterStyle = {
    minLetterSize: plan.letterFont,
    preferredFontSize: plan.letterFont,
  }

  if (forAnswerKey) {
    const band = wordSearchSolutionBand(field, plan)
    return [drawLetterGrid(puzzle, band, font, tag, 'top', undefined, letterStyle)]
  }

  const bands = wordSearchPageBands(field, plan)
  return [
    drawLetterGrid(puzzle, bands.grid, font, tag, 'top', undefined, letterStyle),
    ...drawWordList(puzzle.displays, bands.bank, font, tag, {
      minFontSize: plan.bank.minFont,
      maxFontSize: BANK_MAX_FONT,
      // Spare height in the band becomes larger type, not a larger gap.
      maximizeFont: true,
    }),
  ]
}
