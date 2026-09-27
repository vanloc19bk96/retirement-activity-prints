import type { StudioFabricObject, StudioRole } from '@/types/studio-template.types'
import { STUDIO_DIGIT_FONT, STUDIO_INK, STUDIO_PAPER, STUDIO_RULE_MEDIUM } from '@/constants/studio.constants'
import { STUDIO_CANONICAL_KEY } from '../_shared/uniqueness'
import { buildGroup, buildRect, buildText, nextObjectId, type StudioTag } from '../studio-fabric-builders'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import type { Box } from '../studio-layout'
import {
  NEIGHBORS_BLOCK_WORD,
  NEIGHBORS_LEGEND_BLOCK,
  NEIGHBORS_LEGEND_TWIN,
  NEIGHBORS_TEMPLATE_KEY,
  NEIGHBORS_TOUCH_WORD,
  neighborsSignText,
  type NeighborsLevel,
  type NeighborsStreet,
} from './content'
import {
  NEIGHBORS_BLOCK_STROKE,
  NEIGHBORS_HOUSE_STROKE,
  NEIGHBORS_LEGEND_BLOCK_WIDTH,
  NEIGHBORS_LEGEND_HOUSE,
  NEIGHBORS_LEGEND_ICON_GAP,
  NEIGHBORS_LEGEND_ITEM_GAP,
  NEIGHBORS_LEGEND_ROW_GAP,
  NEIGHBORS_LEGEND_STREET,
  NEIGHBORS_LEGEND_TWIN_STREET,
  NEIGHBORS_LEGEND_TWIN_WIDTH,
  neighborsDigitSpec,
  neighborsLegendItemWidths,
  neighborsLegendRowHeight,
  neighborsLegendSpec,
  neighborsLegendWidth,
  neighborsLineHeight,
  neighborsSignSpec,
  neighborsSignWidth,
  neighborsTextWidth,
  type NeighborsPlan,
} from './layout'
import type { NeighborsBuilt } from './puzzle'
import { NEIGHBORS_BLANK, neighborsBlockCells } from './solver'

/**
 * A planned town → one Fabric group: the street's sign, the town's blocks
 * (rounded outlines with a street between every two, fine lines between the
 * houses of a block), the printed numbers, the answer hidden for the answer
 * page, and the legend.
 *
 * The puzzle page is black on white — bold block outlines, fine gray lines
 * between houses and bold numbers on a few, so pencilled numbers read
 * clearly. On the answer page the town becomes a map: the streets between
 * the blocks are paved a soft gray, and every missing number is written in
 * (the printed ones stay bold, the found ones plain). Black and one gray
 * only, so it prints the same on any interior.
 */

/** Marks the objects a Friendly Neighbors page draws, for checks and the editor. */
export const NEIGHBORS_PART_KEY = 'neighborsPart'

/** The paved streets: a soft gray, dark enough to print, light enough beside black numbers. */
export const NEIGHBORS_STREET_FILL = '#DDDDDD'

/** The legend's cross over two touching houses that may not match. */
const CROSS_STROKE = 2.5

const r2 = (n: number) => Math.round(n * 100) / 100

type Pt = readonly [number, number]
type Cmd = (string | number)[]

function part(obj: StudioFabricObject, name: string, extra: Record<string, unknown> = {}): StudioFabricObject {
  return { ...obj, data: { ...(obj.data ?? {}), [NEIGHBORS_PART_KEY]: name, ...extra } }
}

/**
 * One path of drawing commands in canvas px, placed by its own bounds.
 * Answer paths start hidden; the answer key reveals them, keeping their
 * fill (the paved streets have no stroke, so they stay gray).
 */
function pathOf(options: {
  commands: readonly Cmd[]
  bounds: readonly [number, number, number, number]
  fill: string
  stroke?: string
  strokeWidth: number
  tag: StudioTag
  role: StudioRole
}): StudioFabricObject {
  const { commands, bounds, fill, stroke = STUDIO_INK, strokeWidth, tag, role } = options
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
    stroke,
    strokeWidth,
    strokeUniform: true,
    strokeLineCap: 'round',
    strokeLineJoin: 'round',
    objectId: nextObjectId(tag.instanceId),
    studioTemplateKey: tag.templateKey,
    studioInstanceId: tag.instanceId,
    studioPageRole: tag.pageRole,
    studioRole: role,
    // The answer stays hidden on the puzzle page; the answer key reveals it.
    ...(role === 'answer' ? { visible: false } : {}),
  }
}

