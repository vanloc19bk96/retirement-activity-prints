import { describe, it, expect } from 'vitest'
import { buildFoldItems, paperFoldingTemplate } from './generate'
import {
  buildFoldPuzzle,
  cellsKey,
  coverageCapFor,
  foldChoicesFor,
  foldRegion,
  isInsideGrid,
  maxHolesFor,
  unfoldHoles,
  type Fold,
  type Region,
} from './fold'
import { buildFoldItem } from './distractors'
import { createRng, deriveSeed } from '../studio-rng'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { resetObjectCounter } from '../studio-fabric-builders'
import {
  assertGeneratorEntropy,
  assertObjectsInSafeMargin,
  runGeneratorContractTests,
  STUDIO_TEST_CTX,
} from '../studio-generator-test'
import {
  STUDIO_ANSWER_INK_MONO,
  STUDIO_ANSWER_INK_MONO_TEMPLATES,
} from '@/constants/studio.constants'
import { buildAnswerPage, harvestAnswers } from '../studio-answer-key'
import type {
  StudioConfig,
  StudioFabricObject,
  StudioGenerateContext,
} from '@/types/studio-template.types'

const GRID_SIZE = 5
const OPTION_COUNT = 4

function flatten(objects: StudioFabricObject[]): StudioFabricObject[] {
  return objects.flatMap((obj) =>
    obj.type === 'group' && obj.objects ? flatten(obj.objects) : [obj],
  )
}

const base: StudioConfig = {
  ...buildDefaultConfig(paperFoldingTemplate),
  seed: 42,
  fontFamily: 'PT Serif',
}

/** Every KDP trim the app offers, at its narrowest and widest. */
const TRIMS: Array<[string, StudioGenerateContext]> = [
  ['5 x 8', { pageWidth: 360, pageHeight: 576, margin: { top: 54, right: 43, bottom: 54, left: 65 }, seed: 42, instanceId: 'trim' }],
  ['5.5 x 8.5', { pageWidth: 396, pageHeight: 612, margin: { top: 54, right: 43, bottom: 54, left: 65 }, seed: 42, instanceId: 'trim' }],
  ['6 x 9', { pageWidth: 432, pageHeight: 648, margin: { top: 54, right: 43, bottom: 54, left: 65 }, seed: 42, instanceId: 'trim' }],
  ['8.5 x 11', { pageWidth: 612, pageHeight: 792, margin: { top: 54, right: 43, bottom: 54, left: 65 }, seed: 42, instanceId: 'trim' }],
]

const puzzleAt = (seed: number, overrides?: { foldCount?: number; holeCount?: number; gridSize?: number }) =>
  buildFoldPuzzle({
    gridSize: overrides?.gridSize ?? GRID_SIZE,
    foldCount: overrides?.foldCount ?? 2,
    holeCount: overrides?.holeCount ?? 2,
    rng: createRng(seed),
  })

runGeneratorContractTests(paperFoldingTemplate)
assertGeneratorEntropy(paperFoldingTemplate)

