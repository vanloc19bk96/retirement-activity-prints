import { describe, it, expect } from 'vitest'
import { createRng } from '../studio-rng'
import {
  generateSolvedGrid,
  carvePuzzle,
  countSolutions,
  isFullyValid,
} from './solver'

describe('sudoku uniqueness guarantee', () => {
  it('every generated puzzle has EXACTLY one solution', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const rng = createRng(seed)
      const solved = generateSolvedGrid(9, rng)
      const puzzle = carvePuzzle(solved, 30, 9, rng)
      expect(countSolutions(puzzle, 9, 2)).toBe(1)
    }
  })

  it('the given clues in the puzzle match the solved grid exactly', () => {
    const rng = createRng(42)
    const solved = generateSolvedGrid(9, rng)
    const puzzle = carvePuzzle(solved, 30, 9, rng)
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (puzzle[r][c] !== 0) expect(puzzle[r][c]).toBe(solved[r][c])
      }
    }
  })

  it('generateSolvedGrid always produces a fully valid grid', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const grid = generateSolvedGrid(9, createRng(seed))
      expect(isFullyValid(grid, 9)).toBe(true)
    }
  })

  it('4×4 and 6×6 also produce unique puzzles', () => {
    for (const size of [4, 6] as const) {
      const target = size === 4 ? 8 : 16
      for (let seed = 1; seed <= 20; seed++) {
        const rng = createRng(seed)
        const solved = generateSolvedGrid(size, rng)
        expect(isFullyValid(solved, size)).toBe(true)
        const puzzle = carvePuzzle(solved, target, size, rng)
        expect(countSolutions(puzzle, size, 2)).toBe(1)
      }
    }
  })
})
