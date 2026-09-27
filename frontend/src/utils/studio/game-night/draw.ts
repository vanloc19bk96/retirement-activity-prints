import type { StudioFabricObject, StudioRole } from '@/types/studio-template.types'
import { STUDIO_DIGIT_FONT, STUDIO_INK, STUDIO_RULE_MEDIUM, STUDIO_STROKE_HAIRLINE } from '@/constants/studio.constants'
import { STUDIO_CANONICAL_KEY } from '../_shared/uniqueness'
import { buildGroup, buildRect, buildText, type StudioTag } from '../studio-fabric-builders'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import { drawGridLines } from '../studio-grid-rules'
import type { Box } from '../studio-layout'
import { GN_TEMPLATE_KEY, gnClueText, gnLegendEntries, gnSignText, type GnLegendEntry, type GnLevel, type GnNight } from './content'
import {
  GN_CLUE_INSET,
  GN_DIGIT_DROP,
  GN_LEGEND_BOX_WIDTH,
  GN_LEGEND_CLUE_SIZE,
  GN_LEGEND_DIGIT_DROP,
  GN_LEGEND_ICON_GAP,
  GN_LEGEND_ITEM_GAP,
  GN_LEGEND_ROW_GAP,
  GN_LEGEND_SQUARE,
  GN_WALL,
  gnClueTop,
  gnDigitSpec,
  gnLegendColumns,
  gnLegendPerRow,
  gnLegendRowHeight,
  gnLegendSpec,
  gnLegendWidth,
  gnLineHeight,
  gnSignSpec,
  gnSignWidth,
  gnTextWidth,
  type GnPlan,
} from './layout'
import type { GnBuilt } from './puzzle'
import type { GnPuzzle } from './solver'

/**
 * A planned grid → one Fabric group: the night's sign, the soft lines
 * between squares, the bold walls round every box and the frame, each box's
 * clue in its top-left corner, the answer's numbers hidden for the answer
 * page, and the legend.
 *
 * Black on white with one mid gray, so it prints the same on any interior.
 * The reader pencils a number into every square; the answer page writes
 * them in, plain and set low, clear of the bold clues.
 */

/** Marks the objects a Game Night page draws, for checks and the editor. */
export const GN_PART_KEY = 'gnPart'

const r2 = (n: number) => Math.round(n * 100) / 100

function part(obj: StudioFabricObject, name: string, extra: Record<string, unknown> = {}): StudioFabricObject {
  return { ...obj, data: { ...(obj.data ?? {}), [GN_PART_KEY]: name, ...extra } }
}

/** A filled bar (never a stroked rect: every edge the same weight). */
const bar = (box: Box, tag: StudioTag, fill = STUDIO_INK) => buildRect({ ...box, fill, stroke: 'transparent', strokeWidth: 0 }, tag)

/** A number centred on a point in the digit face. */
function numberText(options: { value: number; cx: number; cy: number; size: number; weight: 400 | 700; tag: StudioTag; role: StudioRole; name: string; extra: Record<string, unknown> }): StudioFabricObject {
  const { value, cx, cy, size, weight, tag, role, name, extra } = options
  const text = String(value)
  const obj = buildText(
    {
      left: r2(cx),
      top: r2(cy),
      text,
      fontFamily: STUDIO_DIGIT_FONT,
      fontSize: size,
      fontWeight: weight,
      fill: STUDIO_INK,
      width: Math.max(Math.ceil(size * 1.1), gnTextWidth(text, size, gnDigitSpec(weight))),
      textAlign: 'center',
      originX: 'center',
      originY: 'center',
      // Fabric's default multiplier centres a lone line of digits off its axis.
      lineHeight: 1,
      editable: false,
    },
    tag,
    role,
  )
  // Answers stay hidden on the puzzle page; the answer key reveals them.
  return part(role === 'answer' ? { ...obj, visible: false } : obj, name, { n: value, ...extra })
}

