import type { StudioFabricObject, StudioRole } from '@/types/studio-template.types'
import { STUDIO_DIGIT_FONT, STUDIO_INK, STUDIO_PAPER, STUDIO_RULE_MEDIUM, STUDIO_STROKE_HAIRLINE, STUDIO_STROKE_NORMAL } from '@/constants/studio.constants'
import { STUDIO_CANONICAL_KEY } from '../_shared/uniqueness'
import { buildGroup, buildRect, buildText, nextObjectId, type StudioTag } from '../studio-fabric-builders'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import { drawGridLines } from '../studio-grid-rules'
import type { Box } from '../studio-layout'
import { SKY_LEGEND_SAMPLE, SKY_TEMPLATE_KEY, skyHeightsWord, skySampleWord, skySignText, type SkyCity, type SkyLevel } from './content'
import {
  SKY_FRAME,
  SKY_LEGEND_CLUE_ICON,
  SKY_LEGEND_ICON,
  SKY_LEGEND_ICON_GAP,
  SKY_LEGEND_ITEM_GAP,
  SKY_LEGEND_ROW_GAP,
  skyDigitSpec,
  skyLegendItemWidths,
  skyLegendRowHeight,
  skyLegendSpec,
  skyLegendWidth,
  skyLineHeight,
  skySignSpec,
  skySignWidth,
  skyTextWidth,
  type SkyPlan,
} from './layout'
import type { SkyBuilt } from './puzzle'
import { skyClueSide } from './solver'

/**
 * A planned city → one Fabric group: the skyline's name board, the softly
 * ruled plots with their given heights, the clues standing round the city,
 * the heavy frame, the finished skyline hidden for the answer page, and the
 * legend.
 *
 * The puzzle page is black on white — nothing on the plots but the lines
 * and the few given heights, so pencilled numbers read clearly. On the
 * answer page every plot raises its building: a pale gray tower standing on
 * the plot's foot, as tall as its height (the tallest in every row and
 * column crowned with a spire), windows up both sides and a door where
 * there is room, and its height in bold on the facade under the roof — the
 * city seen at a glance. Grays only, so it prints the same on any interior.
 */

/** Marks the objects a Skyline Tour page draws, for checks and the editor. */
export const SKY_PART_KEY = 'skyPart'

/** The buildings: a pale gray, so the black height on the facade reads clearly. */
export const SKY_BUILDING_FILL = '#DADADA'

/** Where a building stands in its plot: its foot, its sides, and its roof for the shortest and the tallest. */
const FOOT = 0.88
const SIDE_L = 0.2
const SIDE_R = 0.8
const SHORTEST = 0.46
const TALLEST = 0.76
/** The spire over the tallest building, up to this far from the plot's top. */
const SPIRE_TOP = 0.04
/** Air under the roof before the height, as a share of the plot. */
const ROOF_AIR = 0.05

const r2 = (n: number) => Math.round(n * 100) / 100

type Pt = readonly [number, number]

function part(obj: StudioFabricObject, name: string, extra: Record<string, unknown> = {}): StudioFabricObject {
  return { ...obj, data: { ...(obj.data ?? {}), [SKY_PART_KEY]: name, ...extra } }
}

/**
 * One path of polylines in canvas px: filled closed shapes, or open strokes
 * with no fill. Answer paths start hidden; the answer key reveals them,
 * keeping their fill and inking their stroke.
 */
function pathOf(options: {
  lines: readonly (readonly Pt[])[]
  close: boolean
  fill: string
  strokeWidth: number
  tag: StudioTag
  role: StudioRole
}): StudioFabricObject {
  const { lines, close, fill, strokeWidth, tag, role } = options
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
    if (close) path.push(['Z'])
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
    fill,
    stroke: STUDIO_INK,
    strokeWidth,
    strokeUniform: true,
    strokeLineCap: 'round',
    strokeLineJoin: 'round',
    objectId: nextObjectId(tag.instanceId),
    studioTemplateKey: tag.templateKey,
    studioInstanceId: tag.instanceId,
    studioPageRole: tag.pageRole,
    studioRole: role,
    // The skyline stays hidden on the puzzle page; the answer key reveals it.
    ...(role === 'answer' ? { visible: false } : {}),
  }
}

