import { describe, it, expect } from 'vitest'
import { createRng, deriveSeed } from '../studio-rng'
import {
  generateFigure,
  generateUniqueFigure,
  identityKey,
  isMirrorOf,
  isRotationOf,
  key,
  mirrorH,
  rotateBy,
} from './figure'
import { buildItem, buildItemForDifficulty, CELL_RANGE } from './item'
import { isLegibleShape, legibleShapes } from './polyomino'

describe('rotation geometry', () => {
  it('rotating four times returns the original (incl. accent)', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const f = generateFigure(7, createRng(seed))
      expect(key(rotateBy(f, 4))).toBe(key(f))
    }
  })

  it('generated figures are chiral (mirror is NOT a rotation)', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const f = generateFigure(7, createRng(seed))
      expect(isRotationOf(f, mirrorH(f))).toBe(false)
    }
  })

  it('accent cell stays in the cell set after transforms', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const f = generateFigure(8, createRng(seed))
      for (const q of [0, 1, 2, 3] as const) {
        const rotated = rotateBy(f, q)
        expect(
          rotated.cells.some(
            (c) => c.r === rotated.accent.r && c.c === rotated.accent.c,
          ),
        ).toBe(true)
      }
    }
  })

  it('same-different answers are geometrically correct', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const item = buildItem(7, 'same-different', [90, 180, 270], createRng(seed))
      const cand = item.candidates[0]!
      if (item.answer === 'SAME') {
        expect(isRotationOf(item.ref, cand)).toBe(true)
      } else {
        expect(isMirrorOf(item.ref, cand)).toBe(true)
        expect(isRotationOf(item.ref, cand)).toBe(false)
      }
    }
  })

  it('pick-matches has exactly two correct candidates, foils are true mirrors', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const item = buildItem(7, 'pick-matches', [90, 180, 270], createRng(seed))
      expect(item.correctIndices!.length).toBe(2)
      item.candidates.forEach((cand, i) => {
        if (item.correctIndices!.includes(i)) {
          expect(isRotationOf(item.ref, cand)).toBe(true)
        } else {
          expect(isMirrorOf(item.ref, cand)).toBe(true)
          expect(isRotationOf(item.ref, cand)).toBe(false)
        }
      })
    }
  })

  it('page of 10 easy items keeps distinct reference identities', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const used = new Set<string>()
      const ids: string[] = []
      for (let i = 0; i < 10; i++) {
        const item = buildItemForDifficulty(
          'same-different',
          'easy',
          createRng(deriveSeed(seed, `rot:${i}`)),
          used,
        )
        ids.push(identityKey(item.ref))
      }
      expect(new Set(ids).size).toBe(10)
    }
  })

  it('unique figures keep the requested cell count', () => {
    for (const n of [5, 7, 8, 10]) {
      const used = new Set<string>()
      for (let seed = 1; seed <= 40; seed++) {
        const fig = generateUniqueFigure(n, createRng(seed), used)
        expect(fig.cells.length).toBe(n)
      }
    }
  })

  it('difficulty items stay inside the advertised block range', () => {
    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
      const [min, max] = CELL_RANGE[difficulty]
      for (let seed = 1; seed <= 40; seed++) {
        const used = new Set<string>()
        for (let i = 0; i < 12; i++) {
          const item = buildItemForDifficulty(
            'same-different',
            difficulty,
            createRng(deriveSeed(seed, `rot:${i}`)),
            used,
          )
          const n = item.ref.cells.length
          expect(n).toBeGreaterThanOrEqual(min)
          expect(n).toBeLessThanOrEqual(max)
          expect(item.candidates.every((c) => c.cells.length === n)).toBe(true)
        }
      }
    }
  })

  it('every rotation of a figure looks different', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const f = generateFigure(8, createRng(seed))
      const keys = [0, 1, 2, 3].map((q) => key(rotateBy(f, q)))
      expect(new Set(keys).size).toBe(4)
    }
  })

  it('only emits catalogued, print-legible shapes', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const n = 5 + (seed % 6)
      const f = generateFigure(n, createRng(seed))
      expect(f.cells.length).toBe(n)
      expect(isLegibleShape(f.cells)).toBe(true)
      expect(f.cells.some((c) => c.r === f.accent.r && c.c === f.accent.c)).toBe(true)
    }
  })

  it('rejects the silhouettes that printed unreadably', () => {
    // 1×5 bar, long thin snake, and a spidery sprawl — all previously reachable.
    const bar = [0, 1, 2, 3, 4].map((c) => ({ r: 0, c }))
    const snake = [
      { r: 0, c: 0 },
      { r: 1, c: 0 },
      { r: 2, c: 0 },
      { r: 3, c: 0 },
      { r: 4, c: 0 },
      { r: 4, c: 1 },
    ]
    const sprawl = [
      { r: 0, c: 2 },
      { r: 1, c: 2 },
      { r: 2, c: 0 },
      { r: 2, c: 1 },
      { r: 2, c: 2 },
      { r: 2, c: 3 },
      { r: 2, c: 4 },
      { r: 3, c: 2 },
      { r: 4, c: 2 },
    ]
    // 6×3 ten-omino: prints below MIN_CELL_PX in pick-the-matches on a 6" trim.
    const wideTen = [
      { r: 0, c: 0 },
      { r: 0, c: 1 },
      { r: 0, c: 2 },
      { r: 0, c: 3 },
      { r: 0, c: 4 },
      { r: 0, c: 5 },
      { r: 1, c: 0 },
      { r: 1, c: 1 },
      { r: 2, c: 0 },
      { r: 2, c: 1 },
    ]
    // 10 cells + 1-cell hole: the hole is drawn as a white square, so it counts as 11.
    const holedTen = [
      { r: 0, c: 0 },
      { r: 0, c: 1 },
      { r: 0, c: 2 },
      { r: 0, c: 3 },
      { r: 1, c: 0 },
      { r: 1, c: 1 },
      { r: 1, c: 3 },
      { r: 1, c: 4 },
      { r: 2, c: 1 },
      { r: 2, c: 2 },
    ]
    for (const shape of [bar, snake, sprawl, wideTen, holedTen]) {
      expect(isLegibleShape(shape)).toBe(false)
    }
  })

  it('draws from a pool deep enough that pages rarely repeat', () => {
    // The old preset list held 20 footprints; the catalogue is three orders larger.
    expect(legibleShapes(8).length).toBeGreaterThan(400)
    expect(legibleShapes(10).length).toBeGreaterThan(3000)

    const seen = new Set<string>()
    for (let seed = 1; seed <= 400; seed++) {
      seen.add(identityKey(generateFigure(9, createRng(seed))))
    }
    expect(seen.size).toBeGreaterThan(350)
  })
})