describe('paper-folding geometry', () => {
  it('mirrors a hole across a known crease', () => {
    // 4-wide sheet folded right-half-onto-left: the crease sits at column line 2.
    const fold: Fold = { axis: 'v', line: 2, keep: 'low' }
    const stages: Region[] = [{ x: 0, y: 0, w: 4, h: 4 }, { x: 0, y: 0, w: 2, h: 4 }]
    expect(unfoldHoles([{ r: 1, c: 0 }], [fold], stages)).toEqual([
      { r: 1, c: 0 },
      { r: 1, c: 3 },
    ])
  })

  it('leaves single-layer cells alone when the crease is off-centre', () => {
    // 4 wide, crease at line 1 keeping the right: only column 1 gets two layers.
    const fold: Fold = { axis: 'v', line: 1, keep: 'high' }
    const stages: Region[] = [{ x: 0, y: 0, w: 4, h: 1 }, { x: 1, y: 0, w: 3, h: 1 }]
    expect(unfoldHoles([{ r: 0, c: 1 }], [fold], stages)).toEqual([
      { r: 0, c: 0 },
      { r: 0, c: 1 },
    ])
    // Column 3 is a single layer — opening the sheet leaves one hole, not two.
    expect(unfoldHoles([{ r: 0, c: 3 }], [fold], stages)).toEqual([{ r: 0, c: 3 }])
  })

  it('only offers creases whose flap lands on the sheet', () => {
    for (const region of [
      { x: 0, y: 0, w: 4, h: 4 },
      { x: 0, y: 0, w: 5, h: 5 },
      { x: 2, y: 1, w: 3, h: 4 },
    ] satisfies Region[]) {
      const choices = foldChoicesFor(region)
      expect(choices.length).toBeGreaterThan(0)
      for (const fold of choices) {
        const kept = foldRegion(region, fold)
        expect(kept.w).toBeGreaterThan(0)
        expect(kept.h).toBeGreaterThan(0)
        // The flap can never be larger than the half it lands on.
        const span = fold.axis === 'v' ? region.w : region.h
        const keptSpan = fold.axis === 'v' ? kept.w : kept.h
        expect(keptSpan * 2).toBeGreaterThanOrEqual(span)
      }
    }
  })

  it('keeps every hole on the sheet and under the coverage cap', () => {
    for (const gridSize of [4, 5, 6]) {
      for (let foldCount = 1; foldCount <= 3; foldCount++) {
        for (let seed = 1; seed <= 120; seed++) {
          const puzzle = puzzleAt(seed, { foldCount, holeCount: 4, gridSize })
          expect(puzzle.folds.length).toBe(foldCount)
          expect(puzzle.punches.length).toBeGreaterThan(0)
          expect(puzzle.solution.length).toBeGreaterThanOrEqual(puzzle.punches.length)
          // Coverage is the target; half the sheet is the hard ceiling, which
          // only binds when one punch on a heavily folded small sheet exceeds it.
          expect(puzzle.solution.length).toBeLessThanOrEqual((gridSize * gridSize) / 2)
          if (puzzle.punches.length > 1) {
            expect(puzzle.solution.length).toBeLessThanOrEqual(coverageCapFor(gridSize))
          }
          for (const hole of puzzle.solution) {
            expect(isInsideGrid(hole, gridSize)).toBe(true)
          }
        }
      }
    }
  })

  it('never punches more than the ceiling shown in the form', () => {
    for (const gridSize of [4, 5, 6]) {
      for (let foldCount = 1; foldCount <= 3; foldCount++) {
        for (let seed = 1; seed <= 60; seed++) {
          const puzzle = puzzleAt(seed, { foldCount, holeCount: 4, gridSize })
          expect(puzzle.punches.length).toBeLessThanOrEqual(
            maxHolesFor(gridSize, foldCount),
          )
        }
      }
    }
  })

  it('punches exactly the requested hole count whenever the form allows it', () => {
    for (const gridSize of [4, 5, 6]) {
      for (let foldCount = 1; foldCount <= 3; foldCount++) {
        const holeCount = Math.min(4, maxHolesFor(gridSize, foldCount))
        for (let seed = 1; seed <= 200; seed++) {
          const puzzle = puzzleAt(seed, { foldCount, holeCount, gridSize })
          expect(
            puzzle.punches.length,
            `grid=${gridSize} folds=${foldCount} seed=${seed}`,
          ).toBe(holeCount)
        }
      }
    }
  })
})

