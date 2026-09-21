import { describe, it, expect, beforeEach } from 'vitest'
import type { StudioGenerateContext } from '@/types/studio-template.types'
import { buildDefaultConfig, getStudioTemplate } from '@/constants/studio-templates'
import { STUDIO_ANSWER_INK_MONO } from '@/constants/studio.constants'
import { resetObjectCounter } from '../studio-fabric-builders'
import {
  assertObjectsInSafeMargin,
  runGeneratorContractTests,
} from '../studio-generator-test'
import { buildAnswerPage } from '../studio-answer-key'
import { clearStudioRecentContent } from '../studio-variety'
import { sameCard } from '../_shared/playing-card'
import {
  STUDIO_ENTROPY_FLOOR_BITS,
  createRngFromSeedInput,
} from '../_shared/uniqueness'
import {
  agreeingAnswersForPrefix,
  buildNextCardFigure,
  nextCardCanonicalForm,
  nextCardFigureEntropyBits,
  prefixHasUniqueAnswer,
} from './rules'
import {
  nextCardPageEntropyBits,
  nextCardTemplate,
  NEXT_CARD_ARROW_SOURCE,
  NEXT_CARD_MIN_FIGURES,
} from './generate'

const CTX = (over: Partial<StudioGenerateContext> = {}): StudioGenerateContext => ({
  pageWidth: 576,
  pageHeight: 864,
  margin: { top: 36, right: 36, bottom: 36, left: 48 },
  seed: 42,
  instanceId: 'test-run',
  ownerKey: 'user:test',
  ...over,
})

const base = { ...buildDefaultConfig(nextCardTemplate), fontFamily: 'PT Serif' }

const rngFor = (n: number) =>
  createRngFromSeedInput({
    ownerSalt: 'test-salt',
    templateKey: 'next-card',
    configHash: 'test',
    pageNonce: n,
  })

runGeneratorContractTests(nextCardTemplate, {
  configOverrides: { fontFamily: 'PT Serif' },
})

describe('next-card ambiguity (§9.3)', () => {
  it('every printed figure has a single fair answer across the rule pool', () => {
    const trials = 2_000
    let built = 0
    for (let i = 0; i < trials; i++) {
      for (const includeInterleave of [false, true]) {
        const figure = buildNextCardFigure(rngFor(i * 2 + (includeInterleave ? 1 : 0)), {
          prefixLengths: includeInterleave ? [6, 7] : [5, 6],
          includeInterleave,
          answerCount: 1,
          choiceCount: 0,
        })
        if (!figure) continue
        built++
        const answers = agreeingAnswersForPrefix(figure.prefix, {
          answerCount: 1,
          includeInterleave,
        })
        expect(answers.length).toBeGreaterThan(0)
        expect(
          answers.every((answer) =>
            answer.every((card, index) => sameCard(card, figure.answer[index])),
          ),
        ).toBe(true)
        expect(
          prefixHasUniqueAnswer(figure.prefix, { answerCount: 1, includeInterleave }),
        ).toBe(true)
      }
    }
    expect(built).toBeGreaterThan(trials)
  }, 60_000)

  it('rejects prefixes that two rules would answer differently', () => {
    // A♠ 2♠ — R1 k=1 continues to 3♠; R6 (+1, then +2, …) continues to 4♠.
    // Both reproduce the two-card prefix, so the gate must refuse it.
    const ambiguous = [
      { rank: 1 as const, suit: 0 as const },
      { rank: 2 as const, suit: 0 as const },
    ]
    const answers = agreeingAnswersForPrefix(ambiguous, {
      answerCount: 1,
      includeInterleave: false,
    })
    expect(answers.length).toBeGreaterThan(1)
    expect(
      prefixHasUniqueAnswer(ambiguous, { answerCount: 1, includeInterleave: false }),
    ).toBe(false)
  })
})

describe('next-card construction', () => {
  it('builds figures with the requested answer and choice counts', () => {
    for (let i = 0; i < 200; i++) {
      const figure = buildNextCardFigure(rngFor(i + 10_000), {
        prefixLengths: [5, 6],
        includeInterleave: false,
        answerCount: 2,
        choiceCount: 0,
      })
      expect(figure).not.toBeNull()
      expect(figure!.answer).toHaveLength(2)
      expect(figure!.choices).toHaveLength(0)
    }
  })

  it('shuffles the correct card into a multiple-choice strip', () => {
    for (let i = 0; i < 200; i++) {
      const figure = buildNextCardFigure(rngFor(i + 20_000), {
        prefixLengths: [5, 6],
        includeInterleave: false,
        answerCount: 1,
        choiceCount: 3,
      })
      expect(figure).not.toBeNull()
      expect(figure!.choices).toHaveLength(3)
      expect(sameCard(figure!.choices[figure!.correctChoice], figure!.answer[0])).toBe(
        true,
      )
      const ids = new Set(figure!.choices.map((card) => `${card.rank}-${card.suit}`))
      expect(ids.size).toBe(3)
    }
  })
})