const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
]

/* ------------------------------------------------------------------ *
 * A building, in a plot
 * ------------------------------------------------------------------ */

export interface SkyBuildingShape {
  /** The tower, foot to roof. */
  body: Pt[]
  /** Windows up both sides, in rows (none when the tower is too short). */
  windows: Pt[][]
  /** The door at the foot, when there is room under the height. */
  door: Pt[] | null
  /** The spire over the tallest building. */
  spire: Pt[] | null
  /** The centre of the height on the facade. */
  label: readonly [number, number]
}

/** The roof of a building of `height` in a city of `size`, as a share of its plot from the top. */
export const skyRoofOf = (height: number, size: number) => FOOT - (SHORTEST + ((TALLEST - SHORTEST) * (height - 1)) / Math.max(1, size - 1))

/** A building of `height` in the plot `box`, its height set `labelSize` px tall under the roof. */
export function skyBuildingShape(box: Box, height: number, size: number, labelSize: number): SkyBuildingShape {
  const s = box.width
  const at = (u: number, v: number): Pt => [box.left + u * s, box.top + v * box.height]
  const roof = skyRoofOf(height, size)
  const labelTop = roof + ROOF_AIR
  const labelBottom = labelTop + labelSize / s
  const body = [at(SIDE_L, FOOT), at(SIDE_L, roof), at(SIDE_R, roof), at(SIDE_R, FOOT)]

  // Windows up both sides of the height: small panes, a row to a floor where there is room.
  const windows: Pt[][] = []
  const pane = 0.07
  const pitch = 0.11
  for (let top = roof + 0.08; top + pane <= FOOT - 0.07 + 1e-9; top += pitch) {
    for (const [left, right] of [
      [0.26, 0.34],
      [0.66, 0.74],
    ] as const) {
      const [x0, y0] = at(left, top)
      const [x1, y1] = at(right, top + pane)
      windows.push(rect(x0, y0, x1, y1))
    }
  }

  // A door at the foot, when it clears the height.
  const doorTop = FOOT - 0.12
  let door: Pt[] | null = null
  if (doorTop >= labelBottom + 0.02) {
    const [x0, y0] = at(0.44, doorTop)
    const [x1, y1] = at(0.56, FOOT)
    door = rect(x0, y0, x1, y1)
  }

  const spire = height === size ? [at(0.5, roof), at(0.5, SPIRE_TOP)] : null
  const label = [box.left + 0.5 * s, box.top + (labelTop + labelSize / s / 2) * box.height] as const
  return { body, windows, door, spire, label }
}

/* ------------------------------------------------------------------ *
 * Placement
 * ------------------------------------------------------------------ */

/** The board's box for this skyline, centred over the city and kept on the panel. */
export function skySignBox(plan: SkyPlan, city: SkyCity, font: string): Box {
  const width = Math.min(plan.signBand.width, skySignWidth(skySignText(city, plan.signLines), plan.signSize, font))
  const centre = plan.city.left + plan.city.width / 2
  const left = Math.max(plan.signBand.left, Math.min(centre - width / 2, plan.signBand.left + plan.signBand.width - width))
  return { left: r2(left), top: plan.signBand.top, width, height: plan.signBand.height }
}

/** The widest the board's words may set, centred on the board and kept inside its band. */
export function skySignTextRoom(plan: SkyPlan, sign: Box): number {
  const centre = sign.left + sign.width / 2
  const band = plan.signBand
  return Math.floor(2 * Math.min(centre - band.left, band.left + band.width - centre))
}

/** Where the legend runs: centred under the city and kept on the panel. */
export function skyLegendBox(plan: SkyPlan, font: string): Box {
  const width = skyLegendWidth(plan.size, font, plan.legendRows)
  const centre = plan.city.left + plan.city.width / 2
  const left = Math.max(plan.block.left, Math.min(centre - width / 2, plan.block.left + plan.block.width - width))
  return { left: r2(left), top: plan.legendTop, width, height: plan.legendHeight }
}

