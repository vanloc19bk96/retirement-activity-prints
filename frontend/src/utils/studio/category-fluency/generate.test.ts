import { describe, it, expect } from 'vitest'
import { categoryFluencyTemplate } from './generate'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { resetObjectCounter } from '../studio-fabric-builders'
import {
  assertObjectsInSafeMargin,
  STUDIO_TEST_CTX,
} from '../studio-generator-test'
import { buildAnswerPage, harvestAnswers } from '../studio-answer-key'
import { contentBox, insetHorizontal } from '../studio-layout'
import {
  STUDIO_ANSWER_INK,
  STUDIO_ANSWER_INK_MONO,
  STUDIO_ANSWER_INK_MONO_TEMPLATES,
  STUDIO_CONTENT_SAFE_INSET_X,
} from '@/constants/studio.constants'
import type { StudioConfig, StudioGenerateContext } from '@/types/studio-template.types'
import type { CategoryFluencyResponse } from '@/types/studio-category-fluency.types'

const REMOTE_EXAMPLES = [
  'dog',
  'cat',
  'horse',
  'tiger',
  'whale',
  'eagle',
  'bee',
  'frog',
  'lion',
  'bear',
  'deer',
  'fox',
  'wolf',
  'owl',
  'duck',
]

const REMOTE: CategoryFluencyResponse = {
  category: 'Animals',
  examples: REMOTE_EXAMPLES,
}

const CTX = (
  remote: CategoryFluencyResponse | undefined = REMOTE,
): StudioGenerateContext => ({
  pageWidth: 2550,
  pageHeight: 3300,
  margin: { top: 150, right: 150, bottom: 150, left: 225 },
  seed: 42,
  instanceId: 'test-run',
  remoteData: remote,
})

const base: StudioConfig = {
  ...buildDefaultConfig(categoryFluencyTemplate),
  seed: 42,
  fontFamily: 'Inter',
}