/** The bounds of a set of points, as [minX, minY, maxX, maxY]. */
function boundsOfPoints(points: readonly Pt[]): [number, number, number, number] {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of points) {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  return [r2(minX), r2(minY), r2(maxX), r2(maxY)]
}

/* ------------------------------------------------------------------ *
 * Geometry of a town
 * ------------------------------------------------------------------ */

/** Where a town of blocks is drawn: its top-left corner, pitch, street and corners. */
export interface NeighborsGeometry {
  left: number
  top: number
  cell: number
  street: number
  /** A block's rounded outer corner. */
  radius: number
  /** A block's rounded inner corner (never wider than half a street). */
  inner: number
}

/** The block a house belongs to, or -1 off the town. */
export type NeighborsBlockAt = (row: number, col: number) => number

export const neighborsGeometryOf = (plan: NeighborsPlan): NeighborsGeometry => ({
  left: plan.grid.left,
  top: plan.grid.top,
  cell: plan.cell,
  street: plan.street,
  radius: plan.radius,
  inner: plan.inner,
})

/** A town's blocks as a lookup, -1 off the town. */
export function neighborsBlockAtOf(n: number, blocks: readonly number[]): NeighborsBlockAt {
  return (r, c) => (r >= 0 && r < n && c >= 0 && c < n ? blocks[r * n + c]! : -1)
}

/** The centre of the house at (row, col): on the town's pitch, streets or not. */
export function neighborsCentre(geo: NeighborsGeometry, row: number, col: number): Pt {
  return [geo.left + (col + 0.5) * geo.cell, geo.top + (row + 0.5) * geo.cell]
}

/**
 * A block's outline, clockwise on the page, corner by corner.
 *
 * Every house is cut into a 3 × 3 patch: half a street, the house, half a
 * street, across and down. The house's middle is always the block's; a side
 * strip is the block's when the neighbour that way is too (so there is no
 * street between them), and a corner patch when the three houses round that
 * corner are. The outline runs round those patches: the block's houses
 * joined, with half a street kept clear all round it. A block of five
 * houses or fewer has no hole, so this is one loop.
 */
export function neighborsBlockOutline(geo: NeighborsGeometry, blockAt: NeighborsBlockAt, block: number, houses: readonly (readonly [number, number])[]): Pt[] {
  const half = geo.street / 2
  const offsets = [0, half, geo.cell - half]
  const X = (C: number) => geo.left + Math.floor(C / 3) * geo.cell + offsets[C % 3]!
  const Y = (R: number) => geo.top + Math.floor(R / 3) * geo.cell + offsets[R % 3]!
  const same = (r: number, c: number) => blockAt(r, c) === block
  const filled = (R: number, C: number) => {
    if (R < 0 || C < 0) return false
    const r = Math.floor(R / 3)
    const c = Math.floor(C / 3)
    if (!same(r, c)) return false
    const dr = (R % 3) - 1
    const dc = (C % 3) - 1
    if (dr !== 0 && !same(r + dr, c)) return false
    if (dc !== 0 && !same(r, c + dc)) return false
    return !(dr !== 0 && dc !== 0 && !same(r + dr, c + dc))
  }
  // Every patch edge with open ground beyond it, run clockwise: along the top left to right, and so on.
  const key = (C: number, R: number) => `${C},${R}`
  const next = new Map<string, readonly [number, number]>()
  for (const [r, c] of houses) {
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const R = r * 3 + i
        const C = c * 3 + j
        if (!filled(R, C)) continue
        if (!filled(R - 1, C)) next.set(key(C, R), [C + 1, R])
        if (!filled(R, C + 1)) next.set(key(C + 1, R), [C + 1, R + 1])
        if (!filled(R + 1, C)) next.set(key(C + 1, R + 1), [C, R + 1])
        if (!filled(R, C - 1)) next.set(key(C, R + 1), [C, R])
      }
    }
  }
  const first = next.keys().next().value
  if (first === undefined) return []
  const loop: [number, number][] = []
  let at = first.split(',').map(Number) as [number, number]
  for (let guard = 0; guard <= next.size; guard++) {
    loop.push(at)
    const to = next.get(key(at[0], at[1]))
    if (!to) break
    at = [to[0], to[1]]
    if (key(at[0], at[1]) === first) break
  }
  // Only the corners: drop points where the outline runs straight on.
  const corners = loop.filter((p, i) => {
    const a = loop[(i - 1 + loop.length) % loop.length]!
    const b = loop[(i + 1) % loop.length]!
    return (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]) !== 0
  })
  return corners.map(([C, R]) => [X(C), Y(R)] as const)
}