/** A plot's box. */
export const skyPlotBox = (plan: SkyPlan, row: number, col: number): Box => ({
  left: plan.grid.left + col * plan.cell,
  top: plan.grid.top + row * plan.cell,
  width: plan.cell,
  height: plan.cell,
})

/** The centre of clue `k`, in the band beside its row or column. */
export function skyCluePoint(plan: SkyPlan, k: number): readonly [number, number] {
  const { side, along } = skyClueSide(plan.size, k)
  const { grid, city, cell, band } = plan
  const mid = along + 0.5
  if (side === 'top') return [grid.left + mid * cell, city.top + band / 2]
  if (side === 'bottom') return [grid.left + mid * cell, grid.top + grid.height + band / 2]
  if (side === 'left') return [city.left + band / 2, grid.top + mid * cell]
  return [grid.left + grid.width + band / 2, grid.top + mid * cell]
}

function digitText(options: {
  value: number
  cx: number
  cy: number
  size: number
  tag: StudioTag
  role: StudioRole
  name: string
  extra: Record<string, unknown>
}): StudioFabricObject {
  const { value, cx, cy, size, tag, role, name, extra } = options
  const text = String(value)
  const obj = buildText(
    {
      left: r2(cx),
      top: r2(cy),
      text,
      fontFamily: STUDIO_DIGIT_FONT,
      fontSize: size,
      fontWeight: 700,
      fill: STUDIO_INK,
      width: Math.max(Math.ceil(size * 1.1), skyTextWidth(text, size, skyDigitSpec())),
      textAlign: 'center',
      originX: 'center',
      originY: 'center',
      // Fabric's default multiplier centres a lone glyph off its axis.
      lineHeight: 1,
      editable: false,
    },
    tag,
    role,
  )
  return part(role === 'answer' ? { ...obj, visible: false } : obj, name, { n: value, ...extra })
}

/** The legend's little skyline: three towers climbing left to right. */
function legendSkyline(box: Box, tag: StudioTag): StudioFabricObject[] {
  const w = box.width
  const h = box.height
  const towers: [number, number, number][] = [
    [0.04, 0.34, 0.5],
    [0.36, 0.64, 0.75],
    [0.66, 0.96, 1],
  ]
  const lines = towers.map(([u0, u1, tall]) => rect(box.left + u0 * w, box.top + h, box.left + u1 * w, box.top + (1 - tall) * h + 1))
  return [part(pathOf({ lines, close: true, fill: SKY_BUILDING_FILL, strokeWidth: STUDIO_STROKE_HAIRLINE, tag, role: 'prompt' }), 'legend-skyline')]
}

/** The legend's sample clue: the number, and an arrow looking in. */
function legendArrow(box: Box, tag: StudioTag): StudioFabricObject[] {
  const midY = box.top + box.height / 2
  const x0 = box.left + box.width * 0.52
  const x1 = box.left + box.width * 0.96
  const head = box.height * 0.2
  return [
    part(pathOf({ lines: [[[x0, midY], [x1 - head, midY]]], close: false, fill: 'transparent', strokeWidth: STUDIO_STROKE_NORMAL, tag, role: 'prompt' }), 'legend-arrow'),
    part(
      pathOf({
        lines: [
          [
            [x1 - head * 1.3, midY - head],
            [x1, midY],
            [x1 - head * 1.3, midY + head],
          ],
        ],
        close: true,
        fill: STUDIO_INK,
        strokeWidth: STUDIO_STROKE_HAIRLINE,
        tag,
        role: 'prompt',
      }),
      'legend-arrow',
    ),
  ]
}

