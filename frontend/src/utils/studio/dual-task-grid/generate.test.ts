import { describe, it, expect } from 'vitest'
import {
  dualTaskGridTemplate,
  buildSheet,
  recomputeAnswer,
  itemCountForDifficulty,
  itemsPerRowFor,
  validateDualTaskConfig,
  SAME_TASK_ERROR,
} from './generate'
import { buildDefaultConfig, getStudioTemplate } from '@/constants/studio-templates'
import {
  STUDIO_ANSWER_INK,
  STUDIO_ANSWER_INK_MONO,
  STUDIO_ANSWER_INK_MONO_TEMPLATES,
} from '@/constants/studio.constants'
import { resetObjectCounter } from '../studio-fabric-builders'
import { createRng } from '../studio-rng'
import { runGeneratorContractTests } from '../studio-generator-test'
import { buildAnswerPage, harvestAnswers } from '../studio-answer-key'
import type { StudioFabricObject, StudioGenerateContext } from '@/types/studio-template.types'
import type { StreamType } from './streams'

function flattenObjects(objects: StudioFabricObject[]): StudioFabricObject[] {
  const out: StudioFabricObject[] = []
  for (const o of objects) {
    out.push(o)
    if (o.type === 'group' && o.objects) {
      out.push(...flattenObjects(o.objects))
    }
  }
  return out
}

const CTX = (): StudioGenerateContext => ({
  pageWidth: 2550,
  pageHeight: 3300,
  margin: { top: 150, right: 150, bottom: 150, left: 225 },
  seed: 42,
  instanceId: 'test-run',
})

const base = {
  ...buildDefaultConfig(dualTaskGridTemplate),
  seed: 42,
  fontFamily: 'Inter',
}

runGeneratorContractTests(dualTaskGridTemplate)

