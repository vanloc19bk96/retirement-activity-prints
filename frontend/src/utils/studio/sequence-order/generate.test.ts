import { describe, it, expect } from 'vitest'
import { sequenceOrderTemplate } from './generate'
import { scrambleSequence } from './scramble'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { STUDIO_STROKE_HAIRLINE } from '@/constants/studio.constants'
import { resetObjectCounter } from '../studio-fabric-builders'
import { assertObjectsInSafeMargin, STUDIO_TEST_CTX } from '../studio-generator-test'
import { createRng } from '../studio-rng'
import type { StudioFabricObject, StudioGenerateContext } from '@/types/studio-template.types'
import type { SequenceItem, SequenceResponse } from '@/types/studio-sequence.types'
import { resolveSequenceFallback } from './fallback'
import { estimateTextBoxWidth } from '../studio-layout'
import { MIN_BOX, sequenceColumnCount } from './rhythm'

function flatten(objects: StudioFabricObject[]): StudioFabricObject[] {
  return objects.flatMap((obj) =>
    obj.type === 'group' && obj.objects ? flatten(obj.objects) : [obj],
  )
}

const FIVE_ITEMS: SequenceItem[] = [
  { text: 'Apple' },
  { text: 'Chair' },
  { text: 'Kite' },
  { text: 'Drum' },
  { text: 'Ladder' },
]

const REMOTE: SequenceResponse = {
  sequences: [
    { items: FIVE_ITEMS },
    {
      title: 'Making a cup of tea',
      items: [
        { text: 'Boil the kettle' },
        { text: 'Warm the pot' },
        { text: 'Add the tea' },
        { text: 'Pour the water' },
        { text: 'Let it brew' },
      ],
    },
  ],
}

const CTX = (remote: SequenceResponse = REMOTE): StudioGenerateContext => ({
  ...STUDIO_TEST_CTX,
  pageWidth: 2550,
  pageHeight: 3300,
  margin: { top: 150, right: 150, bottom: 150, left: 225 },
  remoteData: remote,
})

const config: Record<string, unknown> = {
  ...buildDefaultConfig(sequenceOrderTemplate),
  seed: 42,
  fontFamily: 'Inter',
  pagePairCount: 1,
  itemCount: 5,
  answerFormat: 'number-boxes',
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

describe('sequence-order — SCRAMBLE gate (§6)', () => {
  it('no item stays in its original position (derangement)', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const perm = scrambleSequence(FIVE_ITEMS, createRng(seed))
      expect(perm.every((orig, i) => orig !== i)).toBe(true)
    }
  })

  it('the scramble is a true permutation (every item appears once)', () => {
    const perm = scrambleSequence(FIVE_ITEMS, createRng(1))
    expect([...perm].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4])
  })

  it('recall page leaves number boxes blank (no answer key)', () => {
    resetObjectCounter()
    const [, recall] = sequenceOrderTemplate.generate(config, CTX())
    const answers = flatten(recall.objects).filter((o) => o.studioRole === 'answer')
    expect(answers).toHaveLength(0)
  })
})

