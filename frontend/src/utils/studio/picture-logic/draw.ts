import type { StudioFabricObject } from '@/types/studio-template.types'
import {
  STUDIO_DIGIT_FONT,
  STUDIO_INK,
  STUDIO_RULE,
  STUDIO_RULE_LIGHT,
  STUDIO_STROKE_BOLD,
  STUDIO_STROKE_HAIRLINE,
} from '@/constants/studio.constants'
import { STUDIO_CANONICAL_KEY } from '../_shared/uniqueness'
import { buildGroup, buildRect, buildText, type StudioTag } from '../studio-fabric-builders'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import { drawGridLines } from '../studio-grid-rules'
import { PL_MYSTERY_PROMPT, PL_TEMPLATE_KEY, plDesignLabel, type PlDesign } from './content'
import { PL_MYSTERY_SIZE, plLineNumbers, plNameWidth, plNumberWidth, plRowClueCenters, type PlPlan } from './layout'

/**
 * A planned puzzle → one Fabric group: the grid, its clues, the write-in
 * line, and the finished picture hidden for the answer page.
 *
 * Black on white. Heavy rules every five squares and round the edge (the
 * reader's landmarks when counting), light guides running out through the
 * clues so a number is never read against the wrong row. The answer is one
 * shaded bar per run — exactly the runs the clues describe — so the answer
 * page shows the picture and nothing else.
 */

/** Marks the objects a Picture Logic page draws, for checks and the editor. */
export const PL_PART_KEY = 'plPart'

/** The guides running out through the clue areas. */
const GUIDE_WIDTH = 1

const r2 = (n: number) => Math.round(n * 100) / 100

function part(obj: StudioFabricObject, name: string, extra: Record<string, unknown> = {}): StudioFabricObject {
  return { ...obj, data: { ...(obj.data ?? {}), [PL_PART_KEY]: name, ...extra } }
}

function clueNumber(n: number, x: number, y: number, size: number, tag: StudioTag, line: string): StudioFabricObject {
  const text = String(n)
  return part(
    buildText(
      {
        left: r2(x),
        top: r2(y),
        text,
        fontFamily: STUDIO_DIGIT_FONT,
        fontSize: size,
        width: Math.ceil(plNumberWidth(n, size) + size * 0.35),
        textAlign: 'center',
        originX: 'center',
        originY: 'center',
        // Fabric's default multiplier centres a lone glyph off its axis.
        lineHeight: 1,
        editable: false,
      },
      tag,
      'prompt',
    ),
    'clue',
    { line, n },
  )
}

