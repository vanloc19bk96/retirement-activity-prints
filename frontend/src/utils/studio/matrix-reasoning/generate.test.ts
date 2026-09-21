import { describe, it, expect, beforeEach } from 'vitest'
import { buildMatrixItems, matrixReasoningTemplate } from './generate'
import { isDistinguishable } from './distractors'
import { fitUnit, PITCH_LIMIT, SIZE_FACTOR } from './shapes'
import { ATTRIBUTES, figureKey, isPrintable, SIZE_STEPS, type Figure } from './types'
import { buildDefaultConfig, getStudioTemplate } from '@/constants/studio-templates'
import {
  STUDIO_ANSWER_INK,
  STUDIO_ANSWER_INK_MONO,
  STUDIO_ANSWER_INK_MONO_TEMPLATES,
  STUDIO_INK,
} from '@/constants/studio.constants'
import { resetObjectCounter } from '../studio-fabric-builders'
import { clearStudioRecentContent } from '../studio-variety'
import {
  runGeneratorContractTests,
  assertGeneratorEntropy,
  assertObjectsInSafeMargin,
} from '../studio-generator-test'
import { buildAnswerPage, harvestAnswers } from '../studio-answer-key'
import { MIN_MATRIX_CELL, OPTION_LETTERS } from './draw'
import type { StudioFabricObject, StudioGenerateContext } from '@/types/studio-template.types'

/** 6×9 trim at the editor's 96 DPI — the most common KDP interior. */
const CTX = (): StudioGenerateContext => ({
  pageWidth: 576,
  pageHeight: 864,
  margin: { top: 36, right: 36, bottom: 36, left: 48 },
  seed: 42,
  instanceId: 'test-run',
})

const TRIMS: [string, StudioGenerateContext][] = [
  ['5×8', { ...CTX(), pageWidth: 480, pageHeight: 768 }],
  ['6×9', CTX()],
  [
    '8.5×11',
    {
      ...CTX(),
      pageWidth: 816,
      pageHeight: 1056,
      margin: { top: 48, right: 48, bottom: 48, left: 60 },
    },
  ],
]

const base = {
  ...buildDefaultConfig(matrixReasoningTemplate),
  seed: 42,
  fontFamily: 'PT Serif',
}

function stack(objects: StudioFabricObject[]): StudioFabricObject {
  return objects.find((o) => o.type === 'group')!
}

function kids(objects: StudioFabricObject[]): StudioFabricObject[] {
  return stack(objects).objects ?? []
}

const isFigure = (o: StudioFabricObject): boolean => o.type === 'circle' || o.type === 'polygon'

/** Drawn width of one mark, whichever primitive Fabric got. */
const drawnWidth = (o: StudioFabricObject): number => o.width ?? (o.radius ?? 0) * 2

interface Rect {
  left: number
  top: number
  width: number
  height: number
}

/** Widest figure whose centre sits inside `box` — the outline, not its inner mark. */
function figureWidthIn(objects: StudioFabricObject[], box: Rect): number {
  const inside = objects.filter(
    (o) =>
      isFigure(o) &&
      o.left >= box.left &&
      o.left <= box.left + box.width &&
      o.top >= box.top &&
      o.top <= box.top + box.height,
  )
  return Math.max(0, ...inside.map(drawnWidth))
}

/** The 3×3's outer bounds, read back off the hairline bars that draw it. */
function gridBounds(objects: StudioFabricObject[]): Rect {
  const bars = objects.filter(
    (o) => o.type === 'rect' && o.studioRole === 'structure' && (o.width ?? 0) <= 4,
  )
  const left = Math.min(...bars.map((o) => o.left))
  const right = Math.max(...bars.map((o) => o.left + (o.width ?? 0)))
  const top = Math.min(...bars.map((o) => o.top))
  const bottom = Math.max(...bars.map((o) => o.top + (o.height ?? 0)))
  return { left, top, width: right - left, height: bottom - top }
}

runGeneratorContractTests(matrixReasoningTemplate)
assertGeneratorEntropy(matrixReasoningTemplate)

