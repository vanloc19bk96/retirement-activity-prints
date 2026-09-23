import type { StudioFabricObject } from '@/types/studio-template.types'
import { STUDIO_BODY_SIZE, STUDIO_INK } from '@/constants/studio.constants'
import {
  buildGroup,
  buildText,
  type StudioTag,
} from '../studio-fabric-builders'
import { unionObjectBounds, type Box } from '../studio-layout'
import { hugTextBoxWidth, wrapTextToWidth } from '../studio-text-metrics'
import {
  drawWhiteCellEdges,
  type LatticeGrid,
} from '../_shared/lattice-grid'
import { GAP, type FallenPhraseGrid } from './grid'
import type { FallenPhrasePagePlan } from './layout'

/**
 * Painting a Fallen Phrase page: a grid of write-in boxes, and under every
 * column the letters that fell out of it.
 *
 * The whole page turns on one thing being unmistakable — which letters belong
 * to which column — and it has to be unmistakable in black and white, at arm's
 * length, to someone who has never seen a quotefall. So the bank is set at the
 * grid's own column pitch, each stack hanging directly beneath its own boxes.
 * Nothing is colour-coded, keyed or numbered: the letters are simply under
 * their column, which is the one cue that survives a photocopier.
 *
 * Boxes are outlined and the letters under them are not, so the two bands read
 * as different things at a glance: squares to write in, loose letters to place.
 * Word breaks are gaps in the lattice rather than filled squares — a solid
 * black cell is both a lot of toner and, on a page of empty boxes, one more
 * thing to interpret.
 */

/** Phrase caption under the solved grid, so the key reads back in plain text. */
const SOLUTION_CAPTION_CELL_RATIO = 0.5
const SOLUTION_CAPTION_MIN = 14
const SOLUTION_CAPTION_LINE_HEIGHT = 1.35

function latticeFrom(grid: FallenPhraseGrid): LatticeGrid {
  return grid.rows.map((row) =>
    Array.from({ length: grid.cols }, (_, col) => {
      const ch = row[col]
      return !ch || ch === GAP ? null : ch
    }),
  )
}

function letterText(options: {
  centerX: number
  centerY: number
  text: string
  size: number
  maxWidth: number
  font: string
  tag: StudioTag
  role: 'prompt' | 'answer'
}): StudioFabricObject {
  const { centerX, centerY, text, size, maxWidth, font, tag, role } = options
  return buildText(
    {
      left: centerX,
      top: centerY,
      text,
      width: hugTextBoxWidth(text, size, maxWidth, { fontFamily: font }),
      fontFamily: font,
      fontSize: size,
      fill: STUDIO_INK,
      lineHeight: 1,
      textAlign: 'center',
      originX: 'center',
      originY: 'center',
    },
    tag,
    role,
  )
}

/**
 * Every solved letter, in its box.
 *
 * Drawn on the puzzle page too, hidden — that is what lets the editor reveal
 * one sheet in place without regenerating it, and what the answer page is
 * built from.
 */
function drawGridLetters(
  parts: StudioFabricObject[],
  options: {
    grid: FallenPhraseGrid
    bounds: Box
    cell: number
    size: number
    font: string
    tag: StudioTag
  },
): void {
  const { grid, bounds, cell, size, font, tag } = options
  grid.rows.forEach((row, r) => {
    for (let c = 0; c < grid.cols; c++) {
      const letter = row[c]
      if (!letter || letter === GAP) continue
      parts.push(
        letterText({
          centerX: bounds.left + c * cell + cell / 2,
          centerY: bounds.top + r * cell + cell / 2,
          text: letter,
          size,
          maxWidth: cell,
          font,
          tag,
          role: 'answer',
        }),
      )
    }
  })
}

