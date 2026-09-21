import { describe, it, expect } from 'vitest'
import { createRng } from '../studio-rng'
import { generateAbstractHalf } from './patterns'
import {
  reflectHorizontal,
  reflectVertical,
  reflectBoth,
  reflectFor,
  isGivenSide,
} from './reflect'

describe('mirror-draw reflection', () => {
  it('the full pattern is symmetric across the vertical axis', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const half = generateAbstractHalf(10, 'vertical', createRng(seed))
      const full = reflectHorizontal(half.grid, 10, 5)
      for (let r = 0; r < 10; r++) {
        for (let c = 0; c < 10; c++) {
          expect(full[r]![c]).toBe(full[r]![9 - c])
        }
      }
    }
  })

  it('the given half is preserved exactly', () => {
    const half = generateAbstractHalf(10, 'vertical', createRng(1))
    const full = reflectHorizontal(half.grid, 10, 5)
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 5; c++) {
        expect(full[r]![c]).toBe(half.grid[r]![c])
      }
    }
  })

  it('horizontal reflection is symmetric top↔bottom', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const half = generateAbstractHalf(12, 'horizontal', createRng(seed))
      const full = reflectVertical(half.grid, 6, 12)
      for (let r = 0; r < 12; r++) {
        for (let c = 0; c < 12; c++) {
          expect(full[r]![c]).toBe(full[11 - r]![c])
        }
      }
    }
  })

  it('both-axes reflection is symmetric on both axes', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const half = generateAbstractHalf(8, 'both', createRng(seed))
      const full = reflectBoth(half.grid, 4)
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          expect(full[r]![c]).toBe(full[r]![7 - c])
          expect(full[r]![c]).toBe(full[7 - r]![c])
        }
      }
    }
  })

  it('reflectFor matches axis helpers', () => {
    const v = generateAbstractHalf(10, 'vertical', createRng(3))
    expect(reflectFor('vertical', v.grid, 10)).toEqual(reflectHorizontal(v.grid, 10, 5))
    const h = generateAbstractHalf(10, 'horizontal', createRng(4))
    expect(reflectFor('horizontal', h.grid, 10)).toEqual(reflectVertical(h.grid, 5, 10))
  })

  it('isGivenSide splits the grid correctly', () => {
    expect(isGivenSide(0, 0, 10, 'vertical')).toBe(true)
    expect(isGivenSide(0, 5, 10, 'vertical')).toBe(false)
    expect(isGivenSide(0, 3, 10, 'horizontal')).toBe(true)
    expect(isGivenSide(5, 3, 10, 'horizontal')).toBe(false)
    expect(isGivenSide(2, 2, 10, 'both')).toBe(true)
    expect(isGivenSide(2, 7, 10, 'both')).toBe(false)
  })
})
