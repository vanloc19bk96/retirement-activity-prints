import type { StudioFabricObject, StudioRole } from '@/types/studio-template.types'
import {
  STUDIO_DIGIT_FONT,
  STUDIO_INK,
  STUDIO_PAPER,
  STUDIO_RULE,
  STUDIO_RULE_MEDIUM,
  STUDIO_STROKE_BOLD,
  STUDIO_STROKE_HAIRLINE,
  STUDIO_STROKE_NORMAL,
} from '@/constants/studio.constants'
import { STUDIO_CANONICAL_KEY } from '../_shared/uniqueness'
import { buildCircle, buildGroup, buildRect, buildText, nextObjectId, type StudioTag } from '../studio-fabric-builders'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import { drawGridLines } from '../studio-grid-rules'
import type { Box } from '../studio-layout'
import { TY_TEMPLATE_KEY, tyLetter, tySignText, type TyLevel, type TyProject } from './content'
import {
  TY_LEGEND_ICON,
  TY_LEGEND_ICON_GAP,
  TY_LEGEND_ITEM_GAP,
  TY_LEGEND_ROW_GAP,
  tyLegendItemWidths,
  tyLegendRowHeight,
  tyLegendSpec,
  tyLegendWidth,
  tyLegendWords,
  tyLineHeight,
  tySignSpec,
  tySignWidth,
  tyTextWidth,
  type TyPlan,
} from './layout'
import type { TyBuilt } from './puzzle'

/**
 * A planned grid → one Fabric group: the project's tag, the grid (soft rules
 * in a heavy frame), the strands hidden for the answer page, the yarn balls
 * with their letters, and the legend.
 *
 * Black on white with soft gray rules, so it prints the same on any
 * interior. A yarn ball is a plain white ball with a bold letter in the
 * middle, so the letter reads first and the ball second. The strand the
 * reader draws is shown once, in the legend; on the answer page every
 * strand is drawn, thick and round-cornered like a length of yarn, from
 * ball to ball through the middle of every square it fills.
 */

/** Marks the objects a Tangled Yarn page draws, for checks and the editor. */
export const TY_PART_KEY = 'tyPart'

/** An answer strand's weight, as a share of the square (never under 5 px). */
const STRAND_OF_CELL = 0.16

const r2 = (n: number) => Math.round(n * 100) / 100

type Pt = readonly [number, number]

function part(obj: StudioFabricObject, name: string, extra: Record<string, unknown> = {}): StudioFabricObject {
  return { ...obj, data: { ...(obj.data ?? {}), [TY_PART_KEY]: name, ...extra } }
}

/** One stroked path of polylines (no fill), placed by the centre of its own geometry. */
function strokes(options: { lines: readonly (readonly Pt[])[]; width: number; stroke?: string; tag: StudioTag; role: StudioRole }): StudioFabricObject {
  const { lines, width, stroke = STUDIO_INK, tag, role } = options
  const path: (string | number)[][] = []
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const line of lines) {
    line.forEach(([px, py], i) => {
      const x = r2(px)
      const y = r2(py)
      path.push([i === 0 ? 'M' : 'L', x, y])
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    })
  }
  return {
    type: 'path',
    path,
    // A path is placed by the centre of its own geometry (Fabric's pathOffset).
    left: r2((minX + maxX) / 2),
    top: r2((minY + maxY) / 2),
    width: r2(maxX - minX),
    height: r2(maxY - minY),
    originX: 'center',
    originY: 'center',
    fill: 'transparent',
    stroke,
    strokeWidth: width,
    strokeUniform: true,
    strokeLineCap: 'round',
    strokeLineJoin: 'round',
    objectId: nextObjectId(tag.instanceId),
    studioTemplateKey: tag.templateKey,
    studioInstanceId: tag.instanceId,
    studioPageRole: tag.pageRole,
    studioRole: role,
    // Strands stay hidden on the puzzle page; the answer key reveals them.
    ...(role === 'answer' ? { visible: false } : {}),
  }
}

/** A yarn ball: the white ball and its letter. */
function ballParts(options: { cx: number; cy: number; radius: number; letter: string; letterSize: number; tag: StudioTag; name: string; extra: Record<string, unknown> }): StudioFabricObject[] {
  const { cx, cy, radius, letter, letterSize, tag, name, extra } = options
  const outline = radius >= 20 ? STUDIO_STROKE_NORMAL : STUDIO_STROKE_HAIRLINE
  return [
    part(buildCircle({ left: r2(cx), top: r2(cy), radius, fill: STUDIO_PAPER, stroke: STUDIO_INK, strokeWidth: outline }, tag, 'prompt'), name, extra),
    part(
      buildText(
        {
          left: r2(cx),
          top: r2(cy),
          text: letter,
          fontFamily: STUDIO_DIGIT_FONT,
          fontSize: letterSize,
          fontWeight: 700,
          width: Math.ceil(letterSize * 1.2),
          textAlign: 'center',
          originX: 'center',
          originY: 'center',
          // Fabric's default multiplier centres a lone glyph off its axis.
          lineHeight: 1,
        },
        tag,
        'prompt',
      ),
      `${name}-letter`,
      extra,
    ),
  ]
}

