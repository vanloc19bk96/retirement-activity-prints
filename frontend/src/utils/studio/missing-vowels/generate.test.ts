import { describe, it, expect } from 'vitest'
import { missingVowelsTemplate } from './generate'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { resetObjectCounter } from '../studio-fabric-builders'
import {
  assertObjectsInSafeMargin,
  runGeneratorContractTests,
  STUDIO_TEST_CTX,
} from '../studio-generator-test'
import {
  STUDIO_ANSWER_INK_MONO,
  STUDIO_ANSWER_INK_MONO_TEMPLATES,
  STUDIO_BODY_SIZE,
  STUDIO_CONTENT_SAFE_INSET_X,
} from '@/constants/studio.constants'
import { buildAnswerPage, harvestAnswers } from '../studio-answer-key'
import { contentBox, insetHorizontal, drawHeader } from '../studio-layout'
import type { StudioTag } from '../studio-fabric-builders'
import type {
  StudioConfig,
  StudioFabricObject,
  StudioGenerateContext,
} from '@/types/studio-template.types'
import { promptWithBlanks } from './disemvowel'
import { resolveMissingVowelsFallback } from './fallback'

function flattenObjects(objects: StudioFabricObject[]): StudioFabricObject[] {
  return objects.flatMap((obj) => [obj, ...flattenObjects(obj.objects ?? [])])
}

const CTX = (): StudioGenerateContext => ({
  pageWidth: 2550,
  pageHeight: 3300,
  margin: { top: 150, right: 150, bottom: 150, left: 225 },
  seed: 42,
  instanceId: 'test-run',
})

const base: StudioConfig = {
  ...buildDefaultConfig(missingVowelsTemplate),
  seed: 42,
  fontFamily: 'Inter',
}

function withRemoteWords(words: string[]): StudioGenerateContext {
  return { ...CTX(), remoteData: { items: words } }
}

runGeneratorContractTests(missingVowelsTemplate)