describe('category-fluency', () => {
  it('is deterministic given the same remoteData', () => {
    resetObjectCounter()
    const a = categoryFluencyTemplate.generate(base, CTX())
    resetObjectCounter()
    const b = categoryFluencyTemplate.generate(base, CTX())
    expect(a).toEqual(b)
  })

  it('prints lineCount write-in lines in one centered group', () => {
    resetObjectCounter()
    const [page] = categoryFluencyTemplate.generate(base, CTX())
    const grid = page!.objects.find(
      (o) => o.type === 'group' && o.studioRole === 'structure',
    )
    expect(grid).toBeTruthy()
    const lines = (grid?.objects ?? []).filter((o) => o.type === 'line')
    expect(lines.length).toBe(Number(base.lineCount))
  })

  it('centers the category banner without a Category: prefix', () => {
    resetObjectCounter()
    const [page] = categoryFluencyTemplate.generate(base, CTX())
    const banner = page!.objects.find(
      (o) => o.studioRole === 'prompt' && String(o.text) === 'ANIMALS',
    )
    expect(banner).toBeTruthy()
    expect(banner?.originX).toBe('center')
    expect(banner?.textAlign).toBe('center')
    expect(String(banner?.text)).not.toMatch(/Category:/i)
  })

  it('keeps a medium category banner on one estimated line', () => {
    resetObjectCounter()
    const remote: CategoryFluencyResponse = {
      category: 'Things that fly',
      examples: REMOTE.examples,
    }
    const [page] = categoryFluencyTemplate.generate(base, CTX(remote))
    const banner = page!.objects.find((o) => o.studioRole === 'prompt')
    expect(banner?.text).toBe('THINGS THAT FLY')
    // Width must be wide enough that Fabric will not wrap before the safe edge.
    expect(banner?.width ?? 0).toBeGreaterThan(
      String(banner?.text).length * Number(banner?.fontSize) * 0.55,
    )
  })

  it('auto-adds a solution page (no form toggles)', () => {
    expect(categoryFluencyTemplate.producesAnswerKey).toBe(true)
    expect(categoryFluencyTemplate.configSchema.every(
      (f) => f.key !== 'includeAnswerKey' && f.key !== 'answerKeyForAll',
    )).toBe(true)
  })

  it('matches sample-answer count to answer lines', () => {
    for (const lineCount of [8, 10, 15, 28, 29, 30]) {
      resetObjectCounter()
      const extras = Array.from({ length: 40 }, (_, i) => `extra-${i}`)
      const remote: CategoryFluencyResponse = {
        category: 'Animals',
        examples: [...REMOTE_EXAMPLES, ...extras],
      }
      const [page] = categoryFluencyTemplate.generate(
        { ...base, lineCount },
        CTX(remote),
      )
      const grid = page!.objects.find(
        (o) => o.type === 'group' && o.studioRole === 'answer',
      )
      expect(grid?.objects?.length).toBe(lineCount)
    }
  })

  it('hides sample answers on the puzzle page and reveals them on the key', () => {
    resetObjectCounter()
    const [page] = categoryFluencyTemplate.generate(base, CTX())
    // Intro textbox + one grouped word grid.
    const hidden = harvestAnswers(page!.objects)
    expect(hidden.length).toBe(2)
    expect(hidden.every((o) => o.visible === false)).toBe(true)
    const grid = hidden.find((o) => o.type === 'group')
    // Default lineCount is 15; remote may be longer — page must show exactly lineCount.
    expect(grid?.objects?.length).toBe(Number(base.lineCount))

    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has('category-fluency')).toBe(true)
    const keyObjects = buildAnswerPage(page!.objects, STUDIO_ANSWER_INK_MONO)
    const answers = harvestAnswers(keyObjects)
    expect(answers.length).toBe(2)
    expect(answers.every((o) => o.visible !== false)).toBe(true)

    const intro = answers.find((o) => o.type === 'textbox')
    const keyGrid = answers.find((o) => o.type === 'group')
    expect(String(intro?.text ?? '').replace(/\u00a0/g, ' ')).toMatch(
      /Sample answers/,
    )
    expect(intro?.fill).toBe(STUDIO_ANSWER_INK_MONO)
    expect(intro?.fill).not.toBe(STUDIO_ANSWER_INK)
    const labels = (keyGrid?.objects ?? []).map((o) =>
      String(o.text ?? '').replace(/\u00a0/g, ' '),
    )
    expect(labels).toContain('1. dog')
    expect(labels.length).toBe(Number(base.lineCount))
    expect(labels.every((t) => !t.includes('\n'))).toBe(true)
    // NBSP keeps multi-word answers on one Fabric line.
    expect(
      (keyGrid?.objects ?? []).every((o) =>
        String(o.text ?? '').includes('\u00a0') || !String(o.text ?? '').includes(' '),
      ),
    ).toBe(true)

    const keyTexts = keyObjects.map((o) =>
      String(o.text ?? '').replace(/\u00a0/g, ' '),
    )
    expect(keyTexts.some((t) => t === 'ANIMALS')).toBe(false)
    expect(keyTexts.some((t) => /^Time:/i.test(t))).toBe(false)
  })

  it('centers the grouped sample-answer grid in the body', () => {
    resetObjectCounter()
    const remote: CategoryFluencyResponse = {
      category: 'Garden tools',
      examples: [
        'trowel',
        'hedge trimmer',
        'lawn mower',
        'rake',
        'hoe',
        'spade',
        'pruning shears',
        'wheelbarrow',
        'garden hose',
        'pressure washer',
        'potting bench',
        'watering can',
      ],
    }
    const ctx = CTX(remote)
    const [page] = categoryFluencyTemplate.generate(base, ctx)
    const grid = page!.objects.find(
      (o) => o.type === 'group' && o.studioRole === 'answer',
    )
    expect(grid).toBeTruthy()
    const body = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
    const bodyMid = body.left + body.width / 2
    const gridMid = Number(grid!.left) + Number(grid!.width) / 2
    expect(Math.abs(gridMid - bodyMid)).toBeLessThan(2)
  })

  it('keeps max lineCount inside the safe margin', () => {
    resetObjectCounter()
    const remote: CategoryFluencyResponse = {
      category: 'Animals',
      examples: Array.from({ length: 30 }, (_, i) => `animal-${i + 1}`),
    }
    const ctx: StudioGenerateContext = { ...STUDIO_TEST_CTX, remoteData: remote }
    const pages = categoryFluencyTemplate.generate(
      { ...base, lineCount: 30 },
      ctx,
    )
    for (const page of pages) {
      assertObjectsInSafeMargin(page.objects, ctx)
    }
    const grid = pages[0]!.objects.find(
      (o) => o.type === 'group' && o.studioRole === 'answer',
    )
    expect(grid?.objects?.length).toBe(30)
  })

  it('never crashes when remoteData is missing', () => {
    resetObjectCounter()
    expect(() =>
      categoryFluencyTemplate.generate(base, { ...CTX(), remoteData: undefined }),
    ).not.toThrow()
  })

  it('fills lineCount=30 sample answers when the API list is short', () => {
    resetObjectCounter()
    const remote: CategoryFluencyResponse = {
      category: 'Animals',
      examples: REMOTE_EXAMPLES.slice(0, 8),
    }
    const [page] = categoryFluencyTemplate.generate(
      { ...base, lineCount: 30 },
      CTX(remote),
    )
    const grid = page!.objects.find(
      (o) => o.type === 'group' && o.studioRole === 'answer',
    )
    expect(grid?.objects?.length).toBe(30)
  })
})
