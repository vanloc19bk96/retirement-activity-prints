import type { StudioFabricObject } from '@/types/studio-template.types'
import {
  STUDIO_DIGIT_FONT,
  STUDIO_INK,
  STUDIO_PAPER,
  STUDIO_RULE_MEDIUM,
  STUDIO_STROKE_BOLD,
  STUDIO_STROKE_HAIRLINE,
  STUDIO_STROKE_NORMAL,
} from '@/constants/studio.constants'
import { STUDIO_CANONICAL_KEY } from '../_shared/uniqueness'
import { buildCircle, buildGroup, buildRect, buildText, nextObjectId, type StudioTag } from '../studio-fabric-builders'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import type { Box } from '../studio-layout'
import { IH_TEMPLATE_KEY, ihSignText, type IhChain, type IhLevel } from './content'
import {
  IH_LEGEND_ICON,
  IH_LEGEND_ICON_GAP,
  IH_LEGEND_ITEM_GAP,
  IH_LEGEND_ROW_GAP,
  ihLegendItemWidths,
  ihLegendRowHeight,
  ihLegendSpec,
  ihLegendWidth,
  ihLegendWords,
  ihLineHeight,
  ihSignSpec,
  ihSignWidth,
  ihTextWidth,
  type IhPlan,
} from './layout'
import type { IhBuilt } from './puzzle'

/**
 * A planned chart → one Fabric group: the island chain's sign, the sea (a
 * softly ruled frame with a faint dot on every open lattice point), the
 * numbered islands, the bridges hidden for the answer page, and the legend.
 *
 * Black on white with a soft gray for the sea's dots and frame, so it prints
 * the same on any interior. The dots are there for the pencil: a bridge runs
 * from dot to dot, straight across or down, so it is easy to draw true. The
 * bridge the reader draws is shown once, in the legend; on the answer page
 * every bridge is drawn, doubled where the answer doubles it.
 */

/** Marks the objects an Island Hopping page draws, for checks and the editor. */
export const IH_PART_KEY = 'ihPart'

/** The sea's dots, as a share of the spacing (never under 2 px). */
const DOT_OF_CELL = 0.04
/** Two bridges sit this far either side of the lane's centre line, as a share of the spacing. */
const DOUBLE_OF_CELL = 0.09

const r2 = (n: number) => Math.round(n * 100) / 100

function part(obj: StudioFabricObject, name: string, extra: Record<string, unknown> = {}): StudioFabricObject {
  return { ...obj, data: { ...(obj.data ?? {}), [IH_PART_KEY]: name, ...extra } }
}

type Segment = readonly [number, number, number, number]

/** One stroked path of straight segments: a bridge, single or double. */
function strokes(segments: readonly Segment[], width: number, tag: StudioTag, answer: boolean): StudioFabricObject {
  const path: (string | number)[][] = []
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x1, y1, x2, y2] of segments) {
    path.push(['M', r2(x1), r2(y1)], ['L', r2(x2), r2(y2)])
    minX = Math.min(minX, x1, x2)
    minY = Math.min(minY, y1, y2)
    maxX = Math.max(maxX, x1, x2)
    maxY = Math.max(maxY, y1, y2)
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
    stroke: STUDIO_INK,
    strokeWidth: width,
    strokeUniform: true,
    strokeLineCap: 'round',
    objectId: nextObjectId(tag.instanceId),
    studioTemplateKey: tag.templateKey,
    studioInstanceId: tag.instanceId,
    studioPageRole: tag.pageRole,
    studioRole: answer ? 'answer' : 'prompt',
    // Bridges stay hidden on the puzzle page; the answer key reveals them.
    ...(answer ? { visible: false } : {}),
  }
}

/** The segments of `count` bridges from (x1, y1) to (x2, y2), side by side when two. */
function bridgeSegments(x1: number, y1: number, x2: number, y2: number, count: number, apart: number): Segment[] {
  if (count === 1) return [[x1, y1, x2, y2]]
  const horizontal = y1 === y2
  const [dx, dy] = horizontal ? [0, apart] : [apart, 0]
  return [
    [x1 - dx, y1 - dy, x2 - dx, y2 - dy],
    [x1 + dx, y1 + dy, x2 + dx, y2 + dy],
  ]
}