/** A clue set from its square's top-left corner, bold, in the digit face. */
function clueText(options: { text: string; left: number; top: number; size: number; tag: StudioTag; name: string; extra: Record<string, unknown> }): StudioFabricObject {
  const { text, left, top, size, tag, name, extra } = options
  return part(
    buildText(
      {
        left: r2(left),
        top: r2(top),
        text,
        fontFamily: STUDIO_DIGIT_FONT,
        fontSize: size,
        fontWeight: 700,
        fill: STUDIO_INK,
        width: gnTextWidth(text, size, gnDigitSpec()),
        textAlign: 'left',
        lineHeight: 1,
        editable: false,
      },
      tag,
      'prompt',
    ),
    name,
    { clue: text, ...extra },
  )
}

/* ------------------------------------------------------------------ *
 * The walls
 * ------------------------------------------------------------------ */

/** One straight run of wall between boxes, in squares: along grid line `at`, from square `from` up to `to`. */
export interface GnWallRun {
  dir: 'across' | 'down'
  /** The grid line it runs on (1 to size − 1; the frame is drawn apart). */
  at: number
  from: number
  to: number
}

/** Every inside wall of the grid, runs of the same line joined end to end. */
export function gnWallRuns(p: GnPuzzle): GnWallRun[] {
  const n = p.size
  const cageOf = new Array<number>(n * n).fill(-1)
  p.cages.forEach((c, ci) => c.cells.forEach((i) => (cageOf[i] = ci)))
  const runs: GnWallRun[] = []
  for (let at = 1; at < n; at++) {
    // Down: between column at − 1 and at, row by row. Across: between row at − 1 and at, column by column.
    for (const dir of ['down', 'across'] as const) {
      let from = -1
      for (let k = 0; k <= n; k++) {
        const walled = k < n && (dir === 'down' ? cageOf[k * n + at - 1] !== cageOf[k * n + at] : cageOf[(at - 1) * n + k] !== cageOf[at * n + k])
        if (walled && from < 0) from = k
        if (!walled && from >= 0) {
          runs.push({ dir, at, from, to: k })
          from = -1
        }
      }
    }
  }
  return runs
}

/** A wall run's bar on the page: centred on its line, reaching half a wall past each end so corners meet square, and kept inside the grid. */
export function gnWallBox(plan: GnPlan, run: GnWallRun): Box {
  const { grid, cell } = plan
  const half = GN_WALL / 2
  const clampSpan = (start: number, length: number, min: number, max: number) => {
    const a = Math.max(min, start)
    const b = Math.min(max, start + length)
    return [a, b - a] as const
  }
  if (run.dir === 'down') {
    const [top, height] = clampSpan(grid.top + run.from * cell - half, (run.to - run.from) * cell + GN_WALL, grid.top, grid.top + grid.height)
    return { left: r2(grid.left + run.at * cell - half), top: r2(top), width: GN_WALL, height: r2(height) }
  }
  const [left, width] = clampSpan(grid.left + run.from * cell - half, (run.to - run.from) * cell + GN_WALL, grid.left, grid.left + grid.width)
  return { left: r2(left), top: r2(grid.top + run.at * cell - half), width: r2(width), height: GN_WALL }
}

/* ------------------------------------------------------------------ *
 * Where things go
 * ------------------------------------------------------------------ */

/** The sign's box for this night, centred over the grid and kept on the panel. */
export function gnSignBox(plan: GnPlan, night: GnNight, font: string): Box {
  const width = Math.min(plan.signBand.width, gnSignWidth(gnSignText(night, plan.signLines), plan.signSize, font))
  const centre = plan.grid.left + plan.grid.width / 2
  const left = Math.max(plan.signBand.left, Math.min(centre - width / 2, plan.signBand.left + plan.signBand.width - width))
  return { left: r2(left), top: plan.signBand.top, width, height: plan.signBand.height }
}

/** The widest the sign's words may set, centred on the sign and kept inside its band. */
export function gnSignTextRoom(plan: GnPlan, sign: Box): number {
  const centre = sign.left + sign.width / 2
  const band = plan.signBand
  return Math.floor(2 * Math.min(centre - band.left, band.left + band.width - centre))
}

/** Where the legend runs: centred under the grid and kept on the panel. */
export function gnLegendBox(plan: GnPlan, level: GnLevel, font: string): Box {
  const width = gnLegendWidth(level, font, plan.legendRows)
  const centre = plan.grid.left + plan.grid.width / 2
  const left = Math.max(plan.block.left, Math.min(centre - width / 2, plan.block.left + plan.block.width - width))
  return { left: r2(left), top: plan.legendTop, width, height: plan.legendHeight }
}

