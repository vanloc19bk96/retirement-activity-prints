import type { StudioFabricObject, StudioRole } from '@/types/studio-template.types'
import { STUDIO_DIGIT_FONT, STUDIO_INK, STUDIO_RULE_MEDIUM, STUDIO_STROKE_BOLD, STUDIO_STROKE_HAIRLINE, STUDIO_STROKE_NORMAL } from '@/constants/studio.constants'
import { STUDIO_CANONICAL_KEY } from '../_shared/uniqueness'
import { buildGroup, buildRect, buildText, nextObjectId, type StudioTag } from '../studio-fabric-builders'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import { drawGridLines } from '../studio-grid-rules'
import type { Box } from '../studio-layout'
import { TT_LEGEND_WORD, TT_TEMPLATE_KEY, ttSignText, type TtLevel, type TtLine } from './content'
import {
  TT_FRAME,
  TT_LEGEND_ICON,
  TT_LEGEND_ICON_GAP,
  TT_LEGEND_SIZE,
  TT_LEGEND_WORD_GAP,
  ttLegendSpec,
  ttLineHeight,
  ttSignSpec,
  ttSignWidth,
  ttTextWidth,
  type TtPlan,
} from './layout'
import type { TtBuilt } from './puzzle'
import { TT_DIRS, TT_PIECES, ttDirBetween, ttRouteKey, type TtPiece, type TtPortal } from './solver'

/**
 * A planned board → one Fabric group: the line's station sign, the column
 * numbers above and the row numbers to the right, the softly ruled squares
 * in a heavy frame, the finished line hidden for the answer page, the
 * pieces printed for the reader, and the legend.
 *
 * Black on white with one light gray, so it prints the same on any
 * interior. A printed piece is drawn as real track: two rails and three
 * sleepers across them, straight or round a quarter turn, so the reader
 * sees at a glance which two sides of its square it joins. On the answer
 * page the whole line is laid: one smooth black line through every track
 * square, rounding each turn and running off the board where it enters and
 * leaves, with the printed pieces still on top.
 */

/** Marks the objects a Train Tracks page draws, for checks and the editor. */
export const TT_PART_KEY = 'ttPart'

/** The rails sit this share of a square either side of its middle. */
const RAIL = 0.16
/** The sleepers run this share of a square either side of its middle. */
const SLEEPER = 0.27
/** Where the three sleepers cross a piece, as shares of its length. */
const SLEEPERS = [1 / 6, 1 / 2, 5 / 6]
/** The answer's line weight, as a share of a square (never under 3 px). */
const LINE_OF_CELL = 0.09
/** How far before a turn the answer's line starts to round it, as a share of a square. */
const BEND_OF_CELL = 0.4

const r2 = (n: number) => Math.round(n * 100) / 100

type Pt = readonly [number, number]

function part(obj: StudioFabricObject, name: string, extra: Record<string, unknown> = {}): StudioFabricObject {
  return { ...obj, data: { ...(obj.data ?? {}), [TT_PART_KEY]: name, ...extra } }
}

/**
 * One path of open polylines in canvas px, stroked in black. Answer paths
 * start hidden; the answer key reveals them, inking their stroke.
 */
function pathOf(options: { lines: readonly (readonly Pt[])[]; strokeWidth: number; tag: StudioTag; role: StudioRole }): StudioFabricObject {
  const { lines, strokeWidth, tag, role } = options
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
    // The line stays hidden on the puzzle page; the answer key reveals it.
    ...(role === 'answer' ? { visible: false } : {}),
  }
}

/* ------------------------------------------------------------------ *
 * A piece of track, in a unit square
 * ------------------------------------------------------------------ */

const arc = (cx: number, cy: number, r: number, from: number, to: number, steps = 12): Pt[] =>
  Array.from({ length: steps + 1 }, (_, k) => {
    const a = from + ((to - from) * k) / steps
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const
  })

