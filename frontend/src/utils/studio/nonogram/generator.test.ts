import { describe, it, expect } from 'vitest'
import { createRng } from '../studio-rng'
import { canonicalBitmapKey, dihedralTransform } from './bitmap-draw'
import { cluesFromBitmap, columnOf, lineClue } from './clues'
import { maxClueEntries } from './difficulty'
import { descendingStaircase, familiesForStyle, NONOGRAM_FAMILIES } from './families'
import { buildNonogram } from './generator'
import { solveAndCount, traceLineSolve } from './solver'
import {
  NONOGRAM_DIFFICULTIES,
  NONOGRAM_SIZES,
  NONOGRAM_STYLES,
  type NonogramDifficulty,
  type NonogramPuzzle,
  type NonogramSize,
  type NonogramStyle,
} from './types'

function build(
  size: NonogramSize,
  seed: number,
  difficulty: NonogramDifficulty = 'medium',
  style: NonogramStyle = 'mixed',
): NonogramPuzzle {
  return buildNonogram({ size, difficulty, style, rng: createRng(seed) })
}

describe('nonogram correctness', () => {
  it('every puzzle has exactly one solution', () => {
    for (const size of [5, 10] as const) {
      for (let seed = 1; seed <= 40; seed++) {
        const p = build(size, seed)
        const { count } = solveAndCount(p.rowClues, p.colClues, size, 2)
        expect(count, `size ${size} seed ${seed}`).toBe(1)
      }
    }
  })

  it('every puzzle is solvable by logic alone — never by guessing', () => {
    for (const size of NONOGRAM_SIZES) {
      for (const difficulty of NONOGRAM_DIFFICULTIES) {
        for (let seed = 1; seed <= 8; seed++) {
          const p = build(size, seed * 31, difficulty)
          const trace = traceLineSolve(p.rowClues, p.colClues, size)
          expect(trace.solved, `size ${size} ${difficulty} seed ${seed}`).toBe(true)
        }
      }
    }
  })

  it('clues match the bitmap exactly', () => {
    for (const size of NONOGRAM_SIZES) {
      for (let seed = 1; seed <= 10; seed++) {
        const p = build(size, seed)
        for (let r = 0; r < size; r++) {
          expect(lineClue(p.bitmap[r]!)).toEqual(p.rowClues[r])
        }
        for (let c = 0; c < size; c++) {
          expect(lineClue(columnOf(p.bitmap, c))).toEqual(p.colClues[c])
        }
      }
    }
  })

  it('row-clue and column-clue totals agree', () => {
    for (const size of NONOGRAM_SIZES) {
      const p = build(size, 99)
      const rowSum = p.rowClues.flat().reduce((a, b) => a + b, 0)
      const colSum = p.colClues.flat().reduce((a, b) => a + b, 0)
      expect(rowSum).toBe(colSum)
    }
  })

  it('empty lines use clue 0', () => {
    expect(lineClue([false, false, false])).toEqual([0])
  })

  it('never throws for any size / difficulty / style combination', () => {
    for (const size of NONOGRAM_SIZES) {
      for (const difficulty of NONOGRAM_DIFFICULTIES) {
        for (const style of NONOGRAM_STYLES) {
          expect(() =>
            build(size, size * 7 + style.length, difficulty, style),
          ).not.toThrow()
        }
      }
    }
  })
})

describe('nonogram print quality', () => {
  it('keeps clue gutters inside the printable budget', () => {
    for (const size of NONOGRAM_SIZES) {
      const limit = maxClueEntries(size)
      for (let seed = 1; seed <= 12; seed++) {
        const p = build(size, seed * 17)
        expect(p.metrics.maxRowClueLen, `size ${size}`).toBeLessThanOrEqual(limit)
        expect(p.metrics.maxColClueLen, `size ${size}`).toBeLessThanOrEqual(limit)
      }
    }
  })

  it('keeps the grid neither near-empty nor near-solid', () => {
    for (const size of NONOGRAM_SIZES) {
      for (let seed = 1; seed <= 12; seed++) {
        const p = build(size, seed * 13)
        expect(p.metrics.density).toBeGreaterThanOrEqual(0.28)
        expect(p.metrics.density).toBeLessThanOrEqual(0.72)
      }
    }
  })
})

