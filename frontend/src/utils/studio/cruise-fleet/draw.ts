import type { StudioFabricObject, StudioRole } from '@/types/studio-template.types'
import { STUDIO_DIGIT_FONT, STUDIO_INK, STUDIO_RULE_MEDIUM, STUDIO_STROKE_HAIRLINE, STUDIO_STROKE_NORMAL } from '@/constants/studio.constants'
import { STUDIO_CANONICAL_KEY } from '../_shared/uniqueness'
import { buildGroup, buildRect, buildText, nextObjectId, type StudioTag } from '../studio-fabric-builders'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import { drawGridLines } from '../studio-grid-rules'
import type { Box } from '../studio-layout'
import { CF_TEMPLATE_KEY, cfSignText, type CfHarbor, type CfLevel } from './content'
import {
  CF_FRAME,
  CF_LEGEND_ICON_GAP,
  CF_LEGEND_ITEM_GAP,
  CF_LEGEND_ROW_GAP,
  CF_LEGEND_SEG,
  CF_LEGEND_SIZE,
  cfLegendSpec,
  cfLineHeight,
  cfSignSpec,
  cfSignWidth,
  cfTextWidth,
  type CfLegendEntry,
  type CfPlan,
} from './layout'
import type { CfBuilt } from './puzzle'
import { cfShipSquares, type CfPiece, type CfShip } from './solver'

/**
 * A planned harbor → one Fabric group: the harbor's sign, the row and
 * column numbers, the softly ruled squares in a heavy frame, the fleet
 * hidden for the answer page, the squares shown to the reader, and the
 * legend.
 *
 * Black on white with one light gray, so it prints the same on any
 * interior. The squares shown are solid black ship pieces (a round rowboat,
 * a bow or stern rounded on its open end, a square middle) or a wave for
 * open water. On the answer page every ship sails in: a plain gray hull,
 * outlined in black, with the pieces the reader was shown still black on
 * top.
 */

/** Marks the objects a Cruise Fleet page draws, for checks and the editor. */
export const CF_PART_KEY = 'cfPart'

/** The answer page's hulls: light enough for the black shown pieces to stand out on them. */
export const CF_HULL = '#BDBDBD'
/** Ship pieces sit this share of a square in from its sides (a bow's open end runs to the edge). */
const INSET = 0.15

const r2 = (n: number) => Math.round(n * 100) / 100

type Pt = readonly [number, number]

function part(obj: StudioFabricObject, name: string, extra: Record<string, unknown> = {}): StudioFabricObject {
  return { ...obj, data: { ...(obj.data ?? {}), [CF_PART_KEY]: name, ...extra } }
}

/**
 * One path of polylines in canvas px: filled closed shapes, or open strokes
 * (waves) with no fill.
 */
function pathOf(options: { lines: readonly (readonly Pt[])[]; close: boolean; fill: string; strokeWidth: number; tag: StudioTag; role: StudioRole }): StudioFabricObject {
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
    // The fleet stays hidden on the puzzle page; the answer key reveals it.
    ...(role === 'answer' ? { visible: false } : {}),
  }
}

/* ------------------------------------------------------------------ *
 * Shapes, in a unit square (or a box)
 * ------------------------------------------------------------------ */

const arc = (cx: number, cy: number, r: number, from: number, to: number, steps = 14): Pt[] =>
  Array.from({ length: steps + 1 }, (_, k) => {
    const a = from + ((to - from) * k) / steps
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const
  })

const circle = (cx: number, cy: number, r: number, steps = 28): Pt[] => arc(cx, cy, r, 0, Math.PI * 2, steps).slice(0, steps)

/** A hull: a box with fully rounded ends, lying the long way. */
function stadium(box: Box): Pt[] {
  const { left, top, width, height } = box
  if (width >= height) {
    const r = height / 2
    return [...arc(left + width - r, top + r, r, -Math.PI / 2, Math.PI / 2), ...arc(left + r, top + r, r, Math.PI / 2, (Math.PI * 3) / 2)]
  }
  const r = width / 2
  return [...arc(left + r, top + height - r, r, 0, Math.PI), ...arc(left + r, top + r, r, Math.PI, Math.PI * 2)]
}