describe('sequence-order — LAYOUT gate (§7)', () => {
  it('the study page shows visible order numbers in boxes', () => {
    resetObjectCounter()
    const [study] = sequenceOrderTemplate.generate(config, CTX())
    const prompts = flatten(study.objects)
      .filter((o) => o.studioRole === 'prompt')
      .map((o) => String(o.text ?? ''))
    // Labels stay unprefixed; order digits live in the number boxes.
    expect(prompts.every((t) => !/^\s*[1-8][.)]/.test(t))).toBe(true)
    const orderDigits = flatten(study.objects)
      .filter((o) => o.studioRole === 'decoration')
      .map((o) => String(o.text ?? ''))
      .filter((t) => /^[1-8]$/.test(t))
      .sort()
    expect(orderDigits).toEqual(['1', '2', '3', '4', '5'])
  })

  it('study and recall pages share the same item rhythm', () => {
    resetObjectCounter()
    const [study, recall] = sequenceOrderTemplate.generate(config, CTX())
    expect(promptTops(study)).toEqual(promptTops(recall))
  })

  it('answer boxes never fall below the minimum', () => {
    for (const itemCount of [4, 5, 6, 7, 8]) {
      resetObjectCounter()
      const pages = sequenceOrderTemplate.generate(
        { ...config, itemCount, pagePairCount: 1 },
        CTX({
          sequences: [
            {
              items: Array.from({ length: itemCount }, (_, i) => ({
                text: `Item ${i + 1}`,
              })),
            },
          ],
        }),
      )
      // Number boxes are stroked; grid hairlines are fill-only bars.
      const boxes = flatten(pages[1].objects).filter(
        (o) =>
          o.type === 'rect' &&
          o.studioRole === 'structure' &&
          (o.strokeWidth ?? 0) > 0,
      )
      expect(boxes.length).toBe(itemCount)
      expect(boxes.every((b) => (b.width ?? 0) >= MIN_BOX && (b.height ?? 0) >= MIN_BOX)).toBe(
        true,
      )
    }
  })

  it('lays items out in a balanced multi-column grid', () => {
    resetObjectCounter()
    const [study] = sequenceOrderTemplate.generate(config, CTX())
    const prompts = flatten(study.objects).filter((o) => o.studioRole === 'prompt')
    expect(prompts.length).toBe(5)
    const cols = sequenceColumnCount(5)
    expect(cols).toBe(2)
    const lefts = new Set(prompts.map((o) => Math.round(o.left)))
    expect(lefts.size).toBe(cols)
  })

  it('draws even-weight grid bars like grid-copy', () => {
    resetObjectCounter()
    const [study] = sequenceOrderTemplate.generate(config, CTX())
    const bars = flatten(study.objects).filter(
      (o) =>
        o.type === 'rect' &&
        o.studioRole === 'structure' &&
        o.strokeWidth === 0 &&
        o.fill &&
        o.fill !== 'transparent',
    )
    // 2 cols × 3 rows → 3 vertical + 4 horizontal bars
    expect(bars.length).toBe(3 + 4)
    expect(
      bars.every(
        (b) => b.width === STUDIO_STROKE_HAIRLINE || b.height === STUDIO_STROKE_HAIRLINE,
      ),
    ).toBe(true)
  })

  it('does not show the encouragement line', () => {
    resetObjectCounter()
    const [, recall] = sequenceOrderTemplate.generate(config, CTX())
    expect(allText(recall)).not.toMatch(/Even getting a few in the right place/i)
  })

  it('scales long labels so they stay inside their cell', () => {
    resetObjectCounter()
    const long: SequenceResponse = {
      sequences: [
        {
          items: [
            { text: 'Cotton picnic blanket' },
            { text: 'Plastic water bottle' },
            { text: 'Small metal whistle' },
            { text: 'Heavy leather boots' },
            { text: 'Folding camping stool' },
            { text: 'Waterproof rain jacket' },
            { text: 'Handheld electric fan' },
            { text: 'Reusable shopping tote' },
          ],
        },
      ],
    }
    const [study] = sequenceOrderTemplate.generate(
      { ...config, itemCount: 8 },
      CTX(long),
    )
    const prompts = flatten(study.objects).filter((o) => o.studioRole === 'prompt')
    expect(prompts.length).toBe(8)
    for (const prompt of prompts) {
      const text = String(prompt.text ?? '')
      const size = Number(prompt.fontSize ?? 0)
      const width = Number(prompt.width ?? 0)
      // Fitted width must be the glyph run, never wider than that run at this size.
      expect(width).toBeLessThanOrEqual(estimateTextBoxWidth(text, size, width) + 1)
      expect(width).toBeLessThanOrEqual(
        estimateTextBoxWidth(text, size, Number.POSITIVE_INFINITY) + 1,
      )
      // And the natural run must fit the assigned box (no overflow past width).
      expect(estimateTextBoxWidth(text, size, Number.POSITIVE_INFINITY)).toBeLessThanOrEqual(
        width + 1,
      )
    }
  })

  it('a long item does not shift the items below it', () => {
    resetObjectCounter()
    const long: SequenceResponse = {
      sequences: [
        {
          items: [
            { text: 'Very long item words' },
            { text: 'Chair' },
            { text: 'Kite' },
            { text: 'Drum' },
            { text: 'Ladder' },
          ],
        },
      ],
    }
    const short: SequenceResponse = {
      sequences: [{ items: FIVE_ITEMS }],
    }
    const a = sequenceOrderTemplate.generate(config, CTX(long))
    resetObjectCounter()
    const b = sequenceOrderTemplate.generate(config, CTX(short))
    expect(promptTops(a[0])).toEqual(promptTops(b[0]))
  })

  it('first item baseline is identical across page pairs', () => {
    resetObjectCounter()
    const pages = sequenceOrderTemplate.generate(
      { ...config, pagePairCount: 2 },
      CTX(REMOTE),
    )
    const firstA = promptTops(pages[0])[0]
    const firstB = promptTops(pages[2])[0]
    expect(firstA).toBe(firstB)
  })

  it('keeps all 8 items for write-list (does not drop to fit blanks)', () => {
    resetObjectCounter()
    const remote: SequenceResponse = {
      sequences: [
        {
          items: Array.from({ length: 8 }, (_, i) => ({ text: `Word ${i + 1}` })),
        },
      ],
    }
    const ctx: StudioGenerateContext = { ...STUDIO_TEST_CTX, remoteData: remote }
    const [study, recall] = sequenceOrderTemplate.generate(
      { ...config, itemCount: 8, pagePairCount: 1, answerFormat: 'write-list' },
      ctx,
    )
    const studyPrompts = flatten(study.objects).filter((o) => o.studioRole === 'prompt')
    const recallPrompts = flatten(recall.objects).filter((o) => o.studioRole === 'prompt')
    expect(studyPrompts).toHaveLength(8)
    expect(recallPrompts).toHaveLength(8)
    // Numbered answer lines 1..8 under the scrambled grid.
    const blankNumbers = flatten(recall.objects)
      .filter((o) => o.studioRole === 'decoration')
      .map((o) => String(o.text ?? ''))
      .filter((t) => /^[1-8]\.$/.test(t))
      .sort()
    expect(blankNumbers).toEqual(['1.', '2.', '3.', '4.', '5.', '6.', '7.', '8.'])
    for (const page of [study, recall]) {
      assertObjectsInSafeMargin(page.objects, ctx)
    }
  })
})

