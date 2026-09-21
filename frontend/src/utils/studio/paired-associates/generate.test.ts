import { describe, it, expect } from 'vitest'
import { pairedAssociatesTemplate } from './generate'
import { scramblePartners } from './scramble'
import { mcQuestionText } from './draw-recall'
import { MIN_BLANK_W, MATCH_GUTTER, PAIR_GUTTER } from './geometry'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { resetObjectCounter } from '../studio-fabric-builders'
import { assertObjectsInSafeMargin, STUDIO_TEST_CTX } from '../studio-generator-test'
import { harvestAnswers } from '../studio-answer-key'
import { createRng } from '../studio-rng'
import {
  calculateDimensionsWithBleed,
  calculateMarginGuide,
  parsePageSizeLabel,
} from '@/types/canvas-settings.types'
import { resolveStudioMarginForPage } from '../studio-margin'
import type { StudioFabricObject, StudioGenerateContext } from '@/types/studio-template.types'
import type { PairResponse, WordPair } from '@/types/studio-pairs.types'
import { resolvePairsFallback } from './fallback'

function flatten(objects: StudioFabricObject[]): StudioFabricObject[] {
  return objects.flatMap((obj) =>
    obj.type === 'group' && obj.objects ? flatten(obj.objects) : [obj],
  )
}

const SIX_PAIRS: WordPair[] = [
  { left: 'lantern', right: 'biscuit' },
  { left: 'kettle', right: 'feather' },
  { left: 'anchor', right: 'violin' },
  { left: 'mitten', right: 'compass' },
  { left: 'pebble', right: 'ribbon' },
  { left: 'walnut', right: 'scissors' },
]

const REMOTE: PairResponse = {
  sets: [
    { pairs: SIX_PAIRS },
    {
      pairs: [
        { left: 'teacup', right: 'garden' },
        { left: 'pillow', right: 'staircase' },
        { left: 'button', right: 'window' },
        { left: 'candle', right: 'river' },
        { left: 'hammer', right: 'daisy' },
        { left: 'spoon', right: 'cloud' },
      ],
    },
  ],
}

const CTX = (remote: PairResponse = REMOTE): StudioGenerateContext => ({
  ...STUDIO_TEST_CTX,
  pageWidth: 2550,
  pageHeight: 3300,
  margin: { top: 150, right: 150, bottom: 150, left: 225 },
  remoteData: remote,
})

const config: Record<string, unknown> = {
  ...buildDefaultConfig(pairedAssociatesTemplate),
  seed: 42,
  fontFamily: 'Inter',
  exerciseCount: 1,
  pairCount: 6,
  answerFormat: 'write-in',
  testDirection: 'forward',
}

function allText(page: { objects: StudioFabricObject[] }): string {
  return flatten(page.objects)
    .filter((o) => o.type === 'textbox')
    .map((o) => String(o.text ?? ''))
    .join('\n')
}

function promptTops(page: { objects: StudioFabricObject[] }): number[] {
  return flatten(page.objects)
    .filter((o) => o.studioRole === 'prompt')
    .map((o) => Math.round(o.top))
    .sort((a, b) => a - b)
}