/** The stern of a ship that runs on to the right: rounded on the left, open to the square's right edge. */
const LEFT_END: readonly Pt[] = [...arc(0.5, 0.5, 0.5 - INSET, Math.PI / 2, (Math.PI * 3) / 2), [1, INSET], [1, 1 - INSET]]

/** A shown piece in a unit square. */
function pieceShape(piece: Exclude<CfPiece, 'water'>): readonly Pt[] {
  switch (piece) {
    case 'single':
      return circle(0.5, 0.5, 0.5 - INSET)
    case 'middle':
      return [
        [INSET, INSET],
        [1 - INSET, INSET],
        [1 - INSET, 1 - INSET],
        [INSET, 1 - INSET],
      ]
    case 'left':
      return LEFT_END
    case 'right':
      return LEFT_END.map(([u, v]) => [1 - u, v] as const)
    case 'top':
      return LEFT_END.map(([u, v]) => [v, u] as const)
    case 'bottom':
      return LEFT_END.map(([u, v]) => [v, 1 - u] as const)
  }
}

/** Two gentle waves across a unit square. */
const WAVES: readonly (readonly Pt[])[] = [0.4, 0.62].map((v) =>
  Array.from({ length: 25 }, (_, k) => {
    const u = 0.2 + (0.6 * k) / 24
    return [u, v + 0.06 * Math.sin((k / 24) * Math.PI * 3)] as const
  }),
)

const inBox = (shape: readonly Pt[], box: Box): Pt[] => shape.map(([u, v]) => [box.left + u * box.width, box.top + v * box.height] as const)

const weightFor = (side: number) => (side >= 36 ? STUDIO_STROKE_NORMAL : STUDIO_STROKE_HAIRLINE)

/** A square shown to the reader: a black ship piece, or waves for open water. */
function shownParts(piece: CfPiece, box: Box, tag: StudioTag, name: string, extra: Record<string, unknown> = {}): StudioFabricObject {
  const weight = weightFor(box.width)
  if (piece === 'water') {
    return part(pathOf({ lines: WAVES.map((w) => inBox(w, box)), close: false, fill: 'transparent', strokeWidth: weight + 0.5, tag, role: 'prompt' }), name, { piece, ...extra })
  }
  return part(pathOf({ lines: [inBox(pieceShape(piece), box)], close: true, fill: STUDIO_INK, strokeWidth: weight, tag, role: 'prompt' }), name, { piece, ...extra })
}

/** A ship: one plain hull, rounded at both ends, across its squares. */
function shipHull(options: { squares: Box; cell: number; fill: string; tag: StudioTag; role: StudioRole; name: string; extra?: Record<string, unknown> }): StudioFabricObject {
  const { squares, cell, fill, tag, role, name, extra = {} } = options
  const inset = cell * INSET
  const hull: Box = { left: squares.left + inset, top: squares.top + inset, width: squares.width - inset * 2, height: squares.height - inset * 2 }
  return part(pathOf({ lines: [stadium(hull)], close: true, fill, strokeWidth: weightFor(cell), tag, role }), name, extra)
}

/* ------------------------------------------------------------------ *
 * Placement
 * ------------------------------------------------------------------ */

/** The sign's box for this harbor, centred over the grid and kept on the panel. */
export function cfSignBox(plan: CfPlan, harbor: CfHarbor, font: string): Box {
  const width = Math.min(plan.signBand.width, cfSignWidth(cfSignText(harbor, plan.signLines), plan.signSize, font))
  const centre = plan.grid.left + plan.grid.width / 2
  const left = Math.max(plan.signBand.left, Math.min(centre - width / 2, plan.signBand.left + plan.signBand.width - width))
  return { left: r2(left), top: plan.signBand.top, width, height: plan.signBand.height }
}

