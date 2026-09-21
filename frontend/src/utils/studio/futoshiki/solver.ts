import type { StudioRng } from '../studio-rng'
import {
  allCells,
  emptyGrid,
  enumerateSigns,
  generateLatinSquare,
} from './latin'
import type {
  FutoshikiDifficulty,
  FutoshikiPuzzle,
  FutoshikiSign,
  FutoshikiSize,
  FutoshikiStyle,
} from './types'

export type {
  Cell,
  FutoshikiDifficulty,
  FutoshikiPuzzle,
  FutoshikiSign,
  FutoshikiSize,
  FutoshikiStyle,
} from './types'
export {
  allCells,
  emptyGrid,
  enumerateSigns,
  generateLatinSquare,
  isLatinSquare,
  range,
  signGlyph,
  verticalSignGlyph,
} from './latin'

const GIVEN_RATIO: Record<FutoshikiDifficulty, number> = {
  easy: 0.35,
  medium: 0.18,
  hard: 0.05,
}

/** Keep at least this fraction of adjacent-pair signs (easy = more footholds). */
const SIGN_KEEP_RATIO: Record<FutoshikiDifficulty, number> = {
  easy: 0.5,
  medium: 0.3,
  hard: 0.15,
}

/** Abort uniqueness search early while carving — keep the clue if unverified. */
const CARVE_NODE_BUDGET = 25_000

function signSatisfied(va: number, vb: number, relation: '<' | '>'): boolean {
  return relation === '<' ? va < vb : va > vb
}

interface SignEdge {
  otherR: number
  otherC: number
  /** True when this cell is the left/top endpoint (`a`) of the stored sign. */
  isA: boolean
  relation: '<' | '>'
}

function buildSignEdges(signs: FutoshikiSign[], n: number): SignEdge[][] {
  const edges: SignEdge[][] = Array.from({ length: n * n }, () => [])
  for (const s of signs) {
    const ai = s.a.r * n + s.a.c
    const bi = s.b.r * n + s.b.c
    edges[ai].push({
      otherR: s.b.r,
      otherC: s.b.c,
      isA: true,
      relation: s.relation,
    })
    edges[bi].push({
      otherR: s.a.r,
      otherC: s.a.c,
      isA: false,
      relation: s.relation,
    })
  }
  return edges
}

function placementOk(
  grid: number[][],
  r: number,
  c: number,
  val: number,
  rowMask: number[],
  colMask: number[],
  edges: SignEdge[][],
  n: number,
): boolean {
  const bit = 1 << val
  if (rowMask[r] & bit) return false
  if (colMask[c] & bit) return false

  for (const e of edges[r * n + c]) {
    const otherVal = grid[e.otherR][e.otherC]
    if (otherVal === 0) continue
    const va = e.isA ? val : otherVal
    const vb = e.isA ? otherVal : val
    if (!signSatisfied(va, vb, e.relation)) return false
  }
  return true
}

export interface CountSolutionsOptions {
  /** Soft cap on search nodes; when exceeded returns `cap` (treat as non-unique). */
  maxNodes?: number
}

/**
 * Cap early — we only need to distinguish 1 vs >1 solutions.
 * With `maxNodes`, an unfinished search returns `cap` so carving keeps the clue.
 */
