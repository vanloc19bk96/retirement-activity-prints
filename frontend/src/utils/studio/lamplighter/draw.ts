import type { StudioFabricObject, StudioRole } from '@/types/studio-template.types'
import { STUDIO_DIGIT_FONT, STUDIO_INK, STUDIO_PAPER, STUDIO_RULE_MEDIUM, STUDIO_STROKE_HAIRLINE, STUDIO_STROKE_NORMAL } from '@/constants/studio.constants'
import { STUDIO_CANONICAL_KEY } from '../_shared/uniqueness'
import { buildGroup, buildRect, buildText, nextObjectId, type StudioTag } from '../studio-fabric-builders'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import { drawGridLines } from '../studio-grid-rules'
import type { Box } from '../studio-layout'
import { LAMP_LEGEND_SAMPLE, LAMP_TEMPLATE_KEY, lampCountWord, lampSampleWord, lampSignText, type LampHome, type LampLevel } from './content'
import {
  LAMP_FRAME,
  LAMP_LEGEND_ICON,
  LAMP_LEGEND_ICON_GAP,
  LAMP_LEGEND_ITEM_GAP,
  LAMP_LEGEND_ROW_GAP,
  lampLegendItemWidths,
  lampLegendRowHeight,
  lampLegendSpec,
  lampLegendWidth,
  lampLineHeight,
  lampNumberSpec,
  lampSignSpec,
  lampSignWidth,
  lampTextWidth,
  type LampPlan,
} from './layout'
import type { LampBuilt } from './puzzle'
import { LAMP_FLOOR, isLampNumber } from './solver'

/**
 * A planned house → one Fabric group: the home's name board, the softly
 * ruled floor, the solid black walls with their white numbers, the heavy
 * frame, the lit house hidden for the answer page, and the legend.
 *
 * The puzzle page is black on white — nothing on the floor but the lines,
 * so pencilled lamps and dots read clearly. On the answer page every lamp
 * is a light bulb on its square and nothing else is added, so the answer
 * stays as plain to read as the puzzle. Black and white only, so it prints
 * the same on any interior.
 */

/** Marks the objects a Lamplighter page draws, for checks and the editor. */
export const LAMP_PART_KEY = 'lampPart'

const r2 = (n: number) => Math.round(n * 100) / 100

type Pt = readonly [number, number]

function part(obj: StudioFabricObject, name: string, extra: Record<string, unknown> = {}): StudioFabricObject {
  return { ...obj, data: { ...(obj.data ?? {}), [LAMP_PART_KEY]: name, ...extra } }
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
    // The lit house stays hidden on the puzzle page; the answer key reveals it.
    ...(role === 'answer' ? { visible: false } : {}),
  }
}

/* ------------------------------------------------------------------ *
 * The lamp, in a unit square
 * ------------------------------------------------------------------ */

/** The glass: a round bulb narrowing to its neck. */
const GLASS: readonly Pt[] = (() => {
  const cx = 0.5
  const cy = 0.4
  const r = 0.21
  // Where the neck, 0.14 wide, meets the round: this far round from level.
  const meet = Math.acos(0.07 / r)
  // From the lower left of the round, over the top, to the lower right (canvas y runs down).
  const from = Math.PI - meet
  const sweep = Math.PI + 2 * meet
  const out: Pt[] = []
  for (let k = 0; k <= 24; k++) {
    const a = from + (k / 24) * sweep
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
  }
  out.push([0.56, 0.66], [0.44, 0.66])
  return out
})()

/** The screw base under the glass. */
const BASE: readonly Pt[] = [
  [0.42, 0.67],
  [0.58, 0.67],
  [0.58, 0.77],
  [0.54, 0.82],
  [0.46, 0.82],
  [0.42, 0.77],
]

/** Short rays round the top of the glass. */
const RAYS: readonly (readonly Pt[])[] = [-150, -115, -90, -65, -30].map((deg) => {
  const a = (deg * Math.PI) / 180
  return [
    [0.5 + 0.28 * Math.cos(a), 0.4 + 0.28 * Math.sin(a)],
    [0.5 + 0.38 * Math.cos(a), 0.4 + 0.38 * Math.sin(a)],
  ] as const
})

const inBox = (box: Box, shape: readonly Pt[]): Pt[] => shape.map(([u, v]) => [box.left + u * box.width, box.top + v * box.height] as const)

/** A lamp: a white bulb on a screw base, rays round its top. */
export function lampIconParts(box: Box, tag: StudioTag, role: StudioRole, name: string, extra: Record<string, unknown> = {}): StudioFabricObject[] {
  const weight = box.width >= 36 ? STUDIO_STROKE_NORMAL : STUDIO_STROKE_HAIRLINE
  return [
    part(pathOf({ lines: [inBox(box, GLASS)], close: true, fill: STUDIO_PAPER, strokeWidth: weight, tag, role }), name, extra),
    part(pathOf({ lines: [inBox(box, BASE)], close: true, fill: STUDIO_INK, strokeWidth: weight, tag, role }), `${name}-base`, extra),
    part(pathOf({ lines: RAYS.map((ray) => inBox(box, ray)), close: false, fill: 'transparent', strokeWidth: weight, tag, role }), `${name}-rays`, extra),
  ]
}