describe('paper-folding content space', () => {
  /**
   * The failure this guards is invisible per page: page fingerprints stay unique
   * because the distractors shuffle, while the answer a reader actually sees is
   * drawn from a tiny pool and repeats across the book and across sellers.
   */
  it('expresses hundreds of distinct answers at every fold count', () => {
    for (const foldCount of [1, 2, 3]) {
      const answers = new Set<string>()
      for (let seed = 1; seed <= 3000; seed++) {
        answers.add(cellsKey(puzzleAt(seed, { foldCount }).solution).toString())
      }
      expect(answers.size, `folds=${foldCount}`).toBeGreaterThan(600)
    }
  })

  it('fills a 100-page book without heavy repeats', () => {
    const counts = new Map<string, number>()
    for (let page = 0; page < 100; page++) {
      const seed = deriveSeed(9_001, `page:${page}`)
      const items = buildFoldItems({
        count: 3,
        gridSize: GRID_SIZE,
        foldCount: 2,
        holeCount: 2,
        seed,
      })
      for (const item of items) {
        const key = cellsKey(item.puzzle.solution)
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
    }
    // 300 items off a pool the old 4x4 model capped at 12 answers.
    expect(counts.size).toBeGreaterThan(250)
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(3)
  })

  it('gives two sellers different sheets from the same seed', () => {
    const sheetFor = (ownerKey?: string) => {
      resetObjectCounter()
      const [page] = paperFoldingTemplate.generate(base, {
        ...STUDIO_TEST_CTX,
        ownerKey,
      })
      return JSON.stringify(page!.objects)
    }
    expect(sheetFor('user:a')).not.toBe(sheetFor('user:b'))
    expect(sheetFor('user:a')).toBe(sheetFor('user:a'))
  })

  it('never repeats an answer inside one page', () => {
    for (const itemCount of [2, 3, 4, 5, 6]) {
      for (const holeCount of [1, 2]) {
        for (let seed = 1; seed <= 400; seed++) {
          const items = buildFoldItems({
            count: itemCount,
            gridSize: GRID_SIZE,
            foldCount: 2,
            holeCount,
            seed,
          })
          expect(items.length).toBe(itemCount)
          const answers = items.map((item) => cellsKey(item.puzzle.solution))
          expect(new Set(answers).size, `items=${itemCount} holes=${holeCount}`).toBe(
            itemCount,
          )
        }
      }
    }
  })

  it('keeps earlier items stable as the item count grows', () => {
    const at = (count: number) =>
      buildFoldItems({
        count,
        gridSize: GRID_SIZE,
        foldCount: 2,
        holeCount: 2,
        seed: 777,
      }).map((item) => cellsKey(item.puzzle.solution))
    expect(at(5).slice(0, 3)).toEqual(at(3))
  })
})

describe('paper-folding options', () => {
  it('offers four distinct patterns with the solution at correctIndex', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rng = createRng(seed)
      const puzzle = buildFoldPuzzle({
        gridSize: GRID_SIZE,
        foldCount: 2,
        holeCount: 2,
        rng,
      })
      const item = buildFoldItem({ puzzle, optionCount: OPTION_COUNT, rng })
      expect(item.options.length).toBe(OPTION_COUNT)
      const keys = item.options.map(cellsKey)
      expect(new Set(keys).size).toBe(OPTION_COUNT)
      expect(keys[item.correctIndex]).toBe(cellsKey(puzzle.solution))
      for (const option of item.options) {
        expect(option.length).toBeGreaterThan(0)
        expect(option.every((cell) => isInsideGrid(cell, GRID_SIZE))).toBe(true)
      }
    }
  })

  it('spreads the correct answer across all four letters', () => {
    const counts = new Map<number, number>()
    for (let seed = 1; seed <= 200; seed++) {
      const rng = createRng(seed)
      const puzzle = buildFoldPuzzle({
        gridSize: GRID_SIZE,
        foldCount: 2,
        holeCount: 1,
        rng,
      })
      const item = buildFoldItem({ puzzle, optionCount: OPTION_COUNT, rng })
      counts.set(item.correctIndex, (counts.get(item.correctIndex) ?? 0) + 1)
    }
    expect(counts.size).toBe(OPTION_COUNT)
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(20)
    }
  })

  /**
   * The answer unfolds symmetrically about its creases, so if every foil breaks
   * that symmetry the item can be answered without tracing a single fold.
   * Sibling unfolds exist to close that hole — this pins the shortcut near the
   * 25% a coin flip between four options would give.
   */
  it('resists the "pick the tidy one" shortcut', () => {
    const symmetric = (cells: ReadonlyArray<{ r: number; c: number }>, axis: 'v' | 'h') =>
      cellsKey(
        cells.map((cell) =>
          axis === 'v'
            ? { r: cell.r, c: GRID_SIZE - 1 - cell.c }
            : { r: GRID_SIZE - 1 - cell.r, c: cell.c },
        ),
      ) === cellsKey(cells)

    for (const foldCount of [1, 2, 3]) {
      let shortcutWins = 0
      let countWins = 0
      const trials = 1500
      for (let seed = 1; seed <= trials; seed++) {
        const rng = createRng(seed)
        const puzzle = buildFoldPuzzle({
          gridSize: GRID_SIZE,
          foldCount,
          holeCount: 2,
          rng,
        })
        const item = buildFoldItem({ puzzle, optionCount: OPTION_COUNT, rng })
        const axes = new Set(puzzle.folds.map((f) => f.axis))
        const tidy = item.options.map(
          (o) => (!axes.has('v') || symmetric(o, 'v')) && (!axes.has('h') || symmetric(o, 'h')),
        )
        if (tidy.filter(Boolean).length === 1 && tidy[item.correctIndex]) shortcutWins++

        const sizes = item.options.map((o) => o.length)
        const max = Math.max(...sizes)
        if (sizes.filter((s) => s === max).length === 1 && sizes[item.correctIndex] === max) {
          countWins++
        }
      }
      expect(shortcutWins / trials, `symmetry shortcut, folds=${foldCount}`).toBeLessThan(0.35)
      expect(countWins / trials, `hole-count shortcut, folds=${foldCount}`).toBeLessThan(0.35)
    }
  })
})

