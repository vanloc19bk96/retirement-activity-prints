import { describe, it, expect } from 'vitest'
import { createRng } from '../studio-rng'
import {
  buildSnakePuzzle,
  countSnakeSolutions,
  usesEachNumberOnce,
  consecutiveAlwaysAdjacent,
} from './generator'

describe('number-snake correctness', () => {
  it(
    'every generated puzzle has EXACTLY one solution',
    () => {
      for (let seed = 1; seed <= 100; seed++) {
        const p = buildSnakePuzzle(7, 7, 'diagonal', 'medium', createRng(seed))
        expect(countSnakeSolutions(p.solution, p.given, 7, 7, 'diagonal', 2)).toBe(1)
      }
    },
    120_000,
  )

  it(
    'the solution is a valid Hamiltonian path (1..N, consecutive adjacent)',
    () => {
      for (let seed = 1; seed <= 50; seed++) {
        const p = buildSnakePuzzle(7, 7, 'diagonal', 'medium', createRng(seed))
        expect(usesEachNumberOnce(p.solution, 49)).toBe(true)
        expect(consecutiveAlwaysAdjacent(p.solution, 7, 7, 'diagonal')).toBe(true)
      }
    },
    60_000,
  )

  it(
    'orthogonal solutions never use a diagonal step',
    () => {
      for (let seed = 1; seed <= 50; seed++) {
        const p = buildSnakePuzzle(7, 7, 'orthogonal', 'medium', createRng(seed))
        expect(consecutiveAlwaysAdjacent(p.solution, 7, 7, 'orthogonal')).toBe(true)
      }
    },
    60_000,
  )

  it(
    'endpoints 1 and N are always given',
    () => {
      const p = buildSnakePuzzle(7, 7, 'diagonal', 'hard', createRng(1))
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
          if (p.solution[r]![c] === 1 || p.solution[r]![c] === 49) {
            expect(p.given[r]![c]).toBe(true)
          }
        }
      }
    },
    30_000,
  )
})