/** The widest the sign's words may set, centred on the sign and kept inside its band. */
export function cfSignTextRoom(plan: CfPlan, sign: Box): number {
  const centre = sign.left + sign.width / 2
  const band = plan.signBand
  return Math.floor(2 * Math.min(centre - band.left, band.left + band.width - centre))
}

/** Where the legend runs: centred under the grid and kept on the panel. */
export function cfLegendBox(plan: CfPlan): Box {
  const { width, height, top } = plan.legend
  const centre = plan.grid.left + plan.grid.width / 2
  const left = Math.max(plan.block.left, Math.min(centre - width / 2, plan.block.left + plan.block.width - width))
  return { left: r2(left), top, width, height }
}

/** The box round a ship's squares. */
function shipBox(plan: CfPlan, ship: CfShip): Box {
  const n = plan.size
  const r = Math.floor(ship.at / n)
  const c = ship.at % n
  return {
    left: plan.grid.left + c * plan.cell,
    top: plan.grid.top + r * plan.cell,
    width: (ship.across ? ship.length : 1) * plan.cell,
    height: (ship.across ? 1 : ship.length) * plan.cell,
  }
}

function countNumber(n: number, x: number, y: number, size: number, tag: StudioTag, line: string): StudioFabricObject {
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
      },
      tag,
      'prompt',
    ),
    'count',
    { line, n },
  )
}

