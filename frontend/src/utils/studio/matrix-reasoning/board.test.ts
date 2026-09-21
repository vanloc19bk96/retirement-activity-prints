import { describe, it, expect, beforeEach } from 'vitest'
import { createRng } from '../studio-rng'
import { clearStudioRecentContent } from '../studio-variety'
import {
  assembleCells,
  boardId,
  boardSignature,
  buildBoard,
  limitsFor,
  partitionSignature,
  planId,
  randomLatinSquare,
  valueIndexAt,
} from './board'
import { solveBoard } from './solver'
import { buildMatrixItems } from './variety'
import {
  figureKey,
  isPrintable,
  planLabel,
  ruleLabel,
  type AttributeRule,
  type Difficulty,
  type Figure,
} from './types'

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard']
const SEEDS = Array.from({ length: 40 }, (_, i) => 1_000 + i * 7_919)

const RESTING: Figure = {
  shape: 'circle',
  count: 1,
  fill: 'hollow',
  size: 'medium',
  mark: 'none',
}

/** Boards for one tier, drawn from independent seeds. */
function sample(difficulty: Difficulty, count: number) {
  return Array.from({ length: count }, (_, i) =>
    buildBoard({ difficulty }, createRng(1 + i * 7_919)),
  )
}

describe('randomLatinSquare', () => {
  it('puts each value once in every row and column', () => {
    for (const seed of SEEDS) {
      const square = randomLatinSquare(createRng(seed))
      for (let i = 0; i < 3; i++) {
        expect(new Set(square[i]!).size, `row ${i} of seed ${seed}`).toBe(3)
        expect(new Set([0, 1, 2].map((r) => square[r]![i]!)).size).toBe(3)
      }
    }
  })
})

describe('assembleCells', () => {
  it('holds a rowConstant channel steady along each row', () => {
    const rule: AttributeRule = {
      attribute: 'shape',
      kind: 'rowConstant',
      values: ['circle', 'square', 'triangle'],
    }
    const values = Array.from({ length: 9 }, (_, i) => rule.values![valueIndexAt(rule, (i / 3) | 0, i % 3)]!)
    const cells = assembleCells([{ rule, values }], RESTING)
    for (let r = 0; r < 3; r++) {
      const row = [0, 1, 2].map((c) => cells[r * 3 + c]!.shape)
      expect(new Set(row).size).toBe(1)
      expect(row[0]).toBe(rule.values![r])
    }
  })
})

describe('limitsFor', () => {
  /** A mark is a hole in the ink around it — solid paint swallows it whole. */
  it('bars solid paint, small figures and crowded cells once marks are in play', () => {
    const limits = limitsFor(['shape', 'mark'], true)
    expect(limits.fill).not.toContain('solid')
    expect(limits.size).not.toContain('small')
    expect(limits.count).not.toContain(3)
    expect(limits.shape).not.toContain('star')
  })

  it('drops quantities of three on a trim that cannot print them', () => {
    expect(limitsFor(['count'], false).count).toEqual([1, 2])
    expect(limitsFor(['count'], true).count).toEqual([1, 2, 3])
  })
})

describe('partitionSignature', () => {
  it('sees two channels that carve the board up the same way', () => {
    const rows = ['a', 'a', 'a', 'b', 'b', 'b', 'c', 'c', 'c']
    const same = ['x', 'x', 'x', 'y', 'y', 'y', 'z', 'z', 'z']
    const columns = ['a', 'b', 'c', 'a', 'b', 'c', 'a', 'b', 'c']
    expect(partitionSignature(rows as never)).toBe(partitionSignature(same as never))
    expect(partitionSignature(rows as never)).not.toBe(partitionSignature(columns as never))
  })
})

