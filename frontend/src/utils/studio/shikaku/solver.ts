import type { ShikakuClue, ShikakuRect } from './types'

/**
 * Search cap. Hitting it makes `countShikakuSolutions` report `limit`, i.e.
 * "treat as ambiguous" — the generator then throws the candidate away. Bailing
 * pessimistically keeps generation deterministic and never ships a puzzle whose
 * uniqueness we failed to prove.
 */
const NODE_BUDGET = 200_000

/** Every rectangle of the right area that covers this clue and no other. */
export function clueCandidates(
  rows: number,
  cols: number,
  clues: ShikakuClue[],
): ShikakuRect[][] {
  const clueAt = new Int16Array(rows * cols).fill(-1)
  clues.forEach((clue, i) => {
    clueAt[clue.r * cols + clue.c] = i
  })

  return clues.map((clue, index) => {
    const out: ShikakuRect[] = []
    const { value } = clue
    for (let h = 1; h <= Math.min(value, rows); h++) {
      if (value % h !== 0) continue
      const w = value / h
      if (w > cols) continue
      // Slide the block over the clue: it may sit on any of its h×w cells.
      for (let dr = 0; dr < h; dr++) {
        const r0 = clue.r - dr
        if (r0 < 0 || r0 + h > rows) continue
        for (let dc = 0; dc < w; dc++) {
          const c0 = clue.c - dc
          if (c0 < 0 || c0 + w > cols) continue
          let clean = true
          for (let rr = r0; rr < r0 + h && clean; rr++) {
            for (let cc = c0; cc < c0 + w; cc++) {
              const other = clueAt[rr * cols + cc]!
              if (other !== -1 && other !== index) {
                clean = false
                break
              }
            }
          }
          if (clean) out.push({ r: r0, c: c0, h, w })
        }
      }
    }
    return out
  })
}

interface SearchState {
  rows: number
  cols: number
  cover: Int16Array
  placed: Uint8Array
  candidates: ShikakuRect[][]
}

function isLive(state: SearchState, rect: ShikakuRect): boolean {
  const { cover, cols } = state
  for (let rr = rect.r; rr < rect.r + rect.h; rr++) {
    for (let cc = rect.c; cc < rect.c + rect.w; cc++) {
      if (cover[rr * cols + cc] !== -1) return false
    }
  }
  return true
}

function paint(state: SearchState, rect: ShikakuRect, value: number): void {
  const { cover, cols } = state
  for (let rr = rect.r; rr < rect.r + rect.h; rr++) {
    for (let cc = rect.c; cc < rect.c + rect.w; cc++) {
      cover[rr * cols + cc] = value
    }
  }
}

function mark(state: SearchState, reach: Uint8Array, rect: ShikakuRect): void {
  const { cols } = state
  for (let rr = rect.r; rr < rect.r + rect.h; rr++) {
    for (let cc = rect.c; cc < rect.c + rect.w; cc++) {
      reach[rr * cols + cc] = 1
    }
  }
}

/** Clue with the fewest placements left, plus the cells still reachable at all. */
function scanState(state: SearchState): {
  clue: number
  options: ShikakuRect[]
  dead: boolean
} | null {
  const reach = new Uint8Array(state.cover.length)
  let bestClue = -1
  let bestOptions: ShikakuRect[] = []
  let bestCount = Number.POSITIVE_INFINITY

  for (let i = 0; i < state.candidates.length; i++) {
    if (state.placed[i]) continue
    const live: ShikakuRect[] = []
    for (const rect of state.candidates[i]!) {
      if (!isLive(state, rect)) continue
      live.push(rect)
      mark(state, reach, rect)
    }
    if (live.length === 0) return { clue: -1, options: [], dead: true }
    if (live.length < bestCount) {
      bestCount = live.length
      bestClue = i
      bestOptions = live
    }
  }

  if (bestClue === -1) return null

  // A hole no remaining clue can still reach can never be filled.
  for (let k = 0; k < state.cover.length; k++) {
    if (state.cover[k] === -1 && !reach[k]) return { clue: -1, options: [], dead: true }
  }

  return { clue: bestClue, options: bestOptions, dead: false }
}

