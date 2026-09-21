import { describe, it, expect } from 'vitest'
import { createRng } from '../studio-rng'
import {
  buildHitoriPuzzle,
  countHitoriSolutions,
  noWhiteDuplicates,
  noAdjacentShaded,
  whiteCellsConnected,
} from './generator'

describe('hitori correctness', () => {
  it(
    'every generated puzzle has EXACTLY one solution',
    () => {
      for (let seed = 1; seed <= 100; seed++) {
        const p = buildHitoriPuzzle(8, 'medium', createRng(seed))
        expect(countHitoriSolutions(p.grid, 8, 2)).toBe(1)
      }
    },
    120_000,
  )

  it(
    'the stored solution satisfies rule 1: no white duplicates',
    () => {
      for (let seed = 1; seed <= 50; seed++) {
        const p = buildHitoriPuzzle(8, 'medium', createRng(seed))
        expect(noWhiteDuplicates(p.grid, p.shading, 8)).toBe(true)
      }
    },
    60_000,
  )

  it(
    'rule 2: no two shaded cells are orthogonally adjacent',
    () => {
      for (let seed = 1; seed <= 50; seed++) {
        const p = buildHitoriPuzzle(8, 'medium', createRng(seed))
        expect(noAdjacentShaded(p.shading, 8)).toBe(true)
        for (let r = 0; r < 8; r++) {
          for (let c = 0; c < 8; c++) {
            if (!p.shading[r]![c]) continue
            if (r + 1 < 8) expect(p.shading[r + 1]![c]).toBe(false)
            if (c + 1 < 8) expect(p.shading[r]![c + 1]).toBe(false)
          }
        }
      }
    },
    60_000,
  )

  it(
    'rule 3: all white cells are connected',
    () => {
      for (let seed = 1; seed <= 50; seed++) {
        const p = buildHitoriPuzzle(8, 'medium', createRng(seed))
        expect(whiteCellsConnected(p.shading, 8)).toBe(true)
      }
    },
    60_000,
  )

  it('easy 5×5 puzzles generate uniquely', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const p = buildHitoriPuzzle(5, 'easy', createRng(seed))
      expect(countHitoriSolutions(p.grid, 5, 2)).toBe(1)
    }
  })
})
