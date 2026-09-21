import { describe, it, expect } from 'vitest'
import { createRng } from '../studio-rng'
import { loadTopologies, allKakuroTopologies } from './topologies'
import { generatePuzzle, extractRuns, countSolutions } from './solver'

describe('kakuro uniqueness guarantee', () => {
  it('every generated puzzle has EXACTLY one solution (clues + starters)', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const bucket = (['small', 'medium', 'large'] as const)[seed % 3]!
      const topology = loadTopologies(bucket)[seed % loadTopologies(bucket).length]!
      const puzzle = generatePuzzle(topology, createRng(seed), 30)
      expect(countSolutions(topology, puzzle.runs, 2, puzzle.givens)).toBe(1)
    }
  }, 120_000)

  it('the stored solution satisfies every clue', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const topology = loadTopologies('medium')[0]!
      const puzzle = generatePuzzle(topology, createRng(seed), 30)
      for (const run of puzzle.runs) {
        const digits = run.cells.map(({ r, c }) => puzzle.grid[r]![c]!)
        expect(new Set(digits).size).toBe(digits.length)
        expect(digits.reduce((a, b) => a + b, 0)).toBe(run.sum)
        expect(digits.every((d) => d >= 1 && d <= 9)).toBe(true)
      }
    }
  }, 60_000)

  it('no run has length 1 or > 9', () => {
    for (const topology of allKakuroTopologies()) {
      for (const run of extractRuns(topology.cells, topology.size)) {
        expect(run.cells.length).toBeGreaterThanOrEqual(2)
        expect(run.cells.length).toBeLessThanOrEqual(9)
      }
    }
  })
})
