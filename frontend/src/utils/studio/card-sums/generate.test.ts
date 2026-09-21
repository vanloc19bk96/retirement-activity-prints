import { describe, it, expect, beforeEach } from 'vitest'
import type { StudioFabricObject, StudioGenerateContext } from '@/types/studio-template.types'
import { buildDefaultConfig, getStudioTemplate } from '@/constants/studio-templates'
import { STUDIO_ANSWER_INK_MONO } from '@/constants/studio.constants'
import { resetObjectCounter } from '../studio-fabric-builders'
import { assertObjectsInSafeMargin, runGeneratorContractTests } from '../studio-generator-test'
import { buildAnswerPage, harvestAnswers } from '../studio-answer-key'
import { clearStudioRecentContent } from '../studio-variety'
import { cardIndex, cardValue } from '../_shared/playing-card'
import {
  STUDIO_ENTROPY_FLOOR_BITS,
  createRngFromSeedInput,
} from '../_shared/uniqueness'
import {
  LADDER_MAX_TOTAL,
  LADDER_MIN_TOTAL,
  buildRowTotals,
  buildRunningLadder,
  buildTargetHunt,
  cardSumsCanonicalForm,
  subsetsHittingTarget,
} from './build'
import { cardSumsPageEntropyBits, cardSumsTemplate } from './generate'

const CTX = (over: Partial<StudioGenerateContext> = {}): StudioGenerateContext => ({
  pageWidth: 576,
  pageHeight: 864,
  margin: { top: 36, right: 36, bottom: 36, left: 48 },
  seed: 42,
  instanceId: 'test-run',
  ownerKey: 'user:test',
  ...over,
})

const base = { ...buildDefaultConfig(cardSumsTemplate), fontFamily: 'PT Serif' }

const rngFor = (n: number) =>
  createRngFromSeedInput({
    ownerSalt: 'test-salt',
    templateKey: 'card-sums',
    configHash: 'test',
    pageNonce: n,
  })

function flatten(objects: StudioFabricObject[]): StudioFabricObject[] {
  return objects.flatMap((o) => (o.objects ? [o, ...flatten(o.objects)] : [o]))
}

runGeneratorContractTests(cardSumsTemplate, { configOverrides: { fontFamily: 'PT Serif' } })

describe('card values', () => {
  it('scores A low and the court cards high, or all ten', () => {
    expect(cardValue({ rank: 1, suit: 0 })).toBe(1)
    expect(cardValue({ rank: 10, suit: 0 })).toBe(10)
    expect(cardValue({ rank: 11, suit: 0 })).toBe(11)
    expect(cardValue({ rank: 13, suit: 0 })).toBe(13)
    expect(cardValue({ rank: 13, suit: 0 }, 'ten')).toBe(10)
    expect(cardValue({ rank: 9, suit: 0 }, 'ten')).toBe(9)
  })
})

describe('row totals (§6.4 mode A)', () => {
  it('prints a total that is the independent sum of its row', () => {
    for (let i = 0; i < 300; i++) {
      const courtValue = i % 2 === 0 ? 'face' : 'ten'
      const figure = buildRowTotals(rngFor(i), {
        rowCount: 5,
        cardsPerRow: 4,
        courtValue,
      })
      for (const row of figure.rows) {
        let sum = 0
        for (const card of row.cards) sum += cardValue(card, courtValue)
        expect(row.total).toBe(sum)
      }
    }
  })

  it('never repeats a card on the page', () => {
    for (let i = 0; i < 200; i++) {
      const figure = buildRowTotals(rngFor(i + 700), {
        rowCount: 6,
        cardsPerRow: 5,
        courtValue: 'face',
      })
      const all = figure.rows.flatMap((row) => row.cards).map(cardIndex)
      expect(new Set(all).size).toBe(all.length)
    }
  })
})

describe('target hunt (§6.4 mode B) — the uniqueness check', () => {
  it('finds every subset that hits a target', () => {
    // 1 + 4 = 5 and 2 + 3 = 5: two solutions, which the search must report.
    expect(subsetsHittingTarget([1, 2, 3, 4], 2, 5)).toHaveLength(2)
    expect(subsetsHittingTarget([1, 2, 3, 4], 2, 7)).toEqual([[2, 3]])
    expect(subsetsHittingTarget([1, 2, 3, 4], 2, 20)).toHaveLength(0)
  })

  it('only ever emits a spread with exactly one solution', () => {
    for (let i = 0; i < 400; i++) {
      const courtValue = i % 3 === 0 ? 'ten' : 'face'
      const pickCount = (i % 3) + 2
      const figure = buildTargetHunt(rngFor(i), {
        cardCount: 10,
        pickCount,
        courtValue,
      })
      expect(figure).not.toBeNull()
      const values = figure!.cards.map((card) => cardValue(card, courtValue))
      // Independent re-solve, not the generator's own bookkeeping (§9.2).
      const hits = subsetsHittingTarget(values, pickCount, figure!.target)
      expect(hits).toHaveLength(1)
      expect(hits[0]).toEqual(figure!.answer)
      expect(
        figure!.answer.reduce((sum, index) => sum + values[index], 0),
      ).toBe(figure!.target)
    }
  }, 30_000)
})

