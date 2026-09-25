import type { StudioFabricObject, StudioRole } from '@/types/studio-template.types'
import {
  STUDIO_INK,
  STUDIO_INK_MUTED,
  STUDIO_RULE,
  STUDIO_STROKE_BOLD,
  STUDIO_STROKE_HAIRLINE,
} from '@/constants/studio.constants'
import { toNonBreakingSpaces } from '../studio-layout'
import { buildGroup, buildRect, buildText, type StudioTag } from '../studio-fabric-builders'
import { buildCheckMark } from '../studio-check-mark'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import { measureRunWidth, type FontSpec } from '../studio-text-metrics'
import { LG_PEOPLE_TITLE } from './content'
import {
  GRID_EDGE,
  TEXT_LINE_HEIGHT,
  boldSpec,
  colGroups,
  italicSpec,
  rowGroups,
  textBlockHeight,
  textSpec,
  wrapLines,
  type LgGridGeometry,
  type LgGridLabels,
  type LgTextMetrics,
} from './layout'
import { lgContentLabel, type LgPuzzle } from './puzzle'

/**
 * A text box as wide as its widest line, with a hair of slack so the browser's
 * own measure never breaks a line the layout set whole.
 */
export function hugWidth(lines: readonly string[], size: number, spec: FontSpec): number {
  return Math.ceil(Math.max(1, ...lines.map((line) => measureRunWidth(line, size, spec))) * 1.04) + 2
}

/** Labels of one group, in the order the grid prints them. */
export function groupLabels(puzzle: LgPuzzle, g: number): string[] {
  return g === 0 ? [...puzzle.wording.names] : puzzle.wording.categories[g - 1]!.values.map((v) => v.label)
}

export function groupTitle(puzzle: LgPuzzle, g: number): string {
  return g === 0 ? LG_PEOPLE_TITLE : puzzle.wording.categories[g - 1]!.def.title
}

/** What this puzzle's grid prints along each edge. */
export function puzzleGridLabels(puzzle: LgPuzzle): LgGridLabels {
  const { K } = puzzle.shape
  return {
    rows: rowGroups(K).flatMap((g) => groupLabels(puzzle, g)),
    cols: colGroups(K).flatMap((g) => groupLabels(puzzle, g)),
    titles: [0, ...colGroups(K)].map((g) => groupTitle(puzzle, g)),
  }
}

/** A rule as a filled bar centred on its line, overlapping at the corners. */
function bar(tag: StudioTag, x1: number, y1: number, x2: number, y2: number, thickness: number) {
  const half = thickness / 2
  return buildRect(
    {
      left: Math.min(x1, x2) - half,
      top: Math.min(y1, y2) - half,
      width: Math.abs(x2 - x1) + thickness,
      height: Math.abs(y2 - y1) + thickness,
      fill: STUDIO_RULE,
      stroke: 'transparent',
      strokeWidth: 0,
    },
    tag,
    'structure',
  )
}

function label(
  tag: StudioTag,
  spec: {
    cx: number
    cy: number
    text: string
    width: number
    size: number
    font: string
    bold?: boolean
    align: 'left' | 'center' | 'right'
    sideways?: boolean
  },
  role: StudioRole = 'prompt',
): StudioFabricObject {
  return {
    ...buildText(
      {
        left: Math.round(spec.cx),
        top: Math.round(spec.cy),
        text: toNonBreakingSpaces(spec.text),
        width: Math.max(1, Math.floor(spec.width)),
        fontFamily: spec.font,
        fontSize: spec.size,
        fontWeight: spec.bold ? 700 : 'normal',
        textAlign: spec.align,
        originX: 'center',
        originY: 'center',
        lineHeight: 1,
      },
      tag,
      role,
    ),
    // Read bottom to top, starting at the grid: the one rotation a grid needs.
    ...(spec.sideways ? { angle: -90 } : {}),
  }
}

/**
 * The deduction grid: a staircase of n x n blocks, one per pair of groups,
 * with People and the later categories down the side and the categories
 * across the top.
 *
 * Blocks are separated by bold rules and cells by fine ones — weight, never
 * colour — and every label sits in its own ruled slot so the eye can run from
 * a name straight along its row. Column labels are the only sideways text,
 * set to read upward from the grid. On the answer page a check marks the one
 * cell per row that is true in each block.
 */