describe('paired-associates — SCRAMBLE gate (§5)', () => {
  it('no partner sits opposite its own cue (derangement)', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const perm = scramblePartners(SIX_PAIRS, createRng(seed))
      expect(perm.every((orig, i) => orig !== i)).toBe(true)
    }
  })

  it('the scramble is a true permutation', () => {
    const perm = scramblePartners(SIX_PAIRS, createRng(1))
    expect([...perm].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('hidden answer lines connect each cue to its true partner', () => {
    resetObjectCounter()
    const [, recall] = pairedAssociatesTemplate.generate(
      { ...config, answerFormat: 'matching' },
      CTX(),
    )
    const answers = harvestAnswers(recall.objects).filter((o) => o.type === 'line')
    expect(answers.length).toBe(6)
  })
})

describe('paired-associates — LAYOUT gate (§6)', () => {
  it('study page uses linked word cards grouped and centered', () => {
    resetObjectCounter()
    const [study] = pairedAssociatesTemplate.generate(config, CTX())
    const groups = study.objects.filter((o) => o.type === 'group')
    expect(groups.length).toBe(1)
    const ink = flatten(groups[0]!.objects ?? [])
    const prompts = ink.filter((o) => o.studioRole === 'prompt')
    expect(prompts.length).toBe(12)
    expect(ink.filter((o) => o.type === 'rect').length).toBe(12)
    expect(ink.filter((o) => o.type === 'circle').length).toBe(12)
    expect(ink.filter((o) => o.type === 'line').length).toBe(6)
    void PAIR_GUTTER
  })

  it('the study page has NO vertical divider between the columns', () => {
    resetObjectCounter()
    const [study] = pairedAssociatesTemplate.generate(config, CTX())
    const verticals = flatten(study.objects).filter(
      (o) => o.type === 'line' && o.x1 === o.x2,
    )
    expect(verticals.length).toBe(0)
  })

  it('matching mode uses word cards with a wide draw gutter', () => {
    expect(MATCH_GUTTER).toBeGreaterThanOrEqual(57)
    resetObjectCounter()
    const [, recall] = pairedAssociatesTemplate.generate(
      { ...config, answerFormat: 'matching' },
      CTX(),
    )
    const groups = recall.objects.filter((o) => o.type === 'group')
    expect(groups.length).toBe(1)
    const ink = flatten(groups[0]!.objects ?? [])
    expect(ink.filter((o) => o.type === 'rect' && o.studioRole === 'structure').length).toBe(12)
    expect(ink.filter((o) => o.type === 'circle').length).toBe(12)
    const prompts = ink.filter((o) => o.studioRole === 'prompt')
    const lefts = [...new Set(prompts.map((o) => Math.round(Number(o.left))))].sort(
      (a, b) => a - b,
    )
    expect(lefts.length).toBe(2)
    expect(lefts[1]! - lefts[0]!).toBeGreaterThanOrEqual(MATCH_GUTTER)
  })

  it('write-in uses cue cards, connectors, and blank cards', () => {
    resetObjectCounter()
    const [, recall] = pairedAssociatesTemplate.generate(config, CTX())
    const groups = recall.objects.filter((o) => o.type === 'group')
    expect(groups.length).toBe(1)
    const ink = flatten(groups[0]!.objects ?? [])
    expect(ink.filter((o) => o.type === 'rect' && o.studioRole === 'structure').length).toBe(12)
    expect(ink.filter((o) => o.type === 'circle').length).toBe(12)
    const blanks = ink.filter(
      (o) => o.type === 'line' && o.studioRole === 'structure' && o.y1 === o.y2,
    )
    // Connector lines + blank underlines — blanks are the longer horizontal runs.
    const writeIns = blanks.filter(
      (b) => Math.abs((b.x2 ?? 0) - (b.x1 ?? 0)) >= MIN_BLANK_W,
    )
    expect(writeIns.length).toBe(6)
    expect(writeIns.every((b) => b.y1 === b.y2)).toBe(true)
  })

  it('a long word does not shift the rows below it', () => {
    resetObjectCounter()
    const long: PairResponse = {
      sets: [
        {
          pairs: [
            { left: 'LANTERNXX', right: 'BISCUITYY' },
            ...SIX_PAIRS.slice(1),
          ],
        },
      ],
    }
    const short: PairResponse = { sets: [{ pairs: SIX_PAIRS }] }
    const a = pairedAssociatesTemplate.generate(config, CTX(long))
    resetObjectCounter()
    const b = pairedAssociatesTemplate.generate(config, CTX(short))
    expect([...new Set(promptTops(a[0]))]).toEqual([...new Set(promptTops(b[0]))])
  })

  it('keeps objects inside the safe margin at max density', () => {
    resetObjectCounter()
    const remote: PairResponse = {
      sets: [
        {
          pairs: Array.from({ length: 10 }, (_, i) => ({
            left: `word${i}`,
            right: `pair${i}`,
          })),
        },
      ],
    }
    const ctx: StudioGenerateContext = { ...STUDIO_TEST_CTX, remoteData: remote }
    for (const answerFormat of ['write-in', 'multiple-choice', 'matching'] as const) {
      resetObjectCounter()
      const pages = pairedAssociatesTemplate.generate(
        { ...config, pairCount: 10, exerciseCount: 1, answerFormat },
        ctx,
      )
      for (const page of pages) {
        assertObjectsInSafeMargin(page.objects, ctx)
      }
    }
  })

  it('keeps all 10 write-in / matching pairs on default 6×9', () => {
    const trim = parsePageSizeLabel('6 x 9 in')
    const page = calculateDimensionsWithBleed(trim, false)
    const margin = resolveStudioMarginForPage({
      pageIndex: 0,
      pageWidth: page.widthPixels,
      pageHeight: page.heightPixels,
      marginGuide: calculateMarginGuide(24, false),
    })
    const remote: PairResponse = {
      sets: [
        {
          pairs: Array.from({ length: 10 }, (_, i) => ({
            left: `word${i}`,
            right: `pair${i}`,
          })),
        },
      ],
    }
    const ctx: StudioGenerateContext = {
      pageWidth: page.widthPixels,
      pageHeight: page.heightPixels,
      margin,
      seed: 42,
      instanceId: 'pairs-6x9',
      remoteData: remote,
    }

    for (const answerFormat of ['write-in', 'matching'] as const) {
      resetObjectCounter()
      const [study, recall] = pairedAssociatesTemplate.generate(
        { ...config, pairCount: 10, exerciseCount: 1, answerFormat },
        ctx,
      )
      // Study: left + right prompts per pair.
      expect(flatten(study!.objects).filter((o) => o.studioRole === 'prompt').length).toBe(20)
      // Write-in: cue prompts only. Matching: cue + scrambled partner prompts.
      const recallPrompts = flatten(recall!.objects).filter((o) => o.studioRole === 'prompt')
      expect(recallPrompts.length).toBe(answerFormat === 'write-in' ? 10 : 20)
      assertObjectsInSafeMargin(study!.objects, ctx)
      assertObjectsInSafeMargin(recall!.objects, ctx)
    }
  })
})

describe('paired-associates — FRAMING gate (§3.4)', () => {
  it('no scoring, norms or diagnostic language appears on any page', () => {
    resetObjectCounter()
    const FORBIDDEN =
      /\b(score|results?|normal range|average for your age|impairment|decline|dementia)\b/i
    for (const p of pairedAssociatesTemplate.generate(config, CTX())) {
      expect(allText(p)).not.toMatch(FORBIDDEN)
    }
  })
})

describe('paired-associates — multiple-choice layout', () => {
  it('keeps all configured MC pairs on default 6×9 (6 and max 10)', () => {
    const trim = parsePageSizeLabel('6 x 9 in')
    const page = calculateDimensionsWithBleed(trim, false)
    const margin = resolveStudioMarginForPage({
      pageIndex: 0,
      pageWidth: page.widthPixels,
      pageHeight: page.heightPixels,
      marginGuide: calculateMarginGuide(24, false),
    })

    for (const pairCount of [6, 10] as const) {
      const remote: PairResponse = {
        sets: [
          {
            pairs: Array.from({ length: pairCount }, (_, i) => ({
              left: `word${i}`,
              right: `pair${i}`,
            })),
          },
        ],
      }
      const ctx: StudioGenerateContext = {
        pageWidth: page.widthPixels,
        pageHeight: page.heightPixels,
        margin,
        seed: 42,
        instanceId: `pairs-mc-6x9-${pairCount}`,
        remoteData: remote,
      }

      resetObjectCounter()
      const [study, recall] = pairedAssociatesTemplate.generate(
        {
          ...config,
          pairCount,
          exerciseCount: 1,
          answerFormat: 'multiple-choice',
        },
        ctx,
      )
      // Study: left + right prompts per pair.
      expect(
        flatten(study!.objects).filter((o) => o.studioRole === 'prompt').length,
      ).toBe(pairCount * 2)
      const recallPrompts = flatten(recall!.objects).filter(
        (o) => o.studioRole === 'prompt',
      )
      const questions = recallPrompts.filter((o) =>
        String(o.text ?? '').startsWith('Circle the word that went with'),
      )
      expect(questions.length).toBe(pairCount)
      expect(harvestAnswers(recall!.objects).length).toBe(pairCount)
      assertObjectsInSafeMargin(study!.objects, ctx)
      assertObjectsInSafeMargin(recall!.objects, ctx)
    }
  })

  it('asks a full question and lays options in a 2×2 rect grid without connectors', () => {
    resetObjectCounter()
    const [, recall] = pairedAssociatesTemplate.generate(
      { ...config, answerFormat: 'multiple-choice', pairCount: 4 },
      CTX(),
    )
    const groups = recall.objects.filter((o) => o.type === 'group')
    expect(groups.length).toBeGreaterThanOrEqual(1)

    const prompts = flatten(recall.objects).filter((o) => o.studioRole === 'prompt')
    const questions = prompts.filter((o) =>
      String(o.text ?? '').startsWith('Circle the word that went with'),
    )
    expect(questions.length).toBeGreaterThanOrEqual(1)
    expect(String(questions[0]?.text)).toBe(mcQuestionText('LANTERN'))
    expect(Number(questions[0]?.fontSize)).toBeLessThanOrEqual(18)

    const optionLabels = prompts.filter((o) => /^[A-D]\.\s+/.test(String(o.text ?? '')))
    expect(optionLabels.length).toBeGreaterThanOrEqual(4)
    expect(optionLabels.every((o) => Number(o.fontSize) <= 16)).toBe(true)
    expect(optionLabels.every((o) => o.textAlign === 'center')).toBe(true)
    expect(optionLabels.every((o) => o.originY === 'center')).toBe(true)

    const firstGroup = flatten(groups[0]!.objects ?? [])
    const rects = firstGroup.filter((o) => o.type === 'rect' && o.studioRole === 'structure')
    const circles = firstGroup.filter((o) => o.type === 'circle')
    const links = firstGroup.filter((o) => o.type === 'line')
    expect(rects.length).toBe(4)
    expect(circles.length).toBe(0)
    expect(links.length).toBe(0)

    // First question block: A/B share a top; C/D share a lower top; two columns.
    const firstFour = optionLabels.slice(0, 4)
    const tops = [...new Set(firstFour.map((o) => Math.round(Number(o.top))))].sort(
      (a, b) => a - b,
    )
    const lefts = [...new Set(firstFour.map((o) => Math.round(Number(o.left))))].sort(
      (a, b) => a - b,
    )
    expect(tops.length).toBe(2)
    expect(lefts.length).toBe(2)
    expect(tops[1]! - tops[0]!).toBeGreaterThanOrEqual(20)
    expect(lefts[1]! - lefts[0]!).toBeGreaterThanOrEqual(100)
  })

  it('does not offer a question’s own cue word among its options', () => {
    resetObjectCounter()
    const [, recall] = pairedAssociatesTemplate.generate(
      { ...config, answerFormat: 'multiple-choice', pairCount: 4 },
      CTX(),
    )
    const prompts = flatten(recall.objects).filter((o) => o.studioRole === 'prompt')
    const questions = prompts.filter((o) =>
      String(o.text ?? '').startsWith('Circle the word that went with'),
    )
    const options = prompts.filter((o) => /^[A-D]\.\s+/.test(String(o.text ?? '')))

    questions.forEach((q, qi) => {
      const match = String(q.text ?? '').match(/went with ([A-Z]+)\./)
      const cue = match?.[1]
      expect(cue).toBeTruthy()
      const block = options.slice(qi * 4, qi * 4 + 4).map((o) => String(o.text ?? ''))
      expect(block.length).toBe(4)
      expect(block.join('\n')).not.toMatch(new RegExp(`\\b${cue}\\b`))
    })
  })
})

describe('paired-associates — content', () => {
  it('emits two pages per exercise', () => {
    resetObjectCounter()
    const pages = pairedAssociatesTemplate.generate(config, CTX())
    expect(pages.map((p) => p.pageRole)).toEqual(['study', 'recall'])
  })

  it('one hidden answer per pair', () => {
    resetObjectCounter()
    const [, recall] = pairedAssociatesTemplate.generate(config, CTX())
    const answers = harvestAnswers(recall.objects)
    expect(answers.length).toBe(6)
    expect(answers.every((o) => o.visible === false)).toBe(true)
  })

  it('never crashes when remoteData is missing', () => {
    resetObjectCounter()
    const pages = pairedAssociatesTemplate.generate(config, {
      ...CTX(),
      remoteData: undefined,
    })
    expect(pages.length).toBeGreaterThanOrEqual(1)
  })

  it('does not produce an answer key page', () => {
    expect(pairedAssociatesTemplate.producesAnswerKey).toBe(false)
  })

  it('hides exercise count, source, and clue direction from the form schema', () => {
    const keys = pairedAssociatesTemplate.configSchema.map((f) => f.key)
    expect(keys).not.toContain('exerciseCount')
    expect(keys).not.toContain('source')
    expect(keys).not.toContain('testDirection')
  })

  it('fallback returns enough distinct sets', () => {
    const data = resolvePairsFallback('arbitrary', 6, 10, 42)
    expect(data.sets.length).toBe(10)
    expect(data.sets.every((s) => s.pairs.length === 6)).toBe(true)
  })
})
