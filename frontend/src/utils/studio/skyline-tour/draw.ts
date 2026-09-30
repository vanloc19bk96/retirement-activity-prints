import type { StudioFabricObject, StudioRole } from '@/types/studio-template.types'
import { STUDIO_DIGIT_FONT, STUDIO_INK, STUDIO_RULE_MEDIUM, STUDIO_STROKE_HAIRLINE, STUDIO_STROKE_NORMAL } from '@/constants/studio.constants'
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
 * the heavy frame, the answer's heights hidden for the answer page, and the
 * legend.
 *
 * Black on white, nothing on the plots but the lines and the numbers, so
 * pencilled heights read clearly. On the answer page every open plot shows
 * its height, a plain digit in the middle of the plot as large as the
 * givens, which stay bold as on the puzzle page.
 */

/** Marks the objects a Skyline Tour page draws, for checks and the editor. */
export const SKY_PART_KEY = 'skyPart'

/** The legend's little towers: a pale gray under a black outline. */
const SKY_LEGEND_TOWER_FILL = '#DADADA'

const r2 = (n: number) => Math.round(n * 100) / 100

type Pt = readonly [number, number]

function part(obj: StudioFabricObject, name: string, extra: Record<string, unknown> = {}): StudioFabricObject {
  return { ...obj, data: { ...(obj.data ?? {}), [SKY_PART_KEY]: name, ...extra } }
}

/** One path of polylines in canvas px: filled closed shapes, or open strokes with no fill. */
function pathOf(options: { lines: readonly (readonly Pt[])[]; close: boolean; fill: string; strokeWidth: number; tag: StudioTag }): StudioFabricObject {
  const { lines, close, fill, strokeWidth, tag } = options
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
    studioRole: 'prompt',
  }
}

const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
]

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
  /** Bold for the clues and givens; the answer's heights set plain. */
  bold?: boolean
}): StudioFabricObject {
  const { value, cx, cy, size, tag, role, name, extra, bold = true } = options
  const text = String(value)
  const obj = buildText(
    {
      left: r2(cx),
      top: r2(cy),
      text,
      fontFamily: STUDIO_DIGIT_FONT,
      fontSize: size,
      fontWeight: bold ? 700 : 'normal',
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
  return [part(pathOf({ lines, close: true, fill: SKY_LEGEND_TOWER_FILL, strokeWidth: STUDIO_STROKE_HAIRLINE, tag }), 'legend-skyline')]
}

/** The legend's sample clue: the number, and an arrow looking in. */
function legendArrow(box: Box, tag: StudioTag): StudioFabricObject[] {
  const midY = box.top + box.height / 2
  const x0 = box.left + box.width * 0.52
  const x1 = box.left + box.width * 0.96
  const head = box.height * 0.2
  return [
    part(pathOf({ lines: [[[x0, midY], [x1 - head, midY]]], close: false, fill: 'transparent', strokeWidth: STUDIO_STROKE_NORMAL, tag }), 'legend-arrow'),
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
}): StudioFabricObject {
  const { built, plan, city, level, label, tag, font } = options
  const { puzzle, grid: answer } = built
  const { grid, cell, size, digitSize } = plan
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

  // Every plot's height in its middle: the givens bold, the rest plain and hidden until the answer page.
  for (let i = 0; i < n * n; i++) {
    const row = Math.floor(i / n)
    const col = i % n
    const cx = grid.left + (col + 0.5) * cell
    const cy = grid.top + (row + 0.5) * cell
    const given = puzzle.givens[i]!
    if (given > 0) parts.push(digitText({ value: given, cx, cy, size: digitSize, tag, role: 'prompt', name: 'given', extra: { row, col } }))
    else parts.push(digitText({ value: answer[i]!, cx, cy, size: digitSize, tag, role: 'answer', name: 'height', extra: { row, col }, bold: false }))
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