/**
 * Solutions to the clue set, counted up to `limit`. Returns `limit` when the
 * search budget runs out (see NODE_BUDGET) — callers must read that as
 * "not proven unique", never as a real count.
 */
export function countShikakuSolutions(
  rows: number,
  cols: number,
  clues: ShikakuClue[],
  limit = 2,
): number {
  if (clues.length === 0) return 0
  const total = clues.reduce((sum, clue) => sum + clue.value, 0)
  if (total !== rows * cols) return 0

  const state: SearchState = {
    rows,
    cols,
    cover: new Int16Array(rows * cols).fill(-1),
    placed: new Uint8Array(clues.length),
    candidates: clueCandidates(rows, cols, clues),
  }
  if (state.candidates.some((list) => list.length === 0)) return 0

  let found = 0
  let nodes = 0

  const search = (remaining: number): void => {
    if (found >= limit) return
    if (remaining === 0) {
      found++
      return
    }
    if (++nodes > NODE_BUDGET) {
      found = limit
      return
    }

    const scan = scanState(state)
    if (!scan || scan.dead) return

    for (const rect of scan.options) {
      paint(state, rect, scan.clue)
      state.placed[scan.clue] = 1
      search(remaining - 1)
      state.placed[scan.clue] = 0
      paint(state, rect, -1)
      if (found >= limit) return
    }
  }

  search(clues.length)
  return found
}

/**
 * True when the grid falls out of plain "only one place it can go" reasoning —
 * either a clue with a single remaining placement, or a cell only one block can
 * still reach. This is the deduction an easy-tier solver is expected to use, so
 * it is what gates the easy difficulty.
 */
export function isShikakuForcedSolvable(
  rows: number,
  cols: number,
  clues: ShikakuClue[],
): boolean {
  const state: SearchState = {
    rows,
    cols,
    cover: new Int16Array(rows * cols).fill(-1),
    placed: new Uint8Array(clues.length),
    candidates: clueCandidates(rows, cols, clues),
  }

  let remaining = clues.length
  while (remaining > 0) {
    let move: { clue: number; rect: ShikakuRect } | null = null

    const live: (ShikakuRect[] | null)[] = state.candidates.map((list, i) =>
      state.placed[i] ? null : list.filter((rect) => isLive(state, rect)),
    )

    for (let i = 0; i < live.length && !move; i++) {
      const options = live[i]
      if (!options) continue
      if (options.length === 0) return false
      if (options.length === 1) move = { clue: i, rect: options[0]! }
    }

    if (!move) {
      // Cell-first pass: exactly one surviving block can still cover this hole.
      const owner = new Int16Array(state.cover.length).fill(-1)
      const which: (ShikakuRect | null)[] = new Array(state.cover.length).fill(null)
      const ambiguous = new Uint8Array(state.cover.length)
      live.forEach((options, i) => {
        if (!options) return
        for (const rect of options) {
          for (let rr = rect.r; rr < rect.r + rect.h; rr++) {
            for (let cc = rect.c; cc < rect.c + rect.w; cc++) {
              const k = rr * cols + cc
              if (owner[k] === -1) {
                owner[k] = i
                which[k] = rect
              } else if (owner[k] !== i || which[k] !== rect) {
                ambiguous[k] = 1
              }
            }
          }
        }
      })
      for (let k = 0; k < owner.length && !move; k++) {
        if (state.cover[k] !== -1 || ambiguous[k] || owner[k] === -1) continue
        move = { clue: owner[k]!, rect: which[k]! }
      }
    }

    if (!move) return false
    paint(state, move.rect, move.clue)
    state.placed[move.clue] = 1
    remaining--
  }

  return true
}
