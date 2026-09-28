import type { StudioFabricObject, StudioRole } from '@/types/studio-template.types'
import { STUDIO_DIGIT_FONT, STUDIO_INK, STUDIO_STROKE_HAIRLINE } from '@/constants/studio.constants'
import { STUDIO_CANONICAL_KEY } from '../_shared/uniqueness'
import { buildGroup, buildRect, buildText, nextObjectId, type StudioTag } from '../studio-fabric-builders'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import type { Box } from '../studio-layout'
import { STONES_ENDS_WORD, STONES_LEGEND_PAIR, STONES_NEXT_WORD, STONES_TEMPLATE_KEY, stonesSignText, type StonesLevel, type StonesWalk } from './content'
import {
  STONES_LEGEND_ICON,
  STONES_LEGEND_ICON_GAP,
  STONES_LEGEND_ITEM_GAP,
  STONES_LEGEND_PAIR_GAP,
  STONES_LEGEND_ROW_GAP,
  stonesDigitSpec,
  stonesLegendItemWidths,
  stonesLegendRowHeight,
  stonesLegendSpec,
  stonesLegendWidth,
  stonesLineHeight,
  stonesSignSpec,
  stonesSignWidth,
  stonesTextWidth,
  type StonesPlan,
} from './layout'
import type { StonesBuilt } from './puzzle'
import { STONES_BLANK, stonesPathOrder } from './solver'

/**
 * A planned path → one Fabric group: the walk's signpost, the stepping
 * stones with their printed numbers (the start and the finish ringed
 * twice), the finished walk hidden for the answer page, and the legend.
 *
 * The puzzle page is black on white — rounded stones with a strip of lawn
 * between them, bold numbers on a few, so pencilled numbers read clearly. On
 * the answer page the walk appears as a garden trail: a soft gray path
 * winding from the start stone through every stone to the finish, rounded
 * at every turn, with every missing number written in on its stone (the
 * printed ones stay bold, the found ones plain). Black and one gray only,
 * so it prints the same on any interior.
 */

/** Marks the objects a Stepping Stones page draws, for checks and the editor. */
export const STONES_PART_KEY = 'stonesPart'

/** The trail: a soft gray, dark enough to print, light enough for black numbers over it. */
export const STONES_TRAIL_FILL = '#DDDDDD'

/** The start and finish stones: a heavier outer ring, and a fine ring inside it. */
const END_RING = 2.5
const END_INSET = 4

const r2 = (n: number) => Math.round(n * 100) / 100

type Pt = readonly [number, number]
type Cmd = (string | number)[]

function part(obj: StudioFabricObject, name: string, extra: Record<string, unknown> = {}): StudioFabricObject {
  return { ...obj, data: { ...(obj.data ?? {}), [STONES_PART_KEY]: name, ...extra } }
}

/**
 * One path of drawing commands in canvas px, placed by its own bounds.
 * Answer paths start hidden; the answer key reveals them, keeping their
 * fill and inking their stroke (the trail has none, so it stays gray).
 */
function pathOf(options: { commands: readonly Cmd[]; bounds: readonly [number, number, number, number]; fill: string; strokeWidth: number; tag: StudioTag; role: StudioRole }): StudioFabricObject {
  const { commands, bounds, fill, strokeWidth, tag, role } = options
  const [minX, minY, maxX, maxY] = bounds
  return {
    type: 'path',
    path: commands.map((c) => c.map((v) => (typeof v === 'number' ? r2(v) : v))),
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
    // The walk stays hidden on the puzzle page; the answer key reveals it.
    ...(role === 'answer' ? { visible: false } : {}),
  }
}

/** The bounds of a set of boxes, as [minX, minY, maxX, maxY]. */
function boundsOf(boxes: readonly Box[]): [number, number, number, number] {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const b of boxes) {
    minX = Math.min(minX, b.left)
    minY = Math.min(minY, b.top)
    maxX = Math.max(maxX, b.left + b.width)
    maxY = Math.max(maxY, b.top + b.height)
  }
  return [r2(minX), r2(minY), r2(maxX), r2(maxY)]
}

/** A rounded square's outline: straight sides, a quarter curve at each corner. */
export function roundedBox(box: Box, radius: number): Cmd[] {
  const x0 = box.left
  const y0 = box.top
  const x1 = box.left + box.width
  const y1 = box.top + box.height
  const r = Math.max(0, Math.min(radius, box.width / 2, box.height / 2))
  return [
    ['M', x0 + r, y0],
    ['L', x1 - r, y0],
    ['Q', x1, y0, x1, y0 + r],
    ['L', x1, y1 - r],
    ['Q', x1, y1, x1 - r, y1],
    ['L', x0 + r, y1],
    ['Q', x0, y1, x0, y1 - r],
    ['L', x0, y0 + r],
    ['Q', x0, y0, x0 + r, y0],
    ['Z'],
  ]
}

