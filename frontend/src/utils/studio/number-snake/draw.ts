import type { StudioFabricObject } from '@/types/studio-template.types'
import {
  insetBox,
  boxCenterX,
  boxCenterY,
  estimateTextBoxWidth,
  unionObjectBounds,
  type Box,
} from '../studio-layout'
import { drawGridLines, snapGridInField } from '../studio-grid-rules'
import {
  buildCircle,
  buildText,
  buildLine,
  buildGroup,
  type StudioTag,
} from '../studio-fabric-builders'
import {
  STUDIO_INK,
  STUDIO_STROKE_HAIRLINE,
  STUDIO_ANSWER_INK,
  STUDIO_DIGIT_FONT,
} from '@/constants/studio.constants'
import { invertSolution, type SnakePuzzle } from './generator'

/** Breathing room from safe edges — same as Grid Copy. */
const FIELD_INSET = 16

/** Cell size the grid would use if drawn in `area`. */
export function cellForField(area: Box, cols: number, rows: number): number {
  return snapGridInField(insetBox(area, FIELD_INSET), cols, rows).cell
}

export function drawSnakePuzzle(options: {
  field: Box
  puzzle: SnakePuzzle
  showPathOnKey: boolean
  tag: StudioTag
  /**
   * Cap cell size (solution page). Keeps the grid the same size as the puzzle
   * page while still centering in a taller no-instruction body.
   */
  maxCell?: number
}): StudioFabricObject {
  const { field: area, puzzle, showPathOnKey, tag, maxCell } = options
  const { rows, cols, solution, given } = puzzle
  const n = rows * cols

  const field = insetBox(area, FIELD_INSET)
  const fittedCell = snapGridInField(field, cols, rows).cell
  const cell =
    maxCell !== undefined ? Math.max(1, Math.min(fittedCell, Math.floor(maxCell))) : fittedCell
  const width = cell * cols
  const height = cell * rows
  const left = Math.round(field.left + (field.width - width) / 2)
  const top = Math.round(field.top + (field.height - height) / 2)
  const bounds: Box = { left, top, width, height }
  const cellBox = (r: number, c: number): Box => ({
    left: left + c * cell,
    top: top + r * cell,
    width: cell,
    height: cell,
  })

  // Same even-weight mid-gray bars as Grid Copy (not black bold outer frame).
  const parts: StudioFabricObject[] = [...drawGridLines(bounds, cell, cols, rows, tag)]

  if (showPathOnKey) {
    const cellOf = invertSolution(solution, n)
    for (let k = 1; k < n; k++) {
      const a = cellOf[k]!
      const b = cellOf[k + 1]!
      const ca = cellBox(a.r, a.c)
      const cb = cellBox(b.r, b.c)
      parts.push(
        buildLine(
          {
            x1: boxCenterX(ca),
            y1: boxCenterY(ca),
            x2: boxCenterX(cb),
            y2: boxCenterY(cb),
            stroke: STUDIO_ANSWER_INK,
            strokeWidth: 2,
          },
          tag,
          'answer',
        ),
      )
    }
  }

  const widest = String(n).length
  const fontSize = Math.max(
    10,
    Math.min(Math.round(cell * 0.38), Math.floor(cell / (widest * 0.55 + 0.4))),
  )
  const circleRadius = Math.max(8, Math.round(cell * 0.38))

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cellRect = cellBox(r, c)
      const val = solution[r]![c]!
      const cx = Math.round(boxCenterX(cellRect))
      const cy = Math.round(boxCenterY(cellRect))
      const isEndpoint = val === 1 || val === n

      if (isEndpoint) {
        parts.push(
          buildCircle(
            {
              left: cx,
              top: cy,
              radius: circleRadius,
              stroke: STUDIO_INK,
              strokeWidth: STUDIO_STROKE_HAIRLINE,
            },
            tag,
            'structure',
          ),
        )
      }

      const text = String(val)
      const digitOpts = {
        left: cx,
        top: cy,
        text,
        fontFamily: STUDIO_DIGIT_FONT,
        fontSize,
        fontWeight: 'normal' as const,
        width: estimateTextBoxWidth(text, fontSize, cellRect.width),
        textAlign: 'center' as const,
        originX: 'center' as const,
        originY: 'center' as const,
      }
      if (given[r]![c]) {
        parts.push(buildText(digitOpts, tag, 'prompt'))
      } else {
        parts.push(buildText(digitOpts, tag, 'answer'))
      }
    }
  }

  const groupBounds = unionObjectBounds(parts) ?? bounds
  return buildGroup(parts, groupBounds, tag)
}