export function drawLgGrid(options: {
  puzzle: LgPuzzle
  geometry: LgGridGeometry
  left: number
  top: number
  font: string
  tag: StudioTag
  answers: boolean
}): StudioFabricObject {
  const { puzzle, geometry: g, left, top, font, tag, answers } = options
  const { n, K } = puzzle.shape
  const N = n * g.cell
  const gx = left + GRID_EDGE
  const gy = top + GRID_EDGE
  const x0 = gx + g.stripW + g.rowLabelW
  const y0 = gy + g.colTitleH + g.colLabelH
  const bold = STUDIO_STROKE_BOLD
  const fine = STUDIO_STROKE_HAIRLINE
  const rows = rowGroups(K)
  const cols = colGroups(K)
  const parts: StudioFabricObject[] = []

  // Vertical rules: a block edge runs up through the headings, a cell edge
  // through the label band only; each stops at the lowest block it bounds.
  for (let c = 0; c <= K * n; c++) {
    const edge = c % n === 0
    const block = Math.floor(c / n)
    const depth = edge ? (block >= 1 ? K - block + 1 : K) : K - block
    parts.push(bar(tag, x0 + c * g.cell, edge ? gy : y0 - g.colLabelH, x0 + c * g.cell, y0 + depth * N, edge ? bold : fine))
  }
  for (let r = 0; r <= K * n; r++) {
    const edge = r % n === 0
    const band = Math.floor(r / n)
    const reach = edge ? (band >= 1 ? K - band + 1 : K) : K - band
    parts.push(bar(tag, edge ? gx : x0 - g.rowLabelW, y0 + r * g.cell, x0 + reach * N, y0 + r * g.cell, edge ? bold : fine))
  }
  parts.push(
    bar(tag, x0, gy, x0 + K * N, gy, bold),
    bar(tag, x0, gy + g.colTitleH, x0 + K * N, gy + g.colTitleH, fine),
    bar(tag, gx, y0, gx, y0 + K * N, bold),
    bar(tag, gx + g.stripW, y0, gx + g.stripW, y0 + K * N, fine),
  )

  cols.forEach((group, j) => {
    const blockLeft = x0 + j * N
    parts.push(
      label(tag, {
        cx: blockLeft + N / 2,
        cy: gy + g.colTitleH / 2,
        text: groupTitle(puzzle, group),
        width: N - 2 * g.pad,
        size: g.titleFont,
        font,
        bold: true,
        align: 'center',
      }),
    )
    groupLabels(puzzle, group).forEach((text, v) => {
      parts.push(
        label(tag, {
          cx: blockLeft + (v + 0.5) * g.cell,
          cy: gy + g.colTitleH + g.colLabelH / 2,
          text,
          width: g.colLabelH - 2 * g.pad,
          size: g.labelFont,
          font,
          align: 'left',
          sideways: true,
        }),
      )
    })
  })

  rows.forEach((group, i) => {
    const bandTop = y0 + i * N
    parts.push(
      label(tag, {
        cx: gx + g.stripW / 2,
        cy: bandTop + N / 2,
        text: groupTitle(puzzle, group),
        width: N - 2 * g.pad,
        size: g.titleFont,
        font,
        bold: true,
        align: 'center',
        sideways: true,
      }),
    )
    groupLabels(puzzle, group).forEach((text, u) => {
      parts.push(
        label(tag, {
          cx: gx + g.stripW + g.rowLabelW / 2,
          cy: bandTop + (u + 0.5) * g.cell,
          text,
          width: g.rowLabelW - 2 * g.pad,
          size: g.labelFont,
          font,
          align: 'right',
        }),
      )
    })
  })

  if (answers) {
    const { solution } = puzzle
    const size = Math.round(g.cell * 0.72)
    rows.forEach((rowGroup, i) => {
      cols.slice(0, K - i).forEach((colGroup, j) => {
        for (let p = 0; p < n; p++) {
          const u = solution[rowGroup]![p]!
          const v = solution[colGroup]![p]!
          parts.push(
            buildCheckMark(
              {
                left: Math.round(x0 + j * N + v * g.cell + (g.cell - size) / 2),
                top: Math.round(y0 + i * N + u * g.cell + (g.cell - size) / 2),
                size,
                stroke: STUDIO_INK,
              },
              tag,
              'answer',
            ),
          )
        }
      })
    })
  }

  return buildGroup(parts, { left, top, width: g.width, height: g.height }, tag, 'structure')
}

/** Checks the answer grid carries: one per person in every block. */
export const expectedCheckCount = (puzzle: LgPuzzle) =>
  (puzzle.shape.n * puzzle.shape.K * (puzzle.shape.K + 1)) / 2

/**
 * The scene name in bold and the story under it. The name carries the
 * puzzle's content label, so a later page in the book can refuse the same
 * scene or deduction pattern.
 */
