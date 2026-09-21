import { describe, it, expect } from 'vitest'
import { anagramSheetTemplate } from './generate'
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
import { sortLetters } from './scramble'
import { resolveAnagramFallback } from './fallback'

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
  ...buildDefaultConfig(anagramSheetTemplate),
  seed: 42,
  fontFamily: 'Inter',
}

runGeneratorContractTests(anagramSheetTemplate)

describe('anagram-sheet', () => {
  it('is registered as monochrome answer ink', () => {
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has('anagram-sheet')).toBe(true)
  })

  it('emits one hidden answer per item', () => {
    resetObjectCounter()
    const [page] = anagramSheetTemplate.generate(base, CTX())
    const answers = harvestAnswers(page!.objects)
    expect(answers.length).toBe(Number(base.itemCount ?? 12))
    expect(anagramSheetTemplate.producesAnswerKey).toBe(true)
  })

  it('scrambles stay one line and are permutations of the answer', () => {
    resetObjectCounter()
    const [page] = anagramSheetTemplate.generate(base, CTX())
    const nested = flattenObjects(page!.objects)
    const prompts = nested.filter((o) => o.studioRole === 'prompt')
    const answers = harvestAnswers(page!.objects)
    expect(prompts.length).toBe(answers.length)
    for (let i = 0; i < prompts.length; i++) {
      const text = String(prompts[i]!.text ?? '')
      expect(text.includes('\n')).toBe(false)
      expect(text.includes(' ')).toBe(false)
      const scrambled = text.replace(/\s+/g, '')
      const answer = String(answers[i]!.text ?? '').trim()
      expect(scrambled).not.toBe(answer)
      expect(sortLetters(scrambled)).toBe(sortLetters(answer))
      expect(answer).not.toContain('also:')
    }
  })

  it('never prints definition hints', () => {
    resetObjectCounter()
    const [page] = anagramSheetTemplate.generate(
      { ...base, source: 'theme', itemCount: 6 },
      {
        ...CTX(),
        remoteData: {
          items: [
            { word: 'TIGER', hint: 'a big cat' },
            { word: 'OCEAN', hint: 'salt water' },
            { word: 'RIVER', hint: 'fresh water' },
            { word: 'APPLE', hint: 'a fruit' },
            { word: 'CHAIR', hint: 'you sit on it' },
            { word: 'STONE', hint: 'hard rock' },
          ],
        },
      },
    )
    const hintDecor = flattenObjects(page!.objects).filter(
      (o) =>
        o.studioRole === 'decoration' &&
        typeof o.text === 'string' &&
        o.text.startsWith('('),
    )
    expect(hintDecor.length).toBe(0)
  })

  it('custom words all appear as answers', () => {
    const words = ['TIGER', 'EAGLE', 'LION', 'BEAR', 'WOLF', 'HORSE']
    resetObjectCounter()
    const [page] = anagramSheetTemplate.generate(
      { ...base, source: 'custom', words },
      CTX(),
    )
    const answers = harvestAnswers(page!.objects).map((o) => String(o.text ?? '').trim())
    expect(answers).toEqual(words)
    expect(answers.every((a) => !a.includes('also:'))).toBe(true)
  })

  it('requires custom theme text when Custom theme is on', () => {
    expect(
      anagramSheetTemplate.validateConfig?.({
        ...base,
        source: 'theme',
        customTheme: true,
        customThemeText: '   ',
      }),
    ).toMatchObject({ field: 'customThemeText' })
  })

  it('exposes custom theme fields for A theme', () => {
    const keys = anagramSheetTemplate.configSchema.map((f) => f.key)
    expect(keys).toContain('customTheme')
    expect(keys).toContain('customThemeText')
    const toggle = anagramSheetTemplate.configSchema.find((f) => f.key === 'customTheme')
    expect(toggle?.visibleWhen?.({ ...base, source: 'theme' })).toBe(true)
    expect(toggle?.visibleWhen?.({ ...base, source: 'custom' })).toBe(false)
  })

  it('rejects ambiguous AI words and never prints also:', () => {
    resetObjectCounter()
    const [page] = anagramSheetTemplate.generate(
      { ...base, source: 'theme', itemCount: 6 },
      {
        ...CTX(),
        remoteData: {
          items: [
            { word: 'LEMON', hint: 'a sour citrus fruit' },
            { word: 'MELON', hint: 'a sweet fruit' },
            { word: 'TIGER', hint: 'a big cat' },
            { word: 'OCEAN', hint: 'salt water' },
            { word: 'RIVER', hint: 'fresh water' },
            { word: 'APPLE', hint: 'a fruit' },
            { word: 'CHAIR', hint: 'you sit on it' },
            { word: 'STONE', hint: 'hard rock' },
          ],
        },
      },
    )
    const answers = harvestAnswers(page!.objects).map((o) => String(o.text ?? '').trim())
    expect(answers).not.toContain('LEMON')
    expect(answers).not.toContain('MELON')
    expect(answers.every((a) => !a.includes('also:'))).toBe(true)
    expect(answers.length).toBe(6)
  })

  it('keeps max itemCount inside the safe margin', () => {
    resetObjectCounter()
    const pages = anagramSheetTemplate.generate(
      { ...base, itemCount: 24 },
      STUDIO_TEST_CTX,
    )
    for (const page of pages) {
      assertObjectsInSafeMargin(page.objects, STUDIO_TEST_CTX)
    }
  })

  it('omits write-in lines on the answer-key page', () => {
    resetObjectCounter()
    const [page] = anagramSheetTemplate.generate(base, CTX())
    const itemCount = Number(base.itemCount ?? 12)
    const puzzleLines = flattenObjects(page!.objects).filter(
      (o) => o.type === 'line' && o.studioRole === 'structure',
    )
    expect(puzzleLines.length).toBe(itemCount)
    expect(page!.answerSourceObjects?.length).toBeGreaterThan(0)
    const key = flattenObjects(
      buildAnswerPage(page!.answerSourceObjects ?? page!.objects, '#000000'),
    )
    expect(key.filter((o) => o.type === 'line' && o.studioRole === 'structure')).toHaveLength(0)
    expect(key.filter((o) => o.studioRole === 'answer')).toHaveLength(itemCount)
  })

  it('aligns write-in lines to the scramble letter baseline', () => {
    resetObjectCounter()
    const [page] = anagramSheetTemplate.generate(base, CTX())
    const nested = flattenObjects(page!.objects)
    const prompts = nested.filter((o) => o.studioRole === 'prompt')
    const lines = nested.filter((o) => o.type === 'line' && o.studioRole === 'structure')
    expect(prompts.length).toBe(lines.length)
    expect(prompts.length).toBeGreaterThan(0)
    for (let i = 0; i < prompts.length; i++) {
      const prompt = prompts[i]!
      const line = lines[i]!
      const baseline = Math.round(Number(prompt.top) + Number(prompt.fontSize) / 2)
      expect(line.y1).toBe(baseline)
      expect(line.y2).toBe(baseline)
    }
  })

  it('uses Answer (not Your answer) on the solution grid header', () => {
    resetObjectCounter()
    const [page] = anagramSheetTemplate.generate(base, CTX())
    const puzzleNested = flattenObjects(page!.objects)
    expect(puzzleNested.some((o) => o.text === 'Your answer')).toBe(true)
    expect(puzzleNested.some((o) => o.text === 'Answer')).toBe(false)

    const keyNested = flattenObjects(
      buildAnswerPage(page!.answerSourceObjects ?? page!.objects, STUDIO_ANSWER_INK_MONO),
    )
    expect(keyNested.some((o) => o.text === 'Answer')).toBe(true)
    expect(keyNested.some((o) => o.text === 'Your answer')).toBe(false)
  })

  it('centers the solution grid in the answer-key body', () => {
    resetObjectCounter()
    const ctx = CTX()
    const config = { ...base, showTitle: true, title: 'Unscramble: Animals' }
    const [page] = anagramSheetTemplate.generate(config, ctx)
    expect(page!.answerSourceObjects?.length).toBeGreaterThan(0)
    const keyObjects = buildAnswerPage(
      page!.answerSourceObjects ?? page!.objects,
      STUDIO_ANSWER_INK_MONO,
    )
    const grid = keyObjects.find(
      (o) => o.type === 'group' && (o.objects ?? []).some((c) => c.studioRole === 'answer'),
    )!
    const tag: StudioTag = {
      templateKey: 'anagram-sheet',
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
})

describe('anagram-sheet fallback', () => {
  it('fills itemCount even when the short bundled list misses the difficulty band', () => {
    const easy = resolveAnagramFallback(24, 'easy', 3)
    const hard = resolveAnagramFallback(24, 'hard', 3)
    expect(easy.items.length).toBe(24)
    expect(hard.items.length).toBe(24)
  })
})