/** Centre of the square in row r, column c. */
export const tyCentre = (plan: TyPlan, row: number, col: number): Pt => [plan.grid.left + (col + 0.5) * plan.cell, plan.grid.top + (row + 0.5) * plan.cell]

/** A strand's corners: its first and last squares' centres and every square where it turns. */
export function tyStrandPoints(plan: TyPlan, cols: number, path: readonly number[]): Pt[] {
  const at = (i: number) => tyCentre(plan, Math.floor(i / cols), i % cols)
  const points: Pt[] = [at(path[0]!)]
  for (let n = 1; n < path.length - 1; n++) {
    const before = path[n]! - path[n - 1]!
    const after = path[n + 1]! - path[n]!
    if (before !== after) points.push(at(path[n]!))
  }
  if (path.length > 1) points.push(at(path[path.length - 1]!))
  return points
}

/** The tag's box for this project, centred over the grid and kept on the panel. */
export function tySignBox(plan: TyPlan, project: TyProject, font: string): Box {
  const width = Math.min(plan.signBand.width, tySignWidth(tySignText(project, plan.signLines), plan.signSize, font))
  const centre = plan.grid.left + plan.grid.width / 2
  const left = Math.max(plan.signBand.left, Math.min(centre - width / 2, plan.signBand.left + plan.signBand.width - width))
  return { left: r2(left), top: plan.signBand.top, width, height: plan.signBand.height }
}

/** The widest the tag's words may set, centred on the tag and kept inside its band. */
export function tySignTextRoom(plan: TyPlan, sign: Box): number {
  const centre = sign.left + sign.width / 2
  const band = plan.signBand
  return Math.floor(2 * Math.min(centre - band.left, band.left + band.width - centre))
}

/** Where the legend runs: centred under the grid and kept on the panel. */
export function tyLegendBox(plan: TyPlan, pairs: number, font: string): Box {
  const width = tyLegendWidth(pairs, font, plan.legendRows)
  const centre = plan.grid.left + plan.grid.width / 2
  const left = Math.max(plan.block.left, Math.min(centre - width / 2, plan.block.left + plan.block.width - width))
  return { left: r2(left), top: plan.legendTop, width, height: plan.legendHeight }
}

/** An answer strand's weight on this plan. */
export const tyStrandWidth = (plan: TyPlan) => Math.max(5, r2(plan.cell * STRAND_OF_CELL))