/** A straight piece running left to right. */
const ACROSS: readonly (readonly Pt[])[] = [
  [
    [0, 0.5 - RAIL],
    [1, 0.5 - RAIL],
  ],
  [
    [0, 0.5 + RAIL],
    [1, 0.5 + RAIL],
  ],
  ...SLEEPERS.map(
    (u): readonly Pt[] => [
      [u, 0.5 - SLEEPER],
      [u, 0.5 + SLEEPER],
    ],
  ),
]

/** A turn joining the top side to the right side, round the square's top right corner. */
const TOP_RIGHT: readonly (readonly Pt[])[] = [
  arc(1, 0, 0.5 - RAIL, Math.PI / 2, Math.PI),
  arc(1, 0, 0.5 + RAIL, Math.PI / 2, Math.PI),
  ...SLEEPERS.map((f): readonly Pt[] => {
    const a = Math.PI / 2 + (Math.PI / 2) * f
    return [
      [1 + (0.5 - SLEEPER) * Math.cos(a), (0.5 - SLEEPER) * Math.sin(a)],
      [1 + (0.5 + SLEEPER) * Math.cos(a), (0.5 + SLEEPER) * Math.sin(a)],
    ]
  }),
]

const mapLines = (lines: readonly (readonly Pt[])[], f: (p: Pt) => Pt) => lines.map((line) => line.map(f))

/** A piece's rails and sleepers in a unit square. */
export function pieceLines(piece: TtPiece): readonly (readonly Pt[])[] {
  switch (piece) {
    case 'h':
      return ACROSS
    case 'v':
      return mapLines(ACROSS, ([u, v]) => [v, u])
    case 'ne':
      return TOP_RIGHT
    case 'nw':
      return mapLines(TOP_RIGHT, ([u, v]) => [1 - u, v])
    case 'se':
      return mapLines(TOP_RIGHT, ([u, v]) => [u, 1 - v])
    case 'sw':
      return mapLines(TOP_RIGHT, ([u, v]) => [1 - u, 1 - v])
  }
}

const weightFor = (side: number) => (side >= 40 ? STUDIO_STROKE_BOLD : STUDIO_STROKE_NORMAL)

/** A piece of track drawn in a square. */
function trackPiece(piece: TtPiece, box: Box, tag: StudioTag, name: string, extra: Record<string, unknown> = {}): StudioFabricObject {
  const lines = pieceLines(piece).map((line) => line.map(([u, v]) => [box.left + u * box.width, box.top + v * box.height] as const))
  return part(pathOf({ lines, strokeWidth: weightFor(box.width), tag, role: 'prompt' }), name, { piece, ...extra })
}

/* ------------------------------------------------------------------ *
 * The finished line
 * ------------------------------------------------------------------ */

/** A direction as a step across the page: (x, y). */
const vec = (d: number): Pt => [TT_DIRS[d]![1], TT_DIRS[d]![0]]

/**
 * The answer's line through a route, rounding every turn. It starts on the
 * board's edge where the line enters and ends on the edge where it leaves;
 * straight squares are passed through their centre, and at a turn the line
 * leaves the straight `BEND_OF_CELL` of a square before the centre and
 * sweeps round a quarter circle to the next side.
 */