describe('running ladder (§6.4 mode C)', () => {
  it('keeps the running total inside the band by construction', () => {
    for (let i = 0; i < 400; i++) {
      const courtValue = i % 2 === 0 ? 'face' : 'ten'
      const figure = buildRunningLadder(rngFor(i), { length: 10, courtValue })
      let total = 0
      figure.cards.forEach((card, index) => {
        total += figure.signs[index] * cardValue(card, courtValue)
        expect(total).toBeGreaterThanOrEqual(LADDER_MIN_TOTAL)
        expect(total).toBeLessThanOrEqual(LADDER_MAX_TOTAL)
        expect(figure.runningTotals[index]).toBe(total)
      })
    }
  })

  it('opens with an addition and mixes signs afterwards', () => {
    let mixed = 0
    for (let i = 0; i < 200; i++) {
      const figure = buildRunningLadder(rngFor(i + 400), { length: 8, courtValue: 'face' })
      expect(figure.signs[0]).toBe(1)
      if (figure.signs.includes(-1)) mixed++
    }
    expect(mixed / 200).toBeGreaterThan(0.9)
  })
})

describe('card-sums entropy (§4.5 / §9.4)', () => {
  it('clears the floor for every mode at every tier', () => {
    for (const mode of ['rowTotals', 'targetHunt', 'runningLadder']) {
      for (const tier of ['warmup', 'easy', 'medium', 'hard']) {
        const config = { ...base, mode, tier }
        expect(cardSumsPageEntropyBits(config)).toBeGreaterThanOrEqual(
          STUDIO_ENTROPY_FLOOR_BITS,
        )
        expect(cardSumsTemplate.validateConfig!(config)).toBeNull()
      }
    }
  })

  it('samples 10,000 row-total figures without a canonical collision', () => {
    const seen = new Set<string>()
    const samples = 10_000
    for (let i = 0; i < samples; i++) {
      seen.add(
        cardSumsCanonicalForm(
          buildRowTotals(rngFor(i), { rowCount: 5, cardsPerRow: 3, courtValue: 'face' }),
        ),
      )
    }
    expect(samples - seen.size).toBe(0)
  }, 30_000)
})