describe('buildBoard', () => {
  beforeEach(clearStudioRecentContent)

  /**
   * The one property the whole template rests on. A printed grid that supports
   * two readings marks a correct reader wrong, and a book of those is what gets
   * a KDP account complaints and returns — so every board is solved back from
   * its own eight visible cells before it is allowed on a page.
   */
  it('leaves exactly one figure that completes the grid', () => {
    for (const difficulty of DIFFICULTIES) {
      for (const board of sample(difficulty, 600)) {
        const solved = solveBoard(board.cells)
        expect(solved, `${difficulty}: ${boardSignature(board.cells)}`).not.toBeNull()
        expect(figureKey(solved!.figure), `${difficulty}`).toBe(figureKey(board.cells[8]!))
      }
    }
  }, 30_000)

  it('never repeats the answer somewhere else on the grid', () => {
    for (const difficulty of DIFFICULTIES) {
      for (const board of sample(difficulty, 400)) {
        const answer = figureKey(board.cells[8]!)
        expect(board.cells.slice(0, 8).map(figureKey)).not.toContain(answer)
      }
    }
  }, 20_000)

  it('only draws figures the printer can render honestly', () => {
    for (const difficulty of DIFFICULTIES) {
      for (const board of sample(difficulty, 400)) {
        for (const cell of board.cells) {
          expect(isPrintable(cell), `${difficulty}: ${figureKey(cell)}`).toBe(true)
        }
      }
    }
  }, 20_000)

  it('never runs two rules that say the same thing twice', () => {
    for (const difficulty of DIFFICULTIES) {
      for (const board of sample(difficulty, 300)) {
        const attributes = board.rules.map((rule) => rule.attribute)
        expect(new Set(attributes).size).toBe(attributes.length)
        expect(board.rules.length).toBeGreaterThanOrEqual(2)
      }
    }
  }, 20_000)

  /** Quantity and size both eat cell space; varying both means three tiny shapes. */
  it('never varies quantity and size on the same board', () => {
    for (const difficulty of DIFFICULTIES) {
      for (const board of sample(difficulty, 400)) {
        const attributes = new Set(board.rules.map((rule) => rule.attribute))
        expect(attributes.has('count') && attributes.has('size')).toBe(false)
      }
    }
  }, 20_000)

  it('honours the trim that cannot print three shapes in a cell', () => {
    for (const difficulty of DIFFICULTIES) {
      for (let seed = 1; seed <= 300; seed++) {
        const board = buildBoard(
          { difficulty, allowTriples: false },
          createRng(seed * 7_919),
        )
        for (const cell of board.cells) expect(cell.count).toBeLessThanOrEqual(2)
      }
    }
  }, 20_000)

  /**
   * The smallest trims turn both of the fine-detail channels off, so their pool
   * has to be deep enough on its own — a 5×8 book cannot be allowed to repeat
   * itself just because it prints no marks and no triples.
   */
  it('still fills a book on a trim that allows neither marks nor triples', () => {
    const SAMPLE = 1_500
    for (const difficulty of DIFFICULTIES) {
      const boards = new Set<string>()
      for (let seed = 1; seed <= SAMPLE; seed++) {
        const board = buildBoard(
          { difficulty, allowTriples: false, allowMarks: false },
          createRng(seed * 7_919 + 5),
        )
        for (const cell of board.cells) {
          expect(cell.mark, `${difficulty} seed ${seed}`).toBe('none')
          expect(cell.count).toBeLessThanOrEqual(2)
        }
        boards.add(boardSignature(board.cells))
      }
      expect(boards.size / SAMPLE, `${difficulty}`).toBeGreaterThan(0.9)
    }
  }, 60_000)

  /**
   * A tier is a promise about how much work the page asks for. `hard` that a
   * reader finishes by matching rows is a mislabelled page, and a book sold on
   * its difficulty curve is the thing being mislabelled.
   */
  it('asks as much of the reader as its tier promised', () => {
    const tiers = new Map<Difficulty, Set<number>>()
    for (const difficulty of DIFFICULTIES) {
      tiers.set(difficulty, new Set(sample(difficulty, 400).map((board) => board.tier)))
    }
    expect(Math.min(...tiers.get('easy')!)).toBeGreaterThanOrEqual(1)
    expect(Math.max(...tiers.get('easy')!)).toBeLessThanOrEqual(2)
    expect(Math.min(...tiers.get('medium')!)).toBeGreaterThanOrEqual(2)
    expect(tiers.get('hard')!).toEqual(new Set([3]))
  }, 30_000)

  /**
   * Rule *vocabulary*, not just rule instances: a book whose every page is
   * "shape by row, paint by column" is a book of one puzzle printed forty
   * times, however different the shapes are.
   */
  it('uses every rule family it advertises', () => {
    const kinds = new Set<string>()
    for (const difficulty of DIFFICULTIES) {
      for (const board of sample(difficulty, 500)) {
        for (const rule of board.rules) kinds.add(ruleLabel(rule).split(':')[1]!)
      }
    }
    for (const kind of [
      'rowConstant',
      'columnConstant',
      'latin',
      'xor-row',
      'xor-column',
      'and-row',
      'or-row',
      'sum-row',
      'sum-column',
    ]) {
      expect(kinds, kind).toContain(kind)
    }
  }, 30_000)

  /**
   * The batch duplicate check compares whole rendered pages, so it cannot see a
   * grid repeat on its own — it is the size of the board pool that decides
   * whether one book prints the same matrix twice. Guard the pool directly.
   */
  it('draws boards from a pool deep enough to fill a shelf of books', () => {
    const SAMPLE = 3_000
    for (const difficulty of DIFFICULTIES) {
      const boards = new Set<string>()
      const plans = new Set<string>()
      for (let seed = 1; seed <= SAMPLE; seed++) {
        const board = buildBoard({ difficulty }, createRng(seed * 7_919 + 13))
        boards.add(boardSignature(board.cells))
        plans.add(planLabel(board.rules))
      }
      expect(boards.size / SAMPLE, `${difficulty} boards`).toBeGreaterThan(0.96)
      expect(plans.size, `${difficulty} plans`).toBeGreaterThanOrEqual(30)
    }
  }, 60_000)

  it('skips a plan the caller has printed lately', () => {
    const rng = () => createRng(4_242)
    const first = buildBoard({ difficulty: 'medium' }, rng())
    const avoided = buildBoard(
      { difficulty: 'medium', avoidPlans: new Set([planId(first.rules)]) },
      rng(),
    )
    expect(planLabel(avoided.rules)).not.toBe(planLabel(first.rules))
  })

  it('skips a board the caller has printed lately', () => {
    const rng = () => createRng(9_001)
    const first = buildBoard({ difficulty: 'hard' }, rng())
    const avoided = buildBoard(
      { difficulty: 'hard', avoidBoards: new Set([boardId(first.cells)]) },
      rng(),
    )
    expect(boardSignature(avoided.cells)).not.toBe(boardSignature(first.cells))
  })
})

