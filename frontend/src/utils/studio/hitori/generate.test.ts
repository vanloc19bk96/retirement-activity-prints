import { describe, it, expect } from 'vitest'
import { hitoriTemplate } from './generate'
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
import { runGeneratorContractTests, assertObjectsInSafeMargin } from '../studio-generator-test'
import { buildAnswerPage, harvestAnswers } from '../studio-answer-key'
import type { StudioGenerateContext } from '@/types/studio-template.types'

const CTX = (): StudioGenerateContext => ({
  pageWidth: 2550,
  pageHeight: 3300,
  margin: { top: 150, right: 150, bottom: 150, left: 225 },
  seed: 42,
  instanceId: 'test-run',
})

const base = {
  ...buildDefaultConfig(hitoriTemplate),
  seed: 42,
  fontFamily: 'Inter',
}

runGeneratorContractTests(hitoriTemplate)

describe('hitori', () => {
  it('is deterministic', () => {
    resetObjectCounter()
    const a = hitoriTemplate.generate(base, CTX())
    resetObjectCounter()
    const b = hitoriTemplate.generate(base, CTX())
    expect(a).toEqual(b)
  })

  it('different seeds give different puzzles', () => {
    resetObjectCounter()
    const a = JSON.stringify(hitoriTemplate.generate(base, CTX()))
    resetObjectCounter()
    const b = JSON.stringify(
      hitoriTemplate.generate({ ...base, seed: 7 }, { ...CTX(), seed: 7 }),
    )
    expect(a).not.toEqual(b)
  })

  it('auto-adds a solution page (no form toggles)', () => {
    expect(hitoriTemplate.producesAnswerKey).toBe(true)
    const registered = getStudioTemplate('hitori')
    const regKeys = new Set(registered!.configSchema.map((f) => f.key))
    expect(regKeys.has('includeAnswerKey')).toBe(false)
    expect(regKeys.has('answerKeyForAll')).toBe(false)
  })

  it('has hidden answer shading cells', () => {
    resetObjectCounter()
    const [page] = hitoriTemplate.generate(base, CTX())
    const answers = harvestAnswers(page!.objects)
    expect(answers.length).toBeGreaterThan(0)
    expect(answers.every((o) => o.visible === false)).toBe(true)
    expect(answers.every((o) => o.type === 'rect')).toBe(true)
  })

  it('groups the grid into a single object', () => {
    resetObjectCounter()
    const [page] = hitoriTemplate.generate(base, CTX())
    const groups = page!.objects.filter((o) => o.type === 'group')
    expect(groups.length).toBe(1)
  })

  it('centers the grid in the page content area', () => {
    resetObjectCounter()
    const ctx = CTX()
    const [page] = hitoriTemplate.generate(base, ctx)
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
    const [page] = hitoriTemplate.generate(config, ctx)
    assertObjectsInSafeMargin(page!.objects, ctx)

    const grid = page!.objects.find((o) => o.type === 'group')!
    const tag: StudioTag = {
      templateKey: 'hitori',
      instanceId: 'test-run',
      pageRole: 'single',
    }
    resetObjectCounter()
    const field = drawHeader(
      insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X),
      config,
      tag,
      // Match generate.ts instruction so body height matches the puzzle page.
      'Shade cells so that no number repeats in any row or column among the unshaded cells. ' +
        'Shaded cells may not touch each other left-right or up-down (diagonal is fine), and all ' +
        'unshaded cells must stay connected in one group. Tip: a number between two equal numbers ' +
        'is always safe to keep',
    ).body

    expect(grid.left!).toBeGreaterThanOrEqual(field.left + 8)
    expect(grid.top!).toBeGreaterThanOrEqual(field.top + 8)
    expect(grid.left! + grid.width!).toBeLessThanOrEqual(field.left + field.width - 8)
    expect(grid.top! + grid.height!).toBeLessThanOrEqual(field.top + field.height - 8)
  })

  it('centers the solution grid in the taller key body (no instruction)', () => {
    resetObjectCounter()
    const ctx = CTX()
    const [page] = hitoriTemplate.generate(base, ctx)
    expect(page!.answerSourceObjects?.length).toBeGreaterThan(0)

    const keyObjects = buildAnswerPage(
      page!.answerSourceObjects ?? page!.objects,
      STUDIO_ANSWER_INK_MONO,
    )
    const grid = keyObjects.find((o) => o.type === 'group')!

    const tag: StudioTag = {
      templateKey: 'hitori',
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

    const gridCenterX = grid.left! + grid.width! / 2
    const gridCenterY = grid.top! + grid.height! / 2
    expect(Math.abs(gridCenterX - (field.left + field.width / 2))).toBeLessThanOrEqual(2)
    expect(Math.abs(gridCenterY - (field.top + field.height / 2))).toBeLessThanOrEqual(2)
  })

  it('keeps the solution grid the same size as the question page', () => {
    resetObjectCounter()
    const [page] = hitoriTemplate.generate(base, CTX())
    const puzzleGrid = page!.objects.find((o) => o.type === 'group')!
    const keyObjects = buildAnswerPage(
      page!.answerSourceObjects ?? page!.objects,
      STUDIO_ANSWER_INK_MONO,
    )
    const keyGrid = keyObjects.find((o) => o.type === 'group')!
    expect(keyGrid.width).toBe(puzzleGrid.width)
    expect(keyGrid.height).toBe(puzzleGrid.height)
  })

  it('uses Grid Copy mid-gray rule color for grid bars', () => {
    resetObjectCounter()
    const [page] = hitoriTemplate.generate(base, CTX())
    const grid = page!.objects.find((o) => o.type === 'group')!
    const rules = (grid.objects ?? []).filter(
      (o) => o.studioRole === 'structure' && o.type === 'rect',
    )
    expect(rules.length).toBeGreaterThan(0)
    expect(rules.every((o) => o.fill === STUDIO_RULE_MEDIUM)).toBe(true)
  })

  it('every size/difficulty pair generates without throwing', () => {
    for (const size of [5, 6, 8]) {
      for (const difficulty of ['easy', 'medium', 'hard']) {
        for (const seed of [42, 7, 1]) {
          resetObjectCounter()
          expect(
            () =>
              hitoriTemplate.generate(
                { ...base, size, difficulty, seed },
                { ...CTX(), seed },
              ),
            `${size}×${size} ${difficulty} seed ${seed}`,
          ).not.toThrow()
        }
      }
    }
  }, 30_000)

  it('answer key uses black ink, not blue', () => {
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has('hitori')).toBe(true)
    resetObjectCounter()
    const [page] = hitoriTemplate.generate(base, CTX())
    const keyObjects = buildAnswerPage(
      page!.answerSourceObjects ?? page!.objects,
      STUDIO_ANSWER_INK_MONO,
    )
    const answers = harvestAnswers(keyObjects)
    expect(answers.length).toBeGreaterThan(0)
    expect(answers.every((o) => o.fill === STUDIO_ANSWER_INK_MONO)).toBe(true)
    expect(answers.every((o) => o.fill !== STUDIO_ANSWER_INK)).toBe(true)
  })

  it('instruction states all three hitori rules', () => {
    resetObjectCounter()
    const [page] = hitoriTemplate.generate(base, CTX())
    const texts = page!.objects
      .filter((o) => o.type === 'textbox')
      .map((o) => String(o.text ?? ''))
      .join(' ')
    expect(texts).toMatch(/no number repeats/i)
    expect(texts).toMatch(/may not touch/i)
    expect(texts).toMatch(/connected/i)
  })
})
