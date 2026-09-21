import type { Cell } from './types'

/**
 * Turns a cell block into the geometry the page actually draws: one closed outline
 * per boundary loop plus the shared edges inside it.
 *
 * The old renderer drew every cell as its own triangle / diamond / chevron with a gap
 * between them, which shattered the silhouette at worksheet scale. Tracing the union
 * once gives a single readable outline, which is what makes rotation judgeable in print.
 *
 * Coordinates are in grid units: x = column, y = row, so cell (r,c) spans
 * (c,r)–(c+1,r+1). The caller scales them to canvas pixels.
 */

export interface GridPoint {
  x: number
  y: number
}

export type GridSegment = readonly [GridPoint, GridPoint]

interface Edge {
  from: GridPoint
  to: GridPoint
  used: boolean
}

const pointKey = (p: GridPoint): string => `${p.x},${p.y}`

function occupancyOf(cells: readonly Cell[]): (r: number, c: number) => boolean {
  const filled = new Set(cells.map(({ r, c }) => `${r},${c}`))
  return (r, c) => filled.has(`${r},${c}`)
}

/**
 * Boundary edges wound clockwise around the filled area (rows grow downward), so the
 * block always sits on the right of each directed edge.
 */
function boundaryEdges(cells: readonly Cell[]): Edge[] {
  const has = occupancyOf(cells)
  const edges: Edge[] = []
  const push = (x1: number, y1: number, x2: number, y2: number): void => {
    edges.push({ from: { x: x1, y: y1 }, to: { x: x2, y: y2 }, used: false })
  }

  for (const { r, c } of cells) {
    if (!has(r - 1, c)) push(c, r, c + 1, r)
    if (!has(r, c + 1)) push(c + 1, r, c + 1, r + 1)
    if (!has(r + 1, c)) push(c + 1, r + 1, c, r + 1)
    if (!has(r, c - 1)) push(c, r + 1, c, r)
  }
  return edges
}

/** Drop points that sit mid-run so a straight side becomes one polygon edge. */
function dropCollinear(points: readonly GridPoint[]): GridPoint[] {
  const out: GridPoint[] = []
  for (let i = 0; i < points.length; i++) {
    const prev = points[(i - 1 + points.length) % points.length]!
    const cur = points[i]!
    const next = points[(i + 1) % points.length]!
    const cross =
      (cur.x - prev.x) * (next.y - cur.y) - (cur.y - prev.y) * (next.x - cur.x)
    if (cross !== 0) out.push(cur)
  }
  return out.length >= 3 ? out : [...points]
}

/**
 * Closed boundary loops of the block. A solid shape yields one loop; a shape with a
 * hole yields the hole as a second loop wound the other way.
 */
export function outlineLoops(cells: readonly Cell[]): GridPoint[][] {
  const edges = boundaryEdges(cells)
  const byStart = new Map<string, Edge[]>()
  for (const edge of edges) {
    const k = pointKey(edge.from)
    const list = byStart.get(k)
    if (list) list.push(edge)
    else byStart.set(k, [edge])
  }

  const loops: GridPoint[][] = []
  for (const seed of edges) {
    if (seed.used) continue

    const points: GridPoint[] = []
    let current: Edge | undefined = seed
    while (current && !current.used) {
      current.used = true
      points.push(current.from)

      const dx = current.to.x - current.from.x
      const dy = current.to.y - current.from.y
      // Where two cells meet at a single corner, several edges leave the same point.
      // Turning as far clockwise as possible hugs the block and keeps loops separate.
      const preference: GridPoint[] = [
        { x: -dy, y: dx },
        { x: dx, y: dy },
        { x: dy, y: -dx },
      ]
      const outgoing = byStart.get(pointKey(current.to)) ?? []
      let next: Edge | undefined
      for (const dir of preference) {
        next = outgoing.find(
          (e) =>
            !e.used && e.to.x - e.from.x === dir.x && e.to.y - e.from.y === dir.y,
        )
        if (next) break
      }
      current = next
    }

    if (points.length >= 4) loops.push(dropCollinear(points))
  }

  return loops
}

/** Merge unit runs that share a line into the fewest possible segments. */
function mergeRuns(runs: Map<number, number[]>, vertical: boolean): GridSegment[] {
  const out: GridSegment[] = []
  for (const [fixed, starts] of runs) {
    const sorted = [...starts].sort((a, b) => a - b)
    let runStart = sorted[0]!
    let runEnd = runStart + 1
    for (let i = 1; i < sorted.length; i++) {
      const s = sorted[i]!
      if (s === runEnd) {
        runEnd = s + 1
        continue
      }
      out.push(segment(fixed, runStart, runEnd, vertical))
      runStart = s
      runEnd = s + 1
    }
    out.push(segment(fixed, runStart, runEnd, vertical))
  }
  return out
}

function segment(
  fixed: number,
  from: number,
  to: number,
  vertical: boolean,
): GridSegment {
  return vertical
    ? [
        { x: fixed, y: from },
        { x: fixed, y: to },
      ]
    : [
        { x: from, y: fixed },
        { x: to, y: fixed },
      ]
}

/**
 * Edges shared by two filled cells, merged into the longest straight runs.
 * Drawn hairline so the cell grid stays countable without competing with the outline.
 */
export function interiorSegments(cells: readonly Cell[]): GridSegment[] {
  const has = occupancyOf(cells)
  const verticals = new Map<number, number[]>()
  const horizontals = new Map<number, number[]>()

  const add = (map: Map<number, number[]>, fixed: number, start: number): void => {
    const list = map.get(fixed)
    if (list) list.push(start)
    else map.set(fixed, [start])
  }

  for (const { r, c } of cells) {
    if (has(r, c + 1)) add(verticals, c + 1, r)
    if (has(r + 1, c)) add(horizontals, r + 1, c)
  }

  return [...mergeRuns(verticals, true), ...mergeRuns(horizontals, false)]
}