describe('missing-vowels', () => {
  it('is registered as monochrome answer ink', () => {
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has('missing-vowels')).toBe(true)
  })

  it('groups words into one stroked grid', () => {
    resetObjectCounter()
    const [page] = missingVowelsTemplate.generate(base, CTX())
    const groups = page!.objects.filter((o) => o.type === 'group')
    expect(groups.length).toBe(1)
    const nested = flattenObjects(page!.objects)
    expect(nested.some((o) => o.text === 'Your answer')).toBe(false)
    expect(nested.some((o) => o.text === 'Word')).toBe(false)
    expect(nested.filter((o) => o.type === 'line')).toHaveLength(0)
    expect(nested.filter((o) => o.type === 'rect' && o.studioRole === 'structure').length).toBeGreaterThan(
      0,
    )
  })

  it('lays words out in two columns', () => {
    resetObjectCounter()
    const [page] = missingVowelsTemplate.generate({ ...base, itemCount: 12 }, CTX())
    const prompts = flattenObjects(page!.objects).filter((o) => o.studioRole === 'prompt')
    expect(prompts.length).toBe(12)
    const lefts = prompts.map((o) => Number(o.left ?? 0))
    const mid = (Math.min(...lefts) + Math.max(...lefts)) / 2
    const leftCol = lefts.filter((x) => x < mid).length
    const rightCol = lefts.filter((x) => x >= mid).length
    expect(leftCol).toBe(6)
    expect(rightCol).toBe(6)
  })

  it('aligns index numbers on a shared right-aligned gutter', () => {
    resetObjectCounter()
    const words = [
      'FINGER',
      'SHOULDER',
      'HEART',
      'STOMACH',
      'ANKLE',
      'ELBOW',
      'MUSCLE',
      'TONGUE',
      'CHEST',
      'PALM',
    ]
    const [page] = missingVowelsTemplate.generate(
      { ...base, itemCount: words.length },
      withRemoteWords(words),
    )
    const indexes = flattenObjects(page!.objects).filter(
      (o) => o.studioRole === 'decoration' && /^\d+\.$/.test(String(o.text ?? '')),
    )
    expect(indexes).toHaveLength(10)
    expect(indexes.every((o) => o.textAlign === 'right')).toBe(true)
    expect(new Set(indexes.map((o) => Number(o.width ?? 0))).size).toBe(1)
    const lefts = indexes.map((o) => Number(o.left ?? 0))
    const mid = (Math.min(...lefts) + Math.max(...lefts)) / 2
    const leftCol = indexes.filter((o) => Number(o.left ?? 0) < mid)
    const rightCol = indexes.filter((o) => Number(o.left ?? 0) >= mid)
    expect(new Set(leftCol.map((o) => Number(o.left ?? 0))).size).toBe(1)
    expect(new Set(rightCol.map((o) => Number(o.left ?? 0))).size).toBe(1)
  })

  it('uses one shared prompt font size for every row', () => {
    resetObjectCounter()
    const words = ['CAT', 'ELEPHANT', 'DOG', 'HIPPOPOTAMUS', 'FOX', 'CROCODILE']
    const [page] = missingVowelsTemplate.generate(
      { ...base, itemCount: words.length },
      withRemoteWords(words),
    )
    const sizes = flattenObjects(page!.objects)
      .filter((o) => o.studioRole === 'prompt')
      .map((o) => Number(o.fontSize ?? 0))
    expect(sizes.length).toBe(6)
    expect(new Set(sizes).size).toBe(1)
  })

  it('emits one hidden answer per item', () => {
    resetObjectCounter()
    const [page] = missingVowelsTemplate.generate(base, CTX())
    const answers = harvestAnswers(page!.objects)
    expect(answers.length).toBe(Number(base.itemCount ?? 12))
    expect(missingVowelsTemplate.producesAnswerKey).toBe(true)
  })

  it('prompt has __ blanks in vowel slots', () => {
    resetObjectCounter()
    const [page] = missingVowelsTemplate.generate(base, CTX())
    const nested = flattenObjects(page!.objects)
    const prompts = nested.filter((o) => o.studioRole === 'prompt')
    const answers = harvestAnswers(page!.objects)
    expect(prompts.length).toBe(answers.length)
    for (let i = 0; i < prompts.length; i++) {
      const prompt = String(prompts[i]!.text ?? '').replace(/\u00A0/g, ' ')
      const answer = String(answers[i]!.text ?? '').replace(/\u00A0/g, ' ').trim()
      expect(prompt).toBe(promptWithBlanks(answer, false))
      if (/[AEIOU]/.test(answer)) {
        expect(prompt.includes('__')).toBe(true)
      }
    }
  })

  it('does not expose Show letter counts', () => {
    const keys = missingVowelsTemplate.configSchema.map((f) => f.key)
    expect(keys).not.toContain('showLengthHint')
  })

  it('AI remote items are used when provided', () => {
    resetObjectCounter()
    const remote = ['TIGER', 'OCEAN', 'APPLE', 'CHAIR', 'STONE', 'BRIDGE']
    const [page] = missingVowelsTemplate.generate(
      { ...base, itemCount: 6 },
      withRemoteWords(remote),
    )
    const answers = harvestAnswers(page!.objects).map((o) =>
      String(o.text ?? '').replace(/\u00A0/g, ' ').trim(),
    )
    expect(answers).toEqual(remote)
  })

  it('AI mode rejects phrase lines from remote data', () => {
    resetObjectCounter()
    const [page] = missingVowelsTemplate.generate(
      { ...base, itemCount: 6 },
      {
        ...CTX(),
        remoteData: {
          items: [
            'TIGER',
            'BETTER LATE THAN NEVER',
            'OCEAN',
            'PRACTICE MAKES PERFECT',
            'APPLE',
            'CHAIR',
            'STONE',
            'BRIDGE',
          ],
        },
      },
    )
    const answers = harvestAnswers(page!.objects).map((o) =>
      String(o.text ?? '').replace(/\u00A0/g, ' ').trim(),
    )
    expect(answers).toEqual(['TIGER', 'OCEAN', 'APPLE', 'CHAIR', 'STONE', 'BRIDGE'])
    expect(answers.every((a) => !a.includes(' '))).toBe(true)
  })

  it('hard mode blanks Y as a vowel', () => {
    resetObjectCounter()
    const words = ['RHYTHM', 'GYM', 'MYTH', 'LYNX', 'NYMPH']
    const [page] = missingVowelsTemplate.generate(
      { ...base, difficulty: 'hard', itemCount: words.length },
      withRemoteWords(words),
    )
    const prompts = flattenObjects(page!.objects)
      .filter((o) => o.studioRole === 'prompt')
      .map((o) => String(o.text ?? '').replace(/\u00A0/g, ' '))
    expect(prompts).toContain('R H __ T H M')
    expect(prompts).toContain('G __ M')
  })

  it('sizes each prompt textbox to its glyph run (not the column width)', () => {
    resetObjectCounter()
    const words = ['CAT', 'ELEPHANT', 'DOG', 'FOX', 'WOLF', 'BEAR']
    const [page] = missingVowelsTemplate.generate(
      { ...base, itemCount: words.length },
      withRemoteWords(words),
    )
    const prompts = flattenObjects(page!.objects).filter((o) => o.studioRole === 'prompt')
    expect(prompts.length).toBe(6)
    for (const p of prompts) {
      const text = String(p.text ?? '')
      const fontSize = Number(p.fontSize ?? 14)
      const width = Number(p.width ?? 0)
      const spaces = (text.match(/[ \u00A0]/g) ?? []).length
      const units = (text.length - spaces) * 0.7 + spaces * 0.32 + 0.35
      expect(width).toBe(Math.ceil(units * fontSize))
      expect(width).toBeLessThan(text.length * fontSize * 0.9)
    }
  })

  it('requires custom theme text when Custom theme is on', () => {
    expect(
      missingVowelsTemplate.validateConfig?.({
        ...base,
        customTheme: true,
        customThemeText: '   ',
      }),
    ).toMatchObject({ field: 'customThemeText' })
  })

  it('uses a smaller shared font on the solution page', () => {
    resetObjectCounter()
    const [page] = missingVowelsTemplate.generate(base, CTX())
    const keyObjects = buildAnswerPage(
      page!.answerSourceObjects ?? page!.objects,
      STUDIO_ANSWER_INK_MONO,
    )
    const sizes = flattenObjects(keyObjects)
      .filter((o) => o.studioRole === 'answer')
      .map((o) => Number(o.fontSize ?? 0))
    expect(sizes.length).toBeGreaterThan(0)
    expect(new Set(sizes).size).toBe(1)
    expect(sizes[0]).toBeLessThanOrEqual(STUDIO_BODY_SIZE * 0.78)
  })

  it('answer key shows full words only (no overlapping prompts)', () => {
    resetObjectCounter()
    const [page] = missingVowelsTemplate.generate(base, CTX())
    expect(page!.answerSourceObjects?.length).toBeGreaterThan(0)
    const keyObjects = buildAnswerPage(
      page!.answerSourceObjects ?? page!.objects,
      STUDIO_ANSWER_INK_MONO,
    )
    const nested = flattenObjects(keyObjects)
    expect(nested.filter((o) => o.studioRole === 'prompt')).toHaveLength(0)
    const answers = nested.filter((o) => o.studioRole === 'answer')
    expect(answers.length).toBe(Number(base.itemCount ?? 12))
    expect(answers.every((o) => o.visible !== false)).toBe(true)
    expect(answers.every((o) => o.fill === STUDIO_ANSWER_INK_MONO)).toBe(true)
  })

  it('centers the solution grid in the answer-key body', () => {
    resetObjectCounter()
    const ctx = CTX()
    const config = { ...base, showTitle: true, title: 'Missing Vowels: Animals' }
    const [page] = missingVowelsTemplate.generate(config, ctx)
    expect(page!.answerSourceObjects?.length).toBeGreaterThan(0)
    const keyObjects = buildAnswerPage(
      page!.answerSourceObjects ?? page!.objects,
      STUDIO_ANSWER_INK_MONO,
    )
    const grid = keyObjects.find(
      (o) => o.type === 'group' && (o.objects ?? []).some((c) => c.studioRole === 'answer'),
    )!
    const tag: StudioTag = {
      templateKey: 'missing-vowels',
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

  it('keeps max itemCount inside the safe margin', () => {
    resetObjectCounter()
    const pages = missingVowelsTemplate.generate({ ...base, itemCount: 24 }, STUDIO_TEST_CTX)
    for (const page of pages) {
      assertObjectsInSafeMargin(page.objects, STUDIO_TEST_CTX)
      if (page.answerSourceObjects) {
        assertObjectsInSafeMargin(page.answerSourceObjects, STUDIO_TEST_CTX)
      }
    }
  })
})

describe('missing-vowels fallback', () => {
  it('fills itemCount for hard words from the theme catalog', () => {
    const data = resolveMissingVowelsFallback(24, 'words', 'hard', 4)
    expect(data.items.length).toBe(24)
    expect(data.items.every((word) => !word.includes(' '))).toBe(true)
  })
})
