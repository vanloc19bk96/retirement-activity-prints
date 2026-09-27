import type { StudioFabricObject, StudioRole } from '@/types/studio-template.types'
import { STUDIO_INK, STUDIO_PAPER, STUDIO_RULE_MEDIUM, STUDIO_STROKE_BOLD, STUDIO_STROKE_HAIRLINE, STUDIO_STROKE_NORMAL } from '@/constants/studio.constants'
import { STUDIO_CANONICAL_KEY } from '../_shared/uniqueness'
import { buildGroup, buildRect, buildText, nextObjectId, type StudioTag } from '../studio-fabric-builders'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import { drawGridLines } from '../studio-grid-rules'
import type { Box } from '../studio-layout'
import { PEARL_BLACK_WORD, PEARL_TEMPLATE_KEY, PEARL_WHITE_WORD, pearlSignText, type PearlLevel, type PearlNecklace } from './content'
import {
  PEARL_FRAME,
  PEARL_LEGEND_ICON,
  PEARL_LEGEND_ICON_GAP,
  PEARL_LEGEND_ITEM_GAP,
  PEARL_LEGEND_ROW_GAP,
  PEARL_RADIUS_OF_CELL,
  pearlLegendItemWidths,
  pearlLegendRowHeight,
  pearlLegendSpec,
  pearlLegendWidth,
  pearlLineHeight,
  pearlSignSpec,
  pearlSignWidth,
  pearlTextWidth,
  type PearlPlan,
} from './layout'
import type { PearlBuilt } from './puzzle'
import { PEARL_BLACK, PEARL_WHITE, isPearl, pearlAnswerKey, pearlLoopOrder } from './solver'

/**
 * A planned board → one Fabric group: the necklace's name board, the softly
 * ruled squares, the pearls, the heavy frame, the finished necklace hidden
 * for the answer page, and the legend.
 *
 * The puzzle page is black on white — nothing in the squares but the
 * pearls, so a pencilled loop reads clearly. Each pearl carries a small
 * shine, so it reads as a pearl and not a dot. On the answer page the loop
 * becomes the necklace itself: a smooth black cord through every square it
 * visits, rounding each turn, with a small white bead strung on every
 * square between the pearls. Black, white and one gray only, so it prints
 * the same on any interior.
 */

/** Marks the objects a String of Pearls page draws, for checks and the editor. */
export const PEARL_PART_KEY = 'pearlPart'

/** The shine on a white pearl: a soft gray. */
export const PEARL_SHINE_GRAY = STUDIO_RULE_MEDIUM
/** The cord's weight, as a share of a square (never under 3 px). */
const CORD_OF_CELL = 0.09
/** How far before a turn the cord starts to round it, as a share of a square. */
const BEND_OF_CELL = 0.4
/** A bead's radius, as a share of a square. */
const BEAD_OF_CELL = 0.12

const r2 = (n: number) => Math.round(n * 100) / 100

type Pt = readonly [number, number]

function part(obj: StudioFabricObject, name: string, extra: Record<string, unknown> = {}): StudioFabricObject {
  return { ...obj, data: { ...(obj.data ?? {}), [PEARL_PART_KEY]: name, ...extra } }
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
  stroke?: string
  strokeWidth: number
  tag: StudioTag
  role: StudioRole
}): StudioFabricObject {
  const { lines, close, fill, stroke = STUDIO_INK, strokeWidth, tag, role } = options
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
    // The necklace stays hidden on the puzzle page; the answer key reveals it.
    ...(role === 'answer' ? { visible: false } : {}),
  }
}

const circle = (cx: number, cy: number, r: number, steps = 28): Pt[] =>
  Array.from({ length: steps }, (_, k) => {
    const a = (k / steps) * Math.PI * 2
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const
  })

/** An arc of a circle, from one angle to another (degrees, canvas y running down). */
const arc = (cx: number, cy: number, r: number, fromDeg: number, toDeg: number, steps = 8): Pt[] =>
  Array.from({ length: steps + 1 }, (_, k) => {
    const a = ((fromDeg + ((toDeg - fromDeg) * k) / steps) * Math.PI) / 180
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const
  })

/* ------------------------------------------------------------------ *
 * A pearl
 * ------------------------------------------------------------------ */