describe('matrix-reasoning', () => {
  beforeEach(clearStudioRecentContent)

  it('is deterministic', () => {
    resetObjectCounter()
    const a = matrixReasoningTemplate.generate(base, CTX())
    clearStudioRecentContent()
    resetObjectCounter()
    const b = matrixReasoningTemplate.generate(base, CTX())
    expect(a).toEqual(b)
  })

  it('different seeds give different puzzles', () => {
    resetObjectCounter()
    const a = JSON.stringify(matrixReasoningTemplate.generate(base, CTX()))
    clearStudioRecentContent()
    resetObjectCounter()
    const b = JSON.stringify(
      matrixReasoningTemplate.generate({ ...base, seed: 7 }, { ...CTX(), seed: 7 }),
    )
    expect(a).not.toEqual(b)
  })

  it('auto-adds a solution page (no form toggles)', () => {
    expect(matrixReasoningTemplate.producesAnswerKey).toBe(true)
    const registered = getStudioTemplate('matrix-reasoning')
    const regKeys = new Set(registered!.configSchema.map((f) => f.key))
    expect(regKeys.has('includeAnswerKey')).toBe(false)
    expect(regKeys.has('answerKeyForAll')).toBe(false)
  })

  it('marks exactly one choice per puzzle, hidden until the solution', () => {
    for (const itemCount of [1, 2]) {
      clearStudioRecentContent()
      resetObjectCounter()
      const [page] = matrixReasoningTemplate.generate({ ...base, itemCount }, CTX())
      const answers = harvestAnswers(page!.objects)
      expect(answers.length, `${itemCount} puzzles`).toBe(itemCount)
      expect(answers.every((o) => o.visible === false)).toBe(true)
      // A ring, not a blob: transparent fill keeps the figure inside readable.
      expect(answers.every((o) => o.type === 'rect' && o.fill === 'transparent')).toBe(true)
    }
  })

  it('prints one lettered choice box per option', () => {
    for (const optionCount of [4, 6]) {
      clearStudioRecentContent()
      resetObjectCounter()
      const [page] = matrixReasoningTemplate.generate(
        { ...base, itemCount: 1, optionCount },
        CTX(),
      )
      const letters = kids(page!.objects)
        .filter((o) => o.type === 'textbox' && o.studioRole === 'decoration')
        .map((o) => String(o.text))
      expect(letters).toEqual(OPTION_LETTERS.slice(0, optionCount).split(''))
    }
  })

  it('asks with a question mark and answers with the figure', () => {
    resetObjectCounter()
    const [page] = matrixReasoningTemplate.generate({ ...base, itemCount: 1 }, CTX())

    const puzzleMarks = kids(page!.objects).filter(
      (o) => o.type === 'textbox' && String(o.text) === '?',
    )
    expect(puzzleMarks.length).toBe(1)

    const keyStack = buildAnswerPage(page!.answerSourceObjects!, STUDIO_ANSWER_INK_MONO)
    const keyKids = kids(keyStack)
    expect(keyKids.some((o) => o.type === 'textbox' && String(o.text) === '?')).toBe(false)
    // The filled-in cell means the key always draws more figures than the puzzle.
    expect(keyKids.filter(isFigure).length).toBeGreaterThan(
      kids(page!.objects).filter(isFigure).length,
    )
  })

  /**
   * The bug this template was rebuilt around.
   *
   * A choice box used to be sized on its own, so it printed far smaller than a
   * grid cell — and every figure is drawn as a share of the box that holds it.
   * On a board whose rule was *size*, the `small` answer filling a big cell
   * came out wider than the `medium` decoy in a small box, so the key circled a
   * choice that looked nothing like the figure the grid had just shown. Boxes
   * and cells are now one measurement, which is the only way a size rule can be
   * read across the two.
   */
  it('prints the answer in the grid at exactly the size of the choice it circles', () => {
    for (const [name, ctx] of TRIMS) {
      for (const optionCount of [4, 6]) {
        for (let seed = 1; seed <= 25; seed++) {
          clearStudioRecentContent()
          resetObjectCounter()
          const [page] = matrixReasoningTemplate.generate(
            { ...base, itemCount: 1, optionCount, seed, difficulty: 'hard' },
            { ...ctx, seed },
          )
          const parts = kids(page!.answerSourceObjects!)
          const grid = gridBounds(parts)
          const cell = grid.width / 3
          const ring = parts.find((o) => o.studioRole === 'answer')!
          const where = `${name} ${optionCount} choices seed ${seed}`

          // The choice box and the grid cell are the same square.
          expect(Math.abs((ring.width ?? 0) - cell), where).toBeLessThanOrEqual(1)

          const inGrid = figureWidthIn(parts, {
            left: grid.left + 2 * cell,
            top: grid.top + 2 * cell,
            width: cell,
            height: cell,
          })
          const inStrip = figureWidthIn(parts, {
            left: ring.left,
            top: ring.top,
            width: ring.width ?? 0,
            height: ring.height ?? 0,
          })
          expect(inGrid, where).toBeGreaterThan(0)
          expect(Math.abs(inGrid - inStrip), where).toBeLessThanOrEqual(0.5)
        }
      }
    }
  }, 60_000)

  it('keeps the solution artwork the same size as the puzzle', () => {
    resetObjectCounter()
    const [page] = matrixReasoningTemplate.generate(base, CTX())
    const puzzle = stack(page!.objects)
    const key = stack(buildAnswerPage(page!.answerSourceObjects!, STUDIO_ANSWER_INK_MONO))
    expect(Math.abs(key.width! - puzzle.width!)).toBeLessThanOrEqual(2)
    expect(Math.abs(key.height! - puzzle.height!)).toBeLessThanOrEqual(2)
  })

  it('answer key uses black ink, not blue', () => {
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has('matrix-reasoning')).toBe(true)
    resetObjectCounter()
    const [page] = matrixReasoningTemplate.generate(base, CTX())
    const answers = harvestAnswers(
      buildAnswerPage(page!.answerSourceObjects!, STUDIO_ANSWER_INK_MONO),
    )
    expect(answers.length).toBeGreaterThan(0)
    expect(answers.every((o) => o.stroke === STUDIO_INK)).toBe(true)
    expect(answers.every((o) => o.stroke !== STUDIO_ANSWER_INK)).toBe(true)
  })

  it('stays inside the safe area on every trim, tier and count', () => {
    for (const [name, ctx] of TRIMS) {
      for (const difficulty of ['easy', 'medium', 'hard']) {
        for (const itemCount of [1, 2]) {
          for (const optionCount of [4, 6]) {
            clearStudioRecentContent()
            resetObjectCounter()
            const config = {
              ...base,
              difficulty,
              itemCount,
              optionCount,
              showTitle: true,
              title: 'Game 12',
            }
            const pages = matrixReasoningTemplate.generate(config, ctx)
            expect(pages.length, name).toBe(1)
            assertObjectsInSafeMargin(pages[0]!.objects, ctx)
            assertObjectsInSafeMargin(pages[0]!.answerSourceObjects!, ctx)
          }
        }
      }
    }
  }, 60_000)

  it('never prints a grid below the readable floor', () => {
    for (const [name, ctx] of TRIMS) {
      for (const itemCount of [1, 2]) {
        clearStudioRecentContent()
        resetObjectCounter()
        const [page] = matrixReasoningTemplate.generate({ ...base, itemCount }, ctx)
        const grid = gridBounds(kids(page!.objects))
        expect(grid.width / 3, `${name} ${itemCount}`).toBeGreaterThanOrEqual(MIN_MATRIX_CELL)
      }
    }
  })

  /**
   * Countability is a property of the printed page, not of the model: three
   * shapes fit a letter-size cell and turn to mush on a 5×8 one, so the trim
   * decides whether the board may use quantities of three at all.
   */
  it('keeps quantities down to what the smallest trim can print', () => {
    const [, small] = TRIMS[0]!
    for (let seed = 1; seed <= 20; seed++) {
      clearStudioRecentContent()
      resetObjectCounter()
      const [page] = matrixReasoningTemplate.generate(
        { ...base, itemCount: 2, seed },
        { ...small, seed },
      )
      const parts = kids(page!.answerSourceObjects!)
      const grid = gridBounds(parts)
      const cell = grid.width / 3
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          const box = {
            left: grid.left + c * cell,
            top: grid.top + r * cell,
            width: cell,
            height: cell,
          }
          const inCell = parts.filter(
            (o) =>
              (o.type === 'polygon' || o.type === 'circle') &&
              o.left >= box.left &&
              o.left <= box.left + box.width &&
              o.top >= box.top &&
              o.top <= box.top + box.height,
          )
          expect(inCell.length, `seed ${seed} cell ${r},${c}`).toBeLessThanOrEqual(4)
        }
      }
    }
  }, 30_000)

  it('clamps puzzles per page to two', () => {
    const letter = TRIMS[2]![1]
    resetObjectCounter()
    const [page] = matrixReasoningTemplate.generate({ ...base, itemCount: 3 }, letter)
    expect(harvestAnswers(page!.objects).length).toBe(2)
  })

  it('drops a puzzle rather than shrink the grid on a small trim', () => {
    const small = TRIMS[0]![1]
    clearStudioRecentContent()
    resetObjectCounter()
    const over = matrixReasoningTemplate.generate({ ...base, itemCount: 99 }, small)
    clearStudioRecentContent()
    resetObjectCounter()
    const two = matrixReasoningTemplate.generate({ ...base, itemCount: 2 }, small)
    expect(harvestAnswers(over[0]!.objects).length).toBe(
      harvestAnswers(two[0]!.objects).length,
    )
    expect(harvestAnswers(two[0]!.objects).length).toBeLessThanOrEqual(2)
  })

  it('tells the reader both what the rule spans and what to do', () => {
    resetObjectCounter()
    const [page] = matrixReasoningTemplate.generate(base, CTX())
    const texts = page!.objects
      .filter((o) => o.type === 'textbox')
      .map((o) => String(o.text ?? ''))
      .join(' ')
    expect(texts).toMatch(/every row and every column/i)
    expect(texts).toMatch(/empty square/i)
    expect(texts).toMatch(/circle the piece/i)
  })

  it('gives one grid one answer strip, whatever seed reached it', () => {
    clearStudioRecentContent()
    const strips = new Map<string, string>()
    let repeats = 0
    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
      for (let seed = 1; seed <= 1_500; seed++) {
        const [item] = buildMatrixItems({ itemCount: 1, optionCount: 6, difficulty, seed })
        const board = `${difficulty}/${item!.cells.map(figureKey).join('/')}`
        const strip = `${item!.options.map(figureKey).join('/')}#${item!.correctIndex}`
        const seen = strips.get(board)
        if (seen === undefined) {
          strips.set(board, strip)
          continue
        }
        repeats++
        expect(strip, board).toBe(seen)
      }
    }
    // Without repeats the assertion above never runs and the test proves nothing.
    expect(repeats).toBeGreaterThan(10)
  }, 30_000)

  /**
   * The strip that shipped with the original bug printed the key and one decoy
   * as the same three solid triangles, separated only by a size step the
   * renderer had flattened. A reader who works the rule out perfectly still had
   * to guess, and half of them were marked wrong — so this is a correctness
   * check on the puzzle, not a styling one.
   */
  it('never prints two choices that look alike', () => {
    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
      for (const optionCount of [4, 6]) {
        for (let seed = 1; seed <= 300; seed++) {
          const [item] = buildMatrixItems({ itemCount: 1, optionCount, difficulty, seed })
          const options = item!.options
          expect(options.length, `${difficulty} seed ${seed}`).toBe(optionCount)
          for (let i = 0; i < options.length; i++) {
            for (let j = i + 1; j < options.length; j++) {
              expect(
                isDistinguishable(options[i]!, options[j]!),
                `${difficulty} seed ${seed}: ${figureKey(options[i]!)} vs ${figureKey(options[j]!)}`,
              ).toBe(true)
            }
          }
        }
      }
    }
  }, 30_000)

  /** Every decoy has to be wrong for a reason the grid actually stated. */
  it('changes something a rule governs, or a look the grid holds constant', () => {
    // Quantity is the one channel a reader cannot judge across the two frames:
    // every figure is scaled to the busiest cell, so it is never varied off-axis.
    const visibleOffAxis: Set<string> = new Set(['shape', 'fill', 'mark', 'size'])
    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
      for (let seed = 1; seed <= 400; seed++) {
        const [item] = buildMatrixItems({ itemCount: 1, optionCount: 6, difficulty, seed })
        const ruled = new Set(item!.rules.map((rule) => rule.attribute))
        item!.options.forEach((option, i) => {
          if (i === item!.correctIndex) return
          const changed = ATTRIBUTES.filter((key) => option[key] !== item!.answer[key])
          expect(changed.length, `${difficulty} seed ${seed}`).toBeGreaterThan(0)
          expect(
            changed.some((key) => ruled.has(key) || visibleOffAxis.has(key)),
            `${difficulty} seed ${seed}: ${figureKey(option)} changes only ${changed.join()}`,
          ).toBe(true)
        })
      }
    }
  }, 30_000)

  it('only offers choices the printer can render honestly', () => {
    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
      for (let seed = 1; seed <= 400; seed++) {
        const [item] = buildMatrixItems({ itemCount: 1, optionCount: 6, difficulty, seed })
        for (const option of item!.options) {
          expect(isPrintable(option), `${difficulty} seed ${seed}: ${figureKey(option)}`).toBe(
            true,
          )
        }
      }
    }
  }, 30_000)

  /**
   * Everything on a puzzle is scaled to fit its busiest cell, so one crowded
   * choice would shrink the grid it sits under. The scale has to stay a
   * property of the board.
   */
  it('never crowds a choice beyond what the grid already prints', () => {
    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
      for (let seed = 1; seed <= 400; seed++) {
        const [item] = buildMatrixItems({ itemCount: 1, optionCount: 6, difficulty, seed })
        const busiest = Math.max(...item!.cells.map((cell) => cell.count))
        for (const option of item!.options) {
          expect(option.count, `${difficulty} seed ${seed}`).toBeLessThanOrEqual(busiest)
        }
      }
    }
  }, 30_000)

  /** A strip of five near-identical wrong answers tests one rule five times. */
  it('spreads its decoys over more than one axis', () => {
    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
      for (let seed = 1; seed <= 300; seed++) {
        const [item] = buildMatrixItems({ itemCount: 1, optionCount: 6, difficulty, seed })
        const axes = new Set(
          item!.options
            .filter((_, i) => i !== item!.correctIndex)
            .map((option) =>
              ATTRIBUTES.filter((key) => option[key] !== item!.answer[key]).join('+'),
            ),
        )
        expect(axes.size, `${difficulty} seed ${seed}`).toBeGreaterThanOrEqual(2)
      }
    }
  }, 30_000)

  /**
   * The pitch limit keeps repeats from fusing into one bar, but it used to clip
   * the finished side, which held `large` down to the limit while `medium` kept
   * its whole share — the ladder collapsed exactly on the boards that ruled
   * size. Scaling the unit instead keeps the steps proportional at every count.
   */
  it('keeps every size step visible however many shapes share a cell', () => {
    const SLOT = 100
    for (const slots of [1, 2, 3]) {
      const unit = fitUnit(SLOT, SLOT, slots)
      const sides = SIZE_STEPS.map((size) => unit * SIZE_FACTOR[size])
      for (let i = 1; i < sides.length; i++) {
        const ratio = sides[i - 1]! / sides[i]!
        expect(
          ratio,
          `${slots} per cell, ${SIZE_STEPS[i - 1]} vs ${SIZE_STEPS[i]}`,
        ).toBeLessThanOrEqual(0.82)
      }
      // Repeats still may not touch: the widest figure stays inside its slot.
      if (slots > 1) {
        expect(sides[sides.length - 1]!).toBeLessThanOrEqual(SLOT * PITCH_LIMIT + 1e-9)
      }
    }
  })

  it('treats a size step as a real difference between two choices', () => {
    const figure: Figure = {
      shape: 'circle',
      count: 1,
      fill: 'solid',
      size: 'medium',
      mark: 'none',
    }
    expect(isDistinguishable(figure, figure)).toBe(false)
    expect(isDistinguishable(figure, { ...figure, size: 'large' })).toBe(true)
    expect(isDistinguishable(figure, { ...figure, shape: 'star' })).toBe(true)
    expect(isDistinguishable({ ...figure, fill: 'hollow' }, { ...figure, fill: 'hollow', mark: 'dot' })).toBe(true)
  })
})
