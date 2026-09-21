import type { StudioFabricObject, StudioRole } from '@/types/studio-template.types'
import {
  STUDIO_INK,
  STUDIO_STROKE_BOLD,
  STUDIO_STROKE_HAIRLINE,
} from '@/constants/studio.constants'
import { buildRect, type StudioTag } from '../studio-fabric-builders'
import type { Box } from '../studio-layout'
import { isGivenSegment } from './reflect'
import type { Axis, Segment } from './types'

type GridSnap = {
  cell: number
  bounds: Box
}

export function lineInkThickness(cell: number): number {
  return Math.max(STUDIO_STROKE_BOLD, Math.round(cell * 0.1))
}

function barOrigin(
  index: number,
  count: number,
  start: number,
  span: number,
  step: number,
  thickness: number,
): number {
  if (index === 0) return start
  if (index === count) return start + span - thickness
  return start + index * step - Math.floor(thickness / 2)
}

/** Center of the visible grid hairline at this row/col index (0..size). */
export function hairlineCenter(
  index: number,
  count: number,
  start: number,
  span: number,
  step: number,
): number {
  const origin = barOrigin(index, count, start, span, step, STUDIO_STROKE_HAIRLINE)
  return origin + STUDIO_STROKE_HAIRLINE / 2
}

/** Same centering as axis dash bars — avoids odd-thickness right-shift from floor(half). */
export function centeredBarOrigin(center: number, thickness: number): number {
  return Math.round(center - thickness / 2)
}

function inkRect(
  left: number,
  top: number,
  width: number,
  height: number,
  tag: StudioTag,
  role: StudioRole,
): StudioFabricObject {
  return buildRect(
    {
      left: Math.round(left),
      top: Math.round(top),
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(height)),
      fill: STUDIO_INK,
      stroke: 'transparent',
      strokeWidth: 0,
    },
    tag,
    role,
  )
}

function vertexAt(g: GridSnap, size: number, r: number, c: number): { x: number; y: number } {
  return {
    x: hairlineCenter(c, size, g.bounds.left, g.bounds.width, g.cell),
    y: hairlineCenter(r, size, g.bounds.top, g.bounds.height, g.cell),
  }
}

function segmentRole(seg: Segment, size: number, axis: Axis): StudioRole {
  return isGivenSegment(seg, size, axis) ? 'prompt' : 'answer'
}

/**
 * Bar centered on the hairline, length exactly vertex→vertex (no end overrun).
 * Joint squares at vertices close L/U corners without stubs past the outer edge.
 */
function drawSegmentBar(
  g: GridSnap,
  size: number,
  seg: Segment,
  thickness: number,
  tag: StudioTag,
  role: StudioRole,
): StudioFabricObject {
  const a = vertexAt(g, size, seg.r1, seg.c1)
  const b = vertexAt(g, size, seg.r2, seg.c2)
  const isHorizontal = Math.abs(a.y - b.y) < 0.5
  if (isHorizontal) {
    const x0 = Math.min(a.x, b.x)
    const x1 = Math.max(a.x, b.x)
    return inkRect(x0, centeredBarOrigin(a.y, thickness), x1 - x0, thickness, tag, role)
  }
  if (Math.abs(a.x - b.x) < 0.5) {
    const y0 = Math.min(a.y, b.y)
    const y1 = Math.max(a.y, b.y)
    return inkRect(centeredBarOrigin(a.x, thickness), y0, thickness, y1 - y0, tag, role)
  }
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
  return buildRect(
    {
      left: (a.x + b.x) / 2,
      top: (a.y + b.y) / 2,
      width: len,
      height: thickness,
      angle,
      originX: 'center',
      originY: 'center',
      fill: STUDIO_INK,
      stroke: 'transparent',
      strokeWidth: 0,
    },
    tag,
    role,
  )
}

/** Thickness square centered on each vertex so corners meet flush (no end stubs). */
function drawVertexJoints(
  g: GridSnap,
  size: number,
  segments: Segment[],
  thickness: number,
  axis: Axis,
  tag: StudioTag,
): StudioFabricObject[] {
  const byKey = new Map<string, StudioRole>()
  const mark = (r: number, c: number, role: StudioRole) => {
    const key = `${r},${c}`
    const prev = byKey.get(key)
    // Prefer prompt when both given and answer share a vertex (mirror axis).
    if (prev === 'prompt') return
    byKey.set(key, role)
  }
  for (const seg of segments) {
    const role = segmentRole(seg, size, axis)
    mark(seg.r1, seg.c1, role)
    mark(seg.r2, seg.c2, role)
  }
  const parts: StudioFabricObject[] = []
  for (const [key, role] of byKey) {
    const [rs, cs] = key.split(',')
    const { x, y } = vertexAt(g, size, Number(rs), Number(cs))
    parts.push(
      inkRect(
        centeredBarOrigin(x, thickness),
        centeredBarOrigin(y, thickness),
        thickness,
        thickness,
        tag,
        role,
      ),
    )
  }
  return parts
}

export function drawLineFigure(
  g: GridSnap,
  segments: Segment[],
  size: number,
  axis: Axis,
  tag: StudioTag,
): StudioFabricObject[] {
  const thickness = lineInkThickness(g.cell)
  const parts: StudioFabricObject[] = []
  for (const seg of segments) {
    parts.push(drawSegmentBar(g, size, seg, thickness, tag, segmentRole(seg, size, axis)))
  }
  parts.push(...drawVertexJoints(g, size, segments, thickness, axis, tag))
  return parts
}
