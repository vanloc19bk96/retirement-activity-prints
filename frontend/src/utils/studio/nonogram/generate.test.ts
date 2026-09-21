import { describe, it, expect } from 'vitest'
import { nonogramTemplate } from './generate'
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
import {
  assertGeneratorEntropy,
  assertObjectsInSafeMargin,
  contentFingerprint,
  runGeneratorContractTests,
} from '../studio-generator-test'
import { buildAnswerPage, harvestAnswers } from '../studio-answer-key'
import { NONOGRAM_DIFFICULTIES, NONOGRAM_SIZES, NONOGRAM_STYLES } from './types'
import type { StudioGenerateContext } from '@/types/studio-template.types'

const CTX = (): StudioGenerateContext => ({
  pageWidth: 2550,
  pageHeight: 3300,
  margin: { top: 150, right: 150, bottom: 150, left: 225 },
  seed: 42,
  instanceId: 'test-run',
})

const base = {
  ...buildDefaultConfig(nonogramTemplate),
  seed: 42,
  fontFamily: 'Inter',
}

runGeneratorContractTests(nonogramTemplate)
assertGeneratorEntropy(nonogramTemplate)

describe('nonogram', () => {
  it('is deterministic', () => {
    resetObjectCounter()
    const a = nonogramTemplate.generate(base, CTX())
    resetObjectCounter()
    const b = nonogramTemplate.generate(base, CTX())
    expect(a).toEqual(b)
  })

  it('different seeds give different puzzles', () => {
    resetObjectCounter()
    const a = JSON.stringify(nonogramTemplate.generate(base, CTX()))
    resetObjectCounter()
    const b = JSON.stringify(
      nonogramTemplate.generate({ ...base, seed: 7 }, { ...CTX(), seed: 7 }),
    )
    expect(a).not.toEqual(b)
  })

  it('gives two sellers different puzzles from the same seed', () => {
    // Same settings, same seed, different accounts must not print the same page —
    // near-identical books are what gets KDP listings pulled.
    const fingerprintFor = (ownerKey: string): string => {
      resetObjectCounter()
      const pages = nonogramTemplate.generate(base, { ...CTX(), ownerKey })
      return pages.map((p) => contentFingerprint(p.objects)).join('#')
    }
    const seen = new Set(
      ['user:1', 'user:2', 'user:3', 'book:draft', 'anonymous'].map(fingerprintFor),
    )
    expect(seen.size).toBe(5)
  })

  it('is stable for one seller across reruns', () => {
    resetObjectCounter()
    const a = nonogramTemplate.generate(base, { ...CTX(), ownerKey: 'user:42' })
    resetObjectCounter()
    const b = nonogramTemplate.generate(base, { ...CTX(), ownerKey: 'user:42' })
    expect(a).toEqual(b)
  })

  it('auto-adds a solution page (no form toggles)', () => {
    expect(nonogramTemplate.producesAnswerKey).toBe(true)
    const registered = getStudioTemplate('nonogram')
    const regKeys = new Set(registered!.configSchema.map((f) => f.key))
    expect(regKeys.has('includeAnswerKey')).toBe(false)
    expect(regKeys.has('answerKeyForAll')).toBe(false)
  })

  it('exposes only size, difficulty and pattern style', () => {
    const keys = nonogramTemplate.configSchema.map((f) => f.key)
    expect(keys).toEqual(['size', 'difficulty', 'style'])
  })

  it('filled cells have hidden answer rects', () => {
    resetObjectCounter()
    const [page] = nonogramTemplate.generate(base, CTX())
    const answers = harvestAnswers(page!.objects)
    expect(answers.length).toBeGreaterThan(0)
    expect(answers.every((o) => o.visible === false)).toBe(true)
    expect(answers.every((o) => o.type === 'rect')).toBe(true)
  })

  it('groups the puzzle into a single object', () => {
    resetObjectCounter()
    const [page] = nonogramTemplate.generate(base, CTX())
    const groups = page!.objects.filter((o) => o.type === 'group')
    expect(groups.length).toBe(1)
  })

  it('centers the puzzle in the page content area', () => {
    resetObjectCounter()
    const ctx = CTX()
    const [page] = nonogramTemplate.generate(base, ctx)
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
    const [page] = nonogramTemplate.generate(base, ctx)
    expect(page!.answerSourceObjects?.length).toBeGreaterThan(0)

    const keyObjects = buildAnswerPage(
      page!.answerSourceObjects ?? page!.objects,
      STUDIO_ANSWER_INK_MONO,
    )
    const grid = keyObjects.find((o) => o.type === 'group')!

    const tag: StudioTag = {
      templateKey: 'nonogram',
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

  it('uses Grid Copy mid-gray rule color for grid bars', () => {
    resetObjectCounter()
    const [page] = nonogramTemplate.generate(base, CTX())
    const grid = page!.objects.find((o) => o.type === 'group')!
    const rules = (grid.objects ?? []).filter(
      (o) => o.studioRole === 'structure' && o.type === 'rect',
    )
    expect(rules.length).toBeGreaterThan(0)
    expect(rules.every((o) => o.fill === STUDIO_RULE_MEDIUM)).toBe(true)
  })

  it('size / difficulty / style matrix generates and stays inside the margins', () => {
    for (const size of NONOGRAM_SIZES) {
      for (const difficulty of NONOGRAM_DIFFICULTIES) {
        for (const style of NONOGRAM_STYLES) {
          resetObjectCounter()
          const ctx = CTX()
          const pages = nonogramTemplate.generate(
            { ...base, size, difficulty, style },
            ctx,
          )
          expect(pages.length).toBe(1)
          assertObjectsInSafeMargin(pages[0]!.objects, ctx)
        }
      }
    }
  })

  it('keeps clue digits legible on the largest grid', () => {
    resetObjectCounter()
    const [page] = nonogramTemplate.generate({ ...base, size: 20 }, CTX())
    const grid = page!.objects.find((o) => o.type === 'group')!
    const clues = (grid.objects ?? []).filter((o) => o.studioRole === 'prompt')
    expect(clues.length).toBeGreaterThan(0)
    expect(clues.every((o) => (o.fontSize ?? 0) >= 24)).toBe(true)
  })

  it('answer key uses black ink, not blue', () => {
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has('nonogram')).toBe(true)
    resetObjectCounter()
    const [page] = nonogramTemplate.generate(base, CTX())
    const keyObjects = buildAnswerPage(page!.objects, STUDIO_ANSWER_INK_MONO)
    const answers = harvestAnswers(keyObjects)
    expect(answers.length).toBeGreaterThan(0)
    expect(answers.every((o) => o.fill === STUDIO_ANSWER_INK_MONO)).toBe(true)
    expect(answers.every((o) => o.fill !== STUDIO_ANSWER_INK)).toBe(true)
  })

  it('instruction mentions the configured grid size and promises no guessing', () => {
    resetObjectCounter()
    const [page] = nonogramTemplate.generate({ ...base, size: 5 }, CTX())
    const texts = page!.objects
      .filter((o) => o.type === 'textbox')
      .map((o) => String(o.text ?? ''))
    expect(texts.some((t) => t.includes('5×5'))).toBe(true)
    expect(texts.some((t) => t.includes('logic only'))).toBe(true)
  })

  it('keeps the grid inside the safe margin when page title is on', () => {
    resetObjectCounter()
    const ctx = CTX()
    const pages = nonogramTemplate.generate(
      { ...base, showTitle: true, title: 'Game 1', size: 20 },
      ctx,
    )
    assertObjectsInSafeMargin(pages[0]!.objects, ctx)
  })

  it('says nothing about a hidden picture', () => {
    resetObjectCounter()
    const [page] = nonogramTemplate.generate(base, CTX())
    const copy = [
      nonogramTemplate.description,
      ...page!.objects.filter((o) => o.type === 'textbox').map((o) => String(o.text ?? '')),
    ]
      .join(' ')
      .toLowerCase()
    expect(copy).not.toContain('picture')
    expect(copy).not.toContain('image')
  })
})
