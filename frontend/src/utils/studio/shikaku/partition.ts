import type { StudioRng } from '../studio-rng'
import type { ShikakuRect } from './types'

/**
 * Greedy row-major tiling never has to backtrack — a 1×1 always fits the first
 * free cell — so this budget only guards against a future rule change.
 */
const NODE_BUDGET = 20_000

/**
 * Sampling weight per area. Bigger blocks make a livelier board; lone squares
 * are dull to solve and give the whole grid away, so they sink to last resort.
 */
function areaWeight(area: number): number {
  if (area === 1) return 0.3
  if (area === 2) return 1.2
  return area
}

export interface PartitionOptions {
  /** Largest rectangle area allowed. */
  maxArea: number
  /** Longest side allowed — stops 1×12 ribbons that read as noise on the page. */
  maxSide: number
}

/**
 * Greedy weighted tiling of a bare `rows`×`cols` box.
 *
 * Cells are claimed in row-major order, so the block covering the first free
 * cell always has its top-left corner *on* that cell (everything above and to
 * the left is already taken). That invariant is what makes a single pass
 * complete without backtracking.
 */
function tileGreedy(
  rows: number,
  cols: number,
  options: PartitionOptions,
  rng: StudioRng,
): ShikakuRect[] | null {
  const maxArea = Math.max(1, Math.floor(options.maxArea))
  const maxSide = Math.max(1, Math.floor(options.maxSide))
  const filled = new Uint8Array(rows * cols)
  const out: ShikakuRect[] = []
  let nodes = 0
  let cursor = 0

  const fits = (r: number, c: number, h: number, w: number): boolean => {
    if (r + h > rows || c + w > cols) return false
    for (let rr = r; rr < r + h; rr++) {
      for (let cc = c; cc < c + w; cc++) {
        if (filled[rr * cols + cc]) return false
      }
    }
    return true
  }

  const paint = (rect: ShikakuRect, value: 0 | 1): void => {
    for (let rr = rect.r; rr < rect.r + rect.h; rr++) {
      for (let cc = rect.c; cc < rect.c + rect.w; cc++) {
        filled[rr * cols + cc] = value
      }
    }
  }

  const candidatesAt = (r: number, c: number): ShikakuRect[] => {
    const scored: { rect: ShikakuRect; key: number }[] = []
    for (let h = 1; h <= Math.min(maxSide, rows - r); h++) {
      // A blocked cell straight below rules out every taller block too.
      if (!fits(r, c, h, 1)) break
      for (let w = 1; w <= Math.min(maxSide, cols - c); w++) {
        const area = h * w
        // Both bounds grow monotonically, so widening only ever makes it worse.
        if (area > maxArea) break
        if (!fits(r, c, h, w)) break
        scored.push({
          rect: { r, c, h, w },
          // Efraimidis–Spirakis weighted shuffle: one draw per candidate.
          key: Math.pow(rng.next(), 1 / areaWeight(area)),
        })
      }
    }
    return scored.sort((a, b) => b.key - a.key).map((s) => s.rect)
  }

  const solve = (): boolean => {
    while (cursor < filled.length && filled[cursor]) cursor++
    if (cursor >= filled.length) return true
    if (++nodes > NODE_BUDGET) return false

    const start = cursor
    const r = Math.floor(start / cols)
    const c = start % cols

    for (const rect of candidatesAt(r, c)) {
      paint(rect, 1)
      out.push(rect)
      if (solve()) return true
      out.pop()
      paint(rect, 0)
      cursor = start
    }
    return false
  }

  return solve() ? out : null
}

/** The two blocks fused into one, or null when they do not line up. */
function union(a: ShikakuRect, b: ShikakuRect): ShikakuRect | null {
  if (a.r === b.r && a.h === b.h) {
    if (a.c + a.w === b.c) return { r: a.r, c: a.c, h: a.h, w: a.w + b.w }
    if (b.c + b.w === a.c) return { r: a.r, c: b.c, h: a.h, w: a.w + b.w }
  }
  if (a.c === b.c && a.w === b.w) {
    if (a.r + a.h === b.r) return { r: a.r, c: a.c, h: a.h + b.h, w: a.w }
    if (b.r + b.h === a.r) return { r: b.r, c: a.c, h: a.h + b.h, w: a.w }
  }
  return null
}

/**
 * Shuffle a finished tiling by merging a neighbouring pair and re-cutting it.
 *
 * The greedy pass claims cells top-left first, which reliably strands leftovers
 * — often 1×1s — along the bottom and right edges. Re-cutting random pairs is a
 * local move that always keeps the tiling exact (a mergeable pair's union is
 * itself a rectangle) and washes that directional bias out of the board.
 */
function relax(
  rects: ShikakuRect[],
  options: PartitionOptions,
  rng: StudioRng,
): ShikakuRect[] {
  const current = [...rects]
  const passes = Math.max(24, current.length * 4)

  for (let pass = 0; pass < passes; pass++) {
    const i = rng.int(0, current.length - 1)
    const a = current[i]!

    const partners: number[] = []
    for (let j = 0; j < current.length; j++) {
      if (j !== i && union(a, current[j]!)) partners.push(j)
    }
    if (partners.length === 0) continue

    const j = rng.pick(partners)
    const merged = union(a, current[j]!)!
    const recut = tileGreedy(merged.h, merged.w, options, rng)
    if (!recut) continue
    /**
     * Two blocks in, two blocks out. The count has to be held fixed or the
     * chain drifts: accepting every re-cut slides toward confetti (a region has
     * far more fine slicings than coarse ones), while accepting merges slides
     * the other way until every block sits at `maxArea`. Holding at two keeps
     * the greedy pass's block-size mix and spends the passes purely on shape.
     */
    if (recut.length !== 2) continue

    // Drop the pair (high index first so the low index stays valid), then add the cut.
    const [lo, hi] = i < j ? [i, j] : [j, i]
    current.splice(hi, 1)
    current.splice(lo, 1)
    for (const rect of recut) {
      current.push({ r: merged.r + rect.r, c: merged.c + rect.c, h: rect.h, w: rect.w })
    }
  }

  return current
}

/** Random partition of `rows`×`cols` into rectangles obeying `options`. */
export function randomPartition(
  rows: number,
  cols: number,
  options: PartitionOptions,
  rng: StudioRng,
): ShikakuRect[] | null {
  const tiled = tileGreedy(rows, cols, options, rng)
  return tiled ? relax(tiled, options, rng) : null
}
