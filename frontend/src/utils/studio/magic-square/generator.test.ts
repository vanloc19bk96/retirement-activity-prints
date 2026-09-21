import { describe, it, expect } from 'vitest'
import { createRng } from '../studio-rng'
import {
  BANK_ORDERS,
  DIFF_BLANKS,
  MAGIC_ORDERS,
  bankLayers,
  buildBaseSquare,
  diagonalLatinSpecs,
  buildMagicPuzzle,
  buildMagicSquare,
  carveBlanks,
  countBlanks,
  countMagicSolutions,
  isMagic,
  isMagicUnder,
  isPermutationOfRange,
  lineCells,
  lineTotal,
  luxSinglyEvenSquare,
  magicConstant,
  normalConstant,
  parametricOddSquare,
  rollMapping,
  searchMagicSquare,
  siameseOddSquare,
  solvableByElimination,
  supportsMixed,
  supportsMultiply,
} from './generator'
import type { MagicDifficulty, MagicNumberSet, MagicOrder } from './types'

const DIFFICULTIES: MagicDifficulty[] = ['easy', 'medium', 'hard']
const NUMBER_SETS: MagicNumberSet[] = ['normal', 'shifted', 'step', 'mixed', 'multiply']

function puzzleFor(
  order: MagicOrder,
  overrides: {
    difficulty?: MagicDifficulty
    numberSet?: MagicNumberSet
    hideConstant?: boolean
    seed?: number
  } = {},
) {
  const seed = overrides.seed ?? 1
  return buildMagicPuzzle(
    {
      order,
      difficulty: overrides.difficulty ?? 'medium',
      mapping: rollMapping(order, overrides.numberSet ?? 'normal', createRng(seed)),
      hideConstant: overrides.hideConstant ?? false,
    },
    createRng(seed * 7919 + 13),
  )
}

describe('magic-square construction', () => {
  it('every constructed square is magic and uses 1…n² once', () => {
    for (const n of MAGIC_ORDERS) {
      for (let seed = 1; seed <= 40; seed++) {
        const sq = buildBaseSquare(n, createRng(seed))
        expect(isMagic(sq, n), `order ${n} seed ${seed}`).toBe(true)
        expect(isPermutationOfRange(sq, n), `order ${n} seed ${seed}`).toBe(true)
        expect(magicConstant(sq, n)).toBe(normalConstant(n))
      }
    }
  })

  it('each construction family stands on its own', () => {
    for (const n of [3, 5, 7]) {
      const sq = parametricOddSquare(n, createRng(n * 31))
      expect(sq, `parametric ${n}`).not.toBeNull()
      expect(isMagic(sq!, n) && isPermutationOfRange(sq!, n)).toBe(true)
      expect(isMagic(siameseOddSquare(n), n)).toBe(true)
    }
    const four = searchMagicSquare(4, createRng(99))
    expect(four).not.toBeNull()
    expect(isMagic(four!, 4) && isPermutationOfRange(four!, 4)).toBe(true)

    const six = luxSinglyEvenSquare(6, createRng(5))
    expect(six).not.toBeNull()
    expect(isMagic(six!, 6) && isPermutationOfRange(six!, 6)).toBe(true)
    // LUX only covers n ≡ 2 (mod 4).
    expect(luxSinglyEvenSquare(4, createRng(5))).toBeNull()
  })

  it('rejects orders it has no construction for', () => {
    // No 2×2 magic square exists, and LUX needs n ≡ 2 (mod 4) with n ≥ 6.
    expect(() => buildBaseSquare(2, createRng(1))).toThrow()
    // 8 is not offered in the form but the doubly-even fallback still covers it.
    expect(isMagic(buildBaseSquare(8, createRng(1)), 8)).toBe(true)
  })

  /**
   * The regression that motivated the engine: the fixed Siamese / doubly-even
   * constructions could only ever emit 8 squares per order (one square and its
   * dihedral images), so a puzzle book repeated the same arrangement every few
   * pages. 3×3 genuinely has only 8 — every larger order must do far better.
   */
  it('produces many distinct arrangements per order', () => {
    const floors: Record<number, number> = { 3: 8, 4: 50, 5: 55, 6: 20, 7: 55 }
    for (const n of MAGIC_ORDERS) {
      const seen = new Set<string>()
      // Order 3 has only 8 squares in total, so it needs more draws to cover
      // them all — and at 0.1 ms per build it is free to ask for them.
      const seeds = n === 3 ? 150 : 60
      for (let seed = 1; seed <= seeds; seed++) {
        seen.add(JSON.stringify(buildBaseSquare(n, createRng(seed * 7919 + 13))))
      }
      expect(seen.size, `order ${n}`).toBeGreaterThanOrEqual(floors[n]!)
    }
  })

  /**
   * The property a free-value bank rests on, and the reason it cannot cover
   * every order: each line of *both* layers must carry every symbol exactly
   * once. Order 3 has no diagonal Latin square at all and order 6 has no
   * orthogonal pair, so neither can host one.
   */
  it('bank layers are diagonal-latin and orthogonal where they exist', () => {
    expect(diagonalLatinSpecs(3)).toHaveLength(0)
    expect(bankLayers(6, createRng(1))).toBeNull()

    for (const n of [4, 5, 7]) {
      expect(bankLayers(n, createRng(n)), `order ${n}`).not.toBeNull()
      for (let seed = 1; seed <= 20; seed++) {
        const { high, low } = bankLayers(n, createRng(seed))!
        for (const line of lineCells(n)) {
          for (const layer of [high, low]) {
            const symbols = new Set(line.map(({ r, c }) => layer[r]![c]!))
            expect(symbols.size, `order ${n} seed ${seed}`).toBe(n)
          }
        }
        // Orthogonality: all n² (high, low) symbol pairs occur exactly once.
        const pairs = new Set(
          high.flatMap((row, i) => row.map((h, j) => `${h}:${low[i]![j]}`)),
        )
        expect(pairs.size, `order ${n} seed ${seed}`).toBe(n * n)
      }
    }
  })

  it('back-compat offset shifts the constant', () => {
    const sq = buildMagicSquare(3, 10, createRng(1))
    expect(magicConstant(sq, 3)).toBe(15 + 3 * 10)
    expect(isMagic(sq, 3)).toBe(true)
  })
})