/* ------------------------------------------------------------------ *
 * Placement
 * ------------------------------------------------------------------ */

/** The board's box for this home, centred over the grid and kept on the panel. */
export function lampSignBox(plan: LampPlan, home: LampHome, font: string): Box {
  const width = Math.min(plan.signBand.width, lampSignWidth(lampSignText(home, plan.signLines), plan.signSize, font))
  const centre = plan.grid.left + plan.grid.width / 2
  const left = Math.max(plan.signBand.left, Math.min(centre - width / 2, plan.signBand.left + plan.signBand.width - width))
  return { left: r2(left), top: plan.signBand.top, width, height: plan.signBand.height }
}

/** The widest the board's words may set, centred on the board and kept inside its band. */
export function lampSignTextRoom(plan: LampPlan, sign: Box): number {
  const centre = sign.left + sign.width / 2
  const band = plan.signBand
  return Math.floor(2 * Math.min(centre - band.left, band.left + band.width - centre))
}

/** Where the legend runs: centred under the grid and kept on the panel. */
export function lampLegendBox(plan: LampPlan, font: string): Box {
  const width = lampLegendWidth(plan.size, font, plan.legendRows)
  const centre = plan.grid.left + plan.grid.width / 2
  const left = Math.max(plan.block.left, Math.min(centre - width / 2, plan.block.left + plan.block.width - width))
  return { left: r2(left), top: plan.legendTop, width, height: plan.legendHeight }
}

/** The lamp's box inside its square on the answer page. */
const lampBox = (plan: LampPlan, row: number, col: number): Box => {
  const pad = plan.cell * 0.06
  return { left: plan.grid.left + col * plan.cell + pad, top: plan.grid.top + row * plan.cell + pad, width: plan.cell - pad * 2, height: plan.cell - pad * 2 }
}