describe('buildMatrixItems variety', () => {
  beforeEach(clearStudioRecentContent)

  it('never prints the same board twice on one page', () => {
    for (const difficulty of DIFFICULTIES) {
      for (const seed of [42, 7, 2_024, 90_210]) {
        clearStudioRecentContent()
        const boards = buildMatrixItems({
          itemCount: 3,
          optionCount: 6,
          difficulty,
          seed,
        }).map((item) => boardSignature(item.cells))
        expect(new Set(boards).size, `${difficulty} seed ${seed}`).toBe(boards.length)
      }
    }
  })

  /**
   * The layer a seed cannot provide. A fresh seed is perfectly happy to re-roll
   * a rule plan the seller has already printed forty times, which is how a
   * 120-page book ends up feeling like one puzzle — so the last few sittings
   * are remembered and steered away from.
   */
  it('moves on from what this seller printed last time', () => {
    clearStudioRecentContent()
    const shared = { itemCount: 1, optionCount: 6, difficulty: 'medium' as const, seed: 3_141 }
    const first = buildMatrixItems({ ...shared, ownerKey: 'seller' })
    const second = buildMatrixItems({ ...shared, ownerKey: 'seller' })
    expect(boardSignature(second[0]!.cells)).not.toBe(boardSignature(first[0]!.cells))
  })

  it('spreads a book over the rule vocabulary', () => {
    clearStudioRecentContent()
    const plans = new Set<string>()
    const boards = new Set<string>()
    for (let page = 0; page < 30; page++) {
      for (const item of buildMatrixItems({
        itemCount: 2,
        optionCount: 6,
        difficulty: 'medium',
        seed: 500 + page * 977,
        ownerKey: 'seller',
      })) {
        plans.add(planLabel(item.rules))
        boards.add(boardSignature(item.cells))
      }
    }
    expect(boards.size).toBe(60)
    expect(plans.size).toBeGreaterThanOrEqual(20)
  }, 20_000)

  it('parts two sellers who land on the same grid', () => {
    clearStudioRecentContent()
    const shared = { itemCount: 1, optionCount: 6, difficulty: 'medium' as const, seed: 12_345 }
    const a = buildMatrixItems({ ...shared, ownerKey: 'seller-a' })
    clearStudioRecentContent()
    const b = buildMatrixItems({ ...shared, ownerKey: 'seller-b' })
    expect(a[0]!.cells.map(figureKey)).not.toEqual(b[0]!.cells.map(figureKey))
  })
})