describe('paper-folding', () => {
  it('is registered as monochrome answer ink', () => {
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has('paper-folding')).toBe(true)
  })

  it('hides exactly one answer ring per item', () => {
    resetObjectCounter()
    const [page] = paperFoldingTemplate.generate(base, STUDIO_TEST_CTX)
    const answers = harvestAnswers(page!.objects)
    expect(answers.length).toBe(Number(base.itemCount))
    expect(answers.every((o) => o.visible === false)).toBe(true)
    expect(answers.every((o) => o.type === 'rect')).toBe(true)
  })

  it('reveals the ring in black on the key', () => {
    resetObjectCounter()
    const [page] = paperFoldingTemplate.generate(base, STUDIO_TEST_CTX)
    const keyObjects = buildAnswerPage(
      page!.answerSourceObjects ?? page!.objects,
      STUDIO_ANSWER_INK_MONO,
    )
    const answers = harvestAnswers(keyObjects)
    expect(answers.length).toBe(Number(base.itemCount))
    expect(answers.every((o) => o.visible !== false)).toBe(true)
    expect(answers.every((o) => o.stroke === STUDIO_ANSWER_INK_MONO)).toBe(true)
  })

  it('nests sheet → folds → question → page groups', () => {
    resetObjectCounter()
    const [page] = paperFoldingTemplate.generate(
      { ...base, itemCount: 2, foldCount: 2 },
      STUDIO_TEST_CTX,
    )
    const pageGroup = page!.objects.find((o) => o.type === 'group')
    expect(pageGroup?.objects?.length).toBe(2)
    const question = pageGroup!.objects![0]!
    expect(question.type).toBe('group')
    const foldsGroup = (question.objects ?? []).find(
      (o) => o.type === 'group' && o.studioRole === 'structure',
    )
    expect(foldsGroup).toBeTruthy()
    // foldCount 2 → 3 stages; each sheet is square + crease/arrow + holes.
    expect(foldsGroup!.objects?.every((o) => o.type === 'group')).toBe(true)
    expect(foldsGroup!.objects?.length).toBe(3)
    const firstSheet = foldsGroup!.objects![0]!
    expect(firstSheet.objects?.some((o) => o.type === 'rect')).toBe(true)
    const arrow = firstSheet.objects?.find(
      (o) => o.type === 'group' && o.studioRole === 'decoration',
    )
    expect(arrow?.objects?.length).toBe(3)
    expect(arrow?.objects?.every((o) => o.type === 'line')).toBe(true)
  })

  it('packs the index beside the fold band when tiles are height-limited', () => {
    resetObjectCounter()
    // 4 items × 3 folds stacks the bands and used to center the game in the
    // leftover width, leaving a void after `1)`.
    const [page] = paperFoldingTemplate.generate(
      { ...base, gridSize: 4, foldCount: 3, holeCount: 1, itemCount: 4 },
      STUDIO_TEST_CTX,
    )
    const pageGroup = page!.objects.find(
      (o) => o.type === 'group' && o.studioRole === 'structure',
    )
    expect(pageGroup?.objects?.length).toBe(4)
    for (const question of pageGroup!.objects ?? []) {
      const index = (question.objects ?? []).find(
        (o) => o.type === 'textbox' && o.studioRole === 'decoration',
      )
      const foldsGroup = (question.objects ?? []).find(
        (o) => o.type === 'group' && o.studioRole === 'structure',
      )
      expect(index).toBeTruthy()
      expect(foldsGroup).toBeTruthy()
      // Group children are relative to the question center — the difference is
      // the on-page gap between index left and fold-band left.
      const gap = (foldsGroup!.left ?? 0) - (index!.left ?? 0)
      expect(gap, String(index!.text)).toBeGreaterThan(0)
      expect(gap, String(index!.text)).toBeLessThanOrEqual(28)
    }
  })

  it('draws one sheet diagram per fold stage plus four options', () => {
    resetObjectCounter()
    const [page] = paperFoldingTemplate.generate(
      { ...base, itemCount: 2, foldCount: 2 },
      STUDIO_TEST_CTX,
    )
    const sheets = flatten(page!.objects).filter(
      (o) => o.type === 'rect' && o.studioRole === 'structure',
    )
    // Per item: 3 fold stages + 4 option sheets.
    expect(sheets.length).toBe(2 * (3 + OPTION_COUNT))
  })

  it('quotes the real punch count in the instruction', () => {
    resetObjectCounter()
    const [page] = paperFoldingTemplate.generate(
      { ...base, foldCount: 1, holeCount: 1 },
      STUDIO_TEST_CTX,
    )
    const instruction = page!.objects.find((o) =>
      String(o.text ?? '').includes('Fold each sheet once'),
    )
    expect(instruction?.text).toContain('punch one hole')
  })

  it('keeps the Holes ceiling in step with what the generator will punch', () => {
    const field = paperFoldingTemplate.configSchema.find((f) => f.key === 'holeCount')
    expect(field?.maxWhen).toBeTypeOf('function')
    for (const gridSize of [4, 5, 6]) {
      for (const foldCount of [1, 2, 3]) {
        const shown = field!.maxWhen!({ ...base, gridSize, foldCount })
        let punched = 0
        for (let seed = 1; seed <= 200; seed++) {
          punched = Math.max(
            punched,
            puzzleAt(seed, { foldCount, holeCount: shown, gridSize }).punches.length,
          )
        }
        // The slider must be reachable — a ceiling the generator ignores is a lie.
        expect(punched, `grid=${gridSize} folds=${foldCount}`).toBe(shown)
      }
    }
  })
})

