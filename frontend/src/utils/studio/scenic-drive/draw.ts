import type { StudioFabricObject, StudioRole } from '@/types/studio-template.types'
import { STUDIO_DIGIT_FONT, STUDIO_INK } from '@/constants/studio.constants'
import { STUDIO_CANONICAL_KEY } from '../_shared/uniqueness'
import { buildGroup, buildRect, buildText, nextObjectId, type StudioTag } from '../studio-fabric-builders'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import type { Box } from '../studio-layout'
import {
  DRIVE_LEGEND_RUN,
  DRIVE_LEGEND_TOTAL,
  DRIVE_LEGEND_TWIN,
  DRIVE_SUM_WORD,
  DRIVE_TEMPLATE_KEY,
  DRIVE_TWICE_WORD,
  driveSignText,
  type DriveLevel,
  type DriveRoute,
} from './content'
import {
  DRIVE_DIAGONAL_STROKE,
  DRIVE_FRAME_STROKE,
  DRIVE_LEGEND_FRAME_STROKE,
  DRIVE_LEGEND_ICON_GAP,
  DRIVE_LEGEND_ITEM_GAP,
  DRIVE_LEGEND_ROW_GAP,
  DRIVE_LEGEND_RUN_WIDTH,
  DRIVE_LEGEND_SQUARE,
  DRIVE_LEGEND_TWIN_WIDTH,
  DRIVE_LINE_STROKE,
  DRIVE_TOTAL_FAR,
  DRIVE_TOTAL_MIN,
  DRIVE_TOTAL_NEAR,
  driveDigitSpec,
  driveLegendItemWidths,
  driveLegendRowHeight,
  driveLegendSpec,
  driveLegendWidth,
  driveLineHeight,
  driveSignSpec,
  driveSignWidth,
  driveTextWidth,
  type DrivePlan,
} from './layout'
import type { DriveBuilt } from './puzzle'
import { DRIVE_BLANK, driveRuns } from './solver'

/**
 * A planned grid → one Fabric group: the route's road sign, the grid (gray
 * squares carrying the totals, split corner to corner, white squares for the
 * digits, black lines between them in a bold frame), the answer hidden for
 * the answer page, and the legend.
 *
 * The puzzle page is black and one soft gray — the gray squares stand back
 * so the bold totals and the reader's pencilled digits read clearly. On the
 * answer page every white square has its digit written in. Black and one
 * gray only, so it prints the same on any interior.
 */

/** Marks the objects a Scenic Drive page draws, for checks and the editor. */
export const DRIVE_PART_KEY = 'drivePart'

/** The gray squares: a soft gray, dark enough to print, light enough under black totals. */
export const DRIVE_GRAY_FILL = '#DDDDDD'

/** The legend's cross between two squares that may not both hold the same digit. */
const CROSS_STROKE = 2.5

const r2 = (n: number) => Math.round(n * 100) / 100

type Cmd = (string | number)[]

function part(obj: StudioFabricObject, name: string, extra: Record<string, unknown> = {}): StudioFabricObject {
  return { ...obj, data: { ...(obj.data ?? {}), [DRIVE_PART_KEY]: name, ...extra } }
}

/** The bounds of a path's own geometry, as [minX, minY, maxX, maxY] (moves and lines only). */
function boundsOf(commands: readonly Cmd[]): [number, number, number, number] {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const c of commands) {
    for (let k = 1; k + 1 < c.length; k += 2) {
      const x = c[k] as number
      const y = c[k + 1] as number
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }
  return [r2(minX), r2(minY), r2(maxX), r2(maxY)]
}

/**
 * One path of drawing commands in canvas px, placed by the bounds of its own
 * geometry — Fabric centres a path on them (its pathOffset), so bounds taken
 * from anything else would shift it.
 */