/* ------------------------------------------------------------------ *
 * Geometry on the page
 * ------------------------------------------------------------------ */

/** The centre of the stone at (row, col). */
export function stonesCentre(plan: StonesPlan, row: number, col: number): Pt {
  return [plan.grid.left + (col + 0.5) * plan.cell, plan.grid.top + (row + 0.5) * plan.cell]
}

/** The stone at (row, col): its pitch less half the lawn on every side. */
export function stonesStoneBox(plan: StonesPlan, row: number, col: number): Box {
  const half = plan.gap / 2
  return { left: plan.grid.left + col * plan.cell + half, top: plan.grid.top + row * plan.cell + half, width: plan.stone, height: plan.stone }
}

/**
 * The trail through the stones in walking order, as closed shapes of one
 * winding: a band along every straight run from centre to centre, and a
 * disc at every turn and at both ends, so the trail is rounded wherever it
 * bends. Filled, it reads as one soft path.
 */
export function stonesTrailShapes(plan: StonesPlan, walk: readonly number[]): Pt[][] {
  const n = plan.size
  const half = plan.trail / 2
  const at = (s: number) => stonesCentre(plan, Math.floor(s / n), s % n)
  // The walk's corners: its ends and every stone where it turns.
  const corners: number[] = []
  walk.forEach((_, k) => {
    if (k === 0 || k === walk.length - 1) corners.push(k)
    else if (walk[k]! - walk[k - 1]! !== walk[k + 1]! - walk[k]!) corners.push(k)
  })
  const shapes: Pt[][] = []
  for (let i = 0; i + 1 < corners.length; i++) {
    const [ax, ay] = at(walk[corners[i]!]!)
    const [bx, by] = at(walk[corners[i + 1]!]!)
    const x0 = Math.min(ax, bx) - (ax === bx ? half : 0)
    const x1 = Math.max(ax, bx) + (ax === bx ? half : 0)
    const y0 = Math.min(ay, by) - (ay === by ? half : 0)
    const y1 = Math.max(ay, by) + (ay === by ? half : 0)
    // Clockwise on the page, like the discs, so the shapes fill as one.
    shapes.push([
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ])
  }
  for (const k of corners) {
    const [cx, cy] = at(walk[k]!)
    shapes.push(Array.from({ length: 20 }, (_, j) => [cx + half * Math.cos((j / 20) * Math.PI * 2), cy + half * Math.sin((j / 20) * Math.PI * 2)] as const))
  }
  return shapes
}

/* ------------------------------------------------------------------ *
 * Placement
 * ------------------------------------------------------------------ */

/** The signpost's box for this walk, centred over the path and kept on the panel. */
export function stonesSignBox(plan: StonesPlan, walk: StonesWalk, font: string): Box {
  const width = Math.min(plan.signBand.width, stonesSignWidth(stonesSignText(walk, plan.signLines), plan.signSize, font))
  const centre = plan.grid.left + plan.grid.width / 2
  const left = Math.max(plan.signBand.left, Math.min(centre - width / 2, plan.signBand.left + plan.signBand.width - width))
  return { left: r2(left), top: plan.signBand.top, width, height: plan.signBand.height }
}

/** The widest the signpost's words may set, centred on the board and kept inside its band. */
export function stonesSignTextRoom(plan: StonesPlan, sign: Box): number {
  const centre = sign.left + sign.width / 2
  const band = plan.signBand
  return Math.floor(2 * Math.min(centre - band.left, band.left + band.width - centre))
}

/** Where the legend runs: centred under the path and kept on the panel. */
export function stonesLegendBox(plan: StonesPlan, font: string): Box {
  const width = stonesLegendWidth(font, plan.legendRows)
  const centre = plan.grid.left + plan.grid.width / 2
  const left = Math.max(plan.block.left, Math.min(centre - width / 2, plan.block.left + plan.block.width - width))
  return { left: r2(left), top: plan.legendTop, width, height: plan.legendHeight }
}

function numberText(options: {
  value: number
  cx: number
  cy: number
  size: number
  weight: 400 | 700
  tag: StudioTag
  role: StudioRole
  name: string
  extra: Record<string, unknown>
}): StudioFabricObject {
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
      width: Math.max(Math.ceil(size * 1.3), stonesTextWidth(text, size, stonesDigitSpec(weight))),
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
  return part(role === 'answer' ? { ...obj, visible: false } : obj, name, { n: value, ...extra })
}