/**
 * A closed outline with its corners rounded: outer corners by `radius`,
 * inner corners by `inner`, and never more than half of either side.
 */
export function neighborsRoundedOutline(points: readonly Pt[], radius: number, inner: number): Cmd[] {
  const k = points.length
  if (k < 3) return []
  const corners = points.map((p, i) => {
    const a = points[(i - 1 + k) % k]!
    const b = points[(i + 1) % k]!
    const inLen = Math.hypot(p[0] - a[0], p[1] - a[1])
    const outLen = Math.hypot(b[0] - p[0], b[1] - p[1])
    const din = [(p[0] - a[0]) / inLen, (p[1] - a[1]) / inLen] as const
    const dout = [(b[0] - p[0]) / outLen, (b[1] - p[1]) / outLen] as const
    // Clockwise on the page (y runs down), an outer corner turns right.
    const outer = din[0] * dout[1] - din[1] * dout[0] > 0
    const r = Math.min(outer ? radius : inner, inLen / 2, outLen / 2)
    return { from: [p[0] - din[0] * r, p[1] - din[1] * r] as const, at: p, to: [p[0] + dout[0] * r, p[1] + dout[1] * r] as const }
  })
  const out: Cmd[] = [['M', corners[k - 1]!.to[0], corners[k - 1]!.to[1]]]
  for (const c of corners) {
    out.push(['L', c.from[0], c.from[1]])
    out.push(['Q', c.at[0], c.at[1], c.to[0], c.to[1]])
  }
  out.push(['Z'])
  return out
}

/**
 * The fine lines between the houses of a block: one on every side two
 * houses of the same block share, running as far as the block does (to
 * half a street short of its edge, or on into the next pair).
 */
export function neighborsHouseLines(geo: NeighborsGeometry, blockAt: NeighborsBlockAt, rows: number, cols: number): [Pt, Pt][] {
  const half = geo.street / 2
  const lines: [Pt, Pt][] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const b = blockAt(r, c)
      const x0 = geo.left + c * geo.cell
      const y0 = geo.top + r * geo.cell
      if (c + 1 < cols && blockAt(r, c + 1) === b) {
        const x = x0 + geo.cell
        const up = blockAt(r - 1, c) === b && blockAt(r - 1, c + 1) === b
        const down = blockAt(r + 1, c) === b && blockAt(r + 1, c + 1) === b
        lines.push([
          [x, y0 + (up ? 0 : half)],
          [x, y0 + geo.cell - (down ? 0 : half)],
        ])
      }
      if (r + 1 < rows && blockAt(r + 1, c) === b) {
        const y = y0 + geo.cell
        const left = blockAt(r, c - 1) === b && blockAt(r + 1, c - 1) === b
        const right = blockAt(r, c + 1) === b && blockAt(r + 1, c + 1) === b
        lines.push([
          [x0 + (left ? 0 : half), y],
          [x0 + geo.cell - (right ? 0 : half), y],
        ])
      }
    }
  }
  return lines
}