/**
 * A pearl centred at (cx, cy): a white pearl is a white ball in a black
 * ring with a gray shine; a black pearl is a solid black ball with a white
 * shine. The shine sits up and to the left, where the light falls.
 */
export function pearlParts(options: {
  cx: number
  cy: number
  radius: number
  color: number
  tag: StudioTag
  name: string
  extra?: Record<string, unknown>
}): StudioFabricObject[] {
  const { cx, cy, radius, color, tag, name, extra = {} } = options
  const ring = radius >= 14 ? STUDIO_STROKE_BOLD : STUDIO_STROKE_NORMAL
  const white = color === PEARL_WHITE
  const shine = arc(cx, cy, radius * 0.6, 195, 255)
  return [
    part(pathOf({ lines: [circle(cx, cy, radius)], close: true, fill: white ? STUDIO_PAPER : STUDIO_INK, strokeWidth: ring, tag, role: 'prompt' }), name, {
      color: white ? 'white' : 'black',
      ...extra,
    }),
    part(
      pathOf({
        lines: [shine],
        close: false,
        fill: 'transparent',
        stroke: white ? PEARL_SHINE_GRAY : STUDIO_PAPER,
        strokeWidth: Math.max(STUDIO_STROKE_HAIRLINE, Math.round(radius * 0.16 * 2) / 2),
        tag,
        role: 'prompt',
      }),
      `${name}-shine`,
      extra,
    ),
  ]
}

/* ------------------------------------------------------------------ *
 * The necklace
 * ------------------------------------------------------------------ */

export interface PearlStop {
  /** The square. */
  at: number
  /** Where the cord passes the square: its centre, or the middle of its bend. */
  x: number
  y: number
  turn: boolean
}

/**
 * The cord's line round the loop, rounding every turn, and where it passes
 * each square. Straight squares are passed through their centre; at a turn
 * the cord leaves the straight `BEND_OF_CELL` of a square before the centre
 * and sweeps round a quarter circle to the next side.
 */
export function pearlCord(plan: PearlPlan, n: number, links: readonly number[]): { line: Pt[]; stops: PearlStop[] } {
  const order = pearlLoopOrder(n, links) ?? []
  const { grid, cell } = plan
  const bend = cell * BEND_OF_CELL
  const line: Pt[] = []
  const stops: PearlStop[] = []
  const L = order.length
  const centre = (i: number): Pt => [grid.left + ((i % n) + 0.5) * cell, grid.top + (Math.floor(i / n) + 0.5) * cell]
  const dirOf = (a: number, b: number): Pt => {
    const [ax, ay] = centre(a)
    const [bx, by] = centre(b)
    return [Math.sign(bx - ax), Math.sign(by - ay)]
  }
  for (let k = 0; k < L; k++) {
    const at = order[k]!
    const [dx1, dy1] = dirOf(order[(k - 1 + L) % L]!, at)
    const [dx2, dy2] = dirOf(at, order[(k + 1) % L]!)
    const [cx, cy] = centre(at)
    if (dx1 === dx2 && dy1 === dy2) {
      line.push([cx, cy])
      stops.push({ at, x: cx, y: cy, turn: false })
      continue
    }
    // The bend's circle: centred `bend` back along the way in and `bend` on along the way out.
    const ox = cx - dx1 * bend + dx2 * bend
    const oy = cy - dy1 * bend + dy2 * bend
    const start = Math.atan2(cy - dy1 * bend - oy, cx - dx1 * bend - ox)
    const end = Math.atan2(cy + dy2 * bend - oy, cx + dx2 * bend - ox)
    let sweep = end - start
    if (sweep > Math.PI) sweep -= 2 * Math.PI
    if (sweep < -Math.PI) sweep += 2 * Math.PI
    const steps = 8
    for (let s = 0; s <= steps; s++) {
      const a = start + (sweep * s) / steps
      line.push([ox + bend * Math.cos(a), oy + bend * Math.sin(a)])
    }
    const mid = start + sweep / 2
    stops.push({ at, x: ox + bend * Math.cos(mid), y: oy + bend * Math.sin(mid), turn: true })
  }
  return { line, stops }
}

/* ------------------------------------------------------------------ *
 * Placement
 * ------------------------------------------------------------------ */

