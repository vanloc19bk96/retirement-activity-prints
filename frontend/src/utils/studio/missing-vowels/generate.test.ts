import { describe, it, expect } from 'vitest'
import { missingVowelsTemplate } from './generate'
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
import { maskVowels } from './mask'
import {
  LETTER_RANGE,
  MISSING_VOWELS_DEFAULT_TITLE,
  MISSING_VOWELS_INSTRUCTION,
  clampItemCount,
  defaultTitleFor,
  isNearDuplicate,
  parseDifficulty,
  selectAiItems,
} from './content'
import { candidateRequestCount } from './prefetch'
import { validateMissingVowelsConfig } from './config'

function flattenObjects(objects: StudioFabricObject[]): StudioFabricObject[] {
  return objects.flatMap((obj) => [obj, ...flattenObjects(obj.objects ?? [])])
}

const AI_ITEMS = [
  'TRAVEL',
  'GARDEN',
  'PENSION',
  'LEISURE',
  'CRUISE',
  'FAMILY',
  'MEMORY',
  'HOBBY',
  'RELAX',
  'PICNIC',
  'SUNSET',
  'FRIENDS',
  'NATURE',
  'READING',
  'SAILING',
  'FREEDOM',
  'JOURNEY',
  'WEEKEND',
  'BUCKET',
  'SOCIAL',
  'OUTING',
  'COMFORT',
]

const remote = { items: AI_ITEMS }

const CTX = (): StudioGenerateContext => ({
  ...STUDIO_TEST_CTX,
  remoteData: remote,
})

const base: StudioConfig = {
  ...buildDefaultConfig(missingVowelsTemplate),
  seed: 42,
  fontFamily: 'PT Serif',
  itemCount: 12,
  difficulty: 'classic',
}

runGeneratorContractTests(missingVowelsTemplate, {
  contextOverrides: { remoteData: remote },
})
assertGeneratorEntropy(missingVowelsTemplate, {
  contextOverrides: { remoteData: remote },
})