describe('next-card entropy (§4.5 / §9.4)', () => {
  it('clears the floor at every tier, and matches the easy report figure', () => {
    expect(nextCardPageEntropyBits(base)).toBeGreaterThanOrEqual(STUDIO_ENTROPY_FLOOR_BITS)
    // Easy × 6 ≈ 59.6 bits (entropy report).
    expect(nextCardPageEntropyBits(base)).toBeCloseTo(59.6, 0)

    for (const tier of ['easy', 'medium', 'hard']) {
      expect(nextCardPageEntropyBits({ ...base, tier })).toBeGreaterThanOrEqual(
        STUDIO_ENTROPY_FLOOR_BITS,
      )
      expect(nextCardTemplate.validateConfig!({ ...base, tier })).toBeNull()
    }
  })

  it('stays far below the floor on a single figure — the reason for the minimum', () => {
    const one = nextCardFigureEntropyBits({
      prefixLengths: [5, 6],
      includeInterleave: false,
      answerCount: 1,
      choiceCount: 0,
    })
    expect(one).toBeLessThan(STUDIO_ENTROPY_FLOOR_BITS)
    // Spec: rule+params × start ≈ 2^10.2; +1 bit for the two prefix lengths.
    expect(one).toBeCloseTo(11.5, 0)
  })

  it('samples many figures without exhausting the space early', () => {
    const seen = new Set<string>()
    const samples = 2_000
    let built = 0
    for (let i = 0; i < samples; i++) {
      const figure = buildNextCardFigure(rngFor(i + 30_000), {
        prefixLengths: [5, 6],
        includeInterleave: false,
        answerCount: 1,
        choiceCount: 0,
      })
      if (!figure) continue
      built++
      seen.add(nextCardCanonicalForm(figure))
    }
    // One figure is only ~2^11.5; expect real variety, not a collapsed corner.
    expect(built).toBeGreaterThan(samples * 0.8)
    expect(seen.size).toBeGreaterThan(800)
  }, 40_000)
})

