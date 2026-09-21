import {
  ORTHO,
  whiteCellsConnected,
  wouldShadeDisconnect,
} from './rules'
import type { Shading } from './types'

/** 0 = unknown, 1 = white (keep), -1 = shaded */
export type Cell = 0 | 1 | -1

export function cloneState(state: Cell[][]): Cell[][] {
  return state.map((row) => row.slice() as Cell[])
}

export function toShading(state: Cell[][], n: number): Shading {
  return Array.from({ length: n }, (_, r) =>
    Array.from({ length: n }, (_, c) => state[r]![c] === -1),
  )
}

export function setWhite(state: Cell[][], r: number, c: number): boolean {
  if (state[r]![c] === -1) return false
  state[r]![c] = 1
  return true
}

export function setShaded(
  state: Cell[][],
  n: number,
  r: number,
  c: number,
): boolean {
  if (state[r]![c] === 1) return false
  state[r]![c] = -1
  for (const [dr, dc] of ORTHO) {
    const nr = r + dr
    const nc = c + dc
    if (nr < 0 || nr >= n || nc < 0 || nc >= n) continue
    if (state[nr]![nc] === -1) return false
    state[nr]![nc] = 1
  }
  return true
}

function hasContradiction(
  grid: number[][],
  state: Cell[][],
  n: number,
): boolean {
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (state[r]![c] !== -1) continue
      for (const [dr, dc] of ORTHO) {
        const nr = r + dr
        const nc = c + dc
        if (nr < 0 || nr >= n || nc < 0 || nc >= n) continue
        if (state[nr]![nc] === -1) return true
      }
    }
  }

  for (let r = 0; r < n; r++) {
    const seen = new Map<number, number>()
    for (let c = 0; c < n; c++) {
      if (state[r]![c] !== 1) continue
      const v = grid[r]![c]!
      if (seen.has(v)) return true
      seen.set(v, c)
    }
  }
  for (let c = 0; c < n; c++) {
    const seen = new Map<number, number>()
    for (let r = 0; r < n; r++) {
      if (state[r]![c] !== 1) continue
      const v = grid[r]![c]!
      if (seen.has(v)) return true
      seen.set(v, r)
    }
  }

  const soft: Shading = Array.from({ length: n }, (_, r) =>
    Array.from({ length: n }, (_, c) => state[r]![c] === -1),
  )
  return !whiteCellsConnected(soft, n)
}

function canShade(state: Cell[][], n: number, r: number, c: number): boolean {
  if (state[r]![c] === 1) return false
  for (const [dr, dc] of ORTHO) {
    const nr = r + dr
    const nc = c + dc
    if (nr < 0 || nr >= n || nc < 0 || nc >= n) continue
    if (state[nr]![nc] === -1) return false
  }
  const soft: Shading = Array.from({ length: n }, (_, rr) =>
    Array.from({ length: n }, (_, cc) => state[rr]![cc] === -1),
  )
  return !wouldShadeDisconnect(soft, n, r, c)
}

/**
 * Forced deductions: XYX sandwich, duplicate→shade, adjacent-pair forcing,
 * shaded-neighbor→white, connectivity necessity.
 */
export function applyForcedDeductions(
  grid: number[][],
  state: Cell[][],
  n: number,
): boolean {
  let changed = true
  while (changed) {
    changed = false

    for (let r = 0; r < n; r++) {
      for (let c = 1; c < n - 1; c++) {
        if (grid[r]![c - 1] !== grid[r]![c + 1]) continue
        if (state[r]![c] === 0) {
          if (!setWhite(state, r, c)) return false
          changed = true
        } else if (state[r]![c] === -1) {
          return false
        }
      }
    }
    for (let c = 0; c < n; c++) {
      for (let r = 1; r < n - 1; r++) {
        if (grid[r - 1]![c] !== grid[r + 1]![c]) continue
        if (state[r]![c] === 0) {
          if (!setWhite(state, r, c)) return false
          changed = true
        } else if (state[r]![c] === -1) {
          return false
        }
      }
    }

    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (state[r]![c] !== 0) continue
        const v = grid[r]![c]!
        let mustShade = false
        for (let cc = 0; cc < n; cc++) {
          if (cc !== c && grid[r]![cc] === v && state[r]![cc] === 1) {
            mustShade = true
            break
          }
        }
        if (!mustShade) {
          for (let rr = 0; rr < n; rr++) {
            if (rr !== r && grid[rr]![c] === v && state[rr]![c] === 1) {
              mustShade = true
              break
            }
          }
        }
        if (mustShade) {
          if (!setShaded(state, n, r, c)) return false
          changed = true
        }
      }
    }

    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (state[r]![c] !== 0) continue
        for (const [dr, dc] of ORTHO) {
          const nr = r + dr
          const nc = c + dc
          if (nr < 0 || nr >= n || nc < 0 || nc >= n) continue
          if (grid[nr]![nc] !== grid[r]![c]) continue
          if (state[nr]![nc] !== 0 && state[nr]![nc] !== 1) continue
          if (!canShade(state, n, r, c)) {
            if (state[r]![c] === 0) {
              if (!setWhite(state, r, c)) return false
              changed = true
            }
            if (state[nr]![nc] === 0) {
              if (!setShaded(state, n, nr, nc)) return false
              changed = true
            }
          }
        }
      }
    }

    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (state[r]![c] !== 0) continue
        const soft: Shading = Array.from({ length: n }, (_, rr) =>
          Array.from({ length: n }, (_, cc) => state[rr]![cc] === -1),
        )
        if (wouldShadeDisconnect(soft, n, r, c)) {
          if (!setWhite(state, r, c)) return false
          changed = true
        }
      }
    }

    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (state[r]![c] !== -1) continue
        for (const [dr, dc] of ORTHO) {
          const nr = r + dr
          const nc = c + dc
          if (nr < 0 || nr >= n || nc < 0 || nc >= n) continue
          if (state[nr]![nc] === 0) {
            if (!setWhite(state, nr, nc)) return false
            changed = true
          } else if (state[nr]![nc] === -1) {
            return false
          }
        }
      }
    }

    if (hasContradiction(grid, state, n)) return false
  }

  return !hasContradiction(grid, state, n)
}

export function isComplete(state: Cell[][], n: number): boolean {
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (state[r]![c] === 0) return false
    }
  }
  return true
}
