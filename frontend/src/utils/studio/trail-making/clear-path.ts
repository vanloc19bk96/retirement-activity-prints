import type { StudioRng } from '../studio-rng'

export interface Point {
  x: number
  y: number
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** Shortest distance from point `p` to segment `a`→`b`. */
export function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq < 1e-9) return dist(p, a)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq))
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy })
}

/**
 * How many non-endpoint circles the ordered trail cuts through.
 * A hit means the center-to-center segment comes within `radius` of another node.
 */
export function countTrailCircleHits(ordered: readonly Point[], radius: number): number {
  if (ordered.length < 3) return 0
  let hits = 0
  for (let i = 0; i < ordered.length - 1; i++) {
    const a = ordered[i]!
    const b = ordered[i + 1]!
    for (let j = 0; j < ordered.length; j++) {
      if (j === i || j === i + 1) continue
      if (distToSegment(ordered[j]!, a, b) < radius) hits++
    }
  }
  return hits
}

function segmentHitCount(
  a: Point,
  b: Point,
  obstacles: readonly Point[],
  radius: number,
): number {
  let hits = 0
  for (const o of obstacles) {
    if (distToSegment(o, a, b) < radius) hits++
  }
  return hits
}

/**
 * Greedy path: each next point minimizes new circle hits, then prefers a longer
 * jump so consecutive labels are not trivial spatial neighbors.
 */
function greedyClearPath(positions: readonly Point[], radius: number, rng: StudioRng): Point[] {
  const remaining = [...positions]
  const path: Point[] = [remaining.splice(rng.int(0, remaining.length - 1), 1)[0]!]

  while (remaining.length > 0) {
    const from = path[path.length - 1]!
    let bestIdx = 0
    let bestHits = Infinity
    let bestDist = -1

    for (let i = 0; i < remaining.length; i++) {
      const to = remaining[i]!
      const obstacles = remaining.filter((_, j) => j !== i).concat(path.slice(0, -1))
      const hits = segmentHitCount(from, to, obstacles, radius)
      const d = dist(from, to)
      if (hits < bestHits || (hits === bestHits && d > bestDist)) {
        bestHits = hits
        bestDist = d
        bestIdx = i
      }
    }

    path.push(remaining.splice(bestIdx, 1)[0]!)
  }

  return path
}

/** Pairwise swaps that reduce circle hits. */
function improveClearPath(path: Point[], radius: number, rng: StudioRng): Point[] {
  const n = path.length
  if (n < 3) return path

  let best = path
  let bestHits = countTrailCircleHits(best, radius)
  if (bestHits === 0) return best

  const swaps = n * n * 3
  for (let s = 0; s < swaps && bestHits > 0; s++) {
    const i = rng.int(0, n - 1)
    const j = rng.int(0, n - 1)
    if (i === j) continue
    const next = [...best]
    ;[next[i], next[j]] = [next[j]!, next[i]!]
    const hits = countTrailCircleHits(next, radius)
    if (hits < bestHits) {
      best = next
      bestHits = hits
    }
  }
  return best
}

/**
 * Multi-start clear-path ordering: scatter positions stay fixed; only the visit
 * order changes so answer segments rarely cut through other circles.
 */
export function orderForClearTrail(
  positions: readonly Point[],
  radius: number,
  rng: StudioRng,
): Point[] {
  if (positions.length <= 2) return [...positions]

  let best = greedyClearPath(positions, radius, rng)
  let bestHits = countTrailCircleHits(best, radius)
  const restarts = Math.min(10, 2 + positions.length)

  for (let r = 0; r < restarts && bestHits > 0; r++) {
    const candidate = improveClearPath(greedyClearPath(positions, radius, rng), radius, rng)
    const hits = countTrailCircleHits(candidate, radius)
    if (hits < bestHits) {
      best = candidate
      bestHits = hits
    }
  }

  return bestHits === 0 ? best : improveClearPath(best, radius, rng)
}