/** Every block of a town as outlines, and the lines between houses, ready to draw. */
function townPaths(geo: NeighborsGeometry, blockAt: NeighborsBlockAt, rows: number, cols: number) {
  const houses = new Map<number, [number, number][]>()
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const b = blockAt(r, c)
      if (b < 0) continue
      if (!houses.has(b)) houses.set(b, [])
      houses.get(b)!.push([r, c])
    }
  }
  const outlines = [...houses].map(([b, list]) => neighborsBlockOutline(geo, blockAt, b, list))
  return { outlines, lines: neighborsHouseLines(geo, blockAt, rows, cols) }
}

/** The blocks' outlines and the lines between houses, as two paths. */
function drawTown(geo: NeighborsGeometry, blockAt: NeighborsBlockAt, rows: number, cols: number, tag: StudioTag, extra: Record<string, unknown>, names: [string, string]) {
  const { outlines, lines } = townPaths(geo, blockAt, rows, cols)
  const out: StudioFabricObject[] = []
  // Filled white, so on the answer page the gray shows only in the streets.
  out.push(
    part(
      pathOf({
        commands: outlines.flatMap((o) => neighborsRoundedOutline(o, geo.radius, geo.inner)),
        bounds: boundsOfPoints(outlines.flat()),
        fill: STUDIO_PAPER,
        strokeWidth: NEIGHBORS_BLOCK_STROKE,
        tag,
        role: 'prompt',
      }),
      names[0],
      { ...extra, count: outlines.length },
    ),
  )
  if (lines.length > 0) {
    out.push(
      part(
        pathOf({
          commands: lines.flatMap(([a, b]) => [
            ['M', a[0], a[1]],
            ['L', b[0], b[1]],
          ]),
          bounds: boundsOfPoints(lines.flat()),
          fill: 'transparent',
          stroke: STUDIO_RULE_MEDIUM,
          strokeWidth: NEIGHBORS_HOUSE_STROKE,
          tag,
          role: 'prompt',
        }),
        names[1],
        { ...extra, count: lines.length },
      ),
    )
  }
  return out
}

/* ------------------------------------------------------------------ *
 * Placement
 * ------------------------------------------------------------------ */

/** The sign's box for this street, centred over the town and kept on the panel. */
export function neighborsSignBox(plan: NeighborsPlan, street: NeighborsStreet, font: string): Box {
  const width = Math.min(plan.signBand.width, neighborsSignWidth(neighborsSignText(street, plan.signLines), plan.signSize, font))
  const centre = plan.grid.left + plan.grid.width / 2
  const left = Math.max(plan.signBand.left, Math.min(centre - width / 2, plan.signBand.left + plan.signBand.width - width))
  return { left: r2(left), top: plan.signBand.top, width, height: plan.signBand.height }
}

/** The widest the sign's words may set, centred on the board and kept inside its band. */
export function neighborsSignTextRoom(plan: NeighborsPlan, sign: Box): number {
  const centre = sign.left + sign.width / 2
  const band = plan.signBand
  return Math.floor(2 * Math.min(centre - band.left, band.left + band.width - centre))
}

