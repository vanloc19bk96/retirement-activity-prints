import { beforeEach, describe, it, expect } from 'vitest'
import { magicSquareTemplate } from './generate'
import { buildDefaultConfig, getStudioTemplate } from '@/constants/studio-templates'
import {
  STUDIO_ANSWER_INK,
  STUDIO_ANSWER_INK_MONO,
  STUDIO_ANSWER_INK_MONO_TEMPLATES,
  STUDIO_CONTENT_SAFE_INSET_X,
  STUDIO_RULE_MEDIUM,
  STUDIO_STROKE_HAIRLINE,
} from '@/constants/studio.constants'
import { resetObjectCounter } from '../studio-fabric-builders'
import {
  assertGeneratorEntropy,
  assertObjectsInSafeMargin,
  runGeneratorContractTests,
  STUDIO_TEST_CTX,
} from '../studio-generator-test'
import { buildAnswerPage, harvestAnswers } from '../studio-answer-key'
import { contentBox, drawHeader, insetHorizontal } from '../studio-layout'
import { clearStudioRecentContent } from '../studio-variety'
import type { StudioFabricObject, StudioGenerateContext } from '@/types/studio-template.types'
import type { StudioTag } from '../studio-fabric-builders'
import { MAGIC_ORDERS } from './generator'
import { cellForArea, layoutBlocks } from './draw'
import type { MagicNumberSet, MagicOrder } from './types'

function flattenStudioObjects(objects: StudioFabricObject[]): StudioFabricObject[] {
  return objects.flatMap((obj) => {
    if (obj.studioRole === 'answer') return [obj]
    if (obj.type === 'group' && obj.objects) return flattenStudioObjects(obj.objects)
    return [obj]
  })
}

const CTX = (): StudioGenerateContext => ({
  pageWidth: 2550,
  pageHeight: 3300,
  margin: { top: 150, right: 150, bottom: 150, left: 225 },
  seed: 42,
  instanceId: 'test-run',
})

const base = {
  ...buildDefaultConfig(magicSquareTemplate),
  seed: 42,
  fontFamily: 'Inter',
}

function textsOf(objects: StudioFabricObject[]): string[] {
  return flattenStudioObjects(objects)
    .filter((o) => o.type === 'textbox')
    .map((o) => String(o.text ?? ''))
}

runGeneratorContractTests(magicSquareTemplate)

/**
 * The whole point of the construction engine: a book must not reprint the same
 * arrangement every few pages. 3×3 has only 8 magic squares in existence, so it
 * leans on blank masks; larger orders must be distinct outright.
 */
assertGeneratorEntropy(magicSquareTemplate, { seeds: 60, minDistinctRatio: 0.95 })
assertGeneratorEntropy(magicSquareTemplate, {
  seeds: 40,
  configOverrides: { order: 5, squaresPerPage: 2 },
})
assertGeneratorEntropy(magicSquareTemplate, {
  seeds: 24,
  configOverrides: { order: 4, difficulty: 'hard', numberSet: 'step' },
})
// The mixed bank is what a whole KDP book leans on — 3×3 is the order that
// otherwise has only eight squares in existence, so it must be fully distinct.
assertGeneratorEntropy(magicSquareTemplate, {
  seeds: 40,
  minDistinctRatio: 1,
  configOverrides: { order: 3, numberSet: 'mixed', squaresPerPage: 2 },
})