/** Where a clue's top-left corner sits in its square. */
export function gnClueOrigin(plan: GnPlan, row: number, col: number): [number, number] {
  const x = plan.grid.left + col * plan.cell + GN_WALL / 2 + GN_CLUE_INSET
  const y = plan.grid.top + row * plan.cell + gnClueTop()
  return [x, y]
}

/* ------------------------------------------------------------------ *
 * The legend
 * ------------------------------------------------------------------ */

/** A little box of two squares: framed bold, a soft line between, its clue in the corner and a number in each square. */
function legendBox(options: { left: number; midY: number; entry: GnLegendEntry; size: number; tag: StudioTag }): StudioFabricObject[] {
  const { left, midY, entry, size, tag } = options
  const square = GN_LEGEND_SQUARE
  const top = midY - square / 2
  const key = entry.op
  const edge = 2
  const out: StudioFabricObject[] = [
    part(bar({ left: left + square - 0.75, top, width: 1.5, height: square }, tag, STUDIO_RULE_MEDIUM), 'legend-rule', { entry: key }),
    part(bar({ left, top, width: square * 2, height: edge }, tag), 'legend-frame', { entry: key }),
    part(bar({ left, top: top + square - edge, width: square * 2, height: edge }, tag), 'legend-frame', { entry: key }),
    part(bar({ left, top, width: edge, height: square }, tag), 'legend-frame', { entry: key }),
    part(bar({ left: left + square * 2 - edge, top, width: edge, height: square }, tag), 'legend-frame', { entry: key }),
  ]
  out.push(clueText({ text: gnClueText({ op: entry.op, target: entry.target }), left: left + edge + 3, top: top + edge + 1, size: GN_LEGEND_CLUE_SIZE, tag, name: 'legend-clue', extra: { entry: key } }))
  entry.values.forEach((value, k) => {
    out.push(numberText({ value, cx: left + (k + 0.5) * square, cy: top + square * GN_LEGEND_DIGIT_DROP, size, weight: 400, tag, role: 'prompt', name: 'legend-number', extra: { entry: key, k } }))
  })
  return out
}

/* ------------------------------------------------------------------ *
 * The page
 * ------------------------------------------------------------------ */