describe('magic-square puzzles', () => {
  it('every blank is reachable one line at a time', () => {
    for (const order of MAGIC_ORDERS) {
      for (const difficulty of DIFFICULTIES) {
        for (let seed = 1; seed <= 8; seed++) {
          const p = puzzleFor(order, { difficulty, seed })
          expect(countBlanks(p.blank)).toBeGreaterThan(0)
          expect(
            solvableByElimination(p.grid, p.blank, order, p.constant, p.operation),
            `order ${order} ${difficulty} seed ${seed}`,
          ).toBe(true)
        }
      }
    }
  })

  it('difficulty hits its blank target and the ladder rises', () => {
    for (const order of MAGIC_ORDERS) {
      let previous = 0
      for (const difficulty of DIFFICULTIES) {
        const blanks = Array.from({ length: 8 }, (_, i) =>
          countBlanks(puzzleFor(order, { difficulty, seed: i + 1 }).blank),
        )
        expect(Math.min(...blanks), `order ${order} ${difficulty}`).toBe(
          DIFF_BLANKS[order][difficulty],
        )
        expect(DIFF_BLANKS[order][difficulty]).toBeGreaterThan(previous)
        previous = DIFF_BLANKS[order][difficulty]
      }
    }
  })

  it('additive puzzles have exactly one completion', () => {
    for (const order of MAGIC_ORDERS) {
      for (let seed = 1; seed <= 8; seed++) {
        const p = puzzleFor(order, { difficulty: 'hard', seed })
        expect(countMagicSolutions(p.grid, p.blank, order, 2), `order ${order}`).toBe(1)
      }
    }
  })

  it('hiding the target leaves one line complete to read it off', () => {
    for (const order of MAGIC_ORDERS) {
      for (let seed = 1; seed <= 10; seed++) {
        const p = puzzleFor(order, { difficulty: 'hard', hideConstant: true, seed })
        const intact = lineCells(order).some((line) =>
          line.every(({ r, c }) => !p.blank[r]![c]),
        )
        expect(intact, `order ${order} seed ${seed}`).toBe(true)
      }
    }
  })

  it('every number set stays magic under its own operation', () => {
    for (const numberSet of NUMBER_SETS) {
      for (const order of MAGIC_ORDERS) {
        for (let seed = 1; seed <= 8; seed++) {
          const p = puzzleFor(order, { numberSet, seed })
          expect(
            isMagicUnder(p.grid, order, p.operation),
            `${numberSet} order ${order}`,
          ).toBe(true)
          expect(lineTotal(p.grid[0]!, p.operation)).toBe(p.constant)
          expect(new Set(p.grid.flat()).size).toBe(order * order)
          expect(p.grid.flat().every((v) => v > 0)).toBe(true)
        }
      }
    }
  })

  it('multiply builds a product square on 3×3 and falls back elsewhere', () => {
    const three = puzzleFor(3, { numberSet: 'multiply' })
    expect(supportsMultiply(3)).toBe(true)
    expect(three.operation).toBe('multiply')
    for (const line of lineCells(3)) {
      expect(line.reduce((product, { r, c }) => product * three.grid[r]![c]!, 1)).toBe(
        three.constant,
      )
    }
    for (const order of [4, 5, 6, 7] as MagicOrder[]) {
      expect(supportsMultiply(order)).toBe(false)
      expect(puzzleFor(order, { numberSet: 'multiply' }).operation).toBe('add')
    }
  })

  /**
   * The KDP problem this mode exists for: a standard grid is pinned to one
   * line total forever (15 at 3×3, 34 at 4×4, 175 at 7×7), and 3×3 has only
   * eight squares in existence, so a book reprints the same page. A mixed bank
   * frees the total, which frees the whole square with it.
   */
  it('mixed banks break the one-constant-per-order ceiling', () => {
    for (const order of BANK_ORDERS) {
      const fixed = new Set<number>()
      const mixedConstants = new Set<number>()
      const mixedGrids = new Set<string>()
      for (let seed = 1; seed <= 60; seed++) {
        fixed.add(puzzleFor(order, { numberSet: 'normal', seed }).constant)
        const p = puzzleFor(order, { numberSet: 'mixed', seed })
        mixedConstants.add(p.constant)
        mixedGrids.add(JSON.stringify(p.grid))
      }
      expect(fixed.size, `normal order ${order}`).toBe(1)
      expect(mixedConstants.size, `mixed order ${order}`).toBeGreaterThanOrEqual(15)
      expect(mixedGrids.size, `mixed order ${order}`).toBeGreaterThanOrEqual(55)
    }
  })

  it('mixed keeps cells printable and falls back on 6×6', () => {
    for (const order of MAGIC_ORDERS) {
      for (let seed = 1; seed <= 20; seed++) {
        const values = puzzleFor(order, { numberSet: 'mixed', seed }).grid.flat()
        expect(Math.min(...values), `order ${order}`).toBeGreaterThan(0)
        expect(Math.max(...values), `order ${order}`).toBeLessThan(1000)
      }
    }
    // 6×6 has no orthogonal layer pair, so it quietly serves the 1…36 bank.
    expect(supportsMixed(6)).toBe(false)
    expect(puzzleFor(6, { numberSet: 'mixed' }).constant).toBe(normalConstant(6))
    for (const order of BANK_ORDERS) expect(supportsMixed(order)).toBe(true)
  })

  it('multiply spreads across a wide printable product pool', () => {
    const products = new Set<number>()
    const grids = new Set<string>()
    for (let seed = 1; seed <= 120; seed++) {
      const p = puzzleFor(3, { numberSet: 'multiply', seed })
      products.add(p.constant)
      grids.add(JSON.stringify(p.grid))
      expect(Math.max(...p.grid.flat())).toBeLessThan(1000)
    }
    // Old root-21 pool had only 8 products; the expanded pool must clear that.
    expect(products.size).toBeGreaterThanOrEqual(12)
    expect(grids.size).toBeGreaterThanOrEqual(80)
    for (const product of products) {
      // Every line product is the centre cell cubed — the 3×3 multiplicative
      // identity — and the banner prints it, so it must stay at five digits.
      expect(Math.round(Math.cbrt(product)) ** 3).toBe(product)
      expect(product).toBeLessThan(100_000)
    }
  })

  it('stepped and shifted sets describe their own bank', () => {
    const shifted = puzzleFor(4, { numberSet: 'shifted', seed: 3 })
    const values = shifted.grid.flat().sort((a, b) => a - b)
    expect(shifted.bankSentence).toBe(
      `each number from ${values[0]} to ${values[values.length - 1]}`,
    )

    const stepped = puzzleFor(4, { numberSet: 'step', seed: 3 })
    const stepValues = stepped.grid.flat().sort((a, b) => a - b)
    const stride = stepValues[1]! - stepValues[0]!
    expect(stride).toBeGreaterThan(1)
    expect(stepped.bankSentence).toContain(`counting by ${stride}s`)
    for (let i = 1; i < stepValues.length; i++) {
      expect(stepValues[i]! - stepValues[i - 1]!).toBe(stride)
    }
  })

  it('carving is deterministic for a seed and varies across seeds', () => {
    const full = buildBaseSquare(4, createRng(1))
    const a = carveBlanks(full, 4, 6, createRng(9))
    const b = carveBlanks(full, 4, 6, createRng(9))
    const c = carveBlanks(full, 4, 6, createRng(10))
    expect(a).toEqual(b)
    expect(a).not.toEqual(c)
  })

  it('stays well under a frame budget on the densest config', () => {
    const started = performance.now()
    for (let seed = 1; seed <= 10; seed++) {
      puzzleFor(4, { difficulty: 'hard', numberSet: 'step', hideConstant: true, seed })
    }
    // Order 4 is the slow one (randomized search); everything else is sub-ms.
    expect((performance.now() - started) / 10).toBeLessThan(250)
  })
})
