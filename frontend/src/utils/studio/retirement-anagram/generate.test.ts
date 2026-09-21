import { describe, it, expect } from 'vitest'
import { retirementAnagramTemplate } from './generate'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { resetObjectCounter } from '../studio-fabric-builders'
import {
  assertGeneratorEntropy,
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
import { sortLetters } from '../anagram-sheet/scramble'
import {
  LENGTH_RANGE,
  RETIREMENT_ANAGRAM_DEFAULT_TITLE,
  RETIREMENT_ANAGRAM_INSTRUCTION,
  clampItemCount,
  defaultTitleFor,
  isValidWordLength,
  parseDifficulty,
  selectAiWords,
  topicLabel,
} from './content'
import { candidateRequestCount } from './prefetch'
import { validateRetirementAnagramConfig } from './config'

function flattenObjects(objects: StudioFabricObject[]): StudioFabricObject[] {
  return objects.flatMap((obj) => [obj, ...flattenObjects(obj.objects ?? [])])
}

const AI_WORDS = [
  'TRAVEL',
  'GARDEN',
  'PENSION',
  'LEISURE',
  'CRUISE',
  'HOBBY',
  'FAMILY',
  'RELAX',
  'MEMORY',
  'BUCKET',
  'WELLNESS',
  'VOLUNTEER',
  'SUNSET',
  'PICNIC',
  'RETIRE',
  'SAILING',
  'READING',
  'COOKING',
  'WALKING',
  'FRIENDS',
  'NATURE',
  'COMFORT',
  'FREEDOM',
  'JOURNEY',
  'WEEKEND',
]

const remote = { items: AI_WORDS }

const CTX = (): StudioGenerateContext => ({
  ...STUDIO_TEST_CTX,
  remoteData: remote,
})

const base: StudioConfig = {
  ...buildDefaultConfig(retirementAnagramTemplate),
  seed: 42,
  fontFamily: 'PT Serif',
  itemCount: 12,
  difficulty: 'medium',
  topic: 'retirement-life',
}

runGeneratorContractTests(retirementAnagramTemplate, {
  contextOverrides: { remoteData: remote },
})
assertGeneratorEntropy(retirementAnagramTemplate, {
  contextOverrides: { remoteData: remote },
})

describe('retirement-anagram', () => {
  it('is registered as monochrome answer ink', () => {
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has('retirement-anagram')).toBe(true)
  })

  it('emits exact itemCount hidden answers', () => {
    resetObjectCounter()
    const [page] = retirementAnagramTemplate.generate(base, CTX())
    const answers = harvestAnswers(page!.objects)
    expect(answers.length).toBe(12)
    expect(retirementAnagramTemplate.producesAnswerKey).toBe(true)
  })

  it('scrambles are permutations and never equal the answer', () => {
    resetObjectCounter()
    const [page] = retirementAnagramTemplate.generate(base, CTX())
    const nested = flattenObjects(page!.objects)
    const prompts = nested.filter((o) => o.studioRole === 'prompt')
    const answers = harvestAnswers(page!.objects)
    expect(prompts.length).toBe(answers.length)
    const scrambleSet = new Set<string>()
    const answerSet = new Set<string>()
    for (let i = 0; i < prompts.length; i++) {
      const scrambled = String(prompts[i]!.text ?? '').replace(/\s+/g, '')
      const answer = String(answers[i]!.text ?? '').trim()
      expect(scrambled).not.toBe(answer)
      expect(sortLetters(scrambled)).toBe(sortLetters(answer))
      expect(isValidWordLength(answer, 'medium')).toBe(true)
      scrambleSet.add(scrambled)
      answerSet.add(answer)
    }
    expect(scrambleSet.size).toBe(prompts.length)
    expect(answerSet.size).toBe(answers.length)
  })

  it('fits the max 20-item layout inside the safe area', () => {
    resetObjectCounter()
    const config = { ...base, itemCount: 20 }
    const ctx = CTX()
    const [page] = retirementAnagramTemplate.generate(config, ctx)
    expect(harvestAnswers(page!.objects).length).toBe(20)
    assertObjectsInSafeMargin(page!.objects, ctx)

    const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
    const tag: StudioTag = {
      templateKey: 'retirement-anagram',
      instanceId: ctx.instanceId,
      pageRole: 'single',
    }
    const header = drawHeader(content, config, tag, RETIREMENT_ANAGRAM_INSTRUCTION)
    expect(header.body.height).toBeGreaterThan(0)
  })

  it('puzzle and answer key share the same answers in order', () => {
    resetObjectCounter()
    const [page] = retirementAnagramTemplate.generate(base, CTX())
    const puzzleAnswers = harvestAnswers(page!.objects).map((o) =>
      String(o.text ?? '').trim(),
    )
    const keyAnswers = harvestAnswers(page!.answerSourceObjects ?? []).map((o) =>
      String(o.text ?? '').trim(),
    )
    expect(keyAnswers).toEqual(puzzleAnswers)

    const answerPage = buildAnswerPage(
      page!.answerSourceObjects ?? page!.objects,
      STUDIO_ANSWER_INK_MONO,
    )
    expect(
      harvestAnswers(answerPage).every((o) => o.fill === STUDIO_ANSWER_INK_MONO),
    ).toBe(true)
  })

  it('same seed yields the same puzzle', () => {
    resetObjectCounter()
    const a = retirementAnagramTemplate.generate(base, CTX())
    resetObjectCounter()
    const b = retirementAnagramTemplate.generate(base, CTX())
    expect(harvestAnswers(a[0]!.objects).map((o) => o.text)).toEqual(
      harvestAnswers(b[0]!.objects).map((o) => o.text),
    )
  })

  it('requires custom topic text when Custom Topic is selected', () => {
    expect(
      validateRetirementAnagramConfig({
        ...base,
        topic: 'custom',
        customTopic: '',
      }),
    ).toEqual({
      field: 'customTopic',
      message: 'Enter a custom topic, or pick a preset topic.',
    })
  })

  it('defaults title from topic', () => {
    expect(defaultTitleFor({ ...base, title: '', topic: 'retirement-life' })).toBe(
      RETIREMENT_ANAGRAM_DEFAULT_TITLE,
    )
    expect(defaultTitleFor({ ...base, title: '', topic: 'gardening' })).toBe(
      'Unscramble: Gardening',
    )
    expect(topicLabel({ ...base, topic: 'travel-vacations' })).toBe('Travel & Vacations')
  })

  it('clamps itemCount and asks for itemCount+5 candidates', () => {
    expect(clampItemCount(3)).toBe(8)
    expect(clampItemCount(99)).toBe(20)
    expect(candidateRequestCount(12)).toBe(17)
  })

  it('selectAiWords filters length and duplicates', () => {
    const words = selectAiWords(
      ['TRAVEL', 'travel', 'AB', 'GARDEN', 'PENSION', 'XY', 'LEISURE', 'CRUISE', 'HOBBY', 'FAMILY', 'RELAX', 'MEMORY', 'PICNIC'],
      { count: 8, difficulty: 'medium' },
    )
    expect(words.length).toBe(8)
    expect(new Set(words).size).toBe(8)
    expect(words.every((w) => isValidWordLength(w, 'medium'))).toBe(true)
  })

  it('difficulty ranges match the spec', () => {
    expect(LENGTH_RANGE[parseDifficulty('easy')]).toEqual({ min: 4, max: 6 })
    expect(LENGTH_RANGE.medium).toEqual({ min: 5, max: 8 })
    expect(LENGTH_RANGE.hard).toEqual({ min: 7, max: 11 })
  })
})
