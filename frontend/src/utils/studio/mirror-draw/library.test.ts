import { describe, it, expect } from 'vitest'
import { MIRROR_LIBRARY, loadPatterns } from './patterns'
import { reflectHorizontal } from './reflect'

describe('mirror-draw library', () => {
  it('loads curated patterns', () => {
    expect(loadPatterns().length).toBeGreaterThanOrEqual(200)
    expect(MIRROR_LIBRARY.length).toBe(loadPatterns().length)
  })

  it('every pattern dimensions match rows × halfCols', () => {
    for (const pattern of MIRROR_LIBRARY) {
      expect([8, 10, 12, 16]).toContain(pattern.rows)
      expect(pattern.halfCols).toBe(pattern.rows / 2)
      expect(pattern.halfCols * 2).toBe(pattern.rows)
      if (pattern.style === 'pixel') {
        expect(pattern.half.length).toBe(pattern.rows)
        for (const row of pattern.half) {
          expect(row.length).toBe(pattern.halfCols)
          expect(/^[.#]+$/.test(row)).toBe(true)
        }
      } else {
        expect(pattern.segments?.length ?? 0).toBeGreaterThan(0)
      }
    }
  })

  it('reflecting a pixel half yields a left-right symmetric picture', () => {
    for (const pattern of MIRROR_LIBRARY.filter((p) => p.style === 'pixel')) {
      const half = pattern.half.map((row) => [...row].map((ch) => ch === '#'))
      const full = reflectHorizontal(half, pattern.rows, pattern.halfCols)
      const width = pattern.halfCols * 2
      for (let r = 0; r < pattern.rows; r++) {
        for (let c = 0; c < width; c++) {
          expect(full[r]![c]).toBe(full[r]![width - 1 - c])
        }
      }
      // Recognizable payoff: at least a few filled cells.
      const filled = full.flat().filter(Boolean).length
      expect(filled).toBeGreaterThan(0)
    }
  })

  it('covers each grid size and theme', () => {
    for (const size of [8, 10, 12, 16] as const) {
      expect(MIRROR_LIBRARY.some((p) => p.rows === size && p.style === 'pixel')).toBe(true)
    }
    for (const theme of ['animals', 'nature', 'objects'] as const) {
      expect(MIRROR_LIBRARY.some((p) => p.theme === theme)).toBe(true)
    }
  })
})
