import { describe, it, expect } from 'vitest'
import { kenkenTemplate } from './generate'
import { buildDefaultConfig, getStudioTemplate } from '@/constants/studio-templates'
import {
  STUDIO_ANSWER_INK,
  STUDIO_ANSWER_INK_MONO,
  STUDIO_ANSWER_INK_MONO_TEMPLATES,
  STUDIO_CONTENT_SAFE_INSET_X,
  STUDIO_RULE_MEDIUM,
} from '@/constants/studio.constants'
import { resetObjectCounter, type StudioTag } from '../studio-fabric-builders'
import { contentBox, drawHeader, insetHorizontal } from '../studio-layout'
import { assertObjectsInSafeMargin, runGeneratorContractTests } from '../studio-generator-test'
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
  ...buildDefaultConfig(kenkenTemplate),
  seed: 42,
  fontFamily: 'Inter',
}

runGeneratorContractTests(kenkenTemplate)

describe('kenken', () => {
  it('is deterministic', () => {
    resetObjectCounter()
    const a = kenkenTemplate.generate(base, CTX())
    resetObjectCounter()
    const b = kenkenTemplate.generate(base, CTX())
    expect(a).toEqual(b)
  })

  it('different seeds give different puzzles', () => {
    resetObjectCounter()
    const a = JSON.stringify(kenkenTemplate.generate(base, CTX()))
    resetObjectCounter()
    const b = JSON.stringify(
      kenkenTemplate.generate({ ...base, seed: 7 }, { ...CTX(), seed: 7 }),
    )
    expect(a).not.toEqual(b)
  })

  it('auto-adds a solution page (no form toggles)', () => {
    expect(kenkenTemplate.producesAnswerKey).toBe(true)
    const registered = getStudioTemplate('kenken')
    const regKeys = new Set(registered!.configSchema.map((f) => f.key))
    expect(regKeys.has('includeAnswerKey')).toBe(false)
    expect(regKeys.has('answerKeyForAll')).toBe(false)
  })

  it('every cell has a hidden answer digit', () => {
    resetObjectCounter()
    const [page] = kenkenTemplate.generate(base, CTX())
    const answers = harvestAnswers(page!.objects)
    expect(answers.length).toBe(36)
    expect(answers.every((o) => o.visible === false)).toBe(true)
  })

  it('groups the grid into a single object', () => {
    resetObjectCounter()
    const [page] = kenkenTemplate.generate(base, CTX())
    const groups = page!.objects.filter((o) => o.type === 'group')
    expect(groups.length).toBe(1)
  })

  it('centers the grid in the page content area', () => {
    resetObjectCounter()
    const ctx = CTX()
    const [page] = kenkenTemplate.generate(base, ctx)
    const grid = page!.objects.find((o) => o.type === 'group')!
    const contentLeft = ctx.margin.left + STUDIO_CONTENT_SAFE_INSET_X
    const contentRight = ctx.pageWidth - ctx.margin.right - STUDIO_CONTENT_SAFE_INSET_X
    const contentCenterX = (contentLeft + contentRight) / 2
    const gridCenterX = grid.left! + grid.width! / 2
    expect(Math.abs(gridCenterX - contentCenterX)).toBeLessThanOrEqual(2)
  })

  it('centers the solution grid in the taller key body (no instruction)', () => {
    resetObjectCounter()
    const ctx = CTX()
    const [page] = kenkenTemplate.generate(base, ctx)
    expect(page!.answerSourceObjects?.length).toBeGreaterThan(0)

    const keyObjects = buildAnswerPage(
      page!.answerSourceObjects ?? page!.objects,
      STUDIO_ANSWER_INK_MONO,
    )
    const grid = keyObjects.find((o) => o.type === 'group')!

    const tag: StudioTag = {
      templateKey: 'kenken',
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

  it('size/difficulty/operations matrix generates without throwing', () => {
    const cases: Array<{ size: number; difficulty: string; operations: string }> = [
      { size: 4, difficulty: 'easy', operations: 'addmul' },
      { size: 4, difficulty: 'hard', operations: 'all' },
      { size: 5, difficulty: 'medium', operations: 'all' },
      { size: 6, difficulty: 'medium', operations: 'all' },
      { size: 6, difficulty: 'easy', operations: 'addmul' },
      { size: 7, difficulty: 'easy', operations: 'all' },
      { size: 9, difficulty: 'easy', operations: 'addmul' },
    ]
    for (const { size, difficulty, operations } of cases) {
      resetObjectCounter()
      expect(() =>
        kenkenTemplate.generate({ ...base, size, difficulty, operations }, CTX()),
      ).not.toThrow()
    }
  })

  it('answer key uses black ink, not blue', () => {
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has('kenken')).toBe(true)
    resetObjectCounter()
    const [page] = kenkenTemplate.generate(base, CTX())
    const keyObjects = buildAnswerPage(page!.objects, STUDIO_ANSWER_INK_MONO)
    const answers = harvestAnswers(keyObjects)
    expect(answers.length).toBe(36)
    expect(answers.every((o) => o.fill === STUDIO_ANSWER_INK_MONO)).toBe(true)
    expect(answers.every((o) => o.fill !== STUDIO_ANSWER_INK)).toBe(true)
  })

  it('instruction mentions the configured grid size', () => {
    resetObjectCounter()
    const [page] = kenkenTemplate.generate({ ...base, size: 4 }, CTX())
    const texts = page!.objects
      .filter((o) => o.type === 'textbox')
      .map((o) => String(o.text ?? ''))
    expect(texts.some((t) => t.includes('1–4'))).toBe(true)
  })

  it('keeps the grid inside the safe margin when page title is on', () => {
    resetObjectCounter()
    const ctx = CTX()
    const pages = kenkenTemplate.generate(
      { ...base, showTitle: true, title: 'Game 1', size: 9 },
      ctx,
    )
    assertObjectsInSafeMargin(pages[0]!.objects, ctx)
  })

  it('uses Grid Copy mid-gray rule color for grid bars', () => {
    resetObjectCounter()
    const [page] = kenkenTemplate.generate(base, CTX())
    const grid = page!.objects.find((o) => o.type === 'group')!
    const rules = (grid.objects ?? []).filter(
      (o) => o.studioRole === 'structure' && o.type === 'rect',
    )
    expect(rules.length).toBeGreaterThan(0)
    expect(rules.every((o) => o.fill === STUDIO_RULE_MEDIUM)).toBe(true)
  })
})
