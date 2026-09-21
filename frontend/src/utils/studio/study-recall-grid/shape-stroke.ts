import type { Point } from '../symbol-digit-coding/geometry'

const JOINT_EPS = 0.05

function pointsEqual(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < JOINT_EPS && Math.abs(a.y - b.y) < JOINT_EPS
}

/** Pull both ends inward so a chord stops on the inner edge of an outline stroke. */
export function shortenSegment(
  a: Point,
  b: Point,
  inset: number,
): [Point, Point] | null {
  if (inset <= 0) return [a, b]
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  if (len <= inset * 2 + JOINT_EPS) return null
  const ux = dx / len
  const uy = dy / len
  return [
    { x: a.x + ux * inset, y: a.y + uy * inset },
    { x: b.x - ux * inset, y: b.y - uy * inset },
  ]
}

/**
 * Extend segments past shared endpoints so butt-capped corners fill
 * without square caps (which protrude past outline intersections).
 */
export function overlapJointEnds(
  segments: [Point, Point][],
  pad: number,
): [Point, Point][] {
  if (pad <= 0 || segments.length < 2) return segments
  return segments.map(([a, b], index) => {
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
    const ux = (b.x - a.x) / len
    const uy = (b.y - a.y) / len
    const aIsJoint = segments.some(
      (seg, j) =>
        j !== index && (pointsEqual(seg[0], a) || pointsEqual(seg[1], a)),
    )
    const bIsJoint = segments.some(
      (seg, j) =>
        j !== index && (pointsEqual(seg[0], b) || pointsEqual(seg[1], b)),
    )
    return [
      aIsJoint ? { x: a.x - ux * pad, y: a.y - uy * pad } : a,
      bIsJoint ? { x: b.x + ux * pad, y: b.y + uy * pad } : b,
    ]
  })
}

/** Fit line segments for study-recall ink: flush on outlines, solid at open joints. */
export function fitStrokeSegments(
  lines: [Point, Point][],
  strokeWidth: number,
  hasOutline: boolean,
): [Point, Point][] {
  const pad = strokeWidth / 2
  if (hasOutline) {
    const fitted: [Point, Point][] = []
    for (const [a, b] of lines) {
      const next = shortenSegment(a, b, pad)
      if (next) fitted.push(next)
    }
    return fitted
  }
  return overlapJointEnds(lines, pad)
}
