import { describe, it, expect } from 'vitest'
import { listRecallTemplate } from './generate'
import { buildDefaultConfig } from '@/constants/studio-templates'
import {
  STUDIO_ANSWER_INK,
  STUDIO_ANSWER_INK_MONO,
  STUDIO_ANSWER_INK_MONO_TEMPLATES,
  STUDIO_BODY_SIZE,
  STUDIO_STROKE_HAIRLINE,
} from '@/constants/studio.constants'
import { resetObjectCounter } from '../studio-fabric-builders'
import { buildAnswerPage, harvestAnswers } from '../studio-answer-key'
import { assertObjectsInSafeMargin, STUDIO_TEST_CTX } from '../studio-generator-test'
import type { StudioFabricObject, StudioGenerateContext } from '@/types/studio-template.types'
import type { ListRecallResponse } from '@/types/studio-list.types'
import {
  assembleListRecall,
  padOptionsToFullRows,
  recallColumnCount,
  resolveListFallback,
  snapDistractorCountToFullRows,
  validDistractorCounts,
} from './fallback'
import { resolveStudyColumns } from './table'

function flattenStudioObjects(objects: StudioFabricObject[]): StudioFabricObject[] {
  return objects.flatMap((obj) => {
    // Keep answer groups atomic (vector checkmarks) — same as harvestAnswers.
    if (obj.studioRole === 'answer') return [obj]
    if (obj.type === 'group' && obj.objects) return flattenStudioObjects(obj.objects)
    return [obj]
  })
}

const REMOTE: ListRecallResponse = {
  targets: [
    'Whole milk',
    'Bread',
    'Apples',
    'Carrots',
    'Eggs',
    'Cheese',
    'Coffee',
    'Bananas',
  ],
  options: [
    { label: 'Pears', isTarget: false, tier: 'category' },
    { label: 'Whole milk', isTarget: true },
    { label: 'Onions', isTarget: false, tier: 'plain' },
    { label: 'Bread', isTarget: true },
    { label: 'Skim milk', isTarget: false, tier: 'qualitative' },
    { label: 'Apples', isTarget: true },
    { label: 'Coffee', isTarget: true },
    { label: 'Bananas', isTarget: true },
    { label: 'Yogurt', isTarget: false, tier: 'plain' },
    { label: 'Carrots', isTarget: true },
    { label: 'Eggs', isTarget: true },
    { label: 'Cheese', isTarget: true },
    { label: 'Rice', isTarget: false, tier: 'plain' },
    { label: 'Soap', isTarget: false, tier: 'plain' },
    { label: 'Tea', isTarget: false, tier: 'plain' },
    { label: 'Crackers', isTarget: false, tier: 'plain' },
  ],
}

const CTX = (remote: ListRecallResponse = REMOTE): StudioGenerateContext => ({
  pageWidth: 2550,
  pageHeight: 3300,
  margin: { top: 150, right: 150, bottom: 150, left: 225 },
  seed: 42,
  instanceId: 'test-run',
  remoteData: remote,
})

const config: Record<string, unknown> = {
  ...buildDefaultConfig(listRecallTemplate),
  seed: 42,
  fontFamily: 'Inter',
}