describe('dual-task-grid', () => {
  it('is deterministic', () => {
    resetObjectCounter()
    const a = dualTaskGridTemplate.generate(base, CTX())
    resetObjectCounter()
    const b = dualTaskGridTemplate.generate(base, CTX())
    expect(a).toEqual(b)
  })

  it('different seeds give different sheets', () => {
    resetObjectCounter()
    const a = JSON.stringify(dualTaskGridTemplate.generate(base, CTX()))
    resetObjectCounter()
    const b = JSON.stringify(
      dualTaskGridTemplate.generate({ ...base, seed: 7 }, { ...CTX(), seed: 7 }),
    )
    expect(a).not.toEqual(b)
  })

  it('auto-adds a solution page (no form toggles)', () => {
    expect(dualTaskGridTemplate.producesAnswerKey).toBe(true)
    const registered = getStudioTemplate('dual-task-grid')
    const regKeys = new Set(registered!.configSchema.map((f) => f.key))
    expect(regKeys.has('includeAnswerKey')).toBe(false)
    expect(regKeys.has('answerKeyForAll')).toBe(false)
  })

  it('exactly two hidden answers (one per task)', () => {
    resetObjectCounter()
    const [page] = dualTaskGridTemplate.generate(base, CTX())
    const answers = harvestAnswers(page!.objects)
    expect(answers.length).toBe(2)
    expect(answers.every((o) => o.visible === false)).toBe(true)
  })

  it('rejects identical Task A and Task B with a clear error', () => {
    expect(
      validateDualTaskConfig({ taskA: 'alt-sign-sum', taskB: 'alt-sign-sum' }),
    ).toEqual({ message: SAME_TASK_ERROR, field: 'taskB' })
    expect(dualTaskGridTemplate.validateConfig?.(base)).toBeNull()

    resetObjectCounter()
    expect(() =>
      dualTaskGridTemplate.generate(
        { ...base, taskA: 'alt-sign-sum', taskB: 'alt-sign-sum' },
        CTX(),
      ),
    ).toThrow(SAME_TASK_ERROR)
  })

  it('all difficulties generate', () => {
    for (const d of ['easy', 'standard', 'hard'] as const) {
      resetObjectCounter()
      expect(() =>
        dualTaskGridTemplate.generate({ ...base, streamDifficulty: d }, CTX()),
      ).not.toThrow()
    }
  })

  it('uses NO color — all ink is monochrome', () => {
    resetObjectCounter()
    const [page] = dualTaskGridTemplate.generate(base, CTX())
    const allowed = new Set(['#000000', 'transparent', undefined, '#6B7280', '#111827', '#D1D5DB'])
    const colored = flattenObjects(page!.objects).filter(
      (o) => o.fill != null && !allowed.has(o.fill as string),
    )
    expect(colored.length).toBe(0)
  })

  it('answer key uses black ink, not blue', () => {
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has('dual-task-grid')).toBe(true)
    resetObjectCounter()
    const [page] = dualTaskGridTemplate.generate(base, CTX())
    const keyObjects = buildAnswerPage(
      page!.answerSourceObjects ?? page!.objects,
      STUDIO_ANSWER_INK_MONO,
    )
    const answers = harvestAnswers(keyObjects)
    expect(answers.length).toBe(2)
    expect(answers.every((o) => o.fill === STUDIO_ANSWER_INK_MONO)).toBe(true)
    expect(answers.every((o) => o.fill !== STUDIO_ANSWER_INK)).toBe(true)
  })

  it('solution page drops the how-to/legend and centers the grid — no reflow gap', () => {
    resetObjectCounter()
    const [page] = dualTaskGridTemplate.generate(base, CTX())
    const puzzleJson = JSON.stringify(page)
    expect(puzzleJson).toContain('Task A: add the numbers')
    expect(puzzleJson).not.toContain('Example:')
    expect(puzzleJson).not.toContain('A so far')

    expect(page!.answerSourceObjects?.length).toBeGreaterThan(0)
    const keySource = page!.answerSourceObjects!
    const keySourceJson = JSON.stringify(keySource)
    // Instruction + Task A/B legend are absent from layout, not just hidden —
    // the grid gets the reclaimed vertical space instead of leaving a gap.
    expect(keySourceJson).not.toContain('Task A: add the numbers')
    expect(keySourceJson).not.toContain('Squares are Task A')
    const puzzleGrid = flattenObjects(page!.objects).find(
      (o) => o.type === 'group' && o.studioRole === 'structure' && (o.objects?.length ?? 0) > 10,
    )
    const keyGrid = flattenObjects(keySource).find(
      (o) => o.type === 'group' && o.studioRole === 'structure' && (o.objects?.length ?? 0) > 10,
    )
    expect(puzzleGrid).toBeTruthy()
    expect(keyGrid).toBeTruthy()
    expect(keyGrid!.top as number).toBeLessThan(puzzleGrid!.top as number)

    const keyObjects = buildAnswerPage(keySource, STUDIO_ANSWER_INK_MONO)
    const keyFlat = flattenObjects(keyObjects)
    const keyJson = JSON.stringify(keyObjects)
    expect(keyJson).not.toContain('Task A: add the numbers')
    expect(keyFlat.some((o) => o.type === 'rect' && o.studioRole === 'structure')).toBe(true)
    expect(keyFlat.some((o) => o.type === 'circle' && o.studioRole === 'structure')).toBe(true)
    expect(keyFlat.filter((o) => o.studioRole === 'prompt').length).toBeGreaterThan(10)
    expect(harvestAnswers(keyObjects).length).toBe(2)
    expect(harvestAnswers(keyObjects).every((o) => o.visible === true)).toBe(true)
  })

  it('mixes A and B in random order (not strict A,B,A,B…)', () => {
    const sheet = buildSheet('running-sum', 'running-count', 40, 'standard', createRng(42))
    expect(sheet.items).toHaveLength(40)
    const streams = sheet.items.map((i) => i.stream)
    const countA = streams.filter((s) => s === 'A').length
    const countB = streams.filter((s) => s === 'B').length
    expect(countA).toBeGreaterThanOrEqual(14)
    expect(countB).toBeGreaterThanOrEqual(14)
    expect(countA + countB).toBe(40)
    // Shuffled mix produces at least one same-task adjacency (AA or BB).
    expect(streams.some((s, i) => i > 0 && s === streams[i - 1])).toBe(true)
  })

  it('answers match independent recompute from printed tokens', () => {
    const pairs: Array<[StreamType, StreamType]> = [
      ['running-sum', 'running-count'],
      ['updown-track', 'parity-track'],
      ['alt-sign-sum', 'running-sum'],
      ['running-count', 'threshold-count'],
      ['parity-track', 'updown-track'],
      ['vowel-count', 'alt-sign-sum'],
      ['threshold-count', 'vowel-count'],
    ]
    for (const [a, b] of pairs) {
      const sheet = buildSheet(a, b, 24, 'standard', createRng(99))
      const tokensA = sheet.items.filter((i) => i.stream === 'A').map((i) => i.token)
      const tokensB = sheet.items.filter((i) => i.stream === 'B').map((i) => i.token)
      expect(tokensA.length).toBeGreaterThan(0)
      expect(tokensB.length).toBeGreaterThan(0)
      expect(recomputeAnswer(a, tokensA, sheet.countTargetA, sheet.thresholdA)).toBe(
        sheet.answerA,
      )
      expect(recomputeAnswer(b, tokensB, sheet.countTargetB, sheet.thresholdB)).toBe(
        sheet.answerB,
      )
    }
  })

  it('draws square/circle frames with tokens in one grid group', () => {
    resetObjectCounter()
    const [page] = dualTaskGridTemplate.generate(base, CTX())
    const flat = flattenObjects(page!.objects)
    const json = JSON.stringify(page)
    expect(json).not.toContain('Example:')
    expect(json).not.toContain('A so far')
    expect(flat.some((o) => o.type === 'rect' && o.studioRole === 'structure')).toBe(true)
    expect(flat.some((o) => o.type === 'circle' && o.studioRole === 'structure')).toBe(true)
    expect(flat.some((o) => o.type === 'textbox' && o.studioRole === 'prompt')).toBe(true)

    const gridGroups = page!.objects.filter(
      (o) =>
        o.type === 'group' &&
        o.studioRole === 'structure' &&
        (o.objects?.length ?? 0) > 10,
    )
    expect(gridGroups).toHaveLength(1)
  })

  it('item count and row width follow difficulty', () => {
    expect(itemsPerRowFor('easy')).toBe(8)
    expect(itemsPerRowFor('standard')).toBe(10)
    expect(itemsPerRowFor('hard')).toBe(12)

    expect(itemCountForDifficulty('easy')).toBe(24)
    expect(itemCountForDifficulty('standard')).toBe(40)
    expect(itemCountForDifficulty('hard')).toBe(60)

    expect(dualTaskGridTemplate.configSchema.some((f) => f.key === 'itemCount')).toBe(
      false,
    )
  })

  it('generated grids use difficulty item counts and fill complete rows', () => {
    for (const d of ['easy', 'standard', 'hard'] as const) {
      resetObjectCounter()
      const [page] = dualTaskGridTemplate.generate({ ...base, streamDifficulty: d }, CTX())
      const prompts = flattenObjects(page!.objects).filter(
        (o) =>
          o.studioRole === 'prompt' &&
          (o.type === 'textbox' || o.data?.source === 'phosphor-icon'),
      )
      // Answer-strip labels are also prompts — grid tokens are the rest.
      const tokenCount = prompts.length - 2
      expect(tokenCount).toBe(itemCountForDifficulty(d))
      expect(tokenCount % itemsPerRowFor(d)).toBe(0)
    }
  })
})
