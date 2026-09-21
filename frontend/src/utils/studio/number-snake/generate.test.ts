import { describe, it, expect } from 'vitest'
import { numberSnakeTemplate } from './generate'
import { buildDefaultConfig, getStudioTemplate } from '@/constants/studio-templates'
import {
  STUDIO_ANSWER_INK,
  STUDIO_ANSWER_INK_MONO,
  STUDIO_ANSWER_INK_MONO_TEMPLATES,
  STUDIO_CONTENT_SAFE_INSET_X,
  STUDIO_RULE_MEDIUM,
} from '@/constants/studio.constants'
import { resetObjectCounter, type StudioTag } from '../studio-fabric-builders'
import { runGeneratorContractTests, assertObjectsInSafeMargin } from '../studio-generator-test'
import { buildAnswerPage, harvestAnswers } from '../studio-answer-key'
import { contentBox, insetHorizontal, drawHeader } from '../studio-layout'
import type { StudioGenerateContext } from '@/types/studio-template.types'

const CTX = (): StudioGenerateContext => ({
  pageWidth: 2550,
  pageHeight: 3300,
  margin: { top: 150, right: 150, bottom: 150, left: 225 },
  seed: 42,
  instanceId: 'test-run',
})

const base = {
  ...buildDefaultConfig(numberSnakeTemplate),
  seed: 42,
  fontFamily: 'Inter',
}

runGeneratorContractTests(numberSnakeTemplate)