describe('paper-folding print safety', () => {
  it('stays inside the safe margin on every trim and setting', () => {
    for (const [name, ctx] of TRIMS) {
      for (const gridSize of [4, 5, 6]) {
        for (const itemCount of [2, 3, 4, 5, 6]) {
          for (const foldCount of [1, 3]) {
            resetObjectCounter()
            const pages = paperFoldingTemplate.generate(
              {
                ...base,
                gridSize,
                itemCount,
                foldCount,
                holeCount: 4,
                showTitle: true,
                title: `Game 7 — ${name}`,
              },
              ctx,
            )
            for (const page of pages) {
              assertObjectsInSafeMargin(page.objects, ctx)
            }
          }
        }
      }
    }
  })

  it('keeps punched holes printable by dropping items, not shrinking them', () => {
    for (const [name, ctx] of TRIMS) {
      resetObjectCounter()
      const [page] = paperFoldingTemplate.generate(
        { ...base, itemCount: 6, gridSize: 6, foldCount: 3 },
        ctx,
      )
      const radii = flatten(page!.objects)
        .filter((o) => o.type === 'circle')
        .map((o) => o.radius ?? 0)
      expect(radii.length, name).toBeGreaterThan(0)
      // MIN_CELL_PX * HOLE_RADIUS_RATIO — ~1.4mm dot, the floor for a hole to
      // read on cream KDP stock. Below this the fitter drops an item or coarsens
      // the grid instead of shrinking the dots further.
      expect(Math.min(...radii), name).toBeGreaterThanOrEqual(1.9)
    }
  })
})