export function countSolutions(
  givens: number[][],
  signs: FutoshikiSign[],
  n: number,
  cap: number,
  options: CountSolutionsOptions = {},
): number {
  const maxNodes = options.maxNodes ?? Number.POSITIVE_INFINITY
  const g = givens.map((row) => [...row])
  const edges = buildSignEdges(signs, n)
  const rowMask = Array.from({ length: n }, () => 0)
  const colMask = Array.from({ length: n }, () => 0)

  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const v = g[r][c]
      if (v !== 0) {
        rowMask[r] |= 1 << v
        colMask[c] |= 1 << v
      }
    }
  }

  let count = 0
  let nodes = 0

  function solve(): boolean {
    if (count >= cap) return true
    if (++nodes > maxNodes) {
      count = cap
      return true
    }

    let bestR = -1
    let bestC = -1
    let bestCandidates: number[] | null = null

    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (g[r][c] !== 0) continue
        const candidates: number[] = []
        for (let v = 1; v <= n; v++) {
          if (placementOk(g, r, c, v, rowMask, colMask, edges, n)) {
            candidates.push(v)
          }
        }
        if (candidates.length === 0) return false
        if (!bestCandidates || candidates.length < bestCandidates.length) {
          bestR = r
          bestC = c
          bestCandidates = candidates
          if (candidates.length === 1) break
        }
      }
      if (bestCandidates?.length === 1) break
    }

    if (!bestCandidates) {
      count++
      return count >= cap
    }

    for (const v of bestCandidates) {
      const bit = 1 << v
      g[bestR][bestC] = v
      rowMask[bestR] |= bit
      colMask[bestC] |= bit
      if (solve()) return true
      g[bestR][bestC] = 0
      rowMask[bestR] &= ~bit
      colMask[bestC] &= ~bit
    }
    return false
  }

  solve()
  return count
}

function targetGivens(
  size: FutoshikiSize,
  difficulty: FutoshikiDifficulty,
  style: FutoshikiStyle,
): number {
  if (style === 'pure') return 0
  return Math.round(size * size * GIVEN_RATIO[difficulty])
}

function minSignsToKeep(size: FutoshikiSize, difficulty: FutoshikiDifficulty): number {
  const maxSigns = 2 * size * (size - 1)
  return Math.max(2, Math.round(maxSigns * SIGN_KEEP_RATIO[difficulty]))
}

/**
 * Full adjacent signs uniquely determine each row (total order → unique 1..n
 * permutation), so givens can be thinned without a uniqueness check while all
 * signs remain. Sign thinning is gated by the solver (with a node budget).
 */
export function carveFutoshiki(
  solution: number[][],
  allSigns: FutoshikiSign[],
  size: FutoshikiSize,
  difficulty: FutoshikiDifficulty,
  style: FutoshikiStyle,
  rng: StudioRng,
): { signs: FutoshikiSign[]; givens: number[][] } {
  const givens = emptyGrid(size)
  const givenTarget = targetGivens(size, difficulty, style)
  for (const { r, c } of rng.shuffle(allCells(size)).slice(0, givenTarget)) {
    givens[r][c] = solution[r][c]
  }

  let signs = [...allSigns]
  const signFloor = minSignsToKeep(size, difficulty)

  for (const s of rng.shuffle([...allSigns])) {
    if (signs.length <= signFloor) break
    const trial = signs.filter(
      (x) =>
        !(
          x.a.r === s.a.r &&
          x.a.c === s.a.c &&
          x.b.r === s.b.r &&
          x.b.c === s.b.c
        ),
    )
    if (
      countSolutions(givens, trial, size, 2, { maxNodes: CARVE_NODE_BUDGET }) === 1
    ) {
      signs = trial
    }
  }

  return { signs, givens }
}

const MAX_BUILD_ATTEMPTS = 48

export function buildFutoshikiPuzzle(
  size: FutoshikiSize,
  difficulty: FutoshikiDifficulty,
  style: FutoshikiStyle,
  rng: StudioRng,
): FutoshikiPuzzle {
  for (let attempt = 0; attempt < MAX_BUILD_ATTEMPTS; attempt++) {
    const solution = generateLatinSquare(size, rng)
    const allSigns = enumerateSigns(solution)
    const { signs, givens } = carveFutoshiki(
      solution,
      allSigns,
      size,
      difficulty,
      style,
      rng,
    )

    if (style === 'pure' && givens.flat().some((v) => v !== 0)) continue
    // Final check with no node budget — must be exactly one solution.
    if (countSolutions(givens, signs, size, 2) !== 1) continue

    return { size, givens, signs, solution }
  }

  throw new Error(
    `Could not build a uniquely-solvable Futoshiki (${size}×${size}, ${difficulty}, ${style})`,
  )
}
