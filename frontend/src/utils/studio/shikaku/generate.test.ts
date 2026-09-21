import { describe, it, expect } from 'vitest'
import { shikakuTemplate } from './generate'
import { buildDefaultConfig, getStudioTemplate } from '@/constants/studio-templates'
import {
  STUDIO_ANSWER_INK,
  STUDIO_ANSWER_INK_MONO,
  STUDIO_ANSWER_INK_MONO_TEMPLATES,
  STUDIO_CONTENT_SAFE_INSET_X,
  STUDIO_RULE_MEDIUM,
} from '@/constants/studio.constants'
import { resetObjectCounter, type StudioTag } from '../studio-fabric-builders'
import { contentBox, insetHorizontal, drawHeader } from '../studio-layout'
import {
  runGeneratorContractTests,
  assertGeneratorEntropy,
  assertObjectsInSafeMargin,
} from '../studio-generator-test'
import { buildAnswerPage, harvestAnswers } from '../studio-answer-key'
import type { StudioGenerateContext } from '@/types/studio-template.types'

const CTX = (): StudioGenerateContext => ({
  pageWidth: 2550,
  pageHeight: 3300,
  margin: { top: 150, right: 150, bottom: 150, left: 225 },
  seed: 42,
  instanceId: 'test-run',
})

const INSTRUCTION =
  'Divide the whole grid into rectangles by drawing along the grid lines. Every rectangle must ' +
  'contain exactly one number, and that number is how many squares the rectangle covers. Every ' +
  'square ends up inside exactly one rectangle. Tip: start with the numbers that can only be ' +
  'boxed in one way'

const base = {
  ...buildDefaultConfig(shikakuTemplate),
  seed: 42,
  fontFamily: 'Inter',
}

runGeneratorContractTests(shikakuTemplate)
assertGeneratorEntropy(shikakuTemplate)