export function ttLaidLine(plan: TtPlan, route: readonly number[], portals: readonly [TtPortal, TtPortal]): Pt[] {
  const { grid, cell } = plan
  const n = plan.size
  const bend = cell * BEND_OF_CELL
  const centre = (i: number): Pt => [grid.left + ((i % n) + 0.5) * cell, grid.top + (Math.floor(i / n) + 0.5) * cell]
  const last = route.length - 1
  const line: Pt[] = []
  const [ex, ey] = vec(portals[0].dir)
  const [sx, sy] = centre(route[0]!)
  line.push([sx + (ex * cell) / 2, sy + (ey * cell) / 2])
  route.forEach((at, k) => {
    // Which way the line moves into this square, and out of it.
    const [dx1, dy1] = k === 0 ? vec((portals[0].dir + 2) % 4) : vec(ttDirBetween(n, route[k - 1]!, at))
    const [dx2, dy2] = k === last ? vec(portals[1].dir) : vec(ttDirBetween(n, at, route[k + 1]!))
    const [cx, cy] = centre(at)
    if (dx1 === dx2 && dy1 === dy2) {
      line.push([cx, cy])
      return
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
  })
  const [fx, fy] = vec(portals[1].dir)
  const [lx, ly] = centre(route[last]!)
  line.push([lx + (fx * cell) / 2, ly + (fy * cell) / 2])
  return line
}

/* ------------------------------------------------------------------ *
 * Placement
 * ------------------------------------------------------------------ */

/** The sign's box for this line, centred over the grid and kept on the panel. */
export function ttSignBox(plan: TtPlan, line: TtLine, font: string): Box {
  const width = Math.min(plan.signBand.width, ttSignWidth(ttSignText(line, plan.signLines), plan.signSize, font))
  const centre = plan.grid.left + plan.grid.width / 2
  const left = Math.max(plan.signBand.left, Math.min(centre - width / 2, plan.signBand.left + plan.signBand.width - width))
  return { left: r2(left), top: plan.signBand.top, width, height: plan.signBand.height }
}

/** The widest the sign's words may set, centred on the sign and kept inside its band. */
export function ttSignTextRoom(plan: TtPlan, sign: Box): number {
  const centre = sign.left + sign.width / 2
  const band = plan.signBand
  return Math.floor(2 * Math.min(centre - band.left, band.left + band.width - centre))
}

/** Where the legend runs: centred under the grid and kept on the panel. */
export function ttLegendBox(plan: TtPlan): Box {
  const { width, height, top } = plan.legend
  const centre = plan.grid.left + plan.grid.width / 2
  const left = Math.max(plan.block.left, Math.min(centre - width / 2, plan.block.left + plan.block.width - width))
  return { left: r2(left), top, width, height }
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

export function buildTtPuzzle(options: {
  built: TtBuilt
  plan: TtPlan
  line: TtLine
  level: TtLevel
  /** `line|level|board` — what the book remembers of this page. */
  label: string
  tag: StudioTag
  font: string
}): StudioFabricObject {
  const { built, plan, line, level, label, tag, font } = options
  const { puzzle, route } = built
  const { grid, cell, size, countSize, countGap, rowCountWidth, colCountHeight } = plan
  const n = puzzle.size
  const parts: StudioFabricObject[] = []

  // The station sign: a double-ruled board with the line's name.
  const sign = ttSignBox(plan, line, font)
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
  const signText = ttSignText(line, plan.signLines)
  parts.push(
    part(
      buildText(
        {
          left: r2(sign.left + sign.width / 2),
          top: r2(sign.top + (sign.height - ttLineHeight(plan.signSize, plan.signLines)) / 2),
          text: signText,
          fontFamily: font,
          fontSize: plan.signSize,
          fontWeight: 700,
          lineHeight: 1,
          // As wide as the band allows round the sign's centre: the name is
          // centred either way, and a font that sets a little wider than
          // measured runs past the board's padding instead of wrapping.
          width: Math.max(ttTextWidth(signText, plan.signSize, ttSignSpec(font)), ttSignTextRoom(plan, sign)),
          textAlign: 'center',
          originX: 'center',
        },
        tag,
        'prompt',
      ),
      'sign-text',
    ),
  )

  // The numbers: each column's above it, each row's to its right.
  for (let c = 0; c < n; c++) parts.push(countNumber(puzzle.cols[c]!, grid.left + (c + 0.5) * cell, grid.top - countGap - colCountHeight / 2, countSize, tag, `c${c}`))
  for (let r = 0; r < n; r++) parts.push(countNumber(puzzle.rows[r]!, grid.left + grid.width + countGap + rowCountWidth / 2, grid.top + (r + 0.5) * cell, countSize, tag, `r${r}`))

  // Soft rules between every square.
  for (const bar of drawGridLines(grid, cell, size, size, tag, { fill: STUDIO_RULE_MEDIUM, thickness: STUDIO_STROKE_HAIRLINE })) parts.push(part(bar, 'rule'))

  // The line, hidden until the answer page, under the printed pieces.
  parts.push(
    part(pathOf({ lines: [ttLaidLine(plan, route, puzzle.portals)], strokeWidth: Math.max(3, r2(cell * LINE_OF_CELL)), tag, role: 'answer' }), 'line', {
      route: ttRouteKey(route),
    }),
  )

  // The pieces printed to start the reader off, the two ends among them.
  for (const g of puzzle.givens) {
    const row = Math.floor(g.at / n)
    const col = g.at % n
    parts.push(trackPiece(g.piece, { left: grid.left + col * cell, top: grid.top + row * cell, width: cell, height: cell }, tag, 'given', { row, col }))
  }

  // The frame, flush inside the board's edge, over the pieces' ends.
  const frame = (box: Box) => part(buildRect({ ...box, fill: STUDIO_INK, stroke: 'transparent', strokeWidth: 0 }, tag), 'frame')
  parts.push(frame({ left: grid.left, top: grid.top, width: grid.width, height: TT_FRAME }))
  parts.push(frame({ left: grid.left, top: grid.top + grid.height - TT_FRAME, width: grid.width, height: TT_FRAME }))
  parts.push(frame({ left: grid.left, top: grid.top, width: TT_FRAME, height: grid.height }))
  parts.push(frame({ left: grid.left + grid.width - TT_FRAME, top: grid.top, width: TT_FRAME, height: grid.height }))

  // The legend: its words (when there is room), then the six pieces, each in its own square.
  const legend = ttLegendBox(plan)
  const midY = legend.top + legend.height / 2
  let x = legend.left
  if (plan.legend.words) {
    parts.push(
      part(
        buildText(
          {
            left: r2(x),
            top: r2(midY - ttLineHeight(TT_LEGEND_SIZE) / 2),
            text: TT_LEGEND_WORD,
            fontFamily: font,
            fontSize: TT_LEGEND_SIZE,
            lineHeight: 1,
            width: ttTextWidth(TT_LEGEND_WORD, TT_LEGEND_SIZE, ttLegendSpec(font)),
          },
          tag,
          'prompt',
        ),
        'legend-text',
      ),
    )
    x += ttTextWidth(TT_LEGEND_WORD, TT_LEGEND_SIZE, ttLegendSpec(font)) + TT_LEGEND_WORD_GAP
  }
  for (const piece of TT_PIECES) {
    const box: Box = { left: r2(x), top: r2(midY - TT_LEGEND_ICON / 2), width: TT_LEGEND_ICON, height: TT_LEGEND_ICON }
    parts.push(part(buildRect({ ...box, fill: 'transparent', stroke: STUDIO_RULE_MEDIUM, strokeWidth: STUDIO_STROKE_HAIRLINE }, tag), 'legend-square'))
    parts.push(trackPiece(piece, box, tag, 'legend-piece'))
    x += TT_LEGEND_ICON + TT_LEGEND_ICON_GAP
  }

  const rowNumbersRight = grid.left + grid.width + countGap + rowCountWidth
  const top = plan.block.top
  const bottom = legend.top + legend.height
  const left = Math.min(sign.left, legend.left, grid.left)
  const right = Math.max(sign.left + sign.width, legend.left + legend.width, rowNumbersRight)
  const group = buildGroup(parts, { left, top, width: right - left, height: bottom - top }, tag, 'prompt')
  return {
    ...group,
    data: {
      source: TT_TEMPLATE_KEY,
      [TT_PART_KEY]: 'puzzle',
      line: line.name,
      level,
      size: `${n}x${n}`,
      [STUDIO_CONTENT_LABEL_KEY]: label,
      // The same squares, however the board is turned, are the same puzzle wherever they sit.
      [STUDIO_CANONICAL_KEY]: `${TT_TEMPLATE_KEY}:${built.signature}`,
    },
  }
}