function pathOf(options: {
  commands: readonly Cmd[]
  fill: string
  stroke?: string
  strokeWidth: number
  tag: StudioTag
  role: StudioRole
  lineCap?: 'round' | 'butt' | 'square'
}): StudioFabricObject {
  const { commands, fill, stroke = STUDIO_INK, strokeWidth, tag, role, lineCap = 'round' } = options
  const [minX, minY, maxX, maxY] = boundsOf(commands)
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
    strokeLineCap: lineCap,
    strokeLineJoin: 'round',
    objectId: nextObjectId(tag.instanceId),
    studioTemplateKey: tag.templateKey,
    studioInstanceId: tag.instanceId,
    studioPageRole: tag.pageRole,
    studioRole: role,
    ...(role === 'answer' ? { visible: false } : {}),
  }
}

/* ------------------------------------------------------------------ *
 * Geometry of a grid
 * ------------------------------------------------------------------ */

/** Where a grid of squares is drawn: its top-left corner and pitch. */
export interface DriveGeometry {
  left: number
  top: number
  cell: number
}

export const driveGeometryOf = (plan: DrivePlan): DriveGeometry => ({ left: plan.grid.left, top: plan.grid.top, cell: plan.cell })

/** The centre of the square at (row, col). */
export function driveCentre(geo: DriveGeometry, row: number, col: number): readonly [number, number] {
  return [geo.left + (col + 0.5) * geo.cell, geo.top + (row + 0.5) * geo.cell]
}

/** Where a total's centre sits in the gray square at (row, col): the across total above the diagonal, the down total below it. */
export function driveTotalCentre(geo: DriveGeometry, row: number, col: number, dir: 'across' | 'down'): readonly [number, number] {
  const x0 = geo.left + col * geo.cell
  const y0 = geo.top + row * geo.cell
  return dir === 'across'
    ? [x0 + geo.cell * DRIVE_TOTAL_FAR, y0 + geo.cell * DRIVE_TOTAL_NEAR]
    : [x0 + geo.cell * DRIVE_TOTAL_NEAR, y0 + geo.cell * DRIVE_TOTAL_FAR]
}

/**
 * The squares of a grid as three paths: the gray squares filled, the lines
 * between all squares, and a diagonal in every gray square that carries a
 * total; then the bold frame, flush inside the grid's edge.
 */
function drawSquares(options: {
  geo: DriveGeometry
  rows: number
  cols: number
  gray: (row: number, col: number) => boolean
  split: (row: number, col: number) => boolean
  tag: StudioTag
  names: { gray: string; lines: string; diagonals: string; frame: string }
  frame?: number
  extra?: Record<string, unknown>
}): StudioFabricObject[] {
  const { geo, rows, cols, gray, split, tag, names, frame = DRIVE_FRAME_STROKE, extra = {} } = options
  const { left, top, cell } = geo
  const right = left + cols * cell
  const bottom = top + rows * cell
  const out: StudioFabricObject[] = []
  const grays: Cmd[] = []
  const diagonals: Cmd[] = []
  let grayCount = 0
  let splitCount = 0
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!gray(r, c)) continue
      const x = left + c * cell
      const y = top + r * cell
      grays.push(['M', x, y], ['L', x + cell, y], ['L', x + cell, y + cell], ['L', x, y + cell], ['Z'])
      grayCount++
      if (split(r, c)) {
        diagonals.push(['M', x, y], ['L', x + cell, y + cell])
        splitCount++
      }
    }
  }
  if (grays.length > 0) {
    out.push(
      part(pathOf({ commands: grays, fill: DRIVE_GRAY_FILL, strokeWidth: 0, tag, role: 'prompt' }), names.gray, { ...extra, count: grayCount }),
    )
  }
  const lines: Cmd[] = []
  for (let c = 1; c < cols; c++) lines.push(['M', left + c * cell, top], ['L', left + c * cell, bottom])
  for (let r = 1; r < rows; r++) lines.push(['M', left, top + r * cell], ['L', right, top + r * cell])
  if (lines.length > 0) {
    out.push(
      part(pathOf({ commands: lines, fill: 'transparent', strokeWidth: DRIVE_LINE_STROKE, tag, role: 'prompt', lineCap: 'butt' }), names.lines, {
        count: lines.length / 2,
      }),
    )
  }
  if (diagonals.length > 0) {
    out.push(
      part(pathOf({ commands: diagonals, fill: 'transparent', strokeWidth: DRIVE_DIAGONAL_STROKE, tag, role: 'prompt', lineCap: 'butt' }), names.diagonals, {
        count: splitCount,
      }),
    )
  }
  // The frame, flush inside the grid's edge.
  const w = frame
  const bar = (box: Box) => part(buildRect({ ...box, fill: STUDIO_INK, stroke: 'transparent', strokeWidth: 0 }, tag), names.frame)
  out.push(bar({ left, top, width: right - left, height: w }))
  out.push(bar({ left, top: bottom - w, width: right - left, height: w }))
  out.push(bar({ left, top, width: w, height: bottom - top }))
  out.push(bar({ left: right - w, top, width: w, height: bottom - top }))
  return out
}

