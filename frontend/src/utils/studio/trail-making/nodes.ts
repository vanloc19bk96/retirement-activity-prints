import type { StudioRng } from '../studio-rng'
import type { Box } from '../studio-layout'
import {
  countTrailCircleHits,
  orderForClearTrail,
  type Point,
} from './clear-path'

export type { Point } from './clear-path'
export {
  countTrailCircleHits,
  distToSegment,
  orderForClearTrail,
} from './clear-path'

export type TrailPart = 'A' | 'B'

export interface TrailNode {
  id: number
  label: string
  order: number
  x: number
  y: number
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/**
 * Line segment between two node centers, trimmed so endpoints sit on each
 * circle rim — the path does not cross into the label area.
 */
export function rimToRimSegment(
  a: Point,
  b: Point,
  radius: number,
): { x1: number; y1: number; x2: number; y2: number } | null {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const d = Math.hypot(dx, dy)
  if (d <= radius * 2) return null
  const ux = dx / d
  const uy = dy / d
  return {
    x1: a.x + ux * radius,
    y1: a.y + uy * radius,
    x2: b.x - ux * radius,
    y2: b.y - uy * radius,
  }
}

/** Part A: 1..n. Part B: 1,A,2,B,… alternating. */
export function buildSequence(
  part: TrailPart,
  nodeCount: number,
): { label: string; order: number }[] {
  if (nodeCount < 1) return []

  if (part === 'A') {
    return Array.from({ length: nodeCount }, (_, i) => ({
      label: String(i + 1),
      order: i,
    }))
  }

  const out: { label: string; order: number }[] = []
  let order = 0
  const half = Math.ceil(nodeCount / 2)
  for (let i = 0; i < half; i++) {
    out.push({ label: String(i + 1), order: order++ })
    if (out.length < nodeCount) {
      out.push({ label: String.fromCharCode(65 + i), order: order++ })
    }
  }
  return out.slice(0, nodeCount)
}

/**
 * Place `count` non-overlapping centers in `box` with ≥ minDist between any two.
 * Relaxes minDist if the box is too dense rather than looping forever.
 */
export function scatterNodes(
  box: Box,
  count: number,
  radius: number,
  rng: StudioRng,
): Point[] {
  if (count < 1) return []

  const minDist = radius * 2.6
  const pad = radius + 6
  const usableW = Math.max(1, box.width - pad * 2)
  const usableH = Math.max(1, box.height - pad * 2)
  const pts: Point[] = []
  const maxAttemptsPerNode = 60

  let guard = 0
  while (pts.length < count && guard++ < count * maxAttemptsPerNode) {
    const cand = {
      x: box.left + pad + rng.next() * usableW,
      y: box.top + pad + rng.next() * usableH,
    }
    if (pts.every((p) => dist(p, cand) >= minDist)) pts.push(cand)
  }

  let relax = minDist
  while (pts.length < count) {
    relax *= 0.9
    const cand = {
      x: box.left + pad + rng.next() * usableW,
      y: box.top + pad + rng.next() * usableH,
    }
    if (pts.every((p) => dist(p, cand) >= relax)) pts.push(cand)
  }

  return pts
}

/** Cap nodeCount so circles fit without overlap at this radius. */
export function clampNodeCount(requested: number, box: Box, radius: number): number {
  const want = Math.min(25, Math.max(2, Math.floor(Number.isFinite(requested) ? requested : 25)))
  const minDist = radius * 2.6
  const pad = radius + 6
  const usableW = Math.max(0, box.width - pad * 2)
  const usableH = Math.max(0, box.height - pad * 2)
  if (usableW <= 0 || usableH <= 0) return 2

  const cols = Math.max(1, Math.floor(usableW / minDist) + 1)
  const rows = Math.max(1, Math.floor(usableH / minDist) + 1)
  const capacity = cols * rows
  return Math.max(2, Math.min(want, capacity))
}

export function buildNodes(
  part: TrailPart,
  nodeCount: number,
  box: Box,
  radius: number,
  rng: StudioRng,
): TrailNode[] {
  const seq = buildSequence(part, nodeCount)
  // Retry scatter layouts when a clear visit order still cuts circles.
  const scatterAttempts = 4
  let bestOrdered: Point[] | null = null
  let bestHits = Infinity

  for (let attempt = 0; attempt < scatterAttempts; attempt++) {
    const positions = scatterNodes(box, nodeCount, radius, rng)
    const ordered = orderForClearTrail(positions, radius, rng)
    const hits = countTrailCircleHits(ordered, radius)
    if (hits < bestHits) {
      bestHits = hits
      bestOrdered = ordered
      if (hits === 0) break
    }
  }

  const ordered = bestOrdered ?? scatterNodes(box, nodeCount, radius, rng)
  return seq.map((s, i) => ({
    id: i,
    label: s.label,
    order: s.order,
    x: ordered[i]!.x,
    y: ordered[i]!.y,
  }))
}

/**
 * Shift the node cluster so circle + start/end marker pads sit centered in `box`.
 * Use after scatter so random placement doesn't leave the trail stuck to a corner.
 */
export function centerNodesInBox(
  nodes: TrailNode[],
  box: Box,
  radius: number,
  markerClearance: number,
): TrailNode[] {
  if (nodes.length === 0) return nodes

  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const n of nodes) {
    if (n.x < minX) minX = n.x
    if (n.x > maxX) maxX = n.x
    if (n.y < minY) minY = n.y
    if (n.y > maxY) maxY = n.y
  }

  // Markers may sit above/below/left/right of endpoints — pad every side.
  const pad = radius + markerClearance
  const clusterW = maxX - minX + pad * 2
  const clusterH = maxY - minY + pad * 2
  const dx = box.left + (box.width - clusterW) / 2 + pad - minX
  const dy = box.top + (box.height - clusterH) / 2 + pad - minY

  return nodes.map((n) => ({ ...n, x: n.x + dx, y: n.y + dy }))
}