/** Where the legend runs: centred under the town and kept on the panel. */
export function neighborsLegendBox(plan: NeighborsPlan, font: string): Box {
  const width = neighborsLegendWidth(font, plan.legendRows)
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
      width: Math.max(Math.ceil(size * 1.1), neighborsTextWidth(text, size, neighborsDigitSpec(weight))),
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

/* ------------------------------------------------------------------ *
 * The legend's icons
 * ------------------------------------------------------------------ */

/** Three houses in a row, one block, numbered 1, 2, 3. */
function legendBlock(box: Box, legendSize: number, tag: StudioTag): StudioFabricObject[] {
  const house = NEIGHBORS_LEGEND_HOUSE
  const geo: NeighborsGeometry = { left: box.left, top: box.top, cell: house, street: NEIGHBORS_LEGEND_STREET, radius: Math.round(house * 0.2), inner: NEIGHBORS_LEGEND_STREET / 2 }
  const count = NEIGHBORS_LEGEND_BLOCK.length
  return [
    ...drawTown(geo, (r, c) => (r === 0 && c >= 0 && c < count ? 0 : -1), 1, count, tag, {}, ['legend-block', 'legend-lines']),
    ...NEIGHBORS_LEGEND_BLOCK.map((v, c) => {
      const [cx, cy] = neighborsCentre(geo, 0, c)
      return numberText({ value: v, cx, cy, size: legendSize, weight: 700, tag, role: 'prompt', name: 'legend-number', extra: {} })
    }),
  ]
}

/** Two houses side by side, in blocks of their own a street apart, both numbered 2 — and crossed out. */
function legendTwins(box: Box, legendSize: number, tag: StudioTag): StudioFabricObject[] {
  const street = NEIGHBORS_LEGEND_TWIN_STREET
  const house = NEIGHBORS_LEGEND_HOUSE
  // Pitch is a house and a street; the town starts half a street outside the icon.
  const geo: NeighborsGeometry = { left: box.left - street / 2, top: box.top - street / 2, cell: house + street, street, radius: Math.round(house * 0.2), inner: street / 2 }
  // The cross stands in the street between them, reaching just onto each house.
  const [cx, cy] = [box.left + house + street / 2, box.top + house / 2]
  const arm = Math.round(street / 2 + 2)
  return [
    ...drawTown(geo, (r, c) => (r === 0 && (c === 0 || c === 1) ? c : -1), 1, 2, tag, {}, ['legend-twins', 'legend-lines']),
    ...[0, 1].map((c) => {
      const [x, y] = neighborsCentre(geo, 0, c)
      return numberText({ value: NEIGHBORS_LEGEND_TWIN, cx: x, cy: y, size: legendSize, weight: 700, tag, role: 'prompt', name: 'legend-number', extra: {} })
    }),
    part(
      pathOf({
        commands: [
          ['M', cx - arm, cy - arm],
          ['L', cx + arm, cy + arm],
          ['M', cx + arm, cy - arm],
          ['L', cx - arm, cy + arm],
        ],
        bounds: [cx - arm, cy - arm, cx + arm, cy + arm],
        fill: 'transparent',
        strokeWidth: CROSS_STROKE,
        tag,
        role: 'prompt',
      }),
      'legend-cross',
    ),
  ]
}

/* ------------------------------------------------------------------ *
 * The page
 * ------------------------------------------------------------------ */

export function buildNeighborsPuzzle(options: {
  built: NeighborsBuilt
  plan: NeighborsPlan
  street: NeighborsStreet
  level: NeighborsLevel
  /** `street|level|town` — what the book remembers of this page. */
  label: string
  tag: StudioTag
  font: string
}): StudioFabricObject {
  const { built, plan, street, level, label, tag, font } = options
  const { puzzle, values } = built
  const n = puzzle.size
  const parts: StudioFabricObject[] = []

  // The sign: a double-ruled board with the street's name.
  const sign = neighborsSignBox(plan, street, font)
  parts.push(part(buildRect({ ...sign, rx: 10, ry: 10, fill: 'transparent', stroke: STUDIO_INK, strokeWidth: 2 }, tag), 'sign'))
  parts.push(
    part(
      buildRect({ left: sign.left + 5, top: sign.top + 5, width: sign.width - 10, height: sign.height - 10, rx: 6, ry: 6, fill: 'transparent', stroke: STUDIO_INK, strokeWidth: 1 }, tag),
      'sign',
    ),
  )
  const signText = neighborsSignText(street, plan.signLines)
  parts.push(
    part(
      buildText(
        {
          left: r2(sign.left + sign.width / 2),
          top: r2(sign.top + (sign.height - neighborsLineHeight(plan.signSize, plan.signLines)) / 2),
          text: signText,
          fontFamily: font,
          fontSize: plan.signSize,
          fontWeight: 700,
          lineHeight: 1,
          // As wide as the band allows round the board's centre: the name is
          // centred either way, and a font that sets a little wider than
          // measured runs past the board's padding instead of wrapping.
          width: Math.max(neighborsTextWidth(signText, plan.signSize, neighborsSignSpec(font)), neighborsSignTextRoom(plan, sign)),
          textAlign: 'center',
          originX: 'center',
        },
        tag,
        'prompt',
      ),
      'sign-text',
    ),
  )

  // The streets, paved on the answer page only: gray under the white blocks, so it shows between them.
  const { left, top, width, height } = plan.grid
  parts.push(
    part(
      pathOf({
        commands: [['M', left, top], ['L', left + width, top], ['L', left + width, top + height], ['L', left, top + height], ['Z']],
        bounds: [left, top, left + width, top + height],
        fill: NEIGHBORS_STREET_FILL,
        strokeWidth: 0,
        tag,
        role: 'answer',
      }),
      'streets',
    ),
  )

  // The blocks and the lines between their houses.
  const geo = neighborsGeometryOf(plan)
  parts.push(...drawTown(geo, neighborsBlockAtOf(n, puzzle.blocks), n, n, tag, { blocks: puzzle.blocks.join(',') }, ['blocks', 'houses']))

  // The numbers: the printed ones bold, the rest written in, plain, on the answer page.
  for (let s = 0; s < n * n; s++) {
    const row = Math.floor(s / n)
    const col = s % n
    const [cx, cy] = neighborsCentre(geo, row, col)
    const given = puzzle.clues[s] !== NEIGHBORS_BLANK
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

  // The legend: a block of three and what it holds, then two neighbours that may not match.
  const legend = neighborsLegendBox(plan, font)
  const [blockItem] = neighborsLegendItemWidths(font)
  const rowHeight = neighborsLegendRowHeight()
  const rowMid = (row: number) => legend.top + row * (rowHeight + NEIGHBORS_LEGEND_ROW_GAP) + rowHeight / 2
  const words = (text: string, x: number, midY: number, extra: Record<string, unknown>) =>
    part(
      buildText(
        {
          left: r2(x),
          top: r2(midY - neighborsLineHeight(plan.legendSize) / 2),
          text,
          fontFamily: font,
          fontSize: plan.legendSize,
          lineHeight: 1,
          width: neighborsTextWidth(text, plan.legendSize, neighborsLegendSpec(font)),
        },
        tag,
        'prompt',
      ),
      'legend-text',
      extra,
    )
  let x = legend.left
  let midY = rowMid(0)
  const house = NEIGHBORS_LEGEND_HOUSE
  parts.push(...legendBlock({ left: x, top: midY - house / 2, width: NEIGHBORS_LEGEND_BLOCK_WIDTH, height: house }, plan.legendSize, tag))
  parts.push(words(NEIGHBORS_BLOCK_WORD, x + NEIGHBORS_LEGEND_BLOCK_WIDTH + NEIGHBORS_LEGEND_ICON_GAP, midY, { entry: 'block' }))
  if (plan.legendRows === 1) x += blockItem + NEIGHBORS_LEGEND_ITEM_GAP
  else midY = rowMid(1)
  const twin = NEIGHBORS_LEGEND_TWIN_WIDTH
  parts.push(...legendTwins({ left: x, top: midY - house / 2, width: twin, height: house }, plan.legendSize, tag))
  parts.push(words(NEIGHBORS_TOUCH_WORD, x + twin + NEIGHBORS_LEGEND_ICON_GAP, midY, { entry: 'touch' }))

  const groupTop = plan.block.top
  const bottom = plan.legendTop + plan.legendHeight
  const groupLeft = Math.min(sign.left, legend.left, plan.grid.left)
  const right = Math.max(sign.left + sign.width, legend.left + legend.width, plan.grid.left + plan.grid.width)
  const group = buildGroup(parts, { left: groupLeft, top: groupTop, width: right - groupLeft, height: bottom - groupTop }, tag, 'prompt')
  return {
    ...group,
    data: {
      source: NEIGHBORS_TEMPLATE_KEY,
      [NEIGHBORS_PART_KEY]: 'puzzle',
      street: street.name,
      level,
      size: `${n}x${n}`,
      blocks: neighborsBlockCells(puzzle).length,
      [STUDIO_CONTENT_LABEL_KEY]: label,
      // The same blocks and numbers, however the town is turned, are the same puzzle wherever they sit.
      [STUDIO_CANONICAL_KEY]: `${NEIGHBORS_TEMPLATE_KEY}:${built.signature}`,
    },
  }
}