describe('list-recall layout', () => {
  it('is deterministic for the same remote data', () => {
    resetObjectCounter()
    const a = listRecallTemplate.generate(config, CTX())
    resetObjectCounter()
    const b = listRecallTemplate.generate(config, CTX())
    expect(a).toEqual(b)
  })

  it('produces exactly two pages: study then recall', () => {
    resetObjectCounter()
    const pages = listRecallTemplate.generate(config, CTX())
    expect(pages.map((p) => p.pageRole)).toEqual(['study', 'recall'])
  })

  it('renders targets on the study page', () => {
    resetObjectCounter()
    const [study] = listRecallTemplate.generate(config, CTX())
    expect(
      flattenStudioObjects(study.objects).some((o) =>
        String(o.text).replace(/\u00a0/g, ' ').includes('Whole milk'),
      ),
    ).toBe(true)
    expect(study.objects.some((o) => o.type === 'group')).toBe(true)
  })

  it('hides one answer check per target on the recall page', () => {
    resetObjectCounter()
    const [, recall] = listRecallTemplate.generate(config, CTX())
    const answers = flattenStudioObjects(recall.objects).filter(
      (o) => o.studioRole === 'answer',
    )
    expect(answers.length).toBe(REMOTE.targets.length)
    expect(answers.every((o) => o.visible === false)).toBe(true)
  })

  it('answer key uses black ink, not blue', () => {
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has('list-recall')).toBe(true)
    resetObjectCounter()
    const [, recall] = listRecallTemplate.generate(config, CTX())
    const keyObjects = buildAnswerPage(recall.objects, STUDIO_ANSWER_INK_MONO)
    const answers = harvestAnswers(keyObjects)
    expect(answers.length).toBe(REMOTE.targets.length)
    expect(answers.every((o) => o.data?.source === 'studio-check-mark')).toBe(true)
    const strokes = answers.flatMap((o) => (o.objects ?? []).map((c) => c.stroke))
    expect(strokes.length).toBeGreaterThan(0)
    expect(strokes.every((s) => s === STUDIO_ANSWER_INK_MONO)).toBe(true)
    expect(strokes.every((s) => s !== STUDIO_ANSWER_INK)).toBe(true)
  })

  it('shows one checkbox per option inside a table group', () => {
    resetObjectCounter()
    const [, recall] = listRecallTemplate.generate(config, CTX())
    expect(recall.objects.some((o) => o.type === 'group')).toBe(true)
    const checkboxes = flattenStudioObjects(recall.objects).filter(
      (o) => o.type === 'rect' && o.studioRole === 'structure' && o.width === 22,
    )
    const expected = padOptionsToFullRows(REMOTE.options, CTX().seed).length
    expect(checkboxes.length).toBe(expected)
  })

  it('fills the last recall row so no empty trailing cells remain', () => {
    const labels = Array.from({ length: 40 }, (_, i) => `grocery item ${i + 1}`)
    const remote: ListRecallResponse = {
      targets: labels.slice(0, 20),
      options: labels.map((label, i) => ({ label, isTarget: i < 20 })),
    }
    expect(remote.options.length % 3).toBe(1)
    resetObjectCounter()
    const [, recall] = listRecallTemplate.generate(config, CTX(remote))
    const prompts = flattenStudioObjects(recall.objects).filter(
      (o) => o.studioRole === 'prompt',
    )
    const cols = recallColumnCount(prompts.length)
    expect(prompts.length % cols).toBe(0)
    expect(prompts.length).toBe(42)
  })

  it('draws even-weight grid bars like grid-copy (not per-cell strokes)', () => {
    resetObjectCounter()
    const [, recall] = listRecallTemplate.generate(config, CTX())
    const bars = flattenStudioObjects(recall.objects).filter(
      (o) =>
        o.type === 'rect' &&
        o.studioRole === 'structure' &&
        o.strokeWidth === 0 &&
        o.fill &&
        o.fill !== 'transparent',
    )
    // 3 cols × 6 rows → 4 vertical + 7 horizontal bars
    expect(bars.length).toBe(4 + 7)
    expect(bars.every((b) => (b.width === STUDIO_STROKE_HAIRLINE) || (b.height === STUDIO_STROKE_HAIRLINE))).toBe(
      true,
    )
  })

  it('lays out the study list as a balanced multi-column grid (not a single stack)', () => {
    // 8 items on a portrait field → 2×4 (same divisor scoring as picture-recognition).
    const field = { left: 0, top: 0, width: 2000, height: 2400 }
    expect(resolveStudyColumns(field, 8)).toBe(2)
    expect(resolveStudyColumns(field, 6)).toBe(2)
    expect(resolveStudyColumns(field, 9)).toBe(3)

    resetObjectCounter()
    const [study] = listRecallTemplate.generate(config, CTX())
    const bars = flattenStudioObjects(study.objects).filter(
      (o) =>
        o.type === 'rect' &&
        o.studioRole === 'structure' &&
        o.strokeWidth === 0 &&
        o.fill &&
        o.fill !== 'transparent',
    )
    // 2 cols × 4 rows → 3 vertical + 5 horizontal bars
    expect(bars.length).toBe(3 + 5)
  })

  it('keeps objects inside the safe margin on a compact page', () => {
    resetObjectCounter()
    const ctx: StudioGenerateContext = { ...STUDIO_TEST_CTX, remoteData: REMOTE }
    const pages = listRecallTemplate.generate(config, ctx)
    for (const page of pages) {
      assertObjectsInSafeMargin(page.objects, ctx)
    }
  })

  it('keeps max list + distractors inside the safe margin', () => {
    const labels = Array.from({ length: 40 }, (_, i) => `item label ${i + 1}`)
    const remote: ListRecallResponse = {
      targets: labels.slice(0, 20),
      options: labels.map((label, i) => ({ label, isTarget: i < 20 })),
    }
    resetObjectCounter()
    const ctx: StudioGenerateContext = { ...STUDIO_TEST_CTX, remoteData: remote }
    const pages = listRecallTemplate.generate(
      { ...config, listLength: 20, distractorCount: 20 },
      ctx,
    )
    for (const page of pages) {
      assertObjectsInSafeMargin(page.objects, ctx)
    }
  })

  it('keeps recall labels on one line inside each cell', () => {
    const longRemote: ListRecallResponse = {
      targets: REMOTE.targets,
      options: [
        { label: 'green grapes', isTarget: true },
        { label: 'garlic powder', isTarget: true },
        { label: 'chicken breast', isTarget: true },
        { label: 'aluminum foil', isTarget: false },
        { label: 'cheddar cheese', isTarget: true },
        { label: 'peanut butter', isTarget: false },
        { label: 'yellow onions', isTarget: true },
        { label: 'kidney beans', isTarget: true },
        { label: 'white bread', isTarget: true },
        { label: 'pork chops', isTarget: true },
        { label: 'sour cream', isTarget: false },
        { label: 'paper towels', isTarget: false },
        { label: 'dish soap', isTarget: false },
        { label: 'brown rice', isTarget: false },
        { label: 'olive oil', isTarget: false },
        { label: 'black pepper', isTarget: false },
      ],
    }
    resetObjectCounter()
    const [, recall] = listRecallTemplate.generate(config, CTX(longRemote))
    const prompts = flattenStudioObjects(recall.objects).filter(
      (o) => o.studioRole === 'prompt' && typeof o.text === 'string',
    )
    const expected = padOptionsToFullRows(longRemote.options, CTX(longRemote).seed).length
    expect(prompts.length).toBe(expected)
    for (const prompt of prompts) {
      // Spaces become NBSP so Fabric cannot soft-wrap mid-label.
      expect(String(prompt.text)).not.toContain(' ')
      expect(prompt.fontSize ?? STUDIO_BODY_SIZE).toBeLessThanOrEqual(STUDIO_BODY_SIZE)
    }
    expect(
      prompts.some((p) => String(p.text).includes('\u00a0')),
    ).toBe(true)
  })

  it('never crashes when remoteData is missing', () => {
    resetObjectCounter()
    const pages = listRecallTemplate.generate(config, { ...CTX(), remoteData: undefined })
    expect(pages.length).toBeGreaterThanOrEqual(1)
  })
})