/** The name board's box for this necklace, centred over the grid and kept on the panel. */
export function pearlSignBox(plan: PearlPlan, necklace: PearlNecklace, font: string): Box {
  const width = Math.min(plan.signBand.width, pearlSignWidth(pearlSignText(necklace, plan.signLines), plan.signSize, font))
  const centre = plan.grid.left + plan.grid.width / 2
  const left = Math.max(plan.signBand.left, Math.min(centre - width / 2, plan.signBand.left + plan.signBand.width - width))
  return { left: r2(left), top: plan.signBand.top, width, height: plan.signBand.height }
}

/** The widest the board's words may set, centred on the board and kept inside its band. */
export function pearlSignTextRoom(plan: PearlPlan, sign: Box): number {
  const centre = sign.left + sign.width / 2
  const band = plan.signBand
  return Math.floor(2 * Math.min(centre - band.left, band.left + band.width - centre))
}

/** Where the legend runs: centred under the grid and kept on the panel. */
export function pearlLegendBox(plan: PearlPlan, font: string): Box {
  const width = pearlLegendWidth(font, plan.legendRows)
  const centre = plan.grid.left + plan.grid.width / 2
  const left = Math.max(plan.block.left, Math.min(centre - width / 2, plan.block.left + plan.block.width - width))
  return { left: r2(left), top: plan.legendTop, width, height: plan.legendHeight }
}

/** A pearl's radius at the plan's squares. */
export const pearlRadius = (plan: PearlPlan) => r2(plan.cell * PEARL_RADIUS_OF_CELL)

