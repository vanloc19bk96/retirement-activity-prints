import type { StudioRng } from '../studio-rng'

export type SudokuSize = 6 | 9

/** [boxWidth, boxHeight] in cells. */
export const BOX_DIMS: Record<SudokuSize, [number, number]> = {
  9: [3, 3],
  6: [2, 3],
}

export function emptyGrid(size: number): number[][] {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => 0))
}

export function range(from: number, toInclusive: number): number[] {
  const out: number[] = []
  for (let n = from; n <= toInclusive; n++) out.push(n)
  return out
}

export function allCellPositions(size: number): { r: number; c: number }[] {
  const cells: { r: number; c: number }[] = []
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) cells.push({ r, c })
  }
  return cells
}

export function isValidPlacement(
  grid: number[][],
  r: number,
  c: number,
  val: number,
  size: number,
): boolean {
  const [boxW, boxH] = BOX_DIMS[size as SudokuSize]
  for (let i = 0; i < size; i++) {
    if (grid[r][i] === val || grid[i][c] === val) return false
  }
  const boxRow = Math.floor(r / boxH) * boxH
  const boxCol = Math.floor(c / boxW) * boxW
  for (let rr = 0; rr < boxH; rr++) {
    for (let cc = 0; cc < boxW; cc++) {
      if (grid[boxRow + rr][boxCol + cc] === val) return false
    }
  }
  return true
}

function fillBox(
  grid: number[][],
  startR: number,
  startC: number,
  boxW: number,
  boxH: number,
  size: number,
  rng: StudioRng,
): void {
  const values = rng.shuffle(range(1, size))
  let i = 0
  for (let rr = 0; rr < boxH; rr++) {
    for (let cc = 0; cc < boxW; cc++) {
      grid[startR + rr][startC + cc] = values[i++]
    }
  }
}

function fillCell(
  grid: number[][],
  pos: number,
  size: number,
  rng: StudioRng,
): boolean {
  if (pos === size * size) return true
  const r = Math.floor(pos / size)
  const c = pos % size
  if (grid[r][c] !== 0) return fillCell(grid, pos + 1, size, rng)

  const candidates = rng.shuffle(range(1, size))
  for (const val of candidates) {
    if (isValidPlacement(grid, r, c, val, size)) {
      grid[r][c] = val
      if (fillCell(grid, pos + 1, size, rng)) return true
      grid[r][c] = 0
    }
  }
  return false
}

/**
 * Fill every empty (0) cell of a partly placed grid by randomized backtracking.
 * Returns false when the placed cells admit no completion.
 */
export function completeGrid(grid: number[][], size: SudokuSize, rng: StudioRng): boolean {
  return fillCell(grid, 0, size, rng)
}

/**
 * Backtracking fill with randomized candidates.
 * 9×9 prefills independent diagonal boxes (always completable) for speed.
 * 6×6 starts empty — rectangular 2×3 boxes are not independently completable.
 */
export function generateSolvedGrid(size: SudokuSize, rng: StudioRng): number[][] {
  const grid = emptyGrid(size)
  const [boxW, boxH] = BOX_DIMS[size]

  if (size === 9 && boxW === boxH) {
    for (let b = 0; b < size; b += boxW) {
      fillBox(grid, b, b, boxW, boxH, size, rng)
    }
  }

  const ok = fillCell(grid, 0, size, rng)
  if (!ok) {
    throw new Error('Sudoku generation failed — should not happen for valid sizes')
  }
  return grid
}

/** Cap early — we only need to distinguish 1 vs >1 solutions. */
export function countSolutions(grid: number[][], size: number, cap: number): number {
  const g = grid.map((row) => [...row])
  let count = 0

  function solve(pos: number): boolean {
    if (count >= cap) return true
    if (pos === size * size) {
      count++
      return count >= cap
    }
    const r = Math.floor(pos / size)
    const c = pos % size
    if (g[r][c] !== 0) return solve(pos + 1)
    for (let val = 1; val <= size; val++) {
      if (isValidPlacement(g, r, c, val, size)) {
        g[r][c] = val
        if (solve(pos + 1)) return true
        g[r][c] = 0
      }
    }
    return false
  }

  solve(0)
  return count
}

/**
 * Remove cells while uniqueness holds. Actual clue count may exceed targetClues.
 */
export function carvePuzzle(
  solved: number[][],
  targetClues: number,
  size: number,
  rng: StudioRng,
): number[][] {
  const puzzle = solved.map((row) => [...row])
  const cells = rng.shuffle(allCellPositions(size))
  let clueCount = size * size

  for (const { r, c } of cells) {
    if (clueCount <= targetClues) break
    const backup = puzzle[r][c]
    puzzle[r][c] = 0
    if (countSolutions(puzzle, size, 2) === 1) {
      clueCount--
    } else {
      puzzle[r][c] = backup
    }
  }
  return puzzle
}

export function isFullyValid(grid: number[][], size: number): boolean {
  const expected = range(1, size)

  for (let r = 0; r < size; r++) {
    const row = [...grid[r]].sort((a, b) => a - b)
    if (row.join() !== expected.join()) return false
  }
  for (let c = 0; c < size; c++) {
    const col = grid.map((row) => row[c]).sort((a, b) => a - b)
    if (col.join() !== expected.join()) return false
  }

  const [boxW, boxH] = BOX_DIMS[size as SudokuSize]
  for (let br = 0; br < size; br += boxH) {
    for (let bc = 0; bc < size; bc += boxW) {
      const vals: number[] = []
      for (let rr = 0; rr < boxH; rr++) {
        for (let cc = 0; cc < boxW; cc++) {
          vals.push(grid[br + rr][bc + cc])
        }
      }
      vals.sort((a, b) => a - b)
      if (vals.join() !== expected.join()) return false
    }
  }
  return true
}

/** Every given matches the stored solution; empties are 0. */
export function givensMatchSolution(
  puzzle: number[][],
  solved: number[][],
  size: number,
): boolean {
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const given = puzzle[r][c]
      const answer = solved[r][c]
      if (answer < 1 || answer > size) return false
      if (given !== 0 && given !== answer) return false
    }
  }
  return true
}