describe('next-card page', () => {
  beforeEach(() => clearStudioRecentContent())

  it('prints at least the minimum number of sequences', () => {
    resetObjectCounter()
    const [page] = nextCardTemplate.generate(base, CTX())
    const figures = page.objects.filter((o) => o.type === 'group')
    expect(figures.length).toBeGreaterThanOrEqual(NEXT_CARD_MIN_FIGURES)
  })

  it('separator uses path arrows (editor/PDF/SVG match — no Unicode glyphs)', () => {
    resetObjectCounter()
    const [page] = nextCardTemplate.generate(base, CTX())
    const figures = page.objects.filter((o) => o.type === 'group')
    expect(figures.length).toBeGreaterThanOrEqual(NEXT_CARD_MIN_FIGURES)

    for (const figure of figures) {
      const kids = figure.objects ?? []
      const arrows = kids.filter((o) => o.data?.source === NEXT_CARD_ARROW_SOURCE)
      expect(arrows).toHaveLength(1)
      expect(arrows[0].type).toBe('group')
      expect(arrows[0].objects?.every((o) => o.type === 'line')).toBe(true)
      // No Unicode arrows in any text — those diverge under PDF/SVG outline export.
      const texts = kids.filter((o) => o.type === 'textbox')
      expect(texts.every((o) => !/[→←↑↓⟶]/.test(String(o.text ?? '')))).toBe(true)
    }
  })

  it('centers write-in lines on the card mid-height', () => {
    resetObjectCounter()
    const [page] = nextCardTemplate.generate(
      { ...base, answerStyle: 'write' },
      CTX(),
    )
    const figures = page.objects.filter((o) => o.type === 'group')
    expect(figures.length).toBeGreaterThanOrEqual(NEXT_CARD_MIN_FIGURES)

    for (const figure of figures) {
      const kids = figure.objects ?? []
      const cards = kids.filter((o) => o.data?.source === 'playing-card')
      const lines = kids.filter((o) => o.type === 'line')
      expect(cards.length).toBeGreaterThan(0)
      expect(lines.length).toBeGreaterThan(0)

      const card = cards[0]
      const midY = (card.top ?? 0) + (card.height ?? 0) / 2
      for (const line of lines) {
        expect(line.y1).toBeCloseTo(midY, 0)
        expect(line.y2).toBeCloseTo(midY, 0)
      }
    }
  })

  it('write answers use vector suits (editor/PDF match — no Unicode suit glyphs)', () => {
    resetObjectCounter()
    const [page] = nextCardTemplate.generate(
      { ...base, answerStyle: 'write' },
      CTX(),
    )
    const figures = page.objects.filter((o) => o.type === 'group')
    expect(figures.length).toBeGreaterThanOrEqual(NEXT_CARD_MIN_FIGURES)

    for (const figure of figures) {
      const kids = figure.objects ?? []
      const answers = kids.filter((o) => o.studioRole === 'answer')
      expect(answers.length).toBeGreaterThan(0)
      expect(answers.some((o) => o.type === 'textbox')).toBe(true)
      expect(answers.some((o) => o.type === 'polygon')).toBe(true)
      // Unicode suits look fine via canvas fallback; PDF outline export shows "?".
      const texts = answers.filter((o) => o.type === 'textbox')
      expect(texts.every((o) => !/[♠♥♦♣]/.test(String(o.text ?? '')))).toBe(true)
    }
  })

  it('keeps equal card height across rows when prefix lengths differ (multiple choice)', () => {
    resetObjectCounter()
    // Medium allows 5–7 card prefixes; size from the longest so short rows
    // do not print taller cards.
    const [page] = nextCardTemplate.generate(
      { ...base, answerStyle: 'multipleChoice', tier: 'medium' },
      CTX(),
    )
    const figures = page.objects.filter((o) => o.type === 'group')
    const heights = new Set<number>()

    for (const figure of figures) {
      const kids = figure.objects ?? []
      const cards = kids.filter((o) => o.data?.source === 'playing-card')
      expect(cards.length).toBeGreaterThan(0)
      for (const card of cards) {
        heights.add(Math.round((card.height ?? 0) * 100) / 100)
      }
    }

    expect(heights.size).toBe(1)
  })

  it('does not stack sequence rows when 8-up draw asks for two answers', () => {
    // Wide trim used to size cards from the full body height, so 8 bands
    // were shorter than the cards and neighbouring sequences overlapped.
    resetObjectCounter()
    const ctx = CTX({
      pageWidth: 900,
      pageHeight: 900,
      margin: { top: 40, right: 40, bottom: 40, left: 40 },
    })
    const [page] = nextCardTemplate.generate(
      {
        ...base,
        tier: 'easy',
        answerStyle: 'draw',
        answerCount: 2,
        figuresPerPage: 8,
      },
      ctx,
    )
    const figures = page.objects.filter((o) => o.type === 'group')
    expect(figures).toHaveLength(8)

    let minGap = Infinity
    for (let i = 0; i < figures.length - 1; i++) {
      const current = figures[i]
      const next = figures[i + 1]
      const gap =
        (next.top ?? 0) - ((current.top ?? 0) + (current.height ?? 0))
      minGap = Math.min(minGap, gap)
    }
    expect(minGap).toBeGreaterThanOrEqual(8)
  })

  it('keeps every answer style clear of the safe-area guides (not flush)', () => {
    const minClearance = 10
    for (const answerStyle of ['draw', 'write', 'multipleChoice'] as const) {
      for (const seed of [1, 7, 42, 99]) {
        clearStudioRecentContent()
        resetObjectCounter()
        const ctx = CTX({ seed, instanceId: `next-clearance-${answerStyle}-${seed}` })
        const [page] = nextCardTemplate.generate(
          { ...base, answerStyle, tier: 'hard', figuresPerPage: 8, seed },
          ctx,
        )
        assertObjectsInSafeMargin(page.objects, ctx)
        const key = buildAnswerPage(page.answerSourceObjects!, STUDIO_ANSWER_INK_MONO)
        assertObjectsInSafeMargin(key, ctx)
        for (const objects of [page.objects, key]) {
          const figures = objects.filter((o) => o.type === 'group')
          expect(figures.length).toBeGreaterThanOrEqual(NEXT_CARD_MIN_FIGURES)
          for (const figure of figures) {
            expect(figure.left!).toBeGreaterThanOrEqual(ctx.margin.left + minClearance)
            expect(figure.top!).toBeGreaterThanOrEqual(ctx.margin.top + minClearance)
            expect(figure.left! + figure.width!).toBeLessThanOrEqual(
              ctx.pageWidth - ctx.margin.right - minClearance,
            )
            expect(figure.top! + figure.height!).toBeLessThanOrEqual(
              ctx.pageHeight - ctx.margin.bottom - minClearance,
            )
          }
        }
      }
    }
  })

  it('centers the sequence stack in the answer-key body', () => {
    resetObjectCounter()
    // Letter trim + few sequences: pack height is well under the body, so a
    // top-stuck layout would miss the content midline by a wide margin.
    const ctx = CTX({
      pageWidth: 816,
      pageHeight: 1056,
      margin: { top: 48, right: 48, bottom: 48, left: 96 },
    })
    const [page] = nextCardTemplate.generate(
      { ...base, figuresPerPage: 6, answerStyle: 'draw' },
      ctx,
    )
    expect(page.answerSourceObjects).toBeDefined()
    const key = buildAnswerPage(page.answerSourceObjects!, STUDIO_ANSWER_INK_MONO)
    const figures = key.filter((o) => o.type === 'group')
    expect(figures.length).toBe(6)
    const top = Math.min(...figures.map((f) => f.top!))
    const bottom = Math.max(...figures.map((f) => f.top! + f.height!))
    const stackCenterY = (top + bottom) / 2
    const contentCenterY = (ctx.margin.top + ctx.pageHeight - ctx.margin.bottom) / 2
    expect(Math.abs(stackCenterY - contentCenterY)).toBeLessThan(
      (ctx.pageHeight - ctx.margin.top - ctx.margin.bottom) * 0.12,
    )
  })

  it('is registered as a card-tagged logic template', () => {
    const registered = getStudioTemplate('next-card')!
    expect(registered.category).toBe('logic')
    expect(registered.tags).toContain('card')
    expect(registered.producesAnswerKey).toBe(true)
  })
})