/** The two rings of a start or finish stone. */
function endRings(box: Box, radius: number, tag: StudioTag, name: string, extra: Record<string, unknown>): StudioFabricObject[] {
  const inner: Box = { left: box.left + END_INSET, top: box.top + END_INSET, width: box.width - END_INSET * 2, height: box.height - END_INSET * 2 }
  return [
    part(pathOf({ commands: roundedBox(box, radius), bounds: boundsOf([box]), fill: 'transparent', strokeWidth: END_RING, tag, role: 'prompt' }), name, { ...extra, ring: 'outer' }),
    part(
      pathOf({ commands: roundedBox(inner, Math.max(0, radius - END_INSET)), bounds: boundsOf([inner]), fill: 'transparent', strokeWidth: 1, tag, role: 'prompt' }),
      name,
      { ...extra, ring: 'inner' },
    ),
  ]
}

/* ------------------------------------------------------------------ *
 * The legend's icons
 * ------------------------------------------------------------------ */

/** An icon's outline drawn inside its box: the stroke's outer half would otherwise print past the legend's edge. */
const strokeInside = (box: Box, stroke: number): Box => ({ left: box.left + stroke / 2, top: box.top + stroke / 2, width: box.width - stroke, height: box.height - stroke })

/** Two neighbouring stones numbered one after the other. */
function legendPair(box: Box, legendSize: number, tag: StudioTag): StudioFabricObject[] {
  const side = box.height
  const radius = Math.round(side * 0.24)
  const stones: Box[] = [
    strokeInside({ left: box.left, top: box.top, width: side, height: side }, STUDIO_STROKE_HAIRLINE),
    strokeInside({ left: box.left + side + STONES_LEGEND_PAIR_GAP, top: box.top, width: side, height: side }, STUDIO_STROKE_HAIRLINE),
  ]
  return [
    part(
      pathOf({ commands: stones.flatMap((b) => roundedBox(b, radius)), bounds: boundsOf(stones), fill: 'transparent', strokeWidth: STUDIO_STROKE_HAIRLINE, tag, role: 'prompt' }),
      'legend-stones',
    ),
    ...stones.map((b, k) =>
      numberText({ value: STONES_LEGEND_PAIR[k]!, cx: b.left + b.width / 2, cy: b.top + b.height / 2, size: legendSize, weight: 700, tag, role: 'prompt', name: 'legend-number', extra: {} }),
    ),
  ]
}

/** The start stone, ringed twice, with its 1. */
function legendEnd(box: Box, legendSize: number, tag: StudioTag): StudioFabricObject[] {
  return [
    ...endRings(strokeInside(box, END_RING), Math.round(box.width * 0.24), tag, 'legend-end', {}),
    numberText({ value: 1, cx: box.left + box.width / 2, cy: box.top + box.height / 2, size: legendSize, weight: 700, tag, role: 'prompt', name: 'legend-number', extra: {} }),
  ]
}

/* ------------------------------------------------------------------ *
 * The page
 * ------------------------------------------------------------------ */

