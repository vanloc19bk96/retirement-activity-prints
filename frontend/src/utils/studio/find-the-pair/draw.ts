/**
 * Find the Pair — page geometry and ink.
 *
 * The field is a plain lattice of square cells with no rules drawn between
 * them: a grid line beside every figure competes with the figures themselves,
 * and the reader is being asked to compare shapes, not to read a table.
 */

import type { StudioFabricObject } from '@/types/studio-template.types'
import { buildShape, fitUnit, SIZE_FACTOR } from '../matrix-reasoning/shapes'
import type { Figure } from '../matrix-reasoning/types'
import { boxCenterX, boxCenterY, insetBox, type Box } from '../studio-layout'
import type { StudioTag } from '../studio-fabric-builders'
import { drawAnswerRing } from '../_shared/card-page'
import type { FindThePairField } from './build'

/**
 * Smallest cell that still prints an honest near miss.
 *
 * Matrix Reasoning holds its answer boxes at 46pt for the same reason: below
 * that an inner mark and a paint change stop being separable at 300 DPI, and a
 * page whose whole point is spotting one altered attribute becomes an eye test.
 * A field that cannot hold its tier at this size prints fewer cells instead of
 * smaller ones.
 */
export const MIN_PAIR_CELL = 46

/** Widest and narrowest the field may be, in cells. */
const MIN_COLS = 3
const MAX_COLS = 8

/**
 * How far from square a field may be.
 *
 * Left to maximise cell size alone, thirty-six cells on a 6×9 page come out as
 * four columns by nine rows — which prints as a *list*, and a list is read top
 * to bottom rather than scanned. The whole task is scanning, so the field has
 * to look like a field.
 */
const MAX_ASPECT = 1.8

/**
 * Air between the cell edge and the figure, and between the cell edge and the
 * answer ring. The ring sits in the band between them, so a circled figure
 * never touches its own ink and two circled neighbours never merge.
 */
const FIGURE_INSET_RATIO = 0.15
const RING_INSET_RATIO = 0.05

export interface PairFieldFit {
  cols: number
  rows: number
  cell: number
  bounds: Box
}

/**
 * Largest whole rectangle of at least `MIN_PAIR_CELL` cells that fits `field`
 * and holds no more than `requested` of them.
 *
 * Full rectangles only. A ragged last row reads as a mistake on a scanning
 * page, and it also breaks the canonical form's rotation, which is defined on
 * a rectangle.
 */
export function fitPairField(field: Box, requested: number): PairFieldFit | null {
  let best: PairFieldFit | null = null

  for (let cols = MIN_COLS; cols <= MAX_COLS; cols++) {
    for (let rows = MIN_COLS; rows <= 12; rows++) {
      const count = cols * rows
      if (count > requested) continue
      if (Math.max(cols, rows) > Math.min(cols, rows) * MAX_ASPECT) continue
      const cell = Math.floor(Math.min(field.width / cols, field.height / rows))
      if (cell < MIN_PAIR_CELL) continue

      const candidate: PairFieldFit = {
        cols,
        rows,
        cell,
        bounds: {
          left: Math.round(field.left + (field.width - cell * cols) / 2),
          top: Math.round(field.top + (field.height - cell * rows) / 2),
          width: cell * cols,
          height: cell * rows,
        },
      }
      if (!best) {
        best = candidate
        continue
      }
      const bestCount = best.cols * best.rows
      // More cells first — the tier the seller chose — then the squarest,
      // roomiest arrangement of that many.
      if (count > bestCount) best = candidate
      else if (count === bestCount && cell > best.cell) best = candidate
    }
  }

  return best
}

function cellBox(fit: PairFieldFit, index: number): Box {
  const row = Math.floor(index / fit.cols)
  const col = index % fit.cols
  return {
    left: fit.bounds.left + col * fit.cell,
    top: fit.bounds.top + row * fit.cell,
    width: fit.cell,
    height: fit.cell,
  }
}

/**
 * One figure, centred in its cell.
 *
 * `slots` is fixed for the whole field rather than taken per figure: dividing
 * each cell by its own shape count would make "two shapes" also mean "smaller
 * shapes", and quantity would stop being a thing the reader can compare
 * across the page.
 */
function drawFigure(
  parts: StudioFabricObject[],
  figure: Figure,
  box: Box,
  slots: number,
  tag: StudioTag,
): void {
  const inner = insetBox(box, Math.max(3, box.width * FIGURE_INSET_RATIO))
  if (inner.width <= 0 || inner.height <= 0) return

  const slot = inner.width / slots
  const unit = fitUnit(Math.min(slot, inner.height * 0.94), slot, slots)
  const side = unit * SIZE_FACTOR[figure.size]
  const centerX = boxCenterX(inner)
  const centerY = boxCenterY(inner)

  for (let i = 0; i < figure.count; i++) {
    parts.push(
      ...buildShape(
        {
          centerX: centerX + (i - (figure.count - 1) / 2) * slot,
          centerY,
          side,
          shape: figure.shape,
          fill: figure.fill,
          mark: figure.mark,
        },
        tag,
        'prompt',
      ),
    )
  }
}

/**
 * The whole field. Rings are emitted as hidden `answer` objects, so the
 * solution page is built by the Studio's own answer-key pass rather than by a
 * second layout routine that could drift from this one.
 */
export function drawPairField(options: {
  fit: PairFieldFit
  field: FindThePairField
  tag: StudioTag
}): StudioFabricObject[] {
  const { fit, field, tag } = options
  const parts: StudioFabricObject[] = []

  field.cells.forEach((figure, index) => {
    drawFigure(parts, figure, cellBox(fit, index), field.slots, tag)
  })

  field.marked.forEach((isTwin, index) => {
    if (!isTwin) return
    const box = cellBox(fit, index)
    parts.push(
      drawAnswerRing(insetBox(box, Math.max(2, box.width * RING_INSET_RATIO)), tag, 0),
    )
  })

  return parts
}