export function buildPearlPuzzle(options: {
  built: PearlBuilt
  plan: PearlPlan
  necklace: PearlNecklace
  level: PearlLevel
  /** `necklace|level|board` — what the book remembers of this page. */
  label: string
  tag: StudioTag
  font: string
}): StudioFabricObject {
  const { built, plan, necklace, level, label, tag, font } = options
  const { puzzle, links } = built
  const { grid, cell, size } = plan
  const n = puzzle.size
  const parts: StudioFabricObject[] = []

  // The name board: a double-ruled board with the necklace's name.
  const sign = pearlSignBox(plan, necklace, font)
  parts.push(part(buildRect({ ...sign, rx: 10, ry: 10, fill: 'transparent', stroke: STUDIO_INK, strokeWidth: 2 }, tag), 'sign'))
  parts.push(
    part(
      buildRect({ left: sign.left + 5, top: sign.top + 5, width: sign.width - 10, height: sign.height - 10, rx: 6, ry: 6, fill: 'transparent', stroke: STUDIO_INK, strokeWidth: 1 }, tag),
      'sign',
    ),
  )
  const signText = pearlSignText(necklace, plan.signLines)
  parts.push(
    part(
      buildText(
        {
          left: r2(sign.left + sign.width / 2),
          top: r2(sign.top + (sign.height - pearlLineHeight(plan.signSize, plan.signLines)) / 2),
          text: signText,
          fontFamily: font,
          fontSize: plan.signSize,
          fontWeight: 700,
          lineHeight: 1,
          // As wide as the band allows round the board's centre: the name is
          // centred either way, and a font that sets a little wider than
          // measured runs past the board's padding instead of wrapping.
          width: Math.max(pearlTextWidth(signText, plan.signSize, pearlSignSpec(font)), pearlSignTextRoom(plan, sign)),
          textAlign: 'center',
          originX: 'center',
        },
        tag,
        'prompt',
      ),
      'sign-text',
    ),
  )

  // The squares, softly ruled.
  for (const bar of drawGridLines(grid, cell, size, size, tag, { fill: STUDIO_RULE_MEDIUM, thickness: STUDIO_STROKE_HAIRLINE })) parts.push(part(bar, 'rule'))

  // The necklace, hidden until the answer page: the cord over the rules, a bead on every square between the pearls.
  const { line, stops } = pearlCord(plan, n, links)
  parts.push(
    part(pathOf({ lines: [line], close: true, fill: 'transparent', strokeWidth: Math.max(3, r2(cell * CORD_OF_CELL)), tag, role: 'answer' }), 'cord', {
      links: pearlAnswerKey(links),
    }),
  )
  const beadRadius = r2(cell * BEAD_OF_CELL)
  for (const stop of stops) {
    if (isPearl(puzzle.cells[stop.at]!)) continue
    parts.push(
      part(pathOf({ lines: [circle(stop.x, stop.y, beadRadius, 20)], close: true, fill: STUDIO_PAPER, strokeWidth: STUDIO_STROKE_HAIRLINE, tag, role: 'answer' }), 'bead', {
        row: Math.floor(stop.at / n),
        col: stop.at % n,
      }),
    )
  }

  // The pearls, over the cord, so on the answer page the necklace runs through them.
  const radius = pearlRadius(plan)
  for (let i = 0; i < n * n; i++) {
    const v = puzzle.cells[i]!
    if (!isPearl(v)) continue
    const row = Math.floor(i / n)
    const col = i % n
    parts.push(...pearlParts({ cx: grid.left + (col + 0.5) * cell, cy: grid.top + (row + 0.5) * cell, radius, color: v, tag, name: 'pearl', extra: { row, col } }))
  }

  // The frame, flush inside the board's edge.
  const w = PEARL_FRAME
  const frame = (box: Box) => part(buildRect({ ...box, fill: STUDIO_INK, stroke: 'transparent', strokeWidth: 0 }, tag), 'frame')
  parts.push(frame({ left: grid.left, top: grid.top, width: grid.width, height: w }))
  parts.push(frame({ left: grid.left, top: grid.top + grid.height - w, width: grid.width, height: w }))
  parts.push(frame({ left: grid.left, top: grid.top, width: w, height: grid.height }))
  parts.push(frame({ left: grid.left + grid.width - w, top: grid.top, width: w, height: grid.height }))

  // The legend: a white pearl and what it asks, then a black pearl and what it asks.
  const legend = pearlLegendBox(plan, font)
  const [whiteItem] = pearlLegendItemWidths(font)
  const rowHeight = pearlLegendRowHeight()
  const rowMid = (row: number) => legend.top + row * (rowHeight + PEARL_LEGEND_ROW_GAP) + rowHeight / 2
  const words = (text: string, x: number, midY: number, color: string) =>
    part(
      buildText(
        { left: r2(x), top: r2(midY - pearlLineHeight(plan.legendSize) / 2), text, fontFamily: font, fontSize: plan.legendSize, lineHeight: 1, width: pearlTextWidth(text, plan.legendSize, pearlLegendSpec(font)) },
        tag,
        'prompt',
      ),
      'legend-text',
      { color },
    )
  const icon = PEARL_LEGEND_ICON
  const iconRadius = icon / 2 - 1
  let x = legend.left
  let midY = rowMid(0)
  parts.push(...pearlParts({ cx: x + icon / 2, cy: midY, radius: iconRadius, color: PEARL_WHITE, tag, name: 'legend-pearl' }))
  parts.push(words(PEARL_WHITE_WORD, x + icon + PEARL_LEGEND_ICON_GAP, midY, 'white'))
  if (plan.legendRows === 1) x += whiteItem + PEARL_LEGEND_ITEM_GAP
  else midY = rowMid(1)
  parts.push(...pearlParts({ cx: x + icon / 2, cy: midY, radius: iconRadius, color: PEARL_BLACK, tag, name: 'legend-pearl' }))
  parts.push(words(PEARL_BLACK_WORD, x + icon + PEARL_LEGEND_ICON_GAP, midY, 'black'))

  const top = plan.block.top
  const bottom = plan.legendTop + plan.legendHeight
  const left = Math.min(sign.left, legend.left, grid.left)
  const right = Math.max(sign.left + sign.width, legend.left + legend.width, grid.left + grid.width)
  const group = buildGroup(parts, { left, top, width: right - left, height: bottom - top }, tag, 'prompt')
  return {
    ...group,
    data: {
      source: PEARL_TEMPLATE_KEY,
      [PEARL_PART_KEY]: 'puzzle',
      necklace: necklace.name,
      level,
      size: `${n}x${n}`,
      [STUDIO_CONTENT_LABEL_KEY]: label,
      // The same pearls, however the board is turned, are the same puzzle wherever they sit.
      [STUDIO_CANONICAL_KEY]: `${PEARL_TEMPLATE_KEY}:${built.signature}`,
    },
  }
}