function numberText(value: number, cx: number, cy: number, size: number, fill: string, tag: StudioTag, name: string, extra: Record<string, unknown>): StudioFabricObject {
  const text = String(value)
  return part(
    buildText(
      {
        left: r2(cx),
        top: r2(cy),
        text,
        fontFamily: STUDIO_DIGIT_FONT,
        fontSize: size,
        fontWeight: 700,
        fill,
        width: Math.max(Math.ceil(size * 1.1), lampTextWidth(text, size, lampNumberSpec())),
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
    name,
    { n: value, ...extra },
  )
}

export function buildLampPuzzle(options: {
  built: LampBuilt
  plan: LampPlan
  home: LampHome
  level: LampLevel
  /** `home|level|house` — what the book remembers of this page. */
  label: string
  tag: StudioTag
  font: string
}): StudioFabricObject {
  const { built, plan, home, level, label, tag, font } = options
  const { puzzle, lamps } = built
  const { grid, cell, size, numberSize } = plan
  const n = puzzle.size
  const parts: StudioFabricObject[] = []

  // The name board: a double-ruled board with the home's name.
  const sign = lampSignBox(plan, home, font)
  parts.push(part(buildRect({ ...sign, rx: 10, ry: 10, fill: 'transparent', stroke: STUDIO_INK, strokeWidth: 2 }, tag), 'sign'))
  parts.push(
    part(
      buildRect({ left: sign.left + 5, top: sign.top + 5, width: sign.width - 10, height: sign.height - 10, rx: 6, ry: 6, fill: 'transparent', stroke: STUDIO_INK, strokeWidth: 1 }, tag),
      'sign',
    ),
  )
  const signText = lampSignText(home, plan.signLines)
  parts.push(
    part(
      buildText(
        {
          left: r2(sign.left + sign.width / 2),
          top: r2(sign.top + (sign.height - lampLineHeight(plan.signSize, plan.signLines)) / 2),
          text: signText,
          fontFamily: font,
          fontSize: plan.signSize,
          fontWeight: 700,
          lineHeight: 1,
          // As wide as the band allows round the board's centre: the name is
          // centred either way, and a font that sets a little wider than
          // measured runs past the board's padding instead of wrapping.
          width: Math.max(lampTextWidth(signText, plan.signSize, lampSignSpec(font)), lampSignTextRoom(plan, sign)),
          textAlign: 'center',
          originX: 'center',
        },
        tag,
        'prompt',
      ),
      'sign-text',
    ),
  )

  // The walls, solid black; the soft rules run over them so every wall square counts on its own.
  for (let i = 0; i < n * n; i++) {
    if (puzzle.cells[i] === LAMP_FLOOR) continue
    const row = Math.floor(i / n)
    const col = i % n
    parts.push(
      part(buildRect({ left: grid.left + col * cell, top: grid.top + row * cell, width: cell, height: cell, fill: STUDIO_INK, stroke: 'transparent', strokeWidth: 0 }, tag), 'wall', {
        row,
        col,
      }),
    )
  }
  for (const bar of drawGridLines(grid, cell, size, size, tag, { fill: STUDIO_RULE_MEDIUM, thickness: STUDIO_STROKE_HAIRLINE })) parts.push(part(bar, 'rule'))

  // The numbers, bold and white on their walls.
  for (let i = 0; i < n * n; i++) {
    const value = puzzle.cells[i]!
    if (!isLampNumber(value)) continue
    const row = Math.floor(i / n)
    const col = i % n
    parts.push(numberText(value, grid.left + (col + 0.5) * cell, grid.top + (row + 0.5) * cell, numberSize, STUDIO_PAPER, tag, 'number', { row, col }))
  }

  // The lamps, hidden until the answer page: each bulb on its own square.
  for (const at of lamps) {
    const row = Math.floor(at / n)
    const col = at % n
    parts.push(...lampIconParts(lampBox(plan, row, col), tag, 'answer', 'lamp', { row, col }))
  }

  // The frame, flush inside the house's edge.
  const w = LAMP_FRAME
  const frame = (box: Box) => part(buildRect({ ...box, fill: STUDIO_INK, stroke: 'transparent', strokeWidth: 0 }, tag), 'frame')
  parts.push(frame({ left: grid.left, top: grid.top, width: grid.width, height: w }))
  parts.push(frame({ left: grid.left, top: grid.top + grid.height - w, width: grid.width, height: w }))
  parts.push(frame({ left: grid.left, top: grid.top, width: w, height: grid.height }))
  parts.push(frame({ left: grid.left + grid.width - w, top: grid.top, width: w, height: grid.height }))

  // The legend: a lamp and how many there are to place, then a sample wall and what its number means.
  const legend = lampLegendBox(plan, font)
  const [countItem] = lampLegendItemWidths(n, font)
  const rowHeight = lampLegendRowHeight()
  const rowMid = (row: number) => legend.top + row * (rowHeight + LAMP_LEGEND_ROW_GAP) + rowHeight / 2
  const words = (text: string, x: number, midY: number, extra: Record<string, unknown>) =>
    part(
      buildText(
        { left: r2(x), top: r2(midY - lampLineHeight(plan.legendSize) / 2), text, fontFamily: font, fontSize: plan.legendSize, lineHeight: 1, width: lampTextWidth(text, plan.legendSize, lampLegendSpec(font)) },
        tag,
        'prompt',
      ),
      'legend-text',
      extra,
    )

  const icon = LAMP_LEGEND_ICON
  let x = legend.left
  let midY = rowMid(0)
  parts.push(...lampIconParts({ left: x, top: midY - icon / 2, width: icon, height: icon }, tag, 'prompt', 'legend-lamp'))
  parts.push(words(lampCountWord(lamps.length), x + icon + LAMP_LEGEND_ICON_GAP, midY, { lamps: lamps.length }))

  if (plan.legendRows === 1) x += countItem + LAMP_LEGEND_ITEM_GAP
  else midY = rowMid(1)
  parts.push(part(buildRect({ left: x, top: midY - icon / 2, width: icon, height: icon, fill: STUDIO_INK, stroke: 'transparent', strokeWidth: 0 }, tag), 'legend-wall'))
  parts.push(numberText(LAMP_LEGEND_SAMPLE, x + icon / 2, midY, plan.legendSize, STUDIO_PAPER, tag, 'legend-number', {}))
  parts.push(words(lampSampleWord(LAMP_LEGEND_SAMPLE), x + icon + LAMP_LEGEND_ICON_GAP, midY, { sample: LAMP_LEGEND_SAMPLE }))

  const top = plan.block.top
  const bottom = plan.legendTop + plan.legendHeight
  const left = Math.min(sign.left, legend.left, grid.left)
  const right = Math.max(sign.left + sign.width, legend.left + legend.width, grid.left + grid.width)
  const group = buildGroup(parts, { left, top, width: right - left, height: bottom - top }, tag, 'prompt')
  return {
    ...group,
    data: {
      source: LAMP_TEMPLATE_KEY,
      [LAMP_PART_KEY]: 'puzzle',
      home: home.name,
      level,
      size: `${n}x${n}`,
      [STUDIO_CONTENT_LABEL_KEY]: label,
      // The same walls and numbers, however the house is turned, are the same puzzle wherever they sit.
      [STUDIO_CANONICAL_KEY]: `${LAMP_TEMPLATE_KEY}:${built.signature}`,
    },
  }
}
