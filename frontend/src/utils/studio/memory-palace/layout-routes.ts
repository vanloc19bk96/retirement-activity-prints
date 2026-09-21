import type { StudioFabricObject } from '@/types/studio-template.types'
import type { StudioRng } from '../studio-rng'
import {
  fitSquareGrid,
  boxCenterX,
  boxCenterY,
  insetBox,
  type Box,
} from '../studio-layout'
import {
  buildLine,
  buildCircle,
  buildRect,
  buildText,
  type StudioTag,
} from '../studio-fabric-builders'
import {
  STUDIO_DIGIT_FONT,
  STUDIO_INK,
  STUDIO_PAPER,
  STUDIO_RULE_MEDIUM,
  STUDIO_STROKE_NORMAL,
  STUDIO_STROKE_BOLD,
} from '@/constants/studio.constants'

export interface Point {
  x: number
  y: number
}

export type RouteShape = 'house' | 'street' | 'path'

const NODE_R_MAX = 22

/** Seed jitter so bulk sheets do not fingerprint-collide on fixed grids. */
const NODE_JITTER = 0.05

function jitterPoint(p: Point, box: Box, rng: StudioRng): Point {
  return {
    x: p.x + (rng.next() - 0.5) * box.width * NODE_JITTER,
    y: p.y + (rng.next() - 0.5) * box.height * NODE_JITTER,
  }
}

export function streetNodes(box: Box, n: number, rng: StudioRng): Point[] {
  const perRow = Math.ceil(n / 2)
  const lanes = n > perRow ? 2 : 1
  const cols = perRow
  const cellW = box.width / cols
  const cellH = box.height / lanes
  const pts: Point[] = []
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / cols)
    let col = i % cols
    // boustrophedon: reverse odd rows so the path connects end-to-end
    if (row % 2 === 1) col = cols - 1 - col
    pts.push(
      jitterPoint(
        {
          x: box.left + cellW * (col + 0.5),
          y: box.top + cellH * (row + 0.5),
        },
        box,
        rng,
      ),
    )
  }
  return pts
}

/** Exact cell centers — house connectors stay axis-aligned (no per-stop jitter). */
export function houseNodes(box: Box, n: number): Point[] {
  const cols = Math.ceil(Math.sqrt(n))
  const rowsN = Math.ceil(n / cols)
  const grid = fitSquareGrid(box, cols, rowsN)
  const pts: Point[] = []
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols)
    let c = i % cols
    if (r % 2 === 1) c = cols - 1 - c
    const cell = grid.cellBox(r, c)
    pts.push({
      x: Math.round(boxCenterX(cell)),
      y: Math.round(boxCenterY(cell)),
    })
  }
  return pts
}

/** Whole-field nudge for bulk uniqueness without breaking house alignment. */
export function nudgeBox(box: Box, rng: StudioRng, maxPx: number): Box {
  const dx = rng.int(-maxPx, maxPx)
  const dy = rng.int(-maxPx, maxPx)
  return { ...box, left: box.left + dx, top: box.top + dy }
}

export function pathNodes(box: Box, n: number, rng: StudioRng): Point[] {
  const pts: Point[] = []
  const stepY = n <= 1 ? 0 : box.height / (n - 1)
  const amp = box.width * 0.28
  for (let i = 0; i < n; i++) {
    const phase = n <= 1 ? 0 : (i / (n - 1)) * Math.PI * 2
    const jitter = (rng.next() - 0.5) * box.width * 0.06
    pts.push({
      x: boxCenterX(box) + Math.sin(phase) * amp + jitter,
      y: box.top + stepY * i,
    })
  }
  return pts
}

export function placeNodes(
  shape: RouteShape,
  box: Box,
  n: number,
  rng: StudioRng,
): Point[] {
  switch (shape) {
    case 'street':
      return streetNodes(box, n, rng)
    case 'path':
      return pathNodes(box, n, rng)
    case 'house':
    default:
      return houseNodes(box, n)
  }
}

function nodeRadius(box: Box, n: number): number {
  const byHeight = box.height / Math.max(n, 1) / 2.2
  const byWidth = box.width / Math.max(Math.ceil(Math.sqrt(n)), 1) / 4
  return Math.max(10, Math.min(NODE_R_MAX, Math.floor(Math.min(byHeight, byWidth))))
}

export function drawConnectors(
  objects: StudioFabricObject[],
  pts: Point[],
  tag: StudioTag,
): void {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    // structure — included in bulk content fingerprints
    objects.push(
      buildLine(
        {
          x1: a.x,
          y1: a.y,
          x2: b.x,
          y2: b.y,
          stroke: STUDIO_RULE_MEDIUM,
          strokeWidth: STUDIO_STROKE_NORMAL,
          strokeDashArray: [8, 8],
        },
        tag,
        'structure',
      ),
    )
  }
}

export function drawRooms(
  objects: StudioFabricObject[],
  box: Box,
  n: number,
  tag: StudioTag,
): void {
  const cols = Math.ceil(Math.sqrt(n))
  const rowsN = Math.ceil(n / cols)
  const grid = fitSquareGrid(box, cols, rowsN)
  const pad = Math.max(2, Math.floor(grid.cell * 0.06))
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols)
    let c = i % cols
    if (r % 2 === 1) c = cols - 1 - c
    const cell = insetBox(grid.cellBox(r, c), pad)
    objects.push(
      buildRect(
        {
          ...cell,
          stroke: STUDIO_RULE_MEDIUM,
          strokeWidth: STUDIO_STROKE_NORMAL,
        },
        tag,
        'decoration',
      ),
    )
  }
}

export function drawNodes(
  objects: StudioFabricObject[],
  pts: Point[],
  box: Box,
  tag: StudioTag,
): void {
  const radius = nodeRadius(box, pts.length)
  pts.forEach((p, i) => {
    // structure — node anchors vary by seed for bulk uniqueness
    objects.push(
      buildCircle(
        {
          left: p.x,
          top: p.y,
          radius,
          stroke: STUDIO_INK,
          strokeWidth: STUDIO_STROKE_BOLD,
          fill: STUDIO_PAPER,
        },
        tag,
        'structure',
      ),
    )
    // Inter digits + center origin — PT Serif oldstyle figures sit unevenly and
    // left-origin boxes drift when PPT export pads width.
    objects.push(
      buildText(
        {
          left: p.x,
          top: p.y,
          text: String(i + 1),
          width: radius * 2,
          fontFamily: STUDIO_DIGIT_FONT,
          fontSize: radius,
          fontWeight: 700,
          lineHeight: 1,
          textAlign: 'center',
          originX: 'center',
          originY: 'center',
        },
        tag,
        'prompt',
      ),
    )
  })
}
