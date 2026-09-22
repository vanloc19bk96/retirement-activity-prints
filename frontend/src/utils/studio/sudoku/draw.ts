import type { StudioFabricObject } from '@/types/studio-template.types'
import { STUDIO_DIGIT_FONT, STUDIO_RULE } from '@/constants/studio.constants'
import { estimateTextBoxWidth, unionObjectBounds, type Box } from '../studio-layout'
import { buildText, buildGroup, type StudioTag } from '../studio-fabric-builders'
import { drawGridLines } from '../studio-grid-rules'
import { canonicalKeyData } from '../_shared/uniqueness'
import { BOX_DIMS } from './solver'
import { sudokuGridGeometry } from './layout'
import { sudokuCanonicalKey, type RetirementSudokuPuzzle } from './puzzle'

export function drawSudokuGrid(options: {
  field: Box
  puzzle: RetirementSudokuPuzzle
  tag: StudioTag
  pageWidth: number
}): StudioFabricObject {
  const { field, puzzle, tag, pageWidth } = options
  const { size } = puzzle
  const [boxW, boxH] = BOX_DIMS[size]
  const g = sudokuGridGeometry(field, size, pageWidth)

  const parts: StudioFabricObject[] = [
    ...drawGridLines(g.bounds, g.cell, size, size, tag, {
      boxCols: boxW,
      boxRows: boxH,
      // Near-black at both weights: a print grid separates its boxes by rule
      // thickness, not by fading the cell lines out toward the paper.
      fill: STUDIO_RULE,
    }),
  ]

  const fontSize = g.digitFontSize
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const cell = g.cellBox(r, c)
      const digit = (text: string) => ({
        left: Math.round(cell.left + cell.width / 2),
        top: Math.round(cell.top + cell.height / 2),
        text,
        fontFamily: STUDIO_DIGIT_FONT,
        fontSize,
        fontWeight: 'normal',
        width: estimateTextBoxWidth(text, fontSize, cell.width),
        textAlign: 'center' as const,
        originX: 'center' as const,
        originY: 'center' as const,
        // Fabric's default multiplier centres a lone glyph off the cell axis.
        lineHeight: 1,
      })

      const given = puzzle.puzzle[r][c]
      if (given !== 0) {
        parts.push(buildText(digit(String(given)), tag, 'prompt'))
      }
      // Every cell carries its answer, givens included: the solution page drops
      // the prompts, so a cell without one would print blank on the key.
      parts.push(buildText(digit(String(puzzle.solved[r][c])), tag, 'answer'))
    }
  }

  const groupBounds = unionObjectBounds(parts) ?? g.bounds
  const group = buildGroup(parts, groupBounds, tag)
  return {
    ...group,
    data: { ...(group.data ?? {}), ...canonicalKeyData('sudoku', sudokuCanonicalKey(puzzle)) },
  }
}