export function buildGnPuzzle(options: {
  built: GnBuilt
  plan: GnPlan
  night: GnNight
  level: GnLevel
  /** `night|level|grid` — what the book remembers of this page. */
  label: string
  tag: StudioTag
  font: string
}): StudioFabricObject {
  const { built, plan, night, level, label, tag, font } = options
  const { puzzle, values } = built
  const { grid, cell } = plan
  const n = puzzle.size
  const parts: StudioFabricObject[] = []

  // The sign: a double-ruled board with the night's name.
  const sign = gnSignBox(plan, night, font)
  parts.push(part(buildRect({ ...sign, rx: 10, ry: 10, fill: 'transparent', stroke: STUDIO_INK, strokeWidth: 2 }, tag), 'sign'))
  parts.push(
    part(
      buildRect({ left: sign.left + 5, top: sign.top + 5, width: sign.width - 10, height: sign.height - 10, rx: 6, ry: 6, fill: 'transparent', stroke: STUDIO_INK, strokeWidth: 1 }, tag),
      'sign',
    ),
  )
  const signText = gnSignText(night, plan.signLines)
  parts.push(
    part(
      buildText(
        {
          left: r2(sign.left + sign.width / 2),
          top: r2(sign.top + (sign.height - gnLineHeight(plan.signSize, plan.signLines)) / 2),
          text: signText,
          fontFamily: font,
          fontSize: plan.signSize,
          fontWeight: 700,
          lineHeight: 1,
          // As wide as the band allows round the board's centre: the name is
          // centred either way, and a font that sets a little wider than
          // measured runs past the board's padding instead of wrapping.
          width: Math.max(gnTextWidth(signText, plan.signSize, gnSignSpec(font)), gnSignTextRoom(plan, sign)),
          textAlign: 'center',
          originX: 'center',
        },
        tag,
        'prompt',
      ),
      'sign-text',
    ),
  )

  // Soft lines between every square, the bold walls round every box, then the frame flush inside the grid's edge.
  for (const line of drawGridLines(grid, cell, n, n, tag, { fill: STUDIO_RULE_MEDIUM, thickness: STUDIO_STROKE_HAIRLINE })) parts.push(part(line, 'rule'))
  for (const run of gnWallRuns(puzzle)) parts.push(part(bar(gnWallBox(plan, run), tag), 'wall', { dir: run.dir, at: run.at, from: run.from, to: run.to }))
  parts.push(part(bar({ left: grid.left, top: grid.top, width: grid.width, height: GN_WALL }, tag), 'frame'))
  parts.push(part(bar({ left: grid.left, top: grid.top + grid.height - GN_WALL, width: grid.width, height: GN_WALL }, tag), 'frame'))
  parts.push(part(bar({ left: grid.left, top: grid.top, width: GN_WALL, height: grid.height }, tag), 'frame'))
  parts.push(part(bar({ left: grid.left + grid.width - GN_WALL, top: grid.top, width: GN_WALL, height: grid.height }, tag), 'frame'))

  // Every box's clue, in the top-left corner of its first square.
  puzzle.cages.forEach((cage, box) => {
    const first = cage.cells[0]!
    const row = Math.floor(first / n)
    const col = first % n
    const [x, y] = gnClueOrigin(plan, row, col)
    parts.push(clueText({ text: gnClueText(cage), left: x, top: y, size: plan.clueSize, tag, name: 'clue', extra: { row, col, box } }))
  })

  // The answer's numbers, plain and set low, hidden until the answer page.
  for (let i = 0; i < n * n; i++) {
    const row = Math.floor(i / n)
    const col = i % n
    parts.push(
      numberText({ value: values[i]!, cx: grid.left + (col + 0.5) * cell, cy: grid.top + (row + GN_DIGIT_DROP) * cell, size: plan.digitSize, weight: 400, tag, role: 'answer', name: 'answer', extra: { row, col } }),
    )
  }

  // The legend: a worked box for every sign, one row or two.
  const legend = gnLegendBox(plan, level, font)
  const entries = gnLegendEntries(level)
  const per = gnLegendPerRow(level, plan.legendRows)
  const cols = gnLegendColumns(level, font, plan.legendRows)
  const rowHeight = gnLegendRowHeight()
  entries.forEach((entry, k) => {
    const row = Math.floor(k / per)
    const col = k % per
    const x = legend.left + cols.slice(0, col).reduce((a, b) => a + b + GN_LEGEND_ITEM_GAP, 0)
    const midY = legend.top + row * (rowHeight + GN_LEGEND_ROW_GAP) + rowHeight / 2
    parts.push(...legendBox({ left: x, midY, entry, size: plan.legendSize, tag }))
    parts.push(
      part(
        buildText(
          {
            left: r2(x + GN_LEGEND_BOX_WIDTH + GN_LEGEND_ICON_GAP),
            top: r2(midY - gnLineHeight(plan.legendSize) / 2),
            text: entry.words,
            fontFamily: font,
            fontSize: plan.legendSize,
            lineHeight: 1,
            width: gnTextWidth(entry.words, plan.legendSize, gnLegendSpec(font)),
          },
          tag,
          'prompt',
        ),
        'legend-text',
        { entry: entry.op },
      ),
    )
  })

  const top = plan.block.top
  const bottom = plan.legendTop + plan.legendHeight
  const left = Math.min(sign.left, legend.left, grid.left)
  const right = Math.max(sign.left + sign.width, legend.left + legend.width, grid.left + grid.width)
  const group = buildGroup(parts, { left, top, width: right - left, height: bottom - top }, tag, 'prompt')
  return {
    ...group,
    data: {
      source: GN_TEMPLATE_KEY,
      [GN_PART_KEY]: 'puzzle',
      night: night.name,
      level,
      size: `${n}x${n}`,
      boxes: puzzle.cages.length,
      [STUDIO_CONTENT_LABEL_KEY]: label,
      // The same boxes and clues turned or mirrored are the same puzzle wherever they sit.
      [STUDIO_CANONICAL_KEY]: `${GN_TEMPLATE_KEY}:${built.signature}`,
    },
  }
}