function numberText(n: number, x: number, y: number, size: number, tag: StudioTag, extra: Record<string, unknown>): StudioFabricObject {
  return part(
    buildText(
      {
        left: r2(x),
        top: r2(y),
        text: String(n),
        fontFamily: STUDIO_DIGIT_FONT,
        fontSize: size,
        fontWeight: 700,
        width: Math.ceil(size * 1.1),
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
    'number',
    extra,
  )
}

/** Centre of the lattice point in row r, column c. */
export const ihPoint = (plan: IhPlan, row: number, col: number): [number, number] => [
  plan.grid.left + plan.pad + (col + 0.5) * plan.cell,
  plan.grid.top + plan.pad + (row + 0.5) * plan.cell,
]

/** The sign's box for this chain, centred over the chart and kept on the panel. */
export function ihSignBox(plan: IhPlan, chain: IhChain, font: string): Box {
  const width = Math.min(plan.signBand.width, ihSignWidth(ihSignText(chain, plan.signLines), plan.signSize, font))
  const centre = plan.grid.left + plan.grid.width / 2
  const left = Math.max(plan.signBand.left, Math.min(centre - width / 2, plan.signBand.left + plan.signBand.width - width))
  return { left: r2(left), top: plan.signBand.top, width, height: plan.signBand.height }
}

/** The widest the sign's words may set, centred on the sign and kept inside its band. */
export function ihSignTextRoom(plan: IhPlan, sign: Box): number {
  const centre = sign.left + sign.width / 2
  const band = plan.signBand
  return Math.floor(2 * Math.min(centre - band.left, band.left + band.width - centre))
}

/** Where the legend runs: centred under the chart and kept on the panel. */
export function ihLegendBox(plan: IhPlan, islands: number, font: string): Box {
  const width = ihLegendWidth(islands, font, plan.legendRows)
  const centre = plan.grid.left + plan.grid.width / 2
  const left = Math.max(plan.block.left, Math.min(centre - width / 2, plan.block.left + plan.block.width - width))
  return { left: r2(left), top: plan.legendTop, width, height: plan.legendHeight }
}

export function buildIhPuzzle(options: {
  built: IhBuilt
  plan: IhPlan
  chain: IhChain
  level: IhLevel
  /** `chain|level|chart` — what the book remembers of this page. */
  label: string
  tag: StudioTag
  font: string
}): StudioFabricObject {
  const { built, plan, chain, level, label, tag, font } = options
  const { puzzle, bridges } = built
  const { grid, cell, islandRadius, numberSize } = plan
  const parts: StudioFabricObject[] = []

  // The sign: a double-ruled board with the chain's name.
  const sign = ihSignBox(plan, chain, font)
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
  const signText = ihSignText(chain, plan.signLines)
  parts.push(
    part(
      buildText(
        {
          left: r2(sign.left + sign.width / 2),
          top: r2(sign.top + (sign.height - ihLineHeight(plan.signSize, plan.signLines)) / 2),
          text: signText,
          fontFamily: font,
          fontSize: plan.signSize,
          fontWeight: 700,
          lineHeight: 1,
          // As wide as the band allows round the sign's centre: the name is
          // centred either way, and a font that sets a little wider than
          // measured runs past the board's padding instead of wrapping.
          width: Math.max(ihTextWidth(signText, plan.signSize, ihSignSpec(font)), ihSignTextRoom(plan, sign)),
          textAlign: 'center',
          originX: 'center',
        },
        tag,
        'prompt',
      ),
      'sign-text',
    ),
  )

  // The sea: a soft frame, and a faint dot on every open lattice point.
  parts.push(
    part(
      buildRect(
        { left: grid.left, top: grid.top, width: grid.width, height: grid.height, rx: r2(cell * 0.25), ry: r2(cell * 0.25), fill: 'transparent', stroke: STUDIO_RULE_MEDIUM, strokeWidth: STUDIO_STROKE_HAIRLINE },
        tag,
      ),
      'frame',
    ),
  )
  const land = new Set(puzzle.islands.map((isl) => isl.row * puzzle.cols + isl.col))
  const dot = Math.max(2, r2(cell * DOT_OF_CELL))
  for (let r = 0; r < puzzle.rows; r++) {
    for (let c = 0; c < puzzle.cols; c++) {
      if (land.has(r * puzzle.cols + c)) continue
      const [x, y] = ihPoint(plan, r, c)
      parts.push(part(buildCircle({ left: r2(x), top: r2(y), radius: dot, fill: STUDIO_RULE_MEDIUM, stroke: STUDIO_RULE_MEDIUM, strokeWidth: 0 }, tag), 'dot'))
    }
  }

  // Bridges, hidden until the answer page: shore to shore, under the islands.
  const apart = Math.max(4, r2(cell * DOUBLE_OF_CELL))
  for (const bridge of bridges) {
    const from = puzzle.islands[bridge.a]!
    const to = puzzle.islands[bridge.b]!
    const [x1, y1] = ihPoint(plan, from.row, from.col)
    const [x2, y2] = ihPoint(plan, to.row, to.col)
    const across = from.row === to.row
    const [ux, uy] = across ? [1, 0] : [0, 1]
    const segments = bridgeSegments(x1 + ux * islandRadius, y1 + uy * islandRadius, x2 - ux * islandRadius, y2 - uy * islandRadius, bridge.count, apart)
    parts.push(part(strokes(segments, STUDIO_STROKE_BOLD, tag, true), 'bridge', { a: bridge.a, b: bridge.b, count: bridge.count }))
  }

  // The islands: a white circle with its number.
  puzzle.islands.forEach((isl, i) => {
    const [x, y] = ihPoint(plan, isl.row, isl.col)
    parts.push(
      part(
        buildCircle({ left: r2(x), top: r2(y), radius: islandRadius, fill: STUDIO_PAPER, stroke: STUDIO_INK, strokeWidth: STUDIO_STROKE_NORMAL }, tag, 'prompt'),
        'island',
        { i, row: isl.row, col: isl.col, n: isl.n },
      ),
    )
    parts.push(numberText(isl.n, x, y, numberSize, tag, { i, n: isl.n }))
  })

  // The legend: the island they are given (and how many), the bridge they draw.
  const islands = puzzle.islands.length
  const legend = ihLegendBox(plan, islands, font)
  const [islandWord, bridgeWord] = ihLegendWords(islands)
  const [islandItem] = ihLegendItemWidths(islands, font)
  const rowHeight = ihLegendRowHeight()
  const rowMid = (row: number) => legend.top + row * (rowHeight + IH_LEGEND_ROW_GAP) + rowHeight / 2
  const words = (text: string, x: number, midY: number, extra: Record<string, unknown> = {}) =>
    part(
      buildText(
        { left: r2(x), top: r2(midY - ihLineHeight(plan.legendSize) / 2), text, fontFamily: font, fontSize: plan.legendSize, lineHeight: 1, width: ihTextWidth(text, plan.legendSize, ihLegendSpec(font)) },
        tag,
        'prompt',
      ),
      'legend-text',
      extra,
    )

  let x = legend.left
  let midY = rowMid(0)
  const icon = IH_LEGEND_ICON
  parts.push(part(buildCircle({ left: r2(x + icon / 2), top: r2(midY), radius: icon / 2 - 1, fill: STUDIO_PAPER, stroke: STUDIO_INK, strokeWidth: STUDIO_STROKE_NORMAL }, tag, 'prompt'), 'legend-island'))
  parts.push(
    part(
      buildText(
        { left: r2(x + icon / 2), top: r2(midY), text: '2', fontFamily: STUDIO_DIGIT_FONT, fontSize: Math.round(icon * 0.55), fontWeight: 700, width: icon, textAlign: 'center', originX: 'center', originY: 'center', lineHeight: 1, editable: false },
        tag,
        'prompt',
      ),
      'legend-number',
    ),
  )
  parts.push(words(islandWord, x + icon + IH_LEGEND_ICON_GAP, midY, { islands }))

  if (plan.legendRows === 1) x += islandItem + IH_LEGEND_ITEM_GAP
  else midY = rowMid(1)
  parts.push(part(strokes(bridgeSegments(x + 1, midY, x + icon - 1, midY, 2, 4), STUDIO_STROKE_BOLD, tag, false), 'legend-bridge'))
  parts.push(words(bridgeWord, x + icon + IH_LEGEND_ICON_GAP, midY))

  const top = plan.block.top
  const bottom = plan.legendTop + plan.legendHeight
  const left = Math.min(sign.left, legend.left, grid.left)
  const right = Math.max(sign.left + sign.width, legend.left + legend.width, grid.left + grid.width)
  const group = buildGroup(parts, { left, top, width: right - left, height: bottom - top }, tag, 'prompt')
  return {
    ...group,
    data: {
      source: IH_TEMPLATE_KEY,
      [IH_PART_KEY]: 'puzzle',
      chain: chain.name,
      level,
      size: `${puzzle.cols}x${puzzle.rows}`,
      islands,
      [STUDIO_CONTENT_LABEL_KEY]: label,
      // The same chart, however it is turned, is the same puzzle wherever it sits.
      [STUDIO_CANONICAL_KEY]: `${IH_TEMPLATE_KEY}:${built.signature}`,
    },
  }
}