/* ------------------------------------------------------------------ *
 * Placement
 * ------------------------------------------------------------------ */

/** The sign's box for this route, centred over the grid and kept on the panel. */
export function driveSignBox(plan: DrivePlan, route: DriveRoute, font: string): Box {
  const width = Math.min(plan.signBand.width, driveSignWidth(driveSignText(route, plan.signLines), plan.signSize, font))
  const centre = plan.grid.left + plan.grid.width / 2
  const left = Math.max(plan.signBand.left, Math.min(centre - width / 2, plan.signBand.left + plan.signBand.width - width))
  return { left: r2(left), top: plan.signBand.top, width, height: plan.signBand.height }
}

/** The widest the sign's words may set, centred on the board and kept inside its band. */
export function driveSignTextRoom(plan: DrivePlan, sign: Box): number {
  const centre = sign.left + sign.width / 2
  const band = plan.signBand
  return Math.floor(2 * Math.min(centre - band.left, band.left + band.width - centre))
}

/** Where the legend runs: centred under the grid and kept on the panel. */
export function driveLegendBox(plan: DrivePlan, font: string): Box {
  const width = driveLegendWidth(font, plan.legendRows)
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
      width: Math.max(Math.ceil(size * 1.1), driveTextWidth(text, size, driveDigitSpec(weight))),
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

/** A gray square with a total of 4 across, then its run: two white squares holding 1 and 3. */
function legendRun(box: Box, legendSize: number, tag: StudioTag): StudioFabricObject[] {
  const geo: DriveGeometry = { left: box.left, top: box.top, cell: DRIVE_LEGEND_SQUARE }
  const count = DRIVE_LEGEND_RUN.length + 1
  const [tx, ty] = driveTotalCentre(geo, 0, 0, 'across')
  return [
    ...drawSquares({
      geo,
      rows: 1,
      cols: count,
      gray: (_r, c) => c === 0,
      split: (_r, c) => c === 0,
      tag,
      names: { gray: 'legend-gray', lines: 'legend-lines', diagonals: 'legend-diagonal', frame: 'legend-frame' },
      frame: DRIVE_LEGEND_FRAME_STROKE,
    }),
    numberText({ value: DRIVE_LEGEND_TOTAL, cx: tx, cy: ty, size: DRIVE_TOTAL_MIN, weight: 700, tag, role: 'prompt', name: 'legend-total', extra: {} }),
    ...DRIVE_LEGEND_RUN.map((v, k) => {
      const [cx, cy] = driveCentre(geo, 0, k + 1)
      return numberText({ value: v, cx, cy, size: legendSize, weight: 700, tag, role: 'prompt', name: 'legend-number', extra: {} })
    }),
  ]
}

/** Two white squares side by side both holding 2 — crossed out where they meet. */
function legendTwins(box: Box, legendSize: number, tag: StudioTag): StudioFabricObject[] {
  const geo: DriveGeometry = { left: box.left, top: box.top, cell: DRIVE_LEGEND_SQUARE }
  const [cx, cy] = [box.left + DRIVE_LEGEND_SQUARE, box.top + DRIVE_LEGEND_SQUARE / 2]
  const arm = Math.round(DRIVE_LEGEND_SQUARE * 0.2)
  return [
    ...drawSquares({
      geo,
      rows: 1,
      cols: 2,
      gray: () => false,
      split: () => false,
      tag,
      names: { gray: 'legend-gray', lines: 'legend-lines', diagonals: 'legend-diagonal', frame: 'legend-frame' },
      frame: DRIVE_LEGEND_FRAME_STROKE,
    }),
    ...[0, 1].map((c) => {
      const [x, y] = driveCentre(geo, 0, c)
      return numberText({ value: DRIVE_LEGEND_TWIN, cx: x, cy: y, size: legendSize, weight: 700, tag, role: 'prompt', name: 'legend-number', extra: {} })
    }),
    part(
      pathOf({
        commands: [
          ['M', cx - arm, cy - arm],
          ['L', cx + arm, cy + arm],
          ['M', cx + arm, cy - arm],
          ['L', cx - arm, cy + arm],
        ],
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

export function buildDrivePuzzle(options: {
  built: DriveBuilt
  plan: DrivePlan
  route: DriveRoute
  level: DriveLevel
  /** `route|level|grid` — what the book remembers of this page. */
  label: string
  tag: StudioTag
  font: string
}): StudioFabricObject {
  const { built, plan, route, level, label, tag, font } = options
  const { puzzle, values } = built
  const n = puzzle.size
  const parts: StudioFabricObject[] = []

  // The road sign: a double-ruled board with the route's name.
  const sign = driveSignBox(plan, route, font)
  parts.push(part(buildRect({ ...sign, rx: 10, ry: 10, fill: 'transparent', stroke: STUDIO_INK, strokeWidth: 2 }, tag), 'sign'))
  parts.push(
    part(
      buildRect({ left: sign.left + 5, top: sign.top + 5, width: sign.width - 10, height: sign.height - 10, rx: 6, ry: 6, fill: 'transparent', stroke: STUDIO_INK, strokeWidth: 1 }, tag),
      'sign',
    ),
  )
  const signText = driveSignText(route, plan.signLines)
  parts.push(
    part(
      buildText(
        {
          left: r2(sign.left + sign.width / 2),
          top: r2(sign.top + (sign.height - driveLineHeight(plan.signSize, plan.signLines)) / 2),
          text: signText,
          fontFamily: font,
          fontSize: plan.signSize,
          fontWeight: 700,
          lineHeight: 1,
          // As wide as the band allows round the board's centre: the name is
          // centred either way, and a font that sets a little wider than
          // measured runs past the board's padding instead of wrapping.
          width: Math.max(driveTextWidth(signText, plan.signSize, driveSignSpec(font)), driveSignTextRoom(plan, sign)),
          textAlign: 'center',
          originX: 'center',
        },
        tag,
        'prompt',
      ),
      'sign-text',
    ),
  )

  // The squares: gray ones, the lines between all of them, the diagonals, the frame.
  const geo = driveGeometryOf(plan)
  const at = (r: number, c: number) => r * n + c
  parts.push(
    ...drawSquares({
      geo,
      rows: n,
      cols: n,
      gray: (r, c) => !puzzle.open[at(r, c)],
      split: (r, c) => puzzle.across[at(r, c)] !== DRIVE_BLANK || puzzle.down[at(r, c)] !== DRIVE_BLANK,
      tag,
      names: { gray: 'grays', lines: 'lines', diagonals: 'diagonals', frame: 'frame' },
      extra: { open: puzzle.open.map((o) => (o ? 1 : 0)).join('') },
    }),
  )

  // The totals: bold, each in its half of its gray square.
  for (let s = 0; s < n * n; s++) {
    const row = Math.floor(s / n)
    const col = s % n
    for (const dir of ['across', 'down'] as const) {
      const total = puzzle[dir][s]!
      if (total === DRIVE_BLANK) continue
      const [cx, cy] = driveTotalCentre(geo, row, col, dir)
      parts.push(numberText({ value: total, cx, cy, size: plan.totalSize, weight: 700, tag, role: 'prompt', name: `${dir}-total`, extra: { row, col } }))
    }
  }

  // The digits, written in, plain, on the answer page.
  for (let s = 0; s < n * n; s++) {
    if (!puzzle.open[s]) continue
    const row = Math.floor(s / n)
    const col = s % n
    const [cx, cy] = driveCentre(geo, row, col)
    parts.push(numberText({ value: values[s]!, cx, cy, size: plan.digitSize, weight: 400, tag, role: 'answer', name: 'answer', extra: { row, col } }))
  }

  // The legend: a run and its total, then a repeated digit crossed out.
  const legend = driveLegendBox(plan, font)
  const [sumItem] = driveLegendItemWidths(font)
  const rowHeight = driveLegendRowHeight()
  const rowMid = (row: number) => legend.top + row * (rowHeight + DRIVE_LEGEND_ROW_GAP) + rowHeight / 2
  const words = (text: string, x: number, midY: number, extra: Record<string, unknown>) =>
    part(
      buildText(
        {
          left: r2(x),
          top: r2(midY - driveLineHeight(plan.legendSize) / 2),
          text,
          fontFamily: font,
          fontSize: plan.legendSize,
          lineHeight: 1,
          width: driveTextWidth(text, plan.legendSize, driveLegendSpec(font)),
        },
        tag,
        'prompt',
      ),
      'legend-text',
      extra,
    )
  let x = legend.left
  let midY = rowMid(0)
  const square = DRIVE_LEGEND_SQUARE
  parts.push(...legendRun({ left: x, top: midY - square / 2, width: DRIVE_LEGEND_RUN_WIDTH, height: square }, plan.legendSize, tag))
  parts.push(words(DRIVE_SUM_WORD, x + DRIVE_LEGEND_RUN_WIDTH + DRIVE_LEGEND_ICON_GAP, midY, { entry: 'sum' }))
  if (plan.legendRows === 1) x += sumItem + DRIVE_LEGEND_ITEM_GAP
  else midY = rowMid(1)
  parts.push(...legendTwins({ left: x, top: midY - square / 2, width: DRIVE_LEGEND_TWIN_WIDTH, height: square }, plan.legendSize, tag))
  parts.push(words(DRIVE_TWICE_WORD, x + DRIVE_LEGEND_TWIN_WIDTH + DRIVE_LEGEND_ICON_GAP, midY, { entry: 'twice' }))

  const groupTop = plan.block.top
  const bottom = plan.legendTop + plan.legendHeight
  const groupLeft = Math.min(sign.left, legend.left, plan.grid.left)
  const right = Math.max(sign.left + sign.width, legend.left + legend.width, plan.grid.left + plan.grid.width)
  const group = buildGroup(parts, { left: groupLeft, top: groupTop, width: right - groupLeft, height: bottom - groupTop }, tag, 'prompt')
  return {
    ...group,
    data: {
      source: DRIVE_TEMPLATE_KEY,
      [DRIVE_PART_KEY]: 'puzzle',
      route: route.name,
      level,
      size: `${n}x${n}`,
      runs: driveRuns(puzzle).length,
      [STUDIO_CONTENT_LABEL_KEY]: label,
      // The same grid and totals, flipped across the diagonal, are the same puzzle wherever they sit.
      [STUDIO_CANONICAL_KEY]: `${DRIVE_TEMPLATE_KEY}:${built.signature}`,
    },
  }
}
