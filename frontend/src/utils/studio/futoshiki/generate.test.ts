import { describe, it, expect } from 'vitest'
import { futoshikiTemplate } from './generate'
import { buildDefaultConfig, getStudioTemplate } from '@/constants/studio-templates'
import {
  STUDIO_ANSWER_INK,
  STUDIO_ANSWER_INK_MONO,
  STUDIO_ANSWER_INK_MONO_TEMPLATES,
  STUDIO_CONTENT_SAFE_INSET_X,
  STUDIO_INK,
  STUDIO_STROKE_HAIRLINE,
} from '@/constants/studio.constants'
import { resetObjectCounter, type StudioTag } from '../studio-fabric-builders'
import { contentBox, drawHeader, insetHorizontal } from '../studio-layout'
import { runGeneratorContractTests } from '../studio-generator-test'
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
  ...buildDefaultConfig(futoshikiTemplate),
  seed: 42,
  fontFamily: 'Inter',
}

runGeneratorContractTests(futoshikiTemplate)

describe('futoshiki', () => {
  it('is deterministic', () => {
    resetObjectCounter()
    const a = futoshikiTemplate.generate(base, CTX())
    resetObjectCounter()
    const b = futoshikiTemplate.generate(base, CTX())
    expect(a).toEqual(b)
  })

  it('different seeds give different puzzles', () => {
    resetObjectCounter()
    const a = JSON.stringify(futoshikiTemplate.generate(base, CTX()))
    resetObjectCounter()
    const b = JSON.stringify(
      futoshikiTemplate.generate({ ...base, seed: 7 }, { ...CTX(), seed: 7 }),
    )
    expect(a).not.toEqual(b)
  })

  it('auto-adds a solution page (no form toggles)', () => {
    expect(futoshikiTemplate.producesAnswerKey).toBe(true)
    const registered = getStudioTemplate('futoshiki')
    const regKeys = new Set(registered!.configSchema.map((f) => f.key))
    expect(regKeys.has('includeAnswerKey')).toBe(false)
    expect(regKeys.has('answerKeyForAll')).toBe(false)
  })

  it('every cell has a hidden answer digit', () => {
    resetObjectCounter()
    const [page] = futoshikiTemplate.generate(base, CTX())
    const answers = harvestAnswers(page!.objects)
    expect(answers.length).toBe(25)
    expect(answers.every((o) => o.visible === false)).toBe(true)
  })

  it('groups the grid into a single object', () => {
    resetObjectCounter()
    const [page] = futoshikiTemplate.generate(base, CTX())
    const groups = page!.objects.filter((o) => o.type === 'group')
    expect(groups.length).toBe(1)
  })

  it('draws inequality signs as polylines (not Unicode text tofu)', () => {
    resetObjectCounter()
    const [page] = futoshikiTemplate.generate(base, CTX())
    const grid = page!.objects.find((o) => o.type === 'group')!
    const nested = (grid.objects ?? []) as Array<{ type?: string; text?: string }>
    const signs = nested.filter((o) => o.type === 'polyline')
    expect(signs.length).toBeGreaterThan(0)
    // No leftover ∧∨<> text in the grid gutters.
    const signText = nested.filter(
      (o) =>
        o.type === 'textbox' &&
        typeof o.text === 'string' &&
        ['<', '>', '∧', '∨'].includes(o.text),
    )
    expect(signText).toHaveLength(0)
  })

  it('draws cell frames as filled ink bars (even stroke weight)', () => {
    resetObjectCounter()
    const [page] = futoshikiTemplate.generate(base, CTX())
    const grid = page!.objects.find((o) => o.type === 'group')!
    const nested = (grid.objects ?? []) as Array<{
      type?: string
      fill?: string
      strokeWidth?: number
      width?: number
      height?: number
    }>
    const bars = nested.filter(
      (o) =>
        o.type === 'rect' &&
        o.fill === STUDIO_INK &&
        o.strokeWidth === 0 &&
        (o.width === STUDIO_STROKE_HAIRLINE || o.height === STUDIO_STROKE_HAIRLINE),
    )
    // 5×5 → 25 cells × 4 bars
    expect(bars.length).toBe(100)
  })

  it('centers the grid in the page content area', () => {
    resetObjectCounter()
    const ctx = CTX()
    const [page] = futoshikiTemplate.generate(base, ctx)
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
    const [page] = futoshikiTemplate.generate(base, ctx)
    expect(page!.answerSourceObjects?.length).toBeGreaterThan(0)

    const keyObjects = buildAnswerPage(
      page!.answerSourceObjects ?? page!.objects,
      STUDIO_ANSWER_INK_MONO,
    )
    const grid = keyObjects.find((o) => o.type === 'group')!

    const tag: StudioTag = {
      templateKey: 'futoshiki',
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

  it('size/difficulty/style matrix generates without throwing', () => {
    const cases: Array<{ size: number; difficulty: string; style: string }> = [
      { size: 4, difficulty: 'easy', style: 'mixed' },
      { size: 4, difficulty: 'hard', style: 'pure' },
      { size: 5, difficulty: 'medium', style: 'mixed' },
      { size: 5, difficulty: 'hard', style: 'pure' },
      { size: 6, difficulty: 'medium', style: 'mixed' },
      { size: 6, difficulty: 'easy', style: 'pure' },
      { size: 7, difficulty: 'easy', style: 'mixed' },
      { size: 7, difficulty: 'medium', style: 'mixed' },
    ]
    for (const { size, difficulty, style } of cases) {
      resetObjectCounter()
      expect(() =>
        futoshikiTemplate.generate({ ...base, size, difficulty, style }, CTX()),
      ).not.toThrow()
    }
  })

  it('answer key uses black ink, not blue', () => {
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has('futoshiki')).toBe(true)
    resetObjectCounter()
    const [page] = futoshikiTemplate.generate(base, CTX())
    const keyObjects = buildAnswerPage(page!.objects, STUDIO_ANSWER_INK_MONO)
    const answers = harvestAnswers(keyObjects)
    expect(answers.length).toBe(25)
    expect(answers.every((o) => o.fill === STUDIO_ANSWER_INK_MONO)).toBe(true)
    expect(answers.every((o) => o.fill !== STUDIO_ANSWER_INK)).toBe(true)
  })

  it('instruction mentions the configured grid size', () => {
    resetObjectCounter()
    const [page] = futoshikiTemplate.generate({ ...base, size: 6 }, CTX())
    const texts = page!.objects
      .filter((o) => o.type === 'textbox')
      .map((o) => String(o.text ?? ''))
    expect(texts.some((t) => t.includes('1–6'))).toBe(true)
  })
})
