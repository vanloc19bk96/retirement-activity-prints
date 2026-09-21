import { describe, it, expect } from 'vitest'
import { firstLetterRecallTemplate } from './generate'
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
import type { FirstLetterRecallResponse } from '@/types/studio-first-letter-recall.types'

const REMOTE_F = [
  'fish',
  'fork',
  'flower',
  'fence',
  'forest',
  'family',
  'friend',
  'finger',
  'feather',
  'fountain',
  'fridge',
  'frame',
  'farm',
  'flame',
  'flute',
]

const REMOTE: FirstLetterRecallResponse = {
  byLetter: {
    F: REMOTE_F,
    A: [
      'apple',
      'arm',
      'ant',
      'arrow',
      'apron',
      'anchor',
      'alarm',
      'avenue',
      'attic',
      'animal',
      'artist',
      'axle',
      'answer',
      'angle',
      'amber',
    ],
    S: [
      'sun',
      'star',
      'spoon',
      'shoe',
      'sock',
      'snake',
      'stone',
      'sugar',
      'sandwich',
      'shadow',
      'silver',
      'soap',
      'spider',
      'spring',
      'square',
    ],
  },
}

const CTX = (
  remote: FirstLetterRecallResponse | undefined = REMOTE,
): StudioGenerateContext => ({
  pageWidth: 2550,
  pageHeight: 3300,
  margin: { top: 150, right: 150, bottom: 150, left: 225 },
  seed: 42,
  instanceId: 'test-run',
  remoteData: remote,
})

const base: StudioConfig = {
  ...buildDefaultConfig(firstLetterRecallTemplate),
  seed: 42,
  fontFamily: 'Inter',
}

function uniqueLefts(objects: { left?: number }[]): number[] {
  return [...new Set(objects.map((o) => Math.round(Number(o.left ?? 0))))]
}

function firstColumnSize(objects: { left?: number }[]): number {
  const lefts = objects.map((o) => Math.round(Number(o.left ?? 0)))
  if (!lefts.length) return 0
  const minLeft = Math.min(...lefts)
  return lefts.filter((left) => left === minLeft).length
}

