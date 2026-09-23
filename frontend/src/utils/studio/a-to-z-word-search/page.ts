import type { StudioFabricObject } from '@/types/studio-template.types'
import type { Box } from '../studio-layout'
import type { StudioTag } from '../studio-fabric-builders'
import { drawLetterGrid } from '../retirement-word-search/draw'
import { ALPHABET, formatAnswerLabel } from './content'
import {
  ATOZ_ANSWERS_CAPTION,
  ATOZ_LETTERS_CAPTION,
  drawAtoZList,
  planAtoZList,
  type AtoZListPlan,
} from './draw'
import { atoZBandBudget, atoZPageBands, type AtoZPagePlan } from './layout'
import type { AtoZPuzzle } from './place'

/**
 * Paint one A to Z word search into the body column.
 *
 * Both bands come from the plan rather than from a share of the page, which is
 * what lets the form promise a grid size before the puzzle exists.
 * `drawLetterGrid` re-fits a square to whatever box it is handed, so the grid
 * band is built at exactly `cell x side` plus the stroke pad and the re-fit is a
 * no-op — the plan stays the single source of the geometry.
 */

/** The bare alphabet, as the puzzle page sets it, or null if it overruns. */
export function planLettersBand(options: {
  plan: AtoZPagePlan
  font: string
  bandWidth: number
}): AtoZListPlan | null {
  const { plan, font, bandWidth } = options
  return planAtoZList({
    items: ALPHABET.map((letter) => ({ letter })),
    mode: 'letters',
    bandWidth,
    maxHeight: atoZBandBudget(plan),
    font,
    caption: ATOZ_LETTERS_CAPTION,
  })
}

/**
 * The twenty-six answers for the solution page.
 *
 * Letter order and column flow are the puzzle page's, because the solution is
 * only useful if a reader can run a finger down it beside the page they just
 * solved. This is also the only place the hidden words are ever printed — the
 * puzzle page shows the alphabet and nothing else — so it is the block that has
 * to be right.
 */
export function planAnswersBand(options: {
  plan: AtoZPagePlan
  puzzle: AtoZPuzzle
  font: string
  bandWidth: number
}): AtoZListPlan | null {
  const { plan, puzzle, font, bandWidth } = options
  return planAtoZList({
    items: puzzle.entries.map((entry) => ({
      letter: entry.letter,
      word: formatAnswerLabel(entry),
    })),
    mode: 'answers',
    bandWidth,
    maxHeight: atoZBandBudget(plan),
    font,
    caption: ATOZ_ANSWERS_CAPTION,
  })
}

export function drawAtoZPuzzle(options: {
  field: Box
  plan: AtoZPagePlan
  puzzle: AtoZPuzzle
  /** Alphabet band on the puzzle page, answers on the solution page. */
  list: AtoZListPlan
  font: string
  tag: StudioTag
}): StudioFabricObject[] {
  const { field, plan, puzzle, list, font, tag } = options
  const bands = atoZPageBands(field, plan)
  // The reserved box is the same on both pages; each page centres its own band
  // inside it, so the shorter alphabet strip sits under the middle of the grid
  // rather than hard against it.
  const area: Box = {
    ...bands.band,
    top: bands.band.top + Math.max(0, Math.round((bands.band.height - list.height) / 2)),
    height: list.height,
  }
  return [
    drawLetterGrid(puzzle, bands.grid, font, tag, 'top', undefined, {
      minLetterSize: plan.letterFont,
      preferredFontSize: plan.letterFont,
    }),
    ...drawAtoZList(list, area, font, tag),
  ]
}