export function buildCfPuzzle(options: {
  built: CfBuilt
  plan: CfPlan
  harbor: CfHarbor
  level: CfLevel
  /** `harbor|level|fleet` — what the book remembers of this page. */
  label: string
  tag: StudioTag
  font: string
}): StudioFabricObject {
  const { built, plan, harbor, level, label, tag, font } = options
  const { puzzle, ships } = built
  const { grid, cell, size, countSize, countGap, rowCountWidth, colCountHeight } = plan
  const n = puzzle.size
  const parts: StudioFabricObject[] = []

  // The sign: a double-ruled board with the harbor's name.
  const sign = cfSignBox(plan, harbor, font)
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
  const signText = cfSignText(harbor, plan.signLines)
  parts.push(
    part(
      buildText(
        {
          left: r2(sign.left + sign.width / 2),
          top: r2(sign.top + (sign.height - cfLineHeight(plan.signSize, plan.signLines)) / 2),
          text: signText,
          fontFamily: font,
          fontSize: plan.signSize,
          fontWeight: 700,
          lineHeight: 1,
          // As wide as the band allows round the sign's centre: the name is
          // centred either way, and a font that sets a little wider than
          // measured runs past the board's padding instead of wrapping.
          width: Math.max(cfTextWidth(signText, plan.signSize, cfSignSpec(font)), cfSignTextRoom(plan, sign)),
          textAlign: 'center',
          originX: 'center',
        },
        tag,
        'prompt',
      ),
      'sign-text',
    ),
  )

  // The numbers: each row's to its left, each column's above it.
  for (let r = 0; r < n; r++) parts.push(countNumber(puzzle.rows[r]!, grid.left - countGap - rowCountWidth / 2, grid.top + (r + 0.5) * cell, countSize, tag, `r${r}`))
  for (let c = 0; c < n; c++) parts.push(countNumber(puzzle.cols[c]!, grid.left + (c + 0.5) * cell, grid.top - countGap - colCountHeight / 2, countSize, tag, `c${c}`))

  // Soft rules between every square, and the frame, flush inside the harbor's edge.
  for (const bar of drawGridLines(grid, cell, size, size, tag, { fill: STUDIO_RULE_MEDIUM, thickness: STUDIO_STROKE_HAIRLINE })) parts.push(part(bar, 'rule'))
  const frame = (box: Box) => part(buildRect({ ...box, fill: STUDIO_INK, stroke: 'transparent', strokeWidth: 0 }, tag), 'frame')
  parts.push(frame({ left: grid.left, top: grid.top, width: grid.width, height: CF_FRAME }))
  parts.push(frame({ left: grid.left, top: grid.top + grid.height - CF_FRAME, width: grid.width, height: CF_FRAME }))
  parts.push(frame({ left: grid.left, top: grid.top, width: CF_FRAME, height: grid.height }))
  parts.push(frame({ left: grid.left + grid.width - CF_FRAME, top: grid.top, width: CF_FRAME, height: grid.height }))

  // The fleet, hidden until the answer page, under the pieces the reader is shown.
  ships.forEach((ship, k) => {
    parts.push(
      shipHull({
        squares: shipBox(plan, ship),
        cell,
        fill: CF_HULL,
        tag,
        role: 'answer',
        name: 'ship',
        extra: { ship: k, squares: cfShipSquares(ship, n).join('.'), length: ship.length },
      }),
    )
  })

  // The squares shown to start the reader off.
  for (const g of puzzle.givens) {
    const row = Math.floor(g.at / n)
    const col = g.at % n
    parts.push(shownParts(g.piece, { left: grid.left + col * cell, top: grid.top + row * cell, width: cell, height: cell }, tag, 'given', { row, col }))
  }

  // The legend: every ship of the fleet to scale, how many, and the wave for open water.
  const legendPlan = plan.legend
  const legend = cfLegendBox(plan)
  legendPlan.rows.forEach((row, r) => {
    // Every row centred under the harbor, its entries side by side.
    let x = legend.left + (legend.width - row.width) / 2
    const midY = legend.top + r * (legendPlan.rowHeight + CF_LEGEND_ROW_GAP) + legendPlan.rowHeight / 2
    for (const k of row.items) {
      const entry: CfLegendEntry = legendPlan.entries[k]!
      legendEntry(entry, x, midY)
      x += entry.width + CF_LEGEND_ITEM_GAP
    }
  })
  function legendEntry(entry: CfLegendEntry, x: number, midY: number) {
    const seg = CF_LEGEND_SEG
    const iconTop = midY - seg / 2
    if (entry.kind === 'ship') {
      parts.push(
        shipHull({
          squares: { left: x, top: iconTop, width: seg * entry.length, height: seg },
          cell: seg,
          fill: STUDIO_INK,
          tag,
          role: 'prompt',
          name: 'legend-ship',
          extra: { length: entry.length },
        }),
      )
    } else {
      parts.push(shownParts('water', { left: x, top: iconTop, width: seg, height: seg }, tag, 'legend-water'))
    }
    parts.push(
      part(
        buildText(
          {
            left: r2(x + Math.max(1, entry.length) * seg + CF_LEGEND_ICON_GAP),
            top: r2(midY - cfLineHeight(CF_LEGEND_SIZE) / 2),
            text: entry.words,
            fontFamily: font,
            fontSize: CF_LEGEND_SIZE,
            lineHeight: 1,
            width: cfTextWidth(entry.words, CF_LEGEND_SIZE, cfLegendSpec(font)),
          },
          tag,
          'prompt',
        ),
        'legend-text',
        { kind: entry.kind, length: entry.length, count: entry.count },
      ),
    )
  }

  const rowNumbersLeft = grid.left - countGap - rowCountWidth
  const top = plan.block.top
  const bottom = legend.top + legend.height
  const left = Math.min(sign.left, legend.left, rowNumbersLeft)
  const right = Math.max(sign.left + sign.width, legend.left + legend.width, grid.left + grid.width)
  const group = buildGroup(parts, { left, top, width: right - left, height: bottom - top }, tag, 'prompt')
  return {
    ...group,
    data: {
      source: CF_TEMPLATE_KEY,
      [CF_PART_KEY]: 'puzzle',
      harbor: harbor.name,
      level,
      size: `${n}x${n}`,
      [STUDIO_CONTENT_LABEL_KEY]: label,
      // The same fleet, however the harbor is turned, is the same puzzle wherever it sits.
      [STUDIO_CANONICAL_KEY]: `${CF_TEMPLATE_KEY}:${built.signature}`,
    },
  }
}
