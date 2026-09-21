import type { StudioFabricObject } from '@/types/studio-template.types'
import { estimateTextBoxWidth, unionObjectBounds, type Box } from '../studio-layout'
import { drawGridLines, snapGridInField } from '../studio-grid-rules'
import {
  buildRect,
  buildLine,
  buildText,
  buildGroup,
  type StudioTag,
} from '../studio-fabric-builders'
import { STUDIO_INK, STUDIO_PAPER, STUDIO_DIGIT_FONT } from '@/constants/studio.constants'
import type { KakuroTopology } from './topologies'
import type { ClueSums, KakuroPuzzle, KakuroRun } from './solver'

function indexClueSumsByCell(runs: KakuroRun[]): Map<string, ClueSums> {
  const map = new Map<string, ClueSums>()
  for (const run of runs) {
    const { r, c } = run.cells[0]!
    const key = run.direction === 'across' ? `${r},${c - 1}` : `${r - 1},${c}`
    const entry = map.get(key) ?? {}
    if (run.direction === 'across') entry.across = run.sum
    else entry.down = run.sum
    map.set(key, entry)
  }
  return map
}

/** Diagonally-split clue cell: across = upper-right, down = lower-left. */
function drawClueCell(
  parts: StudioFabricObject[],
  cell: Box,
  clue: ClueSums,
  tag: StudioTag,
): void {
  parts.push(
    buildLine(
      {
        x1: cell.left,
        y1: cell.top,
        x2: cell.left + cell.width,
        y2: cell.top + cell.height,
        stroke: STUDIO_PAPER,
        strokeWidth: Math.max(1, Math.round(cell.width * 0.06)),
      },
      tag,
      'structure',
    ),
  )

  const fontSize = Math.max(8, Math.round(cell.width * 0.28))
  if (clue.across !== undefined) {
    const text = String(clue.across)
    parts.push(
      buildText(
        {
          left: Math.round(cell.left + cell.width * 0.72),
          top: Math.round(cell.top + cell.height * 0.28),
          text,
          fontFamily: STUDIO_DIGIT_FONT,
          fontSize,
          fill: STUDIO_PAPER,
          width: estimateTextBoxWidth(text, fontSize, cell.width * 0.55),
          textAlign: 'center',
          originX: 'center',
          originY: 'center',
        },
        tag,
        'prompt',
      ),
    )
  }
  if (clue.down !== undefined) {
    const text = String(clue.down)
    parts.push(
      buildText(
        {
          left: Math.round(cell.left + cell.width * 0.28),
          top: Math.round(cell.top + cell.height * 0.72),
          text,
          fontFamily: STUDIO_DIGIT_FONT,
          fontSize,
          fill: STUDIO_PAPER,
          width: estimateTextBoxWidth(text, fontSize, cell.width * 0.55),
          textAlign: 'center',
          originX: 'center',
          originY: 'center',
        },
        tag,
        'prompt',
      ),
    )
  }
}

/**
 * Active window = whites + one black strip above/left for clues.
 * Empty trailing black bands are excluded so the puzzle block can center.
 */
function contentWindow(topology: KakuroTopology): {
  r0: number
  c0: number
  rows: number
  cols: number
} {
  const size = topology.size
  let minR = size
  let maxR = -1
  let minC = size
  let maxC = -1

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (topology.cells[r]![c] !== 'white') continue
      if (r < minR) minR = r
      if (r > maxR) maxR = r
      if (c < minC) minC = c
      if (c > maxC) maxC = c
    }
  }

  if (maxR < 0) {
    return { r0: 0, c0: 0, rows: size, cols: size }
  }

  const r0 = Math.max(0, minR - 1)
  const c0 = Math.max(0, minC - 1)
  return {
    r0,
    c0,
    rows: maxR - r0 + 1,
    cols: maxC - c0 + 1,
  }
}

export function drawKakuroGrid(options: {
  field: Box
  topology: KakuroTopology
  puzzle: KakuroPuzzle
  tag: StudioTag
}): StudioFabricObject {
  const { field, topology, puzzle, tag } = options
  const win = contentWindow(topology)

  // Same snap + mid-gray hairlines as Grid Copy (studio-grid-rules defaults).
  const g = snapGridInField(field, win.cols, win.rows)
  const clueByCell = indexClueSumsByCell(puzzle.runs)
  // Fills under bars so every rule stays full weight on top (grid-copy pattern).
  const parts: StudioFabricObject[] = []

  for (let lr = 0; lr < win.rows; lr++) {
    for (let lc = 0; lc < win.cols; lc++) {
      const r = win.r0 + lr
      const c = win.c0 + lc
      const cellBox = g.cellBox(lr, lc)

      if (topology.cells[r]![c] === 'black') {
        parts.push(
          buildRect(
            {
              left: cellBox.left,
              top: cellBox.top,
              width: cellBox.width,
              height: cellBox.height,
              fill: STUDIO_INK,
              stroke: 'transparent',
              strokeWidth: 0,
            },
            tag,
            'structure',
          ),
        )
        const clue = clueByCell.get(`${r},${c}`)
        if (clue) drawClueCell(parts, cellBox, clue, tag)
        continue
      }

      const fontSize = Math.round(g.cell * 0.5)
      const digitOpts = {
        left: Math.round(cellBox.left + cellBox.width / 2),
        top: Math.round(cellBox.top + cellBox.height / 2),
        fontFamily: STUDIO_DIGIT_FONT,
        fontSize,
        fontWeight: 'normal' as const,
        textAlign: 'center' as const,
        originX: 'center' as const,
        originY: 'center' as const,
      }
      if (puzzle.givens[r]![c]! > 0) {
        const text = String(puzzle.givens[r]![c])
        parts.push(
          buildText(
            {
              ...digitOpts,
              text,
              width: estimateTextBoxWidth(text, fontSize, cellBox.width),
            },
            tag,
            'prompt',
          ),
        )
      }
      const answer = String(puzzle.grid[r]![c])
      parts.push(
        buildText(
          {
            ...digitOpts,
            text: answer,
            width: estimateTextBoxWidth(answer, fontSize, cellBox.width),
          },
          tag,
          'answer',
        ),
      )
    }
  }

  parts.push(...drawGridLines(g.bounds, g.cell, win.cols, win.rows, tag))
  const groupBounds = unionObjectBounds(parts) ?? g.bounds
  return buildGroup(parts, groupBounds, tag)
}