describe('nonogram difficulty', () => {
  it('hits the requested tier for the vast majority of seeds', () => {
    for (const size of NONOGRAM_SIZES) {
      for (const difficulty of NONOGRAM_DIFFICULTIES) {
        let hits = 0
        const trials = 20
        for (let seed = 1; seed <= trials; seed++) {
          const p = build(size, seed * 101 + size, difficulty)
          if (p.difficulty === difficulty) hits++
        }
        expect(hits / trials, `size ${size} ${difficulty}`).toBeGreaterThanOrEqual(0.9)
      }
    }
  })

  it('reports a tier that matches its own score', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const p = build(10, seed * 7, 'hard')
      if (p.difficulty === 'easy') expect(p.metrics.score).toBeLessThanOrEqual(0.34)
      if (p.difficulty === 'hard') expect(p.metrics.score).toBeGreaterThanOrEqual(0.52)
    }
  })

  it('makes easy puzzles genuinely easier than hard ones', () => {
    const scoreFor = (difficulty: NonogramDifficulty): number => {
      let total = 0
      for (let seed = 1; seed <= 15; seed++) {
        total += build(15, seed * 41, difficulty).metrics.score
      }
      return total / 15
    }
    expect(scoreFor('easy')).toBeLessThan(scoreFor('medium'))
    expect(scoreFor('medium')).toBeLessThan(scoreFor('hard'))
  })
})

describe('nonogram variety', () => {
  it('every family can produce a printable puzzle at every size', () => {
    // A family that never survives the quality gates is dead weight: the style
    // that advertises it would quietly fall back to something else.
    for (const size of NONOGRAM_SIZES) {
      for (const family of NONOGRAM_FAMILIES) {
        const rng = createRng(size * 977 + family.id.length)
        let produced = 0
        for (let attempt = 0; attempt < 120 && produced === 0; attempt++) {
          const bitmap = dihedralTransform(
            family.draw(size, 0.3 + rng.next() * 0.3, rng),
            rng.int(0, 7),
          )
          const { rowClues, colClues } = cluesFromBitmap(bitmap)
          if (Math.max(...rowClues.map((c) => c.length)) > maxClueEntries(size)) continue
          if (Math.max(...colClues.map((c) => c.length)) > maxClueEntries(size)) continue
          if (traceLineSolve(rowClues, colClues, size).solved) produced++
        }
        expect(produced, `${family.id} at ${size}×${size}`).toBeGreaterThan(0)
      }
    }
  })

  it('draws on many different families across a book-length run', () => {
    const families = new Set<string>()
    for (let seed = 1; seed <= 120; seed++) {
      families.add(build(10, seed * 37).familyId)
    }
    expect(families.size).toBeGreaterThanOrEqual(10)
  })

  it('honours the requested style', () => {
    for (const style of ['symmetric', 'geometric', 'organic'] as const) {
      for (const size of NONOGRAM_SIZES) {
        const allowed = new Set(familiesForStyle(style, size).map((f) => f.id))
        expect(allowed.size, `${style} at ${size}`).toBeGreaterThan(2)
        for (let seed = 1; seed <= 10; seed++) {
          const p = build(size, seed * 53 + size, 'medium', style)
          expect(allowed.has(p.familyId), `${style} ${size} → ${p.familyId}`).toBe(true)
        }
      }
    }
  })

  it('produces a distinct grid for every seed, ignoring turns and flips', () => {
    // Two grids that differ only by rotating the page are the same puzzle to a
    // buyer. This is the guard against shipping the same page twice in a book.
    const keys = new Set<string>()
    const runs = 250
    for (let seed = 1; seed <= runs; seed++) {
      keys.add(canonicalBitmapKey(build(10, seed * 7919).bitmap))
    }
    expect(keys.size).toBe(runs)
  })

  it('mostly separates 5×5 grids, where the space is smallest', () => {
    // 5×5 has a real ceiling: 25 cells, and the unique-by-logic requirement rules
    // out most of them. Measured across 400 seeds the distinct rate sits at
    // 90-96% depending on tier, against 99-100% from 10×10 up. Treat 5×5 as a
    // warm-up size rather than the body of a book.
    const keys = new Set<string>()
    const runs = 120
    for (let seed = 1; seed <= runs; seed++) {
      keys.add(canonicalBitmapKey(build(5, seed * 6151).bitmap))
    }
    expect(keys.size / runs).toBeGreaterThanOrEqual(0.95)
  })
})

describe('nonogram fallback', () => {
  it('the safety-net construction is solvable by line logic at every size', () => {
    for (const size of NONOGRAM_SIZES) {
      const bitmap = descendingStaircase(size)
      const { rowClues, colClues } = cluesFromBitmap(bitmap)
      expect(traceLineSolve(rowClues, colClues, size).solved, `${size}`).toBe(true)
    }
  })
})

describe('canonicalBitmapKey', () => {
  it('is identical for all eight turns and flips of a grid', () => {
    const bitmap = build(10, 4242).bitmap
    const key = canonicalBitmapKey(bitmap)
    for (let i = 0; i < 8; i++) {
      expect(canonicalBitmapKey(dihedralTransform(bitmap, i))).toBe(key)
    }
  })

  it('differs for genuinely different grids', () => {
    expect(canonicalBitmapKey(build(10, 1).bitmap)).not.toBe(
      canonicalBitmapKey(build(10, 2).bitmap),
    )
  })
})
