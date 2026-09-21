import type { Shading } from './types'

const ORTHO: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
]

/** Rule 1 — no duplicate among unshaded cells in any row or column. */
export function noWhiteDuplicates(
  grid: number[][],
  shading: Shading,
  n: number,
): boolean {
  for (let r = 0; r < n; r++) {
    const seen = new Set<number>()
    for (let c = 0; c < n; c++) {
      if (shading[r]![c]) continue
      const v = grid[r]![c]!
      if (seen.has(v)) return false
      seen.add(v)
    }
  }
  for (let c = 0; c < n; c++) {
    const seen = new Set<number>()
    for (let r = 0; r < n; r++) {
      if (shading[r]![c]) continue
      const v = grid[r]![c]!
      if (seen.has(v)) return false
      seen.add(v)
    }
  }
  return true
}

/** Rule 2 — shaded cells may not touch orthogonally. */
export function noAdjacentShaded(shading: Shading, n: number): boolean {
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!shading[r]![c]) continue
      if (r + 1 < n && shading[r + 1]![c]) return false
      if (c + 1 < n && shading[r]![c + 1]) return false
    }
  }
  return true
}

/** Rule 3 — all unshaded cells form one orthogonally connected group. */
export function whiteCellsConnected(shading: Shading, n: number): boolean {
  let startR = -1
  let startC = -1
  let whiteCount = 0
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (shading[r]![c]) continue
      whiteCount++
      if (startR < 0) {
        startR = r
        startC = c
      }
    }
  }
  if (whiteCount === 0) return false

  const visited = Array.from({ length: n }, () =>
    Array.from({ length: n }, () => false),
  )
  const stack: Array<[number, number]> = [[startR, startC]]
  visited[startR]![startC] = true
  let seen = 0

  while (stack.length > 0) {
    const [r, c] = stack.pop()!
    seen++
    for (const [dr, dc] of ORTHO) {
      const nr = r + dr
      const nc = c + dc
      if (nr < 0 || nr >= n || nc < 0 || nc >= n) continue
      if (shading[nr]![nc] || visited[nr]![nc]) continue
      visited[nr]![nc] = true
      stack.push([nr, nc])
    }
  }

  return seen === whiteCount
}

export function isValidHitoriSolution(
  grid: number[][],
  shading: Shading,
  n: number,
): boolean {
  return (
    noWhiteDuplicates(grid, shading, n) &&
    noAdjacentShaded(shading, n) &&
    whiteCellsConnected(shading, n)
  )
}

/** Would shading (r,c) disconnect the remaining white region? */
export function wouldShadeDisconnect(
  shading: Shading,
  n: number,
  r: number,
  c: number,
): boolean {
  if (shading[r]![c]) return false
  const probe = shading.map((row) => row.slice())
  probe[r]![c] = true
  return !whiteCellsConnected(probe, n)
}

export { ORTHO }