export function drawStory(
  objects: StudioFabricObject[],
  options: {
    puzzle: LgPuzzle
    lines: { subtitle: readonly string[]; scenario: readonly string[] }
    left: number
    top: number
    width: number
    text: LgTextMetrics
    font: string
    tag: StudioTag
  },
): void {
  const { puzzle, lines, left, top, width, text, font, tag } = options
  objects.push({
    ...buildText(
      {
        left,
        top,
        // The scene name's box hugs its words; the story keeps the column.
        text: lines.subtitle.map(toNonBreakingSpaces).join('\n'),
        width: Math.min(width, hugWidth(lines.subtitle, text.subtitleFont, boldSpec(font))),
        fontFamily: font,
        fontSize: text.subtitleFont,
        fontWeight: 700,
        lineHeight: TEXT_LINE_HEIGHT,
      },
      tag,
      'prompt',
    ),
    data: { [STUDIO_CONTENT_LABEL_KEY]: lgContentLabel(puzzle) },
  })
  if (lines.scenario.length === 0) return
  objects.push(
    buildText(
      {
        left,
        top: Math.round(top + textBlockHeight(lines.subtitle.length, text.subtitleFont) + text.gap),
        text: lines.scenario.join('\n'),
        width,
        fontFamily: font,
        fontSize: text.font,
        lineHeight: TEXT_LINE_HEIGHT,
      },
      tag,
      'prompt',
    ),
  )
}

/** One clue as set: its number and its pre-broken lines. */
export interface LgSetClue {
  index: number
  lines: string[]
}

/** Numbered clues from `top`, each gap `gap` tall. Returns where the last one ends. */
export function drawClues(
  objects: StudioFabricObject[],
  options: {
    clues: readonly LgSetClue[]
    left: number
    top: number
    textWidth: number
    gap: number
    text: LgTextMetrics
    font: string
    tag: StudioTag
  },
): number {
  const { clues, left, textWidth, gap, text, font, tag } = options
  let top = options.top
  clues.forEach((clue, i) => {
    const y = Math.round(top)
    objects.push(
      buildText(
        {
          left,
          top: y,
          text: `${clue.index + 1}.`,
          width: text.numberW,
          fontFamily: font,
          fontSize: text.font,
          fontWeight: 700,
          lineHeight: TEXT_LINE_HEIGHT,
        },
        tag,
        'prompt',
      ),
      buildText(
        {
          left: left + text.numberW,
          top: y,
          text: clue.lines.join('\n'),
          width: textWidth,
          fontFamily: font,
          fontSize: text.font,
          lineHeight: TEXT_LINE_HEIGHT,
        },
        tag,
        'prompt',
      ),
    )
    top += textBlockHeight(clue.lines.length, text.font) + (i < clues.length - 1 ? gap : 0)
  })
  return Math.round(top)
}

/** A quiet italic line ("The grid is on the next page."), centred on its column. */
export function drawNote(
  objects: StudioFabricObject[],
  options: { text: string; left: number; top: number; width: number; size: number; font: string; tag: StudioTag },
): void {
  const width = Math.min(options.width, hugWidth([options.text], options.size, italicSpec(options.font)))
  objects.push(
    buildText(
      {
        left: Math.round(options.left + (options.width - width) / 2),
        top: options.top,
        text: toNonBreakingSpaces(options.text),
        width,
        fontFamily: options.font,
        fontSize: options.size,
        fontStyle: 'italic',
        fill: STUDIO_INK_MUTED,
        textAlign: 'center',
        lineHeight: 1,
      },
      options.tag,
      'prompt',
    ),
  )
}

/**
 * The answer as a table (a row per person), or as one line per person on a
 * narrow page. `width` and `height` are the whole box as placed: a table's
 * rules sit `GRID_EDGE` inside it, as the grid's do, so the two line up.
 */
export type LgSolutionLayout =
  | { mode: 'table'; font: number; colWidths: number[]; rowH: number; padX: number; height: number; width: number }
  | { mode: 'list'; font: number; lines: string[][]; height: number; width: number }

/** Rows of the answer: each person with their value in every category. */
export function solutionRows(puzzle: LgPuzzle): string[][] {
  const { n, K } = puzzle.shape
  return Array.from({ length: n }, (_, p) => [
    puzzle.wording.names[p]!,
    ...Array.from({ length: K }, (_, k) => groupLabels(puzzle, k + 1)[puzzle.solution[k + 1]![p]!]!),
  ])
}

const TABLE_FONTS = [16, 15, 14, 13]

