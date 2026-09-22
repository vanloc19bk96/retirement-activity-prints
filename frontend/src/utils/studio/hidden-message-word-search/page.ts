import type { StudioFabricObject } from '@/types/studio-template.types'
import type { Box } from '../studio-layout'
import type { StudioTag } from '../studio-fabric-builders'
import { drawLetterGrid, drawWordList } from '../retirement-word-search/draw'
import {
  BANK_MAX_FONT,
  hiddenMessagePageBands,
  hiddenMessageSolutionBands,
  type HiddenMessagePagePlan,
} from './layout'
import {
  drawMessageWritingLines,
  drawSolutionMessage,
  fitMessageStrip,
  leftoverCellSet,
} from './draw'
import type { HiddenMessagePuzzle } from './place'

/**
 * Paint one hidden-message word search into the body column.
 *
 * Every band comes from the plan rather than from a share of the page, which is
 * what lets the form promise a grid size and a letter size before either
 * exists. `drawLetterGrid` re-fits a square to whatever box it is handed, so the
 * grid band is built at exactly `cell x side` plus the stroke pad and the re-fit
 * is a no-op — the plan stays the single source of the geometry.
 */
export function drawHiddenMessagePuzzle(options: {
  field: Box
  plan: HiddenMessagePagePlan
  puzzle: HiddenMessagePuzzle
  font: string
  tag: StudioTag
  /** Solution page: the grid alone, words circled, saying set below it. */
  forAnswerKey?: boolean
}): StudioFabricObject[] {
  const { field, plan, puzzle, font, tag, forAnswerKey = false } = options
  const letterStyle = {
    minLetterSize: plan.letterFont,
    preferredFontSize: plan.letterFont,
  }

  if (forAnswerKey) {
    const bands = hiddenMessageSolutionBands(field, plan)
    const objects: StudioFabricObject[] = [
      // Shading the saying's cells is what makes the key answer both halves of
      // the puzzle at once: the circles show the words, the tint shows which
      // letters were left to read.
      drawLetterGrid(
        puzzle,
        bands.grid,
        font,
        tag,
        'top',
        leftoverCellSet(puzzle),
        letterStyle,
      ),
    ]
    const saying = drawSolutionMessage({
      area: bands.message,
      text: puzzle.messageDisplay,
      font,
      tag,
    })
    if (saying) objects.push(saying)
    return objects
  }

  const bands = hiddenMessagePageBands(field, plan)
  const objects: StudioFabricObject[] = [
    drawLetterGrid(puzzle, bands.grid, font, tag, 'top', undefined, letterStyle),
    ...drawWordList(puzzle.displays, bands.bank, font, tag, {
      minFontSize: plan.bank.minFont,
      maxFontSize: BANK_MAX_FONT,
      // Spare height in the band becomes larger type, not a larger gap.
      maximizeFont: true,
    }),
  ]

  const strip = fitMessageStrip(bands.message, puzzle.messageWords, plan.message)
  if (strip) {
    objects.push(
      ...drawMessageWritingLines({
        area: bands.message,
        strip,
        letters: puzzle.messageLetters,
        font,
        tag,
      }),
    )
  }
  return objects
}
