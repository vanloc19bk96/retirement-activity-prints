import { describe, it, expect } from 'vitest'
import { createRng } from '../studio-rng'
import {
  generateSolvedGrid,
  carvePuzzle,
  countSolutions,
  isFullyValid,
  givensMatchSolution,
} from './solver'
import { generateRatedPuzzle, hashSudokuGrid, preflightSudoku, clueCount, matchesRequestedDifficulty } from './puzzle'
import { ratePuzzle } from './rate'

describe('sudoku uniqueness guarantee', () => {
  it('every generated puzzle has EXACTLY one solution', () => {
    for (let seed = 1; seed <= 40; seed++) {
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
    expect(givensMatchSolution(puzzle, solved, 9)).toBe(true)
  })

  it('generateSolvedGrid always produces a fully valid 9×9', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const grid = generateSolvedGrid(9, createRng(seed))
      expect(isFullyValid(grid, 9)).toBe(true)
    }
  })

  it('6×6 produces unique valid puzzles', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const rng = createRng(seed)
      const solved = generateSolvedGrid(6, rng)
      expect(isFullyValid(solved, 6)).toBe(true)
      const puzzle = carvePuzzle(solved, 16, 6, rng)
      expect(countSolutions(puzzle, 6, 2)).toBe(1)
      expect(givensMatchSolution(puzzle, solved, 6)).toBe(true)
    }
  })
})

describe('sudoku rated generation', () => {
  it('6×6 and 9×9 rated puzzles pass preflight', () => {
    for (const size of [6, 9] as const) {
      const built = generateRatedPuzzle(size, 'classic', createRng(11))
      expect(preflightSudoku(built)).toBeNull()
      expect(countSolutions(built.puzzle, size, 2)).toBe(1)
      expect(
        matchesRequestedDifficulty({
          rating: ratePuzzle(built.puzzle, size),
          difficulty: 'classic',
          size,
          clues: clueCount(built.puzzle, size),
        }),
      ).toBe(true)
    }
  }, 30_000)

  it('each difficulty matches the requested rating', () => {
    for (const difficulty of ['relaxed', 'classic', 'challenge'] as const) {
      const built = generateRatedPuzzle(9, difficulty, createRng(99))
      expect(preflightSudoku(built)).toBeNull()
      expect(
        matchesRequestedDifficulty({
          rating: ratePuzzle(built.puzzle, 9),
          difficulty,
          size: 9,
          clues: clueCount(built.puzzle, 9),
        }),
      ).toBe(true)
    }
  }, 60_000)

  it('duplicate hashes are skipped for a second puzzle', () => {
    const rng = createRng(3)
    const first = generateRatedPuzzle(6, 'relaxed', rng)
    const usedP = new Set([first.puzzleHash])
    const usedS = new Set([first.solutionHash])
    const second = generateRatedPuzzle(6, 'relaxed', rng, usedP, usedS)
    expect(second.puzzleHash).not.toBe(first.puzzleHash)
    expect(second.solutionHash).not.toBe(first.solutionHash)
    expect(hashSudokuGrid(second.puzzle)).toBe(second.puzzleHash)
  }, 20_000)
})
