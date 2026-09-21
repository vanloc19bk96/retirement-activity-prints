import { BOX_DIMS, type SudokuSize } from './solver'
import {
  applyChallengeEliminations,
  applyClassicEliminations,
  bitOf,
  cellIndex,
  popcount,
  type SudokuRateState,
} from './rate-techniques'

export type SudokuDifficulty = 'relaxed' | 'classic' | 'challenge'

export const DIFFICULTY_RANK: Record<SudokuDifficulty, number> = {
  relaxed: 0,
  classic: 1,
  challenge: 2,
}

export function maxDifficulty(
  a: SudokuDifficulty,
  b: SudokuDifficulty,
): SudokuDifficulty {
  return DIFFICULTY_RANK[a] >= DIFFICULTY_RANK[b] ? a : b
}

function digitOf(mask: number): number {
  return Math.log2(mask) + 1
}

function fullMask(size: number): number {
  return (1 << size) - 1
}

const UNITS_CACHE = new Map<SudokuSize, { peers: number[][]; units: number[][] }>()

function buildPeersAndUnits(size: SudokuSize): { peers: number[][]; units: number[][] } {
  const cached = UNITS_CACHE.get(size)
  if (cached) return cached

  const [boxW, boxH] = BOX_DIMS[size]
  const n = size * size
  const units: number[][] = []

  for (let r = 0; r < size; r++) {
    units.push(Array.from({ length: size }, (_, c) => cellIndex(size, r, c)))
  }
  for (let c = 0; c < size; c++) {
    units.push(Array.from({ length: size }, (_, r) => cellIndex(size, r, c)))
  }
  for (let br = 0; br < size; br += boxH) {
    for (let bc = 0; bc < size; bc += boxW) {
      const box: number[] = []
      for (let rr = 0; rr < boxH; rr++) {
        for (let cc = 0; cc < boxW; cc++) {
          box.push(cellIndex(size, br + rr, bc + cc))
        }
      }
      units.push(box)
    }
  }

  const peers: number[][] = Array.from({ length: n }, () => [])
  for (const unit of units) {
    for (const i of unit) {
      for (const j of unit) {
        if (i !== j && !peers[i]!.includes(j)) peers[i]!.push(j)
      }
    }
  }
  const built = { peers, units }
  UNITS_CACHE.set(size, built)
  return built
}

function place(state: SudokuRateState, idx: number, digit: number): boolean {
  if (state.grid[idx] !== 0) return state.grid[idx] === digit
  const bit = bitOf(digit)
  if ((state.cands[idx] & bit) === 0) return false
  state.grid[idx] = digit
  state.cands[idx] = 0
  state.empty--
  for (const peer of state.peers[idx]!) {
    if (state.grid[peer] !== 0) continue
    const next = state.cands[peer] & ~bit
    if (next === 0) return false
    state.cands[peer] = next
  }
  return true
}

function makeState(puzzle: number[][], size: SudokuSize): SudokuRateState | null {
  const n = size * size
  const { peers, units } = buildPeersAndUnits(size)
  const state: SudokuRateState = {
    size,
    grid: Array.from({ length: n }, () => 0),
    cands: Array.from({ length: n }, () => fullMask(size)),
    empty: n,
    peers,
    units,
  }
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const val = puzzle[r]![c]!
      if (val === 0) continue
      if (!place(state, cellIndex(size, r, c), val)) return null
    }
  }
  return state
}

function placeSingles(state: SudokuRateState): boolean {
  for (let i = 0; i < state.grid.length; i++) {
    if (state.grid[i] !== 0) continue
    if (popcount(state.cands[i]!) !== 1) continue
    if (!place(state, i, digitOf(state.cands[i]!))) return false
    return true
  }
  for (const unit of state.units) {
    for (let digit = 1; digit <= state.size; digit++) {
      const bit = bitOf(digit)
      const spots = unit.filter((i) => state.grid[i] === 0 && (state.cands[i]! & bit) !== 0)
      if (spots.length !== 1) continue
      if (!place(state, spots[0]!, digit)) return false
      return true
    }
  }
  return false
}

function solveWith(
  puzzle: number[][],
  size: SudokuSize,
  maxRank: number,
): SudokuDifficulty | null {
  const state = makeState(puzzle, size)
  if (!state) return null
  let hardest: SudokuDifficulty = 'relaxed'
  let guard = size * size * 8
  while (state.empty > 0 && guard-- > 0) {
    if (placeSingles(state)) continue
    if (maxRank >= 1 && applyClassicEliminations(state)) {
      hardest = maxDifficulty(hardest, 'classic')
      continue
    }
    if (maxRank >= 2 && applyChallengeEliminations(state)) {
      hardest = maxDifficulty(hardest, 'challenge')
      continue
    }
    return null
  }
  return state.empty === 0 ? hardest : null
}

/** Hardest technique needed; `null` means guessing (not a valid retirement puzzle). */
export function ratePuzzle(puzzle: number[][], size: SudokuSize): SudokuDifficulty | null {
  return solveWith(puzzle, size, DIFFICULTY_RANK.challenge)
}

export function isSolvableWith(
  puzzle: number[][],
  size: SudokuSize,
  maxDifficulty: SudokuDifficulty,
): boolean {
  return solveWith(puzzle, size, DIFFICULTY_RANK[maxDifficulty]) !== null
}