describe('list-recall fallback', () => {
  it('returns disjoint targets and distractors', () => {
    const data = resolveListFallback('mixed', 8, 8, 42)
    const targetSet = new Set(data.targets.map((t) => t.toLowerCase()))
    const foils = data.options.filter((o) => !o.isTarget)
    expect(data.targets.length).toBe(8)
    expect(foils.every((f) => !targetSet.has(f.label.toLowerCase()))).toBe(true)
    expect(data.options.filter((o) => o.isTarget).length).toBe(data.targets.length)
    expect(data.options.length % recallColumnCount(data.options.length)).toBe(0)
  })

  it('snaps Extra decoys so 8+8 becomes a full 3-col grid (18)', () => {
    expect(snapDistractorCountToFullRows(8, 8)).toBe(10)
    expect(validDistractorCounts(8)).toEqual([4, 7, 10, 13, 16, 19])
    const data = resolveListFallback('mixed', 8, 8, 42)
    expect(data.options.length).toBe(18)
    expect(data.options.filter((o) => !o.isTarget).length).toBe(10)
  })

  it('fills Customize counts from the grocery catalog, not a single 8-item list', () => {
    expect(snapDistractorCountToFullRows(10, 14)).toBe(14)
    const data = resolveListFallback('mixed', 10, 14, 7)
    expect(data.targets.length).toBe(10)
    expect(data.options.filter((o) => o.isTarget).length).toBe(10)
    expect(data.options.filter((o) => !o.isTarget).length).toBe(14)
    expect(data.options.length).toBe(24)
  })

  it('tops up a short API payload to the requested list and extra counts', () => {
    const data = assembleListRecall({
      category: 'mixed',
      listLength: 10,
      distractorCount: 14,
      seed: 3,
      preferredTargets: [
        'Whole milk',
        'Bread',
        'Apples',
        'Carrots',
        'Eggs',
        'Cheese',
        'Coffee',
        'Bananas',
      ],
      preferredDecoys: [
        { label: 'Skim milk', isTarget: false, tier: 'qualitative' },
        { label: 'Pears', isTarget: false, tier: 'category' },
        { label: 'Onions', isTarget: false, tier: 'plain' },
        { label: 'Yogurt', isTarget: false, tier: 'plain' },
        { label: 'Rice', isTarget: false, tier: 'plain' },
        { label: 'Soap', isTarget: false, tier: 'plain' },
        { label: 'Tea', isTarget: false, tier: 'plain' },
        { label: 'Crackers', isTarget: false, tier: 'plain' },
      ],
    })
    expect(data.targets.length).toBe(10)
    expect(data.options.filter((o) => !o.isTarget).length).toBe(14)
    expect(data.targets.slice(0, 8)).toEqual([
      'Whole milk',
      'Bread',
      'Apples',
      'Carrots',
      'Eggs',
      'Cheese',
      'Coffee',
      'Bananas',
    ])
  })
})