describe('sequence-order — content', () => {
  it('omits category titles on arbitrary sequences', () => {
    resetObjectCounter()
    const pages = sequenceOrderTemplate.generate(
      { ...config, sequenceType: 'arbitrary' },
      CTX({
        sequences: [{ title: 'Unrelated Objects', items: FIVE_ITEMS }],
      }),
    )
    for (const page of pages) {
      expect(allText(page)).not.toContain('Unrelated Objects')
    }
  })

  it('keeps procedure titles on steps sequences', () => {
    resetObjectCounter()
    const [study] = sequenceOrderTemplate.generate(
      { ...config, sequenceType: 'steps' },
      CTX({
        sequences: [
          {
            title: 'Making a cup of tea',
            items: [
              { text: 'Boil the kettle' },
              { text: 'Warm the pot' },
              { text: 'Add the tea' },
              { text: 'Pour the water' },
              { text: 'Let it brew' },
            ],
          },
        ],
      }),
    )
    expect(allText(study)).toContain('Making a cup of tea')
  })

  it('emits two pages per exercise', () => {
    resetObjectCounter()
    const pages = sequenceOrderTemplate.generate(config, CTX())
    expect(pages.map((p) => p.pageRole)).toEqual(['study', 'recall'])
  })

  it('does not produce an answer key page', () => {
    expect(sequenceOrderTemplate.producesAnswerKey).toBe(false)
  })

  it('never crashes when remoteData is missing', () => {
    resetObjectCounter()
    const pages = sequenceOrderTemplate.generate(config, {
      ...CTX(),
      remoteData: undefined,
    })
    expect(pages.length).toBeGreaterThanOrEqual(1)
  })

  it('fallback returns enough distinct sequences', () => {
    const data = resolveSequenceFallback('arbitrary', 5, 10, 42)
    expect(data.sequences.length).toBe(10)
    expect(data.sequences.every((s) => s.items.length === 5)).toBe(true)
  })

  it('validateConfig requires custom theme text', () => {
    expect(
      sequenceOrderTemplate.validateConfig?.({
        ...config,
        customTheme: true,
        customThemeText: '   ',
      }),
    ).toMatchObject({ field: 'customThemeText' })
    expect(
      sequenceOrderTemplate.validateConfig?.({
        ...config,
        customTheme: true,
        customThemeText: 'beach day packing list',
      }),
    ).toBeNull()
    expect(
      sequenceOrderTemplate.validateConfig?.({
        ...config,
        customTheme: false,
        sequenceType: 'arbitrary',
      }),
    ).toBeNull()
  })

  it('hides exercise count and source from the form schema', () => {
    const keys = sequenceOrderTemplate.configSchema.map((f) => f.key)
    expect(keys).not.toContain('pagePairCount')
    expect(keys).not.toContain('source')
    expect(keys).toContain('customTheme')
    expect(keys).toContain('customThemeText')
  })
})