export function buildSkyPuzzle(options: {
  built: SkyBuilt
  plan: SkyPlan
  city: SkyCity
  level: SkyLevel
  /** `city|level|puzzle` — what the book remembers of this page. */
  label: string
  tag: StudioTag
  font: string
  /** The answer page's drawing: the given heights stand on their buildings' facades with the rest. */
  key?: boolean
}): StudioFabricObject {
  const { built, plan, city, level, label, tag, font, key = false } = options
  const { puzzle, grid: answer } = built
  const { grid, cell, size, digitSize, answerSize } = plan
  const n = puzzle.size
  const parts: StudioFabricObject[] = []

  // The name board: a double-ruled board with the skyline's name.
  const sign = skySignBox(plan, city, font)
  parts.push(part(buildRect({ ...sign, rx: 10, ry: 10, fill: 'transparent', stroke: STUDIO_INK, strokeWidth: 2 }, tag), 'sign'))
  parts.push(
    part(
      buildRect({ left: sign.left + 5, top: sign.top + 5, width: sign.width - 10, height: sign.height - 10, rx: 6, ry: 6, fill: 'transparent', stroke: STUDIO_INK, strokeWidth: 1 }, tag),
      'sign',
    ),
  )
  const signText = skySignText(city, plan.signLines)
  parts.push(
    part(
      buildText(
        {
          left: r2(sign.left + sign.width / 2),
          top: r2(sign.top + (sign.height - skyLineHeight(plan.signSize, plan.signLines)) / 2),
          text: signText,
          fontFamily: font,
          fontSize: plan.signSize,
          fontWeight: 700,
          lineHeight: 1,
          // As wide as the band allows round the board's centre: the name is
          // centred either way, and a font that sets a little wider than
          // measured runs past the board's padding instead of wrapping.
          width: Math.max(skyTextWidth(signText, plan.signSize, skySignSpec(font)), skySignTextRoom(plan, sign)),
          textAlign: 'center',
          originX: 'center',
        },
        tag,
        'prompt',
      ),
      'sign-text',
    ),
  )

  // The plots' soft rules.
  for (const bar of drawGridLines(grid, cell, size, size, tag, { fill: STUDIO_RULE_MEDIUM, thickness: STUDIO_STROKE_HAIRLINE })) parts.push(part(bar, 'rule'))

  // The skyline, hidden until the answer page: every plot's building, over the rules.
  for (let i = 0; i < n * n; i++) {
    const row = Math.floor(i / n)
    const col = i % n
    const height = answer[i]!
    const shape = skyBuildingShape(skyPlotBox(plan, row, col), height, n, answerSize)
    const at = { row, col, height }
    parts.push(part(pathOf({ lines: [shape.body], close: true, fill: SKY_BUILDING_FILL, strokeWidth: STUDIO_STROKE_HAIRLINE, tag, role: 'answer' }), 'building', at))
    if (shape.windows.length > 0) {
      parts.push(part(pathOf({ lines: shape.windows, close: true, fill: STUDIO_PAPER, strokeWidth: 0, tag, role: 'answer' }), 'windows', at))
    }
    if (shape.door) parts.push(part(pathOf({ lines: [shape.door], close: true, fill: STUDIO_INK, strokeWidth: 0, tag, role: 'answer' }), 'door', at))
    if (shape.spire) parts.push(part(pathOf({ lines: [shape.spire], close: false, fill: 'transparent', strokeWidth: STUDIO_STROKE_NORMAL, tag, role: 'answer' }), 'spire', at))
    const given = puzzle.givens[i]! > 0
    if (!given) {
      parts.push(digitText({ value: height, cx: shape.label[0], cy: shape.label[1], size: answerSize, tag, role: 'answer', name: 'height', extra: { row, col } }))
    } else if (key) {
      // On the answer page a given height stands on its facade like the rest.
      parts.push(digitText({ value: height, cx: shape.label[0], cy: shape.label[1], size: answerSize, tag, role: 'prompt', name: 'given', extra: { row, col } }))
    }
  }

  // The given heights, bold in the middle of their plots.
  if (!key) {
    for (let i = 0; i < n * n; i++) {
      const value = puzzle.givens[i]!
      if (value === 0) continue
      const row = Math.floor(i / n)
      const col = i % n
      parts.push(digitText({ value, cx: grid.left + (col + 0.5) * cell, cy: grid.top + (row + 0.5) * cell, size: digitSize, tag, role: 'prompt', name: 'given', extra: { row, col } }))
    }
  }

  // The clues, standing round the city.
  puzzle.clues.forEach((value, k) => {
    if (value === 0) return
    const [cx, cy] = skyCluePoint(plan, k)
    parts.push(digitText({ value, cx, cy, size: digitSize, tag, role: 'prompt', name: 'clue', extra: { k } }))
  })

  // The frame, flush inside the plots' edge.
  const w = SKY_FRAME
  const frame = (box: Box) => part(buildRect({ ...box, fill: STUDIO_INK, stroke: 'transparent', strokeWidth: 0 }, tag), 'frame')
  parts.push(frame({ left: grid.left, top: grid.top, width: grid.width, height: w }))
  parts.push(frame({ left: grid.left, top: grid.top + grid.height - w, width: grid.width, height: w }))
  parts.push(frame({ left: grid.left, top: grid.top, width: w, height: grid.height }))
  parts.push(frame({ left: grid.left + grid.width - w, top: grid.top, width: w, height: grid.height }))

  // The legend: a little skyline and the heights to place, then a sample clue and what it means.
  const legend = skyLegendBox(plan, font)
  const [heightsItem] = skyLegendItemWidths(n, font)
  const rowHeight = skyLegendRowHeight()
  const rowMid = (row: number) => legend.top + row * (rowHeight + SKY_LEGEND_ROW_GAP) + rowHeight / 2
  const words = (text: string, x: number, midY: number, extra: Record<string, unknown>) =>
    part(
      buildText(
        { left: r2(x), top: r2(midY - skyLineHeight(plan.legendSize) / 2), text, fontFamily: font, fontSize: plan.legendSize, lineHeight: 1, width: skyTextWidth(text, plan.legendSize, skyLegendSpec(font)) },
        tag,
        'prompt',
      ),
      'legend-text',
      extra,
    )

  const icon = SKY_LEGEND_ICON
  let x = legend.left
  let midY = rowMid(0)
  parts.push(...legendSkyline({ left: x, top: midY - icon / 2, width: icon, height: icon }, tag))
  parts.push(words(skyHeightsWord(n), x + icon + SKY_LEGEND_ICON_GAP, midY, { heights: n }))

  if (plan.legendRows === 1) x += heightsItem + SKY_LEGEND_ITEM_GAP
  else midY = rowMid(1)
  const clueIcon: Box = { left: x, top: midY - icon / 2, width: SKY_LEGEND_CLUE_ICON, height: icon }
  parts.push(digitText({ value: SKY_LEGEND_SAMPLE, cx: x + SKY_LEGEND_CLUE_ICON * 0.25, cy: midY, size: plan.legendSize, tag, role: 'prompt', name: 'legend-clue', extra: {} }))
  parts.push(...legendArrow(clueIcon, tag))
  parts.push(words(skySampleWord(SKY_LEGEND_SAMPLE), x + SKY_LEGEND_CLUE_ICON + SKY_LEGEND_ICON_GAP, midY, { sample: SKY_LEGEND_SAMPLE }))

  const top = plan.block.top
  const bottom = plan.legendTop + plan.legendHeight
  const left = Math.min(sign.left, legend.left, plan.city.left)
  const right = Math.max(sign.left + sign.width, legend.left + legend.width, plan.city.left + plan.city.width)
  const group = buildGroup(parts, { left, top, width: right - left, height: bottom - top }, tag, 'prompt')
  return {
    ...group,
    data: {
      source: SKY_TEMPLATE_KEY,
      [SKY_PART_KEY]: 'puzzle',
      city: city.name,
      level,
      size: `${n}x${n}`,
      [STUDIO_CONTENT_LABEL_KEY]: label,
      // The same clues and givens, however the city is turned, are the same puzzle wherever they sit.
      [STUDIO_CANONICAL_KEY]: `${SKY_TEMPLATE_KEY}:${built.signature}`,
    },
  }
}