/** Largest table that fits the column; a list when no table does. */
export function planSolution(puzzle: LgPuzzle, width: number, font: string, ptToPx: (pt: number) => number): LgSolutionLayout {
  const header = [0, ...colGroups(puzzle.shape.K)].map((g) => groupTitle(puzzle, g))
  const rows = solutionRows(puzzle)
  for (const pt of TABLE_FONTS) {
    const size = ptToPx(pt)
    const padX = Math.round(size * 0.6)
    const colWidths = header.map((title, c) =>
      Math.ceil(
        Math.max(
          measureRunWidth(title, size, boldSpec(font)),
          ...rows.map((row) => measureRunWidth(row[c]!, size, textSpec(font))),
        ) * 1.06 + 2 * padX,
      ),
    )
    const total = colWidths.reduce((a, b) => a + b, 0) + 2 * GRID_EDGE
    if (total <= width) {
      const rowH = Math.round(size * 1.9)
      return { mode: 'table', font: size, colWidths, rowH, padX, height: rowH * (rows.length + 1) + 2 * GRID_EDGE, width: total }
    }
  }
  const size = ptToPx(14)
  const lines = rows.map(([name, ...values]) =>
    wrapLines(`${name}: ${values.join(', ')}`, width, size, textSpec(font)),
  )
  const count = lines.reduce((sum, l) => sum + l.length, 0)
  return {
    mode: 'list',
    font: size,
    lines,
    height: Math.round(textBlockHeight(count, size) + (rows.length - 1) * size * 0.5),
    width,
  }
}

/**
 * The answer, drawn from the same puzzle object as the clues and grid, as one
 * group so it moves as one piece. Every value is an `answer` object, so it can
 * never appear on the puzzle page.
 */
export function drawSolution(
  objects: StudioFabricObject[],
  options: {
    puzzle: LgPuzzle
    layout: LgSolutionLayout
    left: number
    top: number
    font: string
    tag: StudioTag
    /** The puzzle page's write-in chart: names only, every answer cell left empty. */
    blank?: boolean
  },
): void {
  const { puzzle, layout, left, top, font, tag, blank = false } = options
  const rows = solutionRows(puzzle)
  const parts: StudioFabricObject[] = []
  const box = { left, top, width: layout.width, height: layout.height }
  if (layout.mode === 'list') {
    if (blank) return
    let y = top
    layout.lines.forEach((lines) => {
      parts.push(
        buildText(
          {
            left,
            top: Math.round(y),
            text: lines.join('\n'),
            width: layout.width,
            fontFamily: font,
            fontSize: layout.font,
            lineHeight: TEXT_LINE_HEIGHT,
          },
          tag,
          'answer',
        ),
      )
      y += textBlockHeight(lines.length, layout.font) + layout.font * 0.5
    })
    objects.push(buildGroup(parts, box, tag, 'structure'))
    return
  }

  const { colWidths, rowH, padX } = layout
  const header = [0, ...colGroups(puzzle.shape.K)].map((g) => groupTitle(puzzle, g))
  const x0 = left + GRID_EDGE
  const y0 = top + GRID_EDGE
  const x1 = left + layout.width - GRID_EDGE
  const y1 = top + layout.height - GRID_EDGE
  parts.push(
    bar(tag, x0, y0, x1, y0, STUDIO_STROKE_BOLD),
    bar(tag, x0, y0 + rowH, x1, y0 + rowH, STUDIO_STROKE_BOLD),
    bar(tag, x0, y1, x1, y1, STUDIO_STROKE_BOLD),
    bar(tag, x0, y0, x0, y1, STUDIO_STROKE_BOLD),
    bar(tag, x1, y0, x1, y1, STUDIO_STROKE_BOLD),
  )
  for (let r = 2; r <= rows.length; r++) {
    parts.push(bar(tag, x0, y0 + r * rowH, x1, y0 + r * rowH, STUDIO_STROKE_HAIRLINE))
  }
  let x = x0
  colWidths.forEach((w, c) => {
    if (c > 0) parts.push(bar(tag, x, y0, x, y1, STUDIO_STROKE_HAIRLINE))
    const cell = (text: string, row: number, boldText: boolean, role: StudioRole) =>
      label(
        tag,
        {
          cx: x + w / 2,
          cy: y0 + (row + 0.5) * rowH,
          text,
          width: w - 2 * padX,
          size: layout.font,
          font,
          bold: boldText,
          align: 'left',
        },
        role,
      )
    parts.push(cell(header[c]!, 0, true, 'prompt'))
    rows.forEach((row, r) => {
      if (c === 0) parts.push(cell(row[c]!, r + 1, true, 'prompt'))
      else if (!blank) parts.push(cell(row[c]!, r + 1, false, 'answer'))
    })
    x += w
  })
  objects.push(buildGroup(parts, box, tag, 'structure'))
}