export function buildTyPuzzle(options: {
  built: TyBuilt
  plan: TyPlan
  project: TyProject
  level: TyLevel
  /** `project|level|grid` — what the book remembers of this page. */
  label: string
  tag: StudioTag
  font: string
}): StudioFabricObject {
  const { built, plan, project, level, label, tag, font } = options
  const { puzzle, paths } = built
  const { grid, cell, ballRadius, letterSize } = plan
  const parts: StudioFabricObject[] = []

  // The tag: a double-ruled board with the project's name.
  const sign = tySignBox(plan, project, font)
  parts.push(part(buildRect({ ...sign, rx: 10, ry: 10, fill: 'transparent', stroke: STUDIO_INK, strokeWidth: 2 }, tag), 'sign'))
  parts.push(
    part(
      buildRect(
        { left: sign.left + 4, top: sign.top + 4, width: sign.width - 8, height: sign.height - 8, rx: 7, ry: 7, fill: 'transparent', stroke: STUDIO_INK, strokeWidth: 1 },
        tag,
      ),
      'sign',
    ),
  )
  const signText = tySignText(project, plan.signLines)
  parts.push(
    part(
      buildText(
        {
          left: r2(sign.left + sign.width / 2),
          top: r2(sign.top + (sign.height - tyLineHeight(plan.signSize, plan.signLines)) / 2),
          text: signText,
          fontFamily: font,
          fontSize: plan.signSize,
          fontWeight: 700,
          lineHeight: 1,
          // As wide as the band allows round the tag's centre: the name is
          // centred either way, and a font that sets a little wider than
          // measured runs past the board's padding instead of wrapping.
          width: Math.max(tyTextWidth(signText, plan.signSize, tySignSpec(font)), tySignTextRoom(plan, sign)),
          textAlign: 'center',
          originX: 'center',
        },
        tag,
        'prompt',
      ),
      'sign-text',
    ),
  )

  // The grid: medium rules inside, a heavy frame round it.
  for (const bar of drawGridLines(grid, cell, plan.size, plan.size, tag, { fill: STUDIO_RULE_MEDIUM, thickness: STUDIO_STROKE_HAIRLINE })) {
    parts.push(part(bar, 'rule'))
  }
  parts.push(
    part(
      buildRect({ left: grid.left, top: grid.top, width: grid.width, height: grid.height, fill: 'transparent', stroke: STUDIO_RULE, strokeWidth: STUDIO_STROKE_BOLD }, tag),
      'frame',
    ),
  )

  // Strands, hidden until the answer page: ball to ball, under the balls.
  const weight = tyStrandWidth(plan)
  paths.forEach((path, i) => {
    parts.push(part(strokes({ lines: [tyStrandPoints(plan, puzzle.cols, path)], width: weight, tag, role: 'answer' }), 'strand', { k: i + 1, cells: path.join('.') }))
  })

  // The yarn balls: a white ball and its letter.
  puzzle.ends.forEach((k, i) => {
    if (k === 0) return
    const row = Math.floor(i / puzzle.cols)
    const col = i % puzzle.cols
    const [x, y] = tyCentre(plan, row, col)
    parts.push(...ballParts({ cx: x, cy: y, radius: ballRadius, letter: tyLetter(k), letterSize, tag, name: 'ball', extra: { k, row, col } }))
  })

  // The legend: the ball they are given (and how many pairs), the strand they draw.
  const pairs = paths.length
  const legend = tyLegendBox(plan, pairs, font)
  const [ballWord, strandWord] = tyLegendWords(pairs)
  const [ballItem] = tyLegendItemWidths(pairs, font)
  const rowHeight = tyLegendRowHeight()
  const rowMid = (row: number) => legend.top + row * (rowHeight + TY_LEGEND_ROW_GAP) + rowHeight / 2
  const words = (text: string, x: number, midY: number, extra: Record<string, unknown> = {}) =>
    part(
      buildText(
        { left: r2(x), top: r2(midY - tyLineHeight(plan.legendSize) / 2), text, fontFamily: font, fontSize: plan.legendSize, lineHeight: 1, width: tyTextWidth(text, plan.legendSize, tyLegendSpec(font)) },
        tag,
        'prompt',
      ),
      'legend-text',
      extra,
    )

  let x = legend.left
  let midY = rowMid(0)
  const icon = TY_LEGEND_ICON
  const legendBall = (icon / 2 - 1) * 0.92
  parts.push(...ballParts({ cx: x + icon / 2, cy: midY, radius: legendBall, letter: tyLetter(1), letterSize: Math.round(icon * 0.46), tag, name: 'legend-ball', extra: {} }))
  parts.push(words(ballWord, x + icon + TY_LEGEND_ICON_GAP, midY, { pairs }))

  if (plan.legendRows === 1) x += ballItem + TY_LEGEND_ITEM_GAP
  else midY = rowMid(1)
  const bend = icon * 0.22
  parts.push(
    part(
      strokes({
        lines: [
          [
            [x + 2, midY + bend],
            [x + icon / 2, midY + bend],
            [x + icon / 2, midY - bend],
            [x + icon - 2, midY - bend],
          ],
        ],
        width: 4,
        tag,
        role: 'prompt',
      }),
      'legend-strand',
    ),
  )
  parts.push(words(strandWord, x + icon + TY_LEGEND_ICON_GAP, midY))

  const top = plan.block.top
  const bottom = plan.legendTop + plan.legendHeight
  const left = Math.min(sign.left, legend.left, grid.left)
  const right = Math.max(sign.left + sign.width, legend.left + legend.width, grid.left + grid.width)
  const group = buildGroup(parts, { left, top, width: right - left, height: bottom - top }, tag, 'prompt')
  return {
    ...group,
    data: {
      source: TY_TEMPLATE_KEY,
      [TY_PART_KEY]: 'puzzle',
      project: project.name,
      level,
      size: `${puzzle.cols}x${puzzle.rows}`,
      pairs,
      [STUDIO_CONTENT_LABEL_KEY]: label,
      // The same grid, however it is turned, is the same puzzle wherever it sits.
      [STUDIO_CANONICAL_KEY]: `${TY_TEMPLATE_KEY}:${built.signature}`,
    },
  }
}