describe('first-letter-recall', () => {
  it('is deterministic given the same remoteData', () => {
    resetObjectCounter()
    const a = firstLetterRecallTemplate.generate(base, CTX())
    resetObjectCounter()
    const b = firstLetterRecallTemplate.generate(base, CTX())
    expect(a).toEqual(b)
  })

  it('different seeds pick different letters', () => {
    resetObjectCounter()
    const a = JSON.stringify(firstLetterRecallTemplate.generate(base, CTX()))
    resetObjectCounter()
    const b = JSON.stringify(
      firstLetterRecallTemplate.generate({ ...base, seed: 7 }, {
        ...CTX(),
        seed: 7,
      }),
    )
    expect(a).not.toEqual(b)
  })

  it('prints lineCount write-in lines in one centered group', () => {
    resetObjectCounter()
    const [page] = firstLetterRecallTemplate.generate(base, CTX())
    const grid = page!.objects.find(
      (o) => o.type === 'group' && o.studioRole === 'structure',
    )
    expect(grid).toBeTruthy()
    const lines = (grid?.objects ?? []).filter((o) => o.type === 'line')
    expect(lines.length).toBe(Number(base.lineCount))
  })

  it('does not print the rules footer line', () => {
    resetObjectCounter()
    const [page] = firstLetterRecallTemplate.generate(base, CTX())
    const texts = page!.objects.map((o) =>
      String(o.text ?? '').replace(/\u00a0/g, ' '),
    )
    expect(texts.some((t) => /Rules:\s*no names/i.test(t))).toBe(false)
  })

  it('auto-adds a solution page (no form toggles)', () => {
    expect(firstLetterRecallTemplate.producesAnswerKey).toBe(true)
    expect(
      firstLetterRecallTemplate.configSchema.every(
        (f) => f.key !== 'includeAnswerKey' && f.key !== 'answerKeyForAll',
      ),
    ).toBe(true)
  })

  it('matches sample-answer count and grid to answer lines', () => {
    for (const lineCount of [8, 10, 15, 16, 28, 29, 30]) {
      resetObjectCounter()
      const extras = Array.from({ length: 40 }, (_, i) => `extra-${i}`)
      const remote: FirstLetterRecallResponse = {
        byLetter: { F: [...REMOTE_F, ...extras] },
      }
      const [page] = firstLetterRecallTemplate.generate(
        { ...base, lineCount, letterMode: 'fixed', fixedLetter: 'F' },
        CTX(remote),
      )
      const writeIn = page!.objects.find(
        (o) => o.type === 'group' && o.studioRole === 'structure',
      )
      const answers = page!.objects.find(
        (o) => o.type === 'group' && o.studioRole === 'answer',
      )
      const writeInLabels = (writeIn?.objects ?? []).filter(
        (o) => o.type === 'textbox',
      )
      const answerLabels = answers?.objects ?? []
      expect(answerLabels.length).toBe(lineCount)

      const expectedCols = lineCount > 10 ? 3 : 2
      const expectedRows = Math.ceil(lineCount / expectedCols)
      expect(uniqueLefts(writeInLabels)).toHaveLength(expectedCols)
      expect(uniqueLefts(answerLabels)).toHaveLength(expectedCols)
      expect(firstColumnSize(writeInLabels)).toBe(expectedRows)
      expect(firstColumnSize(answerLabels)).toBe(expectedRows)
    }
  })

  it('hides sample answers on the puzzle page and reveals them on the key', () => {
    resetObjectCounter()
    const [page] = firstLetterRecallTemplate.generate(
      { ...base, letterMode: 'fixed', fixedLetter: 'F' },
      CTX(),
    )
    const hidden = harvestAnswers(page!.objects)
    expect(hidden.length).toBe(2)
    expect(hidden.every((o) => o.visible === false)).toBe(true)
    const grid = hidden.find((o) => o.type === 'group')
    // Default lineCount is 15; remote may be longer — page must show exactly lineCount.
    expect(grid?.objects?.length).toBe(Number(base.lineCount))

    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has('first-letter-recall')).toBe(true)
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

    const keyTexts = keyObjects.map((o) =>
      String(o.text ?? '').replace(/\u00a0/g, ' '),
    )
    expect(keyTexts.some((t) => /^Letter:/i.test(t))).toBe(false)
    expect(keyTexts.some((t) => /^Time:/i.test(t))).toBe(false)
    expect(keyGrid?.objects?.length).toBe(Number(base.lineCount))
  })

  it('centers the grouped write-in grid in the body', () => {
    resetObjectCounter()
    const ctx = CTX()
    const [page] = firstLetterRecallTemplate.generate(base, ctx)
    const grid = page!.objects.find(
      (o) => o.type === 'group' && o.studioRole === 'structure',
    )
    expect(grid).toBeTruthy()
    const body = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
    const bodyMid = body.left + body.width / 2
    const gridMid = Number(grid!.left) + Number(grid!.width) / 2
    expect(Math.abs(gridMid - bodyMid)).toBeLessThan(2)
  })

  it('keeps max lineCount inside the safe margin', () => {
    resetObjectCounter()
    const ctx: StudioGenerateContext = { ...STUDIO_TEST_CTX, remoteData: REMOTE }
    const pages = firstLetterRecallTemplate.generate(
      { ...base, lineCount: 30, letterMode: 'fixed', fixedLetter: 'F' },
      ctx,
    )
    for (const page of pages) {
      assertObjectsInSafeMargin(page.objects, ctx)
    }
  })

  it('never crashes when remoteData is missing', () => {
    resetObjectCounter()
    expect(() =>
      firstLetterRecallTemplate.generate(base, { ...CTX(), remoteData: undefined }),
    ).not.toThrow()
  })

  it('fills lineCount=30 sample answers from the catalog when the API list is short', () => {
    resetObjectCounter()
    const short: FirstLetterRecallResponse = { byLetter: { F: REMOTE_F.slice(0, 8) } }
    const [page] = firstLetterRecallTemplate.generate(
      { ...base, lineCount: 30, letterMode: 'fixed', fixedLetter: 'F' },
      CTX(short),
    )
    const answers = page!.objects.find(
      (o) => o.type === 'group' && o.studioRole === 'answer',
    )
    expect(answers?.objects?.length).toBe(30)
  })
})
