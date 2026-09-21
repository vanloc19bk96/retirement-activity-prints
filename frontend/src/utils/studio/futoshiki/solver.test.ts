import { describe, it, expect } from 'vitest'
import { createRng } from '../studio-rng'
import {
  buildFutoshikiPuzzle,
  countSolutions,
  generateLatinSquare,
  isLatinSquare,
  signGlyph,
  verticalSignGlyph,
} from './solver'

describe('futoshiki correctness', () => {
  it('every generated puzzle has EXACTLY one solution', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const p = buildFutoshikiPuzzle(5, 'medium', 'mixed', createRng(seed))
      expect(countSolutions(p.givens, p.signs, 5, 2)).toBe(1)
    }
  })

  it('the solution is a valid Latin square', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const p = buildFutoshikiPuzzle(5, 'medium', 'mixed', createRng(seed))
      expect(isLatinSquare(p.solution, 5)).toBe(true)
    }
  })

  it('every sign is satisfied by the solution', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const p = buildFutoshikiPuzzle(5, 'medium', 'mixed', createRng(seed))
      for (const s of p.signs) {
        const va = p.solution[s.a.r][s.a.c]
        const vb = p.solution[s.b.r][s.b.c]
        expect(s.relation === '<' ? va < vb : va > vb).toBe(true)
      }
    }
  })

  it('given clues match the solution', () => {
    const p = buildFutoshikiPuzzle(5, 'medium', 'mixed', createRng(42))
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        if (p.givens[r][c] !== 0) expect(p.givens[r][c]).toBe(p.solution[r][c])
      }
    }
  })

  it('pure style has zero givens', () => {
    const p = buildFutoshikiPuzzle(5, 'hard', 'pure', createRng(1))
    expect(p.givens.flat().every((v) => v === 0)).toBe(true)
    expect(countSolutions(p.givens, p.signs, 5, 2)).toBe(1)
  })

  it('generateLatinSquare always produces a Latin square', () => {
    for (const size of [4, 5, 6, 7] as const) {
      for (let seed = 1; seed <= 10; seed++) {
        expect(isLatinSquare(generateLatinSquare(size, createRng(seed)), size)).toBe(
          true,
        )
      }
    }
  })

  it('sign glyphs: open side faces the larger number', () => {
    expect(verticalSignGlyph(true)).toBe('∨')
    expect(verticalSignGlyph(false)).toBe('∧')

    expect(
      signGlyph({
        a: { r: 0, c: 0 },
        b: { r: 0, c: 1 },
        relation: '<',
      }),
    ).toBe('<')
    expect(
      signGlyph({
        a: { r: 0, c: 0 },
        b: { r: 0, c: 1 },
        relation: '>',
      }),
    ).toBe('>')
    // Top larger than bottom → open faces up (∨)
    expect(
      signGlyph({
        a: { r: 0, c: 0 },
        b: { r: 1, c: 0 },
        relation: '>',
      }),
    ).toBe('∨')
    // Bottom larger → open faces down (∧)
    expect(
      signGlyph({
        a: { r: 0, c: 0 },
        b: { r: 1, c: 0 },
        relation: '<',
      }),
    ).toBe('∧')
  })

  it('4×4 and 6×6 also produce unique puzzles', () => {
    for (const size of [4, 6] as const) {
      for (let seed = 1; seed <= 20; seed++) {
        const p = buildFutoshikiPuzzle(size, 'medium', 'mixed', createRng(seed))
        expect(countSolutions(p.givens, p.signs, size, 2)).toBe(1)
      }
    }
  })
})