describe('shikaku', () => {
  it('is deterministic', () => {
    resetObjectCounter()
    const a = shikakuTemplate.generate(base, CTX())
    resetObjectCounter()
    const b = shikakuTemplate.generate(base, CTX())
    expect(a).toEqual(b)
  })

  it('different seeds give different puzzles', () => {
    resetObjectCounter()
    const a = JSON.stringify(shikakuTemplate.generate(base, CTX()))
    resetObjectCounter()
    const b = JSON.stringify(
      shikakuTemplate.generate({ ...base, seed: 7 }, { ...CTX(), seed: 7 }),
    )
    expect(a).not.toEqual(b)
  })

  it('auto-adds a solution page (no form toggles)', () => {
    expect(shikakuTemplate.producesAnswerKey).toBe(true)
    const registered = getStudioTemplate('shikaku')
    const regKeys = new Set(registered!.configSchema.map((f) => f.key))
    expect(regKeys.has('includeAnswerKey')).toBe(false)
    expect(regKeys.has('answerKeyForAll')).toBe(false)
  })

  it('hides the rectangle outlines until the solution page', () => {
    resetObjectCounter()
    const [page] = shikakuTemplate.generate(base, CTX())
    const answers = harvestAnswers(page!.objects)
    expect(answers.length).toBeGreaterThan(0)
    expect(answers.every((o) => o.visible === false)).toBe(true)
    expect(answers.every((o) => o.type === 'rect')).toBe(true)
  })

  it('prints one clue number per rectangle', () => {
    resetObjectCounter()
    const [page] = shikakuTemplate.generate(base, CTX())
    const grid = page!.objects.find((o) => o.type === 'group')!
    const numbers = (grid.objects ?? []).filter((o) => o.studioRole === 'prompt')
    // Default 8×8 board: every clue value sums back to the 64 squares.
    const total = numbers.reduce((sum, o) => sum + Number(o.text), 0)
    expect(numbers.length).toBeGreaterThan(0)
    expect(total).toBe(64)
  })

  it('groups the grid into a single object', () => {
    resetObjectCounter()
    const [page] = shikakuTemplate.generate(base, CTX())
    expect(page!.objects.filter((o) => o.type === 'group').length).toBe(1)
  })

  it('centers the grid in the page content area', () => {
    resetObjectCounter()
    const ctx = CTX()
    const [page] = shikakuTemplate.generate(base, ctx)
    const grid = page!.objects.find((o) => o.type === 'group')!
    const contentLeft = ctx.margin.left + STUDIO_CONTENT_SAFE_INSET_X
    const contentRight = ctx.pageWidth - ctx.margin.right - STUDIO_CONTENT_SAFE_INSET_X
    const contentCenterX = (contentLeft + contentRight) / 2
    const gridCenterX = grid.left! + grid.width! / 2
    expect(Math.abs(gridCenterX - contentCenterX)).toBeLessThanOrEqual(2)
  })

  it('keeps the grid clear of the safe-area edge when page title is on', () => {
    resetObjectCounter()
    const ctx = CTX()
    const config = { ...base, showTitle: true, title: 'Game 1' }
    const [page] = shikakuTemplate.generate(config, ctx)
    assertObjectsInSafeMargin(page!.objects, ctx)

    const tag: StudioTag = {
      templateKey: 'shikaku',
      instanceId: 'test-run',
      pageRole: 'single',
    }
    resetObjectCounter()
    const field = drawHeader(
      insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X),
      config,
      tag,
      INSTRUCTION,
    ).body

    const grid = page!.objects.find((o) => o.type === 'group')!
    expect(grid.left!).toBeGreaterThanOrEqual(field.left + 8)
    expect(grid.top!).toBeGreaterThanOrEqual(field.top + 8)
    expect(grid.left! + grid.width!).toBeLessThanOrEqual(field.left + field.width - 8)
    expect(grid.top! + grid.height!).toBeLessThanOrEqual(field.top + field.height - 8)
  })

  it('keeps the solution grid the same size as the question page', () => {
    resetObjectCounter()
    const [page] = shikakuTemplate.generate(base, CTX())
    const puzzleGrid = page!.objects.find((o) => o.type === 'group')!
    const keyGrid = buildAnswerPage(
      page!.answerSourceObjects ?? page!.objects,
      STUDIO_ANSWER_INK_MONO,
    ).find((o) => o.type === 'group')!
    expect(keyGrid.width).toBe(puzzleGrid.width)
    expect(keyGrid.height).toBe(puzzleGrid.height)
  })

  it('centers the solution grid in the taller key body (no instruction)', () => {
    resetObjectCounter()
    const ctx = CTX()
    const [page] = shikakuTemplate.generate(base, ctx)
    const grid = buildAnswerPage(
      page!.answerSourceObjects ?? page!.objects,
      STUDIO_ANSWER_INK_MONO,
    ).find((o) => o.type === 'group')!

    const tag: StudioTag = {
      templateKey: 'shikaku',
      instanceId: 'test-run',
      pageRole: 'single',
    }
    resetObjectCounter()
    const field = drawHeader(
      insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X),
      base,
      tag,
      '',
    ).body

    expect(Math.abs(grid.left! + grid.width! / 2 - (field.left + field.width / 2))).toBeLessThanOrEqual(2)
    expect(Math.abs(grid.top! + grid.height! / 2 - (field.top + field.height / 2))).toBeLessThanOrEqual(2)
  })

  it('uses the shared mid-gray rule color for grid bars', () => {
    resetObjectCounter()
    const [page] = shikakuTemplate.generate(base, CTX())
    const grid = page!.objects.find((o) => o.type === 'group')!
    const rules = (grid.objects ?? []).filter((o) => o.studioRole === 'structure')
    expect(rules.length).toBeGreaterThan(0)
    expect(rules.every((o) => o.fill === STUDIO_RULE_MEDIUM)).toBe(true)
  })

  it('answer key uses black ink, not blue', () => {
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has('shikaku')).toBe(true)
    resetObjectCounter()
    const [page] = shikakuTemplate.generate(base, CTX())
    const answers = harvestAnswers(
      buildAnswerPage(page!.answerSourceObjects ?? page!.objects, STUDIO_ANSWER_INK_MONO),
    )
    expect(answers.length).toBeGreaterThan(0)
    expect(answers.every((o) => o.fill === STUDIO_ANSWER_INK_MONO)).toBe(true)
    expect(answers.every((o) => o.fill !== STUDIO_ANSWER_INK)).toBe(true)
  })

  it('states all three rules in the instruction', () => {
    resetObjectCounter()
    const [page] = shikakuTemplate.generate(base, CTX())
    const texts = page!.objects
      .filter((o) => o.type === 'textbox')
      .map((o) => String(o.text ?? ''))
      .join(' ')
    expect(texts).toMatch(/rectangles/i)
    expect(texts).toMatch(/exactly one number/i)
    expect(texts).toMatch(/how many squares/i)
  })

  it('every size/difficulty pair generates inside the safe area', () => {
    for (const size of ['6x6', '8x8', '10x10', '12x12', '10x14']) {
      for (const difficulty of ['easy', 'medium', 'hard']) {
        for (const seed of [42, 7]) {
          resetObjectCounter()
          const ctx = { ...CTX(), seed }
          const pages = shikakuTemplate.generate({ ...base, size, difficulty, seed }, ctx)
          assertObjectsInSafeMargin(pages[0]!.objects, ctx)
        }
      }
    }
  }, 60_000)

  it('fits the tall board on a small trim without spilling', () => {
    const ctx: StudioGenerateContext = {
      pageWidth: 1650,
      pageHeight: 2550,
      margin: { top: 108, right: 108, bottom: 108, left: 162 },
      seed: 3,
      instanceId: 'test-run',
    }
    resetObjectCounter()
    const pages = shikakuTemplate.generate(
      { ...base, size: '10x14', difficulty: 'hard', showTitle: true, title: 'Game 9', seed: 3 },
      ctx,
    )
    assertObjectsInSafeMargin(pages[0]!.objects, ctx)
  })
})