export function buildPlPuzzle(options: {
  design: PlDesign
  plan: PlPlan
  tag: StudioTag
  font: string
}): StudioFabricObject {
  const { design, plan, tag, font } = options
  const { grid, cell, clueSize, slotWidth, slotHeight, gap, rowClueWidth, colClueHeight, mystery } = plan
  const parts: StudioFabricObject[] = []

  // The picture, hidden: one bar per run of every row.
  design.bitmap.forEach((row, r) => {
    let c = 0
    while (c < row.length) {
      if (!row[c]) {
        c++
        continue
      }
      const start = c
      while (c < row.length && row[c]) c++
      parts.push(
        part(
          buildRect(
            { left: r2(grid.left + start * cell), top: r2(grid.top + r * cell), width: r2((c - start) * cell), height: r2(cell), fill: STUDIO_INK, stroke: 'transparent', strokeWidth: 0 },
            tag,
            'answer',
          ),
          'answer',
          { row: r, from: start, length: c - start },
        ),
      )
    }
  })

  // Guides through the clue areas, then the grid over everything.
  for (let r = 1; r < design.height; r++) {
    parts.push(
      part(
        buildRect({ left: r2(grid.left - gap - rowClueWidth), top: r2(grid.top + r * cell - GUIDE_WIDTH / 2), width: r2(rowClueWidth + gap), height: GUIDE_WIDTH, fill: STUDIO_RULE_LIGHT, stroke: 'transparent', strokeWidth: 0 }, tag),
        'guide',
      ),
    )
  }
  for (let c = 1; c < design.width; c++) {
    parts.push(
      part(
        buildRect({ left: r2(grid.left + c * cell - GUIDE_WIDTH / 2), top: r2(grid.top - gap - colClueHeight), width: GUIDE_WIDTH, height: r2(colClueHeight + gap), fill: STUDIO_RULE_LIGHT, stroke: 'transparent', strokeWidth: 0 }, tag),
        'guide',
      ),
    )
  }
  for (const bar of drawGridLines(grid, cell, design.width, design.height, tag, {
    fill: STUDIO_RULE,
    thickness: STUDIO_STROKE_HAIRLINE,
    boldThickness: STUDIO_STROKE_BOLD,
    boxCols: 5,
    boxRows: 5,
  })) {
    parts.push(part(bar, 'rule'))
  }
  // The edge is always heavy, whatever the grid's size.
  parts.push(
    part(
      buildRect({ left: grid.left, top: grid.top, width: grid.width, height: grid.height, fill: 'transparent', stroke: STUDIO_RULE, strokeWidth: STUDIO_STROKE_BOLD }, tag),
      'frame',
    ),
  )

  // Row clues, right-aligned against the grid; an empty row reads "0".
  design.clues.rows.forEach((clue, r) => {
    const y = grid.top + (r + 0.5) * cell
    const centers = plRowClueCenters(clue, clueSize, slotWidth)
    plLineNumbers(clue).forEach((n, i) => {
      parts.push(clueNumber(n, grid.left - gap - centers[i]!, y, clueSize, tag, `r${r}`))
    })
  })
  // Column clues, stacked down to the grid.
  design.clues.cols.forEach((clue, c) => {
    const numbers = plLineNumbers(clue)
    const x = grid.left + (c + 0.5) * cell
    numbers.forEach((n, i) => {
      const y = grid.top - gap - (numbers.length - i - 0.5) * slotHeight
      parts.push(clueNumber(n, x, y, clueSize, tag, `c${c}`))
    })
  })

  // The write-in line, with the answer waiting on it.
  parts.push(
    part(
      buildText(
        {
          left: r2(mystery.promptLeft),
          top: r2(mystery.promptTop),
          text: PL_MYSTERY_PROMPT,
          fontFamily: font,
          fontSize: PL_MYSTERY_SIZE,
          width: Math.ceil(mystery.promptWidth),
        },
        tag,
        'prompt',
      ),
      'mystery-prompt',
    ),
  )
  parts.push(
    part(
      buildRect({ left: r2(mystery.lineLeft), top: r2(mystery.baseline), width: r2(mystery.lineRight - mystery.lineLeft), height: 1.5, fill: STUDIO_INK, stroke: 'transparent', strokeWidth: 0 }, tag),
      'mystery-line',
    ),
  )
  const lineWidth = mystery.lineRight - mystery.lineLeft
  parts.push(
    part(
      buildText(
        {
          left: r2(mystery.lineLeft + lineWidth / 2),
          top: r2(mystery.answerTop),
          text: design.picture.name,
          fontFamily: font,
          fontSize: PL_MYSTERY_SIZE,
          fontWeight: 700,
          width: Math.min(Math.floor(lineWidth), plNameWidth(design.picture.name)),
          textAlign: 'center',
          originX: 'center',
        },
        tag,
        'answer',
      ),
      'mystery-answer',
    ),
  )

  const group = buildGroup(parts, plan.block, tag, 'prompt')
  const label = plDesignLabel(design)
  return {
    ...group,
    data: {
      source: PL_TEMPLATE_KEY,
      [PL_PART_KEY]: 'puzzle',
      picture: design.picture.name,
      size: `${design.width}x${design.height}`,
      [STUDIO_CONTENT_LABEL_KEY]: label,
      // The same picture the same way round is the same puzzle, wherever it sits.
      [STUDIO_CANONICAL_KEY]: `${PL_TEMPLATE_KEY}:${label}`,
    },
  }
}