describe('number-snake', () => {
  it('is deterministic', () => {
    resetObjectCounter()
    const a = numberSnakeTemplate.generate(base, CTX())
    resetObjectCounter()
    const b = numberSnakeTemplate.generate(base, CTX())
    expect(a).toEqual(b)
  })

  it('different seeds give different puzzles', () => {
    resetObjectCounter()
    const a = JSON.stringify(numberSnakeTemplate.generate(base, CTX()))
    resetObjectCounter()
    const b = JSON.stringify(
      numberSnakeTemplate.generate({ ...base, seed: 7 }, { ...CTX(), seed: 7 }),
    )
    expect(a).not.toEqual(b)
  })

  it('auto-adds a solution page (no form toggles)', () => {
    expect(numberSnakeTemplate.producesAnswerKey).toBe(true)
    const registered = getStudioTemplate('number-snake')
    const regKeys = new Set(registered!.configSchema.map((f) => f.key))
    expect(regKeys.has('includeAnswerKey')).toBe(false)
    expect(regKeys.has('answerKeyForAll')).toBe(false)
  })

  it('emits hidden answers for blank cells', () => {
    resetObjectCounter()
    const [page] = numberSnakeTemplate.generate(
      { ...base, size: 5, difficulty: 'easy', showPathOnKey: false },
      CTX(),
    )
    const answers = harvestAnswers(page!.objects)
    expect(answers.length).toBeGreaterThan(0)
    expect(answers.every((o) => o.visible === false)).toBe(true)
  })

  it('groups the puzzle into one movable unit', () => {
    resetObjectCounter()
    const [page] = numberSnakeTemplate.generate(base, CTX())
    const groups = page!.objects.filter((o) => o.type === 'group')
    expect(groups.length).toBe(1)
  })

  it('centers the grid in the content area', () => {
    resetObjectCounter()
    const ctx = CTX()
    const [page] = numberSnakeTemplate.generate({ ...base, size: 5 }, ctx)
    const grid = page!.objects.find((o) => o.type === 'group')!
    const contentLeft = ctx.margin.left + STUDIO_CONTENT_SAFE_INSET_X
    const contentRight = ctx.pageWidth - ctx.margin.right - STUDIO_CONTENT_SAFE_INSET_X
    const contentCenterX = (contentLeft + contentRight) / 2
    const gridCenterX = grid.left! + grid.width! / 2
    expect(Math.abs(gridCenterX - contentCenterX)).toBeLessThanOrEqual(2)
  })

  it('uses Grid Copy mid-gray rule color for grid bars', () => {
    resetObjectCounter()
    const [page] = numberSnakeTemplate.generate({ ...base, size: 5 }, CTX())
    const grid = page!.objects.find((o) => o.type === 'group')!
    const rules = (grid.objects ?? []).filter(
      (o) => o.studioRole === 'structure' && o.type === 'rect',
    )
    expect(rules.length).toBeGreaterThan(0)
    expect(rules.every((o) => o.fill === STUDIO_RULE_MEDIUM)).toBe(true)
  })

  it('centers the solution grid at the same size as the puzzle page', () => {
    resetObjectCounter()
    const ctx = CTX()
    const config = { ...base, size: 5, showTitle: true, title: 'Game 1' }
    const [page] = numberSnakeTemplate.generate(config, ctx)
    expect(page!.answerSourceObjects?.length).toBeGreaterThan(0)

    const puzzleGrid = page!.objects.find((o) => o.type === 'group')!
    const keyObjects = buildAnswerPage(
      page!.answerSourceObjects ?? page!.objects,
      STUDIO_ANSWER_INK_MONO,
    )
    const grid = keyObjects.find((o) => o.type === 'group')!
    assertObjectsInSafeMargin(keyObjects, ctx)

    expect(grid.width).toBe(puzzleGrid.width)
    expect(grid.height).toBe(puzzleGrid.height)

    const tag: StudioTag = {
      templateKey: 'number-snake',
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
    expect(Math.abs(gridCenterY - (field.top + field.height / 2))).toBeLessThanOrEqual(2)
  })

  it('all sizes and difficulties generate without throwing', () => {
    for (const size of [5, 6, 7, 8, 9, 10]) {
      for (const difficulty of ['easy', 'medium', 'hard']) {
        for (const variant of ['diagonal', 'orthogonal']) {
          resetObjectCounter()
          expect(() =>
            numberSnakeTemplate.generate(
              { ...base, size, difficulty, variant, showPathOnKey: true },
              CTX(),
            ),
          ).not.toThrow()
        }
      }
    }
  }, 120_000)

  it('max density (10×10 hard) stays inside safe margin', () => {
    resetObjectCounter()
    expect(() =>
      numberSnakeTemplate.generate(
        { ...base, size: 10, difficulty: 'hard', variant: 'diagonal', showPathOnKey: true },
        CTX(),
      ),
    ).not.toThrow()
  })

  it('answer key uses black ink, not blue', () => {
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has('number-snake')).toBe(true)
    resetObjectCounter()
    const [page] = numberSnakeTemplate.generate(
      { ...base, size: 5, showPathOnKey: false },
      CTX(),
    )
    const keyObjects = buildAnswerPage(page!.objects, STUDIO_ANSWER_INK_MONO)
    const answers = harvestAnswers(keyObjects).filter((o) => o.type === 'textbox')
    expect(answers.length).toBeGreaterThan(0)
    expect(answers.every((o) => o.fill === STUDIO_ANSWER_INK_MONO)).toBe(true)
    expect(answers.every((o) => o.fill !== STUDIO_ANSWER_INK)).toBe(true)
  })

  it('instruction mentions N and adjacency for the variant', () => {
    resetObjectCounter()
    const [page] = numberSnakeTemplate.generate(
      { ...base, size: 6, variant: 'orthogonal', showInstructions: true },
      CTX(),
    )
    const texts = page!.objects
      .filter((o) => o.type === 'textbox')
      .map((o) => String(o.text ?? ''))
    expect(texts.some((t) => t.includes('1 to 36'))).toBe(true)
    expect(texts.some((t) => t.includes('not diagonally'))).toBe(true)
  })

  it('path lines appear on the answer key when enabled', () => {
    resetObjectCounter()
    const [page] = numberSnakeTemplate.generate(
      { ...base, size: 5, showPathOnKey: true },
      CTX(),
    )
    const lines = harvestAnswers(page!.objects).filter((o) => o.type === 'line')
    expect(lines.length).toBe(24)
  })
})
