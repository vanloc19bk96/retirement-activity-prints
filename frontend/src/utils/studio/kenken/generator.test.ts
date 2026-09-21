import { describe, it, expect } from 'vitest'
import { createRng } from '../studio-rng'
import {
  buildCalcudokuPuzzle,
  countSolutions,
  applyOp,
  isLatinSquare,
  cageMatchesSolution,
} from './generator'

describe('kenken correctness', () => {
  it('every generated puzzle has EXACTLY one solution', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const p = buildCalcudokuPuzzle(6, 'medium', 'all', createRng(seed))
      expect(countSolutions(6, p.cages, 2)).toBe(1)
    }
  })

  it('solution is a valid Latin square', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const p = buildCalcudokuPuzzle(6, 'medium', 'all', createRng(seed))
      expect(isLatinSquare(p.solution, 6)).toBe(true)
    }
  })

  it('every cage’s digits produce its target under its op', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const p = buildCalcudokuPuzzle(6, 'medium', 'all', createRng(seed))
      for (const cage of p.cages) {
        expect(cageMatchesSolution(cage, p.solution)).toBe(true)
        const digits = cage.cells.map(({ r, c }) => p.solution[r]![c]!)
        expect(applyOp(cage.op, digits)).toBe(cage.target)
      }
    }
  })

  it('subtraction and division cages are 2-cell and integer-safe', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const p = buildCalcudokuPuzzle(6, 'medium', 'all', createRng(seed))
      for (const cage of p.cages) {
        if (cage.op === 'sub' || cage.op === 'div') {
          expect(cage.cells.length).toBe(2)
        }
        if (cage.op === 'div') {
          const [a, b] = cage.cells
            .map(({ r, c }) => p.solution[r]![c]!)
            .sort((x, y) => y - x)
          expect(a! % b!).toBe(0)
        }
      }
    }
  })

  it('cages partition the grid exactly (every cell in exactly one cage)', () => {
    const p = buildCalcudokuPuzzle(6, 'medium', 'all', createRng(1))
    const covered = new Set<string>()
    for (const cage of p.cages) {
      for (const { r, c } of cage.cells) {
        expect(covered.has(`${r},${c}`)).toBe(false)
        covered.add(`${r},${c}`)
      }
    }
    expect(covered.size).toBe(36)
  })

  it('addmul mode uses no subtraction or division', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const p = buildCalcudokuPuzzle(6, 'easy', 'addmul', createRng(seed))
      expect(p.cages.every((c) => c.op !== 'sub' && c.op !== 'div')).toBe(true)
    }
  })
})