describe('magic-square', () => {
  beforeEach(() => {
    clearStudioRecentContent()
  })

  it('is deterministic', () => {
    resetObjectCounter()
    const a = magicSquareTemplate.generate(base, CTX())
    // Variety ledger would otherwise make the second draw avoid the first.
    clearStudioRecentContent()
    resetObjectCounter()
    const b = magicSquareTemplate.generate(base, CTX())
    expect(a).toEqual(b)
  })

  it('different seeds give different puzzles', () => {
    resetObjectCounter()
    const a = JSON.stringify(magicSquareTemplate.generate(base, CTX()))
    resetObjectCounter()
    const b = JSON.stringify(
      magicSquareTemplate.generate({ ...base, seed: 7 }, { ...CTX(), seed: 7 }),
    )
    expect(a).not.toEqual(b)
  })

  it('auto-adds a solution page (no form toggles)', () => {
    expect(magicSquareTemplate.producesAnswerKey).toBe(true)
    const registered = getStudioTemplate('magic-square')
    const regKeys = new Set(registered!.configSchema.map((f) => f.key))
    expect(regKeys.has('includeAnswerKey')).toBe(false)
    expect(regKeys.has('answerKeyForAll')).toBe(false)
  })

  it('one hidden answer per blank cell', () => {
    resetObjectCounter()
    const [page] = magicSquareTemplate.generate(
      { ...base, order: 3, squaresPerPage: 1, difficulty: 'easy' },
      CTX(),
    )
    const answers = harvestAnswers(page!.objects)
    expect(answers.length).toBeGreaterThan(0)
    expect(answers.every((o) => o.visible === false)).toBe(true)
  })

  it('groups each square into its own object', () => {
    resetObjectCounter()
    const [page] = magicSquareTemplate.generate({ ...base, squaresPerPage: 2 }, CTX())
    const groups = page!.objects.filter((o) => o.type === 'group')
    expect(groups.length).toBe(2)
  })

  it('keeps 3-per-page grids at least as large as 2×2 (4-per-page)', () => {
    const tag: StudioTag = {
      templateKey: 'magic-square',
      instanceId: 'test-run',
      pageRole: 'single',
    }
    const content = insetHorizontal(contentBox(CTX()), STUDIO_CONTENT_SAFE_INSET_X)
    const header = drawHeader(content, base, tag, '')
    const three = layoutBlocks(header.body, 3)
    const four = layoutBlocks(header.body, 4)
    expect(three).toHaveLength(3)
    expect(four).toHaveLength(4)
    const cell3 = Math.min(...three.map((area) => cellForArea(area, 3)))
    const cell4 = Math.min(...four.map((area) => cellForArea(area, 3)))
    expect(cell3).toBeGreaterThanOrEqual(cell4)
  })

  it('never prints the same square twice on one page', () => {
    for (const order of MAGIC_ORDERS) {
      const perPage = order >= 6 ? 2 : 4
      for (let seed = 1; seed <= 3; seed++) {
        resetObjectCounter()
        const [page] = magicSquareTemplate.generate(
          { ...base, order, squaresPerPage: perPage, seed },
          { ...CTX(), seed },
        )
        const grids = page!.objects
          .filter((o) => o.type === 'group')
          .map((g) => textsOf(g.objects ?? []).join(','))
        expect(new Set(grids).size, `order ${order} seed ${seed}`).toBe(grids.length)
      }
    }
  })

  it('draws even-weight mid-gray grid bars like grid-copy', () => {
    resetObjectCounter()
    const [page] = magicSquareTemplate.generate(
      { ...base, order: 3, squaresPerPage: 1 },
      CTX(),
    )
    const bars = flattenStudioObjects(page!.objects).filter(
      (o) =>
        o.type === 'rect' &&
        o.studioRole === 'structure' &&
        o.strokeWidth === 0 &&
        o.fill &&
        o.fill !== 'transparent',
    )
    // 3×3 → 4 vertical + 4 horizontal bars
    expect(bars.length).toBe(8)
    expect(bars.every((b) => b.fill === STUDIO_RULE_MEDIUM)).toBe(true)
    expect(
      bars.every(
        (b) => b.width === STUDIO_STROKE_HAIRLINE || b.height === STUDIO_STROKE_HAIRLINE,
      ),
    ).toBe(true)
  })

  it('centers a single square in the content area', () => {
    resetObjectCounter()
    const ctx = CTX()
    const [page] = magicSquareTemplate.generate({ ...base, squaresPerPage: 1 }, ctx)
    const grid = page!.objects.find((o) => o.type === 'group')!
    const contentLeft = ctx.margin.left + STUDIO_CONTENT_SAFE_INSET_X
    const contentRight = ctx.pageWidth - ctx.margin.right - STUDIO_CONTENT_SAFE_INSET_X
    const contentCenterX = (contentLeft + contentRight) / 2
    const gridCenterX = grid.left! + grid.width! / 2
    expect(Math.abs(gridCenterX - contentCenterX)).toBeLessThanOrEqual(2)
  })

  it('centers the solution square at the same size as the puzzle page', () => {
    resetObjectCounter()
    const ctx = CTX()
    const config = { ...base, squaresPerPage: 1, showTitle: true, title: 'Game 1' }
    const [page] = magicSquareTemplate.generate(config, ctx)
    expect(page!.answerSourceObjects?.length).toBeGreaterThan(0)

    const puzzleGrid = page!.objects.find((o) => o.type === 'group')!
    const keyObjects = buildAnswerPage(
      page!.answerSourceObjects ?? page!.objects,
      STUDIO_ANSWER_INK_MONO,
    )
    const grid = keyObjects.find((o) => o.type === 'group')!
    assertObjectsInSafeMargin(keyObjects, ctx)

    // Same footprint as the question page — only recentered in the taller key body.
    expect(grid.width).toBe(puzzleGrid.width)
    expect(grid.height).toBe(puzzleGrid.height)

    const tag: StudioTag = {
      templateKey: 'magic-square',
      instanceId: 'test-run',
      pageRole: 'single',
    }
    const field = drawHeader(
      insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X),
      config,
      tag,
      '',
    ).body
    const gridCenterX = grid.left! + grid.width! / 2
    const gridCenterY = grid.top! + grid.height! / 2
    expect(Math.abs(gridCenterX - (field.left + field.width / 2))).toBeLessThanOrEqual(2)
    // Banner sits above the grid; allow a small optical offset from geometric center.
    expect(Math.abs(gridCenterY - (field.top + field.height / 2))).toBeLessThan(30)
  })

  it('every order × difficulty × number set generates inside the safe margin', () => {
    for (const order of MAGIC_ORDERS) {
      for (const difficulty of ['easy', 'medium', 'hard']) {
        for (const numberSet of ['normal', 'shifted', 'step', 'mixed', 'multiply']) {
          resetObjectCounter()
          const pages = magicSquareTemplate.generate(
            {
              ...base,
              order,
              difficulty,
              numberSet,
              squaresPerPage: order >= 6 ? 2 : 3,
              hideConstant: numberSet === 'step',
            },
            STUDIO_TEST_CTX,
          )
          for (const page of pages) {
            assertObjectsInSafeMargin(page.objects)
            assertObjectsInSafeMargin(page.answerSourceObjects ?? page.objects)
          }
        }
      }
    }
  })

  it('answer key uses black ink, not blue', () => {
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has('magic-square')).toBe(true)
    resetObjectCounter()
    const [page] = magicSquareTemplate.generate(base, CTX())
    const keyObjects = buildAnswerPage(
      page!.answerSourceObjects ?? page!.objects,
      STUDIO_ANSWER_INK_MONO,
    )
    const answers = harvestAnswers(keyObjects)
    expect(answers.length).toBeGreaterThan(0)
    expect(answers.every((o) => o.fill === STUDIO_ANSWER_INK_MONO)).toBe(true)
    expect(answers.every((o) => o.fill !== STUDIO_ANSWER_INK)).toBe(true)
  })

  it('the instruction names the exact number bank in play', () => {
    resetObjectCounter()
    const normal = magicSquareTemplate.generate(
      { ...base, order: 4, numberSet: 'normal', showInstructions: true },
      CTX(),
    )
    expect(textsOf(normal[0]!.objects).some((t) => t.includes('1 to 16'))).toBe(true)

    resetObjectCounter()
    const stepped = magicSquareTemplate.generate(
      { ...base, order: 4, numberSet: 'step', showInstructions: true },
      CTX(),
    )
    const stepTexts = textsOf(stepped[0]!.objects)
    expect(stepTexts.some((t) => /counting by \ds/.test(t))).toBe(true)

    resetObjectCounter()
    const product = magicSquareTemplate.generate(
      { ...base, order: 3, numberSet: 'multiply', showInstructions: true },
      CTX(),
    )
    const productTexts = textsOf(product[0]!.objects)
    expect(productTexts.some((t) => t.includes('multiply to the same product'))).toBe(true)
    expect(productTexts.some((t) => t.includes('divide the product'))).toBe(true)
    expect(productTexts.some((t) => /each line multiplies to \d+/.test(t))).toBe(true)
  })

  it('a mixed bank names its numbers and prints its own line total', () => {
    resetObjectCounter()
    const [page] = magicSquareTemplate.generate(
      { ...base, order: 3, numberSet: 'mixed', squaresPerPage: 1, showInstructions: true },
      CTX(),
    )
    const texts = textsOf(page!.objects)
    // Small grids list the bank outright, so the solver knows it is not 1…9.
    const listed = texts.find((t) => t.includes('Use each of '))
    expect(listed).toBeDefined()
    const banner = texts.find((t) => /each line adds to \d+/.test(t))!
    expect(banner).toBeDefined()

    const total = Number(banner.match(/adds to (\d+)/)![1])
    const bank = listed!
      .match(/Use each of ([\d, ]+) once/)![1]!
      .split(',')
      .map((v) => Number(v.trim()))
    expect(bank).toHaveLength(9)
    expect(new Set(bank).size).toBe(9)
    // The whole point: neither the bank nor the total is the standard 1…9 / 15.
    expect(total).not.toBe(15)
    expect(bank.reduce((sum, v) => sum + v, 0)).toBe(total * 3)
  })

  it('mixed leaves the bank out of the instruction on the big grids', () => {
    resetObjectCounter()
    const [page] = magicSquareTemplate.generate(
      { ...base, order: 7, numberSet: 'mixed', squaresPerPage: 1, showInstructions: true },
      CTX(),
    )
    const texts = textsOf(page!.objects)
    expect(texts.some((t) => t.includes('each number in the square'))).toBe(true)
    expect(texts.some((t) => t.includes('Use each of '))).toBe(false)
  })

  it('salts squares per seller so two books never share a page', () => {
    const fingerprint = (ownerKey?: string): string => {
      clearStudioRecentContent()
      resetObjectCounter()
      return JSON.stringify(magicSquareTemplate.generate(base, { ...CTX(), ownerKey }))
    }
    expect(fingerprint('user:a')).not.toEqual(fingerprint('user:b'))
    expect(fingerprint('user:a')).toEqual(fingerprint('user:a'))
  })

  it('bulk multiply run spreads products instead of clustering', () => {
    const products: number[] = []
    for (let i = 0; i < 18; i++) {
      resetObjectCounter()
      const [page] = magicSquareTemplate.generate(
        { ...base, order: 3, numberSet: 'multiply', squaresPerPage: 1, seed: 1000 + i },
        { ...CTX(), seed: 1000 + i, ownerKey: 'user:bulk' },
      )
      const banner = textsOf(page!.objects).find((t) => /multiplies to \d+/.test(t))
      expect(banner).toBeDefined()
      products.push(Number(banner!.match(/multiplies to (\d+)/)![1]))
    }
    expect(new Set(products).size).toBeGreaterThanOrEqual(14)
  })

  it('multiply mode varies products across seeds for KDP uniqueness', () => {
    const products = new Set<number>()
    const pages = new Set<string>()
    for (let seed = 1; seed <= 40; seed++) {
      resetObjectCounter()
      const [page] = magicSquareTemplate.generate(
        { ...base, order: 3, numberSet: 'multiply', squaresPerPage: 1, seed },
        { ...CTX(), seed, ownerKey: 'user:kdp' },
      )
      pages.add(JSON.stringify(page!.objects))
      const banner = textsOf(page!.objects).find((t) => /multiplies to \d+/.test(t))
      expect(banner).toBeDefined()
      products.add(Number(banner!.match(/multiplies to (\d+)/)![1]))
    }
    expect(products.size).toBeGreaterThanOrEqual(12)
    expect(pages.size).toBe(40)
  })

  it('hiding the target replaces the banner instead of printing it', () => {
    resetObjectCounter()
    const [page] = magicSquareTemplate.generate(
      { ...base, order: 4, hideConstant: true, squaresPerPage: 1 },
      CTX(),
    )
    const texts = textsOf(page!.objects)
    expect(texts.some((t) => t.includes('work out the line total'))).toBe(true)
    expect(texts.some((t) => /each line adds to \d+/.test(t))).toBe(false)
  })

  it('drops the “Square N” prefix when the page holds one square', () => {
    resetObjectCounter()
    const [one] = magicSquareTemplate.generate({ ...base, squaresPerPage: 1 }, CTX())
    expect(textsOf(one!.objects).some((t) => t.startsWith('Square 1:'))).toBe(false)

    resetObjectCounter()
    const [two] = magicSquareTemplate.generate({ ...base, squaresPerPage: 2 }, CTX())
    expect(textsOf(two!.objects).some((t) => t.startsWith('Square 2:'))).toBe(true)
  })

  it('keeps long product banners fully inside the square group', () => {
    resetObjectCounter()
    const [page] = magicSquareTemplate.generate(
      { ...base, order: 3, numberSet: 'multiply', squaresPerPage: 2 },
      CTX(),
    )
    const groups = page!.objects.filter((o) => o.type === 'group')
    expect(groups.length).toBe(2)

    for (const group of groups) {
      const banner = group.objects!.find(
        (o) => o.type === 'textbox' && /multiplies to \d+/.test(String(o.text ?? '')),
      )
      expect(banner).toBeDefined()
      // Must stay one line inside the group — a tight width soft-wraps and
      // Fabric clips the first line (only “…5832” remained visible).
      expect(group.width!).toBeGreaterThanOrEqual(banner!.width!)
      expect(banner!.lineHeight).toBe(1)
      expect(banner!.height).toBe(banner!.fontSize)

      const printed = Number(String(banner!.text).match(/multiplies to (\d+)/)![1])
      const cells = group.objects!
        .filter(
          (o) =>
            o.type === 'textbox' &&
            (o.studioRole === 'prompt' || o.studioRole === 'answer') &&
            /^\d+$/.test(String(o.text ?? '')),
        )
        .toSorted((a, b) => a.top! - b.top! || a.left! - b.left!)
      expect(cells).toHaveLength(9)
      const row0 = cells.slice(0, 3).map((c) => Number(c.text))
      expect(row0.reduce((product, v) => product * v, 1)).toBe(printed)
    }
  })

  it('reads a pre-numberSet book’s nonNormal toggle as the shifted bank', () => {
    resetObjectCounter()
    const legacy = { ...base, order: 3, nonNormal: true, showInstructions: true }
    delete (legacy as Record<string, unknown>).numberSet
    const [page] = magicSquareTemplate.generate(legacy, CTX())
    expect(textsOf(page!.objects).some((t) => t.includes('1 to 9'))).toBe(false)
  })

  describe('validateConfig', () => {
    it('blocks a product square on anything but 3×3', () => {
      expect(
        magicSquareTemplate.validateConfig!({ ...base, order: 5, numberSet: 'multiply' }),
      ).toMatchObject({ field: 'numberSet' })
      expect(
        magicSquareTemplate.validateConfig!({ ...base, order: 3, numberSet: 'multiply' }),
      ).toBeNull()
    })

    it('caps squares per page on the big grids', () => {
      for (const order of [6, 7] as MagicOrder[]) {
        expect(
          magicSquareTemplate.validateConfig!({ ...base, order, squaresPerPage: 4 }),
        ).toMatchObject({ field: 'squaresPerPage' })
        expect(
          magicSquareTemplate.validateConfig!({ ...base, order, squaresPerPage: 2 }),
        ).toBeNull()
      }
      expect(
        magicSquareTemplate.validateConfig!({ ...base, order: 5, squaresPerPage: 4 }),
      ).toBeNull()
    })

    it('blocks a mixed bank on 6×6, which has no orthogonal layer pair', () => {
      expect(
        magicSquareTemplate.validateConfig!({ ...base, order: 6, numberSet: 'mixed' }),
      ).toMatchObject({ field: 'numberSet' })
      for (const order of [3, 4, 5, 7] as MagicOrder[]) {
        expect(
          magicSquareTemplate.validateConfig!({ ...base, order, numberSet: 'mixed' }),
        ).toBeNull()
      }
    })

    it('accepts every default the form can produce', () => {
      for (const order of MAGIC_ORDERS) {
        for (const numberSet of ['normal', 'shifted', 'step'] as MagicNumberSet[]) {
          expect(
            magicSquareTemplate.validateConfig!({ ...base, order, numberSet }),
          ).toBeNull()
        }
      }
    })
  })
})