describe('missing-vowels', () => {
  it('is registered as monochrome answer ink', () => {
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has('missing-vowels')).toBe(true)
  })

  it('emits exact itemCount hidden answers', () => {
    resetObjectCounter()
    const [page] = missingVowelsTemplate.generate(base, CTX())
    const answers = harvestAnswers(page!.objects)
    expect(answers.length).toBe(12)
    expect(missingVowelsTemplate.producesAnswerKey).toBe(true)
  })

  it('masks every A/E/I/O/U and keeps Y visible', () => {
    resetObjectCounter()
    const words = ['HAPPY', 'CRUISE', 'GARDEN', 'FAMILY', 'PICNIC', 'SUNSET', 'TRAVEL', 'MEMORY']
    const [page] = missingVowelsTemplate.generate(
      { ...base, itemCount: words.length },
      { ...CTX(), remoteData: { items: words } },
    )
    const nested = flattenObjects(page!.objects)
    const prompts = nested.filter((o) => o.studioRole === 'prompt')
    const answers = harvestAnswers(page!.objects)
    expect(prompts.length).toBe(answers.length)
    for (let i = 0; i < prompts.length; i++) {
      const prompt = String(prompts[i]!.text ?? '').replace(/\u00A0/g, ' ')
      const answer = String(answers[i]!.text ?? '').replace(/\u00A0/g, ' ').trim()
      expect(prompt).toBe(maskVowels(answer))
      expect(prompt.includes('Y') || !answer.includes('Y')).toBe(true)
    }
    const happy = prompts.map((o) => String(o.text ?? '').replace(/\u00A0/g, ' '))
    expect(happy).toContain('H_PPY')
  })

  it('allows short two-word phrases', () => {
    resetObjectCounter()
    const items = [
      'ROAD TRIP',
      'FREE TIME',
      'TEA TIME',
      'CRUISE',
      'GARDEN',
      'FAMILY',
      'PICNIC',
      'SUNSET',
    ]
    const [page] = missingVowelsTemplate.generate(
      { ...base, itemCount: 8 },
      { ...CTX(), remoteData: { items } },
    )
    const answers = harvestAnswers(page!.objects).map((o) =>
      String(o.text ?? '').replace(/\u00A0/g, ' ').trim(),
    )
    expect(answers).toEqual(expect.arrayContaining(['ROAD TRIP', 'FREE TIME']))
    const prompts = flattenObjects(page!.objects)
      .filter((o) => o.studioRole === 'prompt')
      .map((o) => String(o.text ?? '').replace(/\u00A0/g, ' '))
    expect(prompts).toContain('R__D TR_P')
  })

  it('drops duplicate masked forms and near-duplicate stems', () => {
    const selected = selectAiItems(
      [
        'BOAT',
        'BEAT',
        'BAIT',
        'GARDEN',
        'GARDENER',
        'CRUISE',
        'FAMILY',
        'PICNIC',
        'SUNSET',
        'TRAVEL',
        'MEMORY',
        'RELAX',
      ],
      { count: 8, difficulty: 'relaxed' },
    )
    const tokens = selected.map((item) => item.token)
    expect(tokens).toContain('BOAT')
    expect(tokens).not.toContain('BEAT')
    expect(tokens.filter((t) => t.startsWith('GARDEN')).length).toBe(1)
    const masks = new Set(selected.map((item) => item.masked))
    expect(masks.size).toBe(selected.length)
  })

  it('fits the max 18-item layout inside the safe area', () => {
    resetObjectCounter()
    const config = { ...base, itemCount: 18 }
    const ctx = CTX()
    const [page] = missingVowelsTemplate.generate(config, ctx)
    expect(harvestAnswers(page!.objects).length).toBe(18)
    assertObjectsInSafeMargin(page!.objects, ctx)
    if (page!.answerSourceObjects) {
      assertObjectsInSafeMargin(page!.answerSourceObjects, ctx)
    }
  })

  it('puts index and masked prompt on a shared baseline', () => {
    resetObjectCounter()
    const [page] = missingVowelsTemplate.generate({ ...base, itemCount: 18 }, CTX())
    const nested = flattenObjects(page!.objects)
    const prompts = nested.filter((o) => o.studioRole === 'prompt')
    const indexes = nested.filter(
      (o) => o.studioRole === 'decoration' && /^\d+\.$/.test(String(o.text ?? '')),
    )
    expect(indexes.length).toBe(prompts.length)
    expect(prompts.length).toBe(18)
    for (let i = 0; i < prompts.length; i++) {
      expect(prompts[i]!.originY).toBe('bottom')
      expect(indexes[i]!.originY).toBe('bottom')
      expect(indexes[i]!.top).toBe(prompts[i]!.top)
    }
  })

  it('keeps 18-item write-in lines off the cell floor', () => {
    resetObjectCounter()
    const [page] = missingVowelsTemplate.generate({ ...base, itemCount: 18 }, CTX())
    const grid = page!.objects.find(
      (o) => o.type === 'group' && (o.objects ?? []).some((c) => c.studioRole === 'prompt'),
    )!
    const rows = 9
    const cellH = grid.height! / rows
    const lines = flattenObjects([grid]).filter((o) => o.type === 'line' && o.studioRole === 'structure')
    expect(lines.length).toBe(18)
    for (const line of lines) {
      // Group children are stored relative to the group center.
      const localY = Number(line.y1) + grid.height! / 2
      const row = Math.min(rows - 1, Math.max(0, Math.floor(localY / cellH)))
      const cellBottom = (row + 1) * cellH
      expect(cellBottom - localY).toBeGreaterThanOrEqual(12)
      expect(localY - row * cellH).toBeGreaterThan(cellH * 0.4)
    }
  })

  it('puzzle and answer key share the same answers in order', () => {
    resetObjectCounter()
    const [page] = missingVowelsTemplate.generate(base, CTX())
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
    const nested = flattenObjects(answerPage)
    expect(nested.filter((o) => o.studioRole === 'prompt')).toHaveLength(0)
    expect(nested.filter((o) => o.type === 'line')).toHaveLength(0)
    expect(harvestAnswers(answerPage).every((o) => o.fill === STUDIO_ANSWER_INK_MONO)).toBe(
      true,
    )
  })

  it('centers the solution grid in the answer-key body', () => {
    resetObjectCounter()
    const ctx = CTX()
    const config = { ...base, showTitle: true, title: 'Missing Vowels: Travel Dreams' }
    const [page] = missingVowelsTemplate.generate(config, ctx)
    const keyObjects = buildAnswerPage(
      page!.answerSourceObjects ?? page!.objects,
      STUDIO_ANSWER_INK_MONO,
    )
    const grid = keyObjects.find(
      (o) => o.type === 'group' && (o.objects ?? []).some((c) => c.studioRole === 'answer'),
    )!
    const tag: StudioTag = {
      templateKey: 'missing-vowels',
      instanceId: ctx.instanceId,
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

  it('shows an error page instead of bundled words when AI content is missing', () => {
    resetObjectCounter()
    const [page] = missingVowelsTemplate.generate(base, { ...STUDIO_TEST_CTX })
    expect(harvestAnswers(page!.objects)).toHaveLength(0)
    const texts = flattenObjects(page!.objects).map((o) => String(o.text ?? ''))
    expect(texts.some((t) => /unable to create/i.test(t))).toBe(true)
  })

  it('requires custom theme text when Write my own theme is on', () => {
    expect(
      validateMissingVowelsConfig({
        ...base,
        writeOwnTheme: true,
        customTheme: '',
      }),
    ).toMatchObject({ field: 'customTheme' })
  })

  it('defaults title from the retirement theme', () => {
    expect(defaultTitleFor({ ...base, title: '' })).toBe(
      `${MISSING_VOWELS_DEFAULT_TITLE}: Life After Work`,
    )
    expect(MISSING_VOWELS_INSTRUCTION).toMatch(/missing vowels/i)
  })

  it('clamps itemCount and asks for itemCount×2 candidates', () => {
    expect(clampItemCount(3)).toBe(8)
    expect(clampItemCount(99)).toBe(18)
    expect(candidateRequestCount(12)).toBe(24)
  })

  it('difficulty letter ranges match the spec', () => {
    expect(LETTER_RANGE[parseDifficulty('relaxed')]).toEqual({ min: 4, max: 8 })
    expect(LETTER_RANGE.classic).toEqual({ min: 5, max: 10 })
    expect(LETTER_RANGE.challenge).toEqual({ min: 6, max: 14 })
    expect(isNearDuplicate('GARDEN', 'GARDENING')).toBe(true)
    expect(isNearDuplicate('CRUISE', 'GARDEN')).toBe(false)
  })

  it('exposes retirement theme fields and no custom word list', () => {
    const keys = missingVowelsTemplate.configSchema.map((f) => f.key)
    expect(keys).toContain('presetThemeId')
    expect(keys).toContain('retirementCategory')
    expect(keys).toContain('printStyle')
    expect(keys).not.toContain('showLengthHint')
    expect(keys).not.toContain('wordList')
    expect(buildDefaultConfig(missingVowelsTemplate).presetThemeId).toBe('life-after-work')
    expect(buildDefaultConfig(missingVowelsTemplate).difficulty).toBe('classic')
    expect(buildDefaultConfig(missingVowelsTemplate).printStyle).toBe('large-print')
  })
})