describe('card-sums page', () => {
  beforeEach(() => clearStudioRecentContent())

  it('prints one hidden total per row', () => {
    resetObjectCounter()
    const [page] = cardSumsTemplate.generate({ ...base, mode: 'rowTotals' }, CTX())
    const answers = harvestAnswers(page.objects)
    // Easy presets five rows; medium cards may clamp to four on letter.
    expect(answers.length).toBeGreaterThanOrEqual(4)
    expect(answers.length).toBeLessThanOrEqual(5)
    expect(answers.every((a) => a.visible === false)).toBe(true)
    expect(answers.every((a) => Number.isFinite(Number(a.text)))).toBe(true)
  })

  it('rings exactly the target-hunt answer cards', () => {
    resetObjectCounter()
    const [page] = cardSumsTemplate.generate({ ...base, mode: 'targetHunt' }, CTX())
    const answers = harvestAnswers(page.objects)
    expect(answers).toHaveLength(3)
    const key = buildAnswerPage(page.answerSourceObjects!, STUDIO_ANSWER_INK_MONO)
    expect(harvestAnswers(key).every((o) => o.visible === true)).toBe(true)
  })

  it('prints one final total for the ladder', () => {
    resetObjectCounter()
    const [page] = cardSumsTemplate.generate({ ...base, mode: 'runningLadder' }, CTX())
    const answers = harvestAnswers(page.objects)
    expect(answers).toHaveLength(1)
    const total = Number(answers[0].text)
    expect(total).toBeGreaterThanOrEqual(LADDER_MIN_TOTAL)
    expect(total).toBeLessThanOrEqual(LADDER_MAX_TOTAL)
  })

  it('renders ladder operators as shapes, not +/− text glyphs', () => {
    resetObjectCounter()
    const [page] = cardSumsTemplate.generate({ ...base, mode: 'runningLadder' }, CTX())
    const texts = flatten(page.objects)
      .filter((o) => typeof o.text === 'string')
      .map((o) => String(o.text).trim())
    expect(texts.some((t) => t === '+' || t === '−' || t === '-')).toBe(false)
  })

  it('folds card values into the instruction when asked', () => {
    const instructionText = (showValueKey: boolean) => {
      clearStudioRecentContent()
      resetObjectCounter()
      const [page] = cardSumsTemplate.generate({ ...base, showValueKey }, CTX())
      return flatten(page.objects)
        .filter((o) => typeof o.text === 'string')
        .map((o) => String(o.text))
        .join(' ')
    }
    expect(instructionText(true)).toMatch(/Ace/i)
    expect(instructionText(true)).toMatch(/Jack/i)
    expect(instructionText(false)).not.toMatch(/Ace is worth|Ace as 1|Ace equals/i)
  })

  it('omits the value sentence from the answer page and centers the figure', () => {
    resetObjectCounter()
    const ctx = CTX()
    const [page] = cardSumsTemplate.generate(
      { ...base, showValueKey: true, title: 'Game 1' },
      ctx,
    )
    expect(page.answerSourceObjects?.length).toBeGreaterThan(0)
    const key = buildAnswerPage(page.answerSourceObjects!, STUDIO_ANSWER_INK_MONO, {
      contentWidth: ctx.pageWidth - ctx.margin.left - ctx.margin.right,
    })
    const keyText = flatten(key)
      .filter((o) => typeof o.text === 'string')
      .map((o) => String(o.text))
      .join(' ')
    expect(keyText).not.toMatch(/Ace is worth|Ace as 1|Ace equals|Jack is 11/i)

    const figure = key.find((o) => o.type === 'group' && (o.objects?.length ?? 0) > 3)!
    expect(figure).toBeDefined()
    assertObjectsInSafeMargin(key, ctx)

    const safeTop = ctx.margin.top
    const safeBottom = ctx.pageHeight - ctx.margin.bottom
    // Pack-and-center: must not stretch to the full safe column on a key page.
    expect(figure.height!).toBeLessThan((safeBottom - safeTop) * 0.92)

    const bodyTop = safeTop + 40 // below a normal title strip
    const bodyBottom = safeBottom
    const bodyCenterY = (bodyTop + bodyBottom) / 2
    const figureCenterY = figure.top! + figure.height! / 2
    expect(figureCenterY).toBeLessThan(bodyCenterY + (bodyBottom - bodyTop) * 0.2)
    expect(figureCenterY).toBeGreaterThan(bodyCenterY - (bodyBottom - bodyTop) * 0.25)
  })

  it('generates every mode and tier inside the safe margin', () => {
    const ctx = CTX()
    for (const mode of ['rowTotals', 'targetHunt', 'runningLadder']) {
      for (const tier of ['warmup', 'easy', 'medium', 'hard']) {
        for (const courtValue of ['face', 'ten']) {
          clearStudioRecentContent()
          resetObjectCounter()
          const [page] = cardSumsTemplate.generate(
            { ...base, mode, tier, courtValue, title: 'Game 1' },
            ctx,
          )
          assertObjectsInSafeMargin(page.objects, ctx)
          assertObjectsInSafeMargin(
            buildAnswerPage(page.answerSourceObjects!, STUDIO_ANSWER_INK_MONO, {
              contentWidth: ctx.pageWidth - ctx.margin.left - ctx.margin.right,
            }),
            ctx,
          )
        }
      }
    }
  }, 60_000)

  it('keeps the hard running ladder clear of the safe-area guides', () => {
    // Shared CARD_FIGURE_EDGE_INSET — same air as Next Card.
    // Full-width ladders must not sit flush on the guide.
    const minClearance = 18
    for (const seed of [1, 7, 42, 99]) {
      clearStudioRecentContent()
      resetObjectCounter()
      const ctx = CTX({ seed, instanceId: `sums-clearance-${seed}` })
      const [page] = cardSumsTemplate.generate(
        {
          ...base,
          mode: 'runningLadder',
          tier: 'hard',
          courtValue: 'face',
          title: 'Game 1',
          seed,
        },
        ctx,
      )
      const figure = page.objects.find((o) => o.type === 'group')!
      expect(figure.left!).toBeGreaterThanOrEqual(ctx.margin.left + minClearance)
      expect(figure.left! + figure.width!).toBeLessThanOrEqual(
        ctx.pageWidth - ctx.margin.right - minClearance,
      )

      const key = buildAnswerPage(page.answerSourceObjects!, STUDIO_ANSWER_INK_MONO, {
        contentWidth: ctx.pageWidth - ctx.margin.left - ctx.margin.right,
      })
      const keyFigure = key.find((o) => o.type === 'group' && (o.objects?.length ?? 0) > 3)!
      expect(keyFigure.left!).toBeGreaterThanOrEqual(ctx.margin.left + minClearance)
      expect(keyFigure.left! + keyFigure.width!).toBeLessThanOrEqual(
        ctx.pageWidth - ctx.margin.right - minClearance,
      )
    }
  })

  it('omits the card-size control', () => {
    const keys = cardSumsTemplate.configSchema.map((field) => field.key)
    expect(keys).not.toContain('cardSize')
  })

  it('is registered as a card-tagged logic template', () => {
    const registered = getStudioTemplate('card-sums')!
    expect(registered.category).toBe('logic')
    expect(registered.tags).toContain('card')
    expect(registered.producesAnswerKey).toBe(true)
  })
})