/** The fallen letters, stacked under the column they came from. */
function drawLetterBank(
  parts: StudioFabricObject[],
  options: {
    grid: FallenPhraseGrid
    bounds: Box
    plan: FallenPhrasePagePlan
    bankTop: number
    font: string
    tag: StudioTag
  },
): void {
  const { grid, bounds, plan, bankTop, font, tag } = options
  const { cell, bankPitch, bankLetterSize } = plan.metrics

  grid.columns.forEach((column, c) => {
    column.fallen.forEach((letter, i) => {
      parts.push(
        letterText({
          centerX: bounds.left + c * cell + cell / 2,
          centerY: bankTop + i * bankPitch + bankPitch / 2,
          text: letter,
          size: bankLetterSize,
          maxWidth: cell,
          font,
          tag,
          role: 'prompt',
        }),
      )
    })
  })
}

/**
 * The solved saying, spelled out under the grid on the answer page.
 *
 * The filled grid already is the answer, but it is the answer read across
 * three or four justified rows with the word breaks set as gaps — which is
 * exactly the reading a solver checking their work can get wrong. One plain
 * line removes the doubt. Dropped rather than crushed if the band below the
 * grid cannot hold it.
 */
function drawSolutionCaption(
  parts: StudioFabricObject[],
  options: {
    phrase: string
    bounds: Box
    plan: FallenPhrasePagePlan
    bankTop: number
    font: string
    tag: StudioTag
  },
): void {
  const { phrase, bounds, plan, bankTop, font, tag } = options
  const size = Math.min(
    STUDIO_BODY_SIZE,
    Math.max(
      SOLUTION_CAPTION_MIN,
      Math.round(plan.metrics.cell * SOLUTION_CAPTION_CELL_RATIO),
    ),
  )
  const lines = wrapTextToWidth(phrase, size, bounds.width, { fontFamily: font })
  const height = lines.length * size * SOLUTION_CAPTION_LINE_HEIGHT
  if (height > plan.bankHeight) return

  parts.push(
    buildText(
      {
        left: bounds.left + bounds.width / 2,
        top: bankTop,
        text: lines.join('\n'),
        width: bounds.width,
        fontFamily: font,
        fontSize: size,
        fill: STUDIO_INK,
        lineHeight: SOLUTION_CAPTION_LINE_HEIGHT,
        textAlign: 'center',
        originX: 'center',
      },
      tag,
      'answer',
    ),
  )
}

export interface FallenPhraseDrawOptions {
  field: Box
  plan: FallenPhrasePagePlan
  grid: FallenPhraseGrid
  font: string
  tag: StudioTag
  /** Answer page: drop the fallen letters and name the saying instead. */
  forAnswerKey?: boolean
}

/**
 * Stack the grid and its letter bank in the body column.
 *
 * Centred as one block rather than top-aligned: the two bands are a single
 * object to a reader, and a grid pinned to the top of the column with the
 * bank trailing off towards the footer reads as two unrelated things.
 */
export function drawFallenPhrase(
  objects: StudioFabricObject[],
  options: FallenPhraseDrawOptions,
): void {
  const { field, plan, grid, font, tag, forAnswerKey = false } = options
  const { cell } = plan.metrics
  const gridWidth = plan.cols * cell

  const bounds: Box = {
    left: Math.round(field.left + (field.width - gridWidth) / 2),
    top: Math.round(field.top + Math.max(0, (field.height - plan.blockHeight) / 2)),
    width: gridWidth,
    height: plan.gridHeight,
  }
  const bankTop = bounds.top + plan.gridHeight + plan.metrics.bankGap

  const parts: StudioFabricObject[] = [
    ...drawWhiteCellEdges(latticeFrom(grid), bounds, cell, tag),
  ]
  drawGridLetters(parts, {
    grid,
    bounds,
    cell,
    size: plan.metrics.letterSize,
    font,
    tag,
  })

  if (forAnswerKey) {
    drawSolutionCaption(parts, {
      phrase: grid.phrase,
      // The caption may run wider than the grid, but never past the column.
      bounds: { ...field, top: bounds.top, height: plan.gridHeight },
      plan,
      bankTop,
      font,
      tag,
    })
  } else {
    drawLetterBank(parts, { grid, bounds, plan, bankTop, font, tag })
  }

  const groupBounds = unionObjectBounds(parts)
  if (!groupBounds) return
  objects.push(buildGroup(parts, groupBounds, tag, 'structure'))
}