export function buildStonesPuzzle(options: {
  built: StonesBuilt
  plan: StonesPlan
  walk: StonesWalk
  level: StonesLevel
  /** `walk|level|path` — what the book remembers of this page. */
  label: string
  tag: StudioTag
  font: string
}): StudioFabricObject {
  const { built, plan, walk, level, label, tag, font } = options
  const { puzzle, values } = built
  const n = puzzle.size
  const N = n * n
  const parts: StudioFabricObject[] = []

  // The signpost: a double-ruled board with the walk's name.
  const sign = stonesSignBox(plan, walk, font)
  parts.push(part(buildRect({ ...sign, rx: 10, ry: 10, fill: 'transparent', stroke: STUDIO_INK, strokeWidth: 2 }, tag), 'sign'))
  parts.push(
    part(
      buildRect({ left: sign.left + 5, top: sign.top + 5, width: sign.width - 10, height: sign.height - 10, rx: 6, ry: 6, fill: 'transparent', stroke: STUDIO_INK, strokeWidth: 1 }, tag),
      'sign',
    ),
  )
  const signText = stonesSignText(walk, plan.signLines)
  parts.push(
    part(
      buildText(
        {
          left: r2(sign.left + sign.width / 2),
          top: r2(sign.top + (sign.height - stonesLineHeight(plan.signSize, plan.signLines)) / 2),
          text: signText,
          fontFamily: font,
          fontSize: plan.signSize,
          fontWeight: 700,
          lineHeight: 1,
          // As wide as the band allows round the board's centre: the name is
          // centred either way, and a font that sets a little wider than
          // measured runs past the board's padding instead of wrapping.
          width: Math.max(stonesTextWidth(signText, plan.signSize, stonesSignSpec(font)), stonesSignTextRoom(plan, sign)),
          textAlign: 'center',
          originX: 'center',
        },
        tag,
        'prompt',
      ),
      'sign-text',
    ),
  )

  // The trail, hidden until the answer page: under the stones, so it runs through each one.
  const order = stonesPathOrder(n, values) ?? []
  const trail = stonesTrailShapes(plan, order)
  const trailPts = trail.flat()
  parts.push(
    part(
      pathOf({
        commands: trail.flatMap((shape) => [...shape.map(([x, y], i) => [i === 0 ? 'M' : 'L', x, y]), ['Z']]),
        bounds: [
          r2(Math.min(...trailPts.map(([x]) => x))),
          r2(Math.min(...trailPts.map(([, y]) => y))),
          r2(Math.max(...trailPts.map(([x]) => x))),
          r2(Math.max(...trailPts.map(([, y]) => y))),
        ],
        fill: STONES_TRAIL_FILL,
        strokeWidth: 0,
        tag,
        role: 'answer',
      }),
      'trail',
      { walk: order.join(',') },
    ),
  )

  // The stones, a row at a time.
  for (let r = 0; r < n; r++) {
    const boxes = Array.from({ length: n }, (_, c) => stonesStoneBox(plan, r, c))
    parts.push(
      part(
        pathOf({ commands: boxes.flatMap((b) => roundedBox(b, plan.radius)), bounds: boundsOf(boxes), fill: 'transparent', strokeWidth: STUDIO_STROKE_HAIRLINE, tag, role: 'prompt' }),
        'stones',
        { row: r, stones: n },
      ),
    )
  }

  // The start and the finish, ringed twice.
  for (const v of [1, N]) {
    const s = order[v - 1]!
    const row = Math.floor(s / n)
    const col = s % n
    parts.push(...endRings(stonesStoneBox(plan, row, col), plan.radius, tag, 'end', { row, col, n: v }))
  }

  // The numbers: the printed ones bold, the rest written in, plain, on the answer page.
  for (let s = 0; s < N; s++) {
    const row = Math.floor(s / n)
    const col = s % n
    const [cx, cy] = stonesCentre(plan, row, col)
    const given = puzzle.clues[s] !== STONES_BLANK
    parts.push(
      numberText({
        value: values[s]!,
        cx,
        cy,
        size: plan.digitSize,
        weight: given ? 700 : 400,
        tag,
        role: given ? 'prompt' : 'answer',
        name: given ? 'given' : 'answer',
        extra: { row, col },
      }),
    )
  }

  // The legend: two stones in a row and what "next" means, then the start stone.
  const legend = stonesLegendBox(plan, font)
  const [nextItem] = stonesLegendItemWidths(font)
  const rowHeight = stonesLegendRowHeight()
  const rowMid = (row: number) => legend.top + row * (rowHeight + STONES_LEGEND_ROW_GAP) + rowHeight / 2
  const words = (text: string, x: number, midY: number, extra: Record<string, unknown>) =>
    part(
      buildText(
        {
          left: r2(x),
          top: r2(midY - stonesLineHeight(plan.legendSize) / 2),
          text,
          fontFamily: font,
          fontSize: plan.legendSize,
          lineHeight: 1,
          width: stonesTextWidth(text, plan.legendSize, stonesLegendSpec(font)),
        },
        tag,
        'prompt',
      ),
      'legend-text',
      extra,
    )
  const icon = STONES_LEGEND_ICON
  let x = legend.left
  let midY = rowMid(0)
  const pairWidth = icon * 2 + STONES_LEGEND_PAIR_GAP
  parts.push(...legendPair({ left: x, top: midY - icon / 2, width: pairWidth, height: icon }, plan.legendSize, tag))
  parts.push(words(STONES_NEXT_WORD, x + pairWidth + STONES_LEGEND_ICON_GAP, midY, { entry: 'next' }))
  if (plan.legendRows === 1) x += nextItem + STONES_LEGEND_ITEM_GAP
  else midY = rowMid(1)
  parts.push(...legendEnd({ left: x, top: midY - icon / 2, width: icon, height: icon }, plan.legendSize, tag))
  parts.push(words(STONES_ENDS_WORD, x + icon + STONES_LEGEND_ICON_GAP, midY, { entry: 'ends' }))

  const top = plan.block.top
  const bottom = plan.legendTop + plan.legendHeight
  const left = Math.min(sign.left, legend.left, plan.grid.left)
  const right = Math.max(sign.left + sign.width, legend.left + legend.width, plan.grid.left + plan.grid.width)
  const group = buildGroup(parts, { left, top, width: right - left, height: bottom - top }, tag, 'prompt')
  return {
    ...group,
    data: {
      source: STONES_TEMPLATE_KEY,
      [STONES_PART_KEY]: 'puzzle',
      walk: walk.name,
      level,
      size: `${n}x${n}`,
      [STUDIO_CONTENT_LABEL_KEY]: label,
      // The same numbers, however the path is turned or walked, are the same puzzle wherever they sit.
      [STUDIO_CANONICAL_KEY]: `${STONES_TEMPLATE_KEY}:${built.signature}`,
    },
  }
}
