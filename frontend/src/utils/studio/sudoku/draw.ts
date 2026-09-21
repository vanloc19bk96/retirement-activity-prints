import type { StudioFabricObject } from '@/types/studio-template.types'
import { STUDIO_DIGIT_FONT } from '@/constants/studio.constants'
import {
  estimateTextBoxWidth,
  unionObjectBounds,
  type Box,
} from '../studio-layout'
import { buildText, buildGroup, type StudioTag } from '../studio-fabric-builders'
import { drawGridLines, snapGridInField } from '../studio-grid-rules'
import { canonicalKeyData } from '../_shared/uniqueness'
import { BOX_DIMS } from './solver'
import { minDigitPx, type RetirementPrintStyle } from './config'
import { sudokuCanonicalKey, type RetirementSudokuPuzzle } from './puzzle'

export function drawSudokuGrid(options: {
  field: Box
  puzzle: RetirementSudokuPuzzle
  tag: StudioTag
  printStyle: RetirementPrintStyle
  pageWidth: number
}): StudioFabricObject {
  const { field, puzzle, tag, printStyle, pageWidth } = options
  const { size } = puzzle
  const [boxW, boxH] = BOX_DIMS[size]
  const g = snapGridInField(field, size, size)
  const parts: StudioFabricObject[] = [
    ...drawGridLines(g.bounds, g.cell, size, size, tag, {
      boxCols: boxW,
      boxRows: boxH,
    }),
  ]

  const preferred = Math.round(g.cell * 0.55)
  const minSize = minDigitPx(printStyle, pageWidth)
  const maxSize = Math.max(8, Math.floor(g.cell * 0.72))
  const fontSize = Math.min(maxSize, Math.max(Math.min(minSize, maxSize), preferred))

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const cell = g.cellBox(r, c)
      const digitOpts = {
        left: Math.round(cell.left + cell.width / 2),
        top: Math.round(cell.top + cell.height / 2),
        fontFamily: STUDIO_DIGIT_FONT,
        fontSize,
        fontWeight: 'normal' as const,
        textAlign: 'center' as const,
        originX: 'center' as const,
        originY: 'center' as const,
      }
      if (puzzle.puzzle[r][c] !== 0) {
        const text = String(puzzle.puzzle[r][c])
        parts.push(
          buildText(
            {
              ...digitOpts,
              text,
              width: estimateTextBoxWidth(text, fontSize, cell.width),
            },
            tag,
            'prompt',
          ),
        )
      }
      const answer = String(puzzle.solved[r][c])
      parts.push(
        buildText(
          {
            ...digitOpts,
            text: answer,
            width: estimateTextBoxWidth(answer, fontSize, cell.width),
          },
          tag,
          'answer',
        ),
      )
    }
  }

  const groupBounds = unionObjectBounds(parts) ?? g.bounds
  const group = buildGroup(parts, groupBounds, tag)
  return {
    ...group,
    data: { ...(group.data ?? {}), ...canonicalKeyData('sudoku', sudokuCanonicalKey(puzzle)) },
  }
}
