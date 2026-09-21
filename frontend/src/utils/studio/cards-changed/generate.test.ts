import { describe, it, expect, beforeEach } from 'vitest'
import type { StudioFabricObject, StudioGenerateContext } from '@/types/studio-template.types'
import { buildDefaultConfig, getStudioTemplate } from '@/constants/studio-templates'
import { CARDS_CHANGED_SPREAD_LABELS } from '@/constants/studio-phrasing'
import { STUDIO_ANSWER_INK_MONO } from '@/constants/studio.constants'
import { resetObjectCounter } from '../studio-fabric-builders'
import {
  assertObjectsInSafeMargin,
  runGeneratorContractTests,
} from '../studio-generator-test'
import { buildAnswerPage, harvestAnswers } from '../studio-answer-key'
import { clearStudioRecentContent } from '../studio-variety'
import { cardIndex } from '../_shared/playing-card'
import {
  STUDIO_ENTROPY_FLOOR_BITS,
  createRngFromSeedInput,
} from '../_shared/uniqueness'
import {
  buildCardsChangedFigure,
  cardsChangedCanonicalForm,
  type CardChangeType,
} from './build'
import { cardsChangedPageEntropyBits, cardsChangedTemplate } from './generate'

const CTX = (over: Partial<StudioGenerateContext> = {}): StudioGenerateContext => ({
  pageWidth: 576,
  pageHeight: 864,
  margin: { top: 36, right: 36, bottom: 36, left: 48 },
  seed: 42,
  instanceId: 'test-run',
  ownerKey: 'user:test',
  ...over,
})

const base = { ...buildDefaultConfig(cardsChangedTemplate), fontFamily: 'PT Serif' }

const rngFor = (n: number) =>
  createRngFromSeedInput({
    ownerSalt: 'test-salt',
    templateKey: 'cards-changed',
    configHash: 'test',
    pageNonce: n,
  })

function flatten(objects: StudioFabricObject[]): StudioFabricObject[] {
  return objects.flatMap((o) => (o.objects ? [o, ...flatten(o.objects)] : [o]))
}

runGeneratorContractTests(cardsChangedTemplate, {
  configOverrides: { fontFamily: 'PT Serif' },
})

describe('cards-changed construction', () => {
  const allTypes: CardChangeType[] = ['rank', 'suit', 'swap']

  it('marks exactly the cells that differ — recomputed, not trusted', () => {
    for (let i = 0; i < 300; i++) {
      const figure = buildCardsChangedFigure(rngFor(i), {
        cardCount: 12,
        changeCount: 3,
        changeTypes: allTypes,
        cols: 4,
      })
      const recomputed = figure.before.map((cell, index) => {
        const after = figure.after[index]
        return cardIndex(cell.card) !== cardIndex(after.card)
      })
      expect(figure.changed).toEqual(recomputed)
    }
  })

  it('changes at least the requested number of cells', () => {
    for (let i = 0; i < 200; i++) {
      const figure = buildCardsChangedFigure(rngFor(i + 500), {
        cardCount: 12,
        changeCount: 3,
        changeTypes: ['rank', 'suit'],
        cols: 4,
      })
      expect(figure.changed.filter(Boolean).length).toBe(3)
    }
  })

  it('never introduces a duplicate card into the After spread', () => {
    for (let i = 0; i < 200; i++) {
      const figure = buildCardsChangedFigure(rngFor(i + 900), {
        cardCount: 12,
        changeCount: 4,
        changeTypes: ['rank', 'suit'],
        cols: 4,
      })
      const faces = figure.after.map((c) => cardIndex(c.card))
      expect(new Set(faces).size).toBe(faces.length)
    }
  })

  it('spreads the changes instead of clustering them', () => {
    let clustered = 0
    const trials = 200
    for (let i = 0; i < trials; i++) {
      const cols = 4
      const figure = buildCardsChangedFigure(rngFor(i + 1300), {
        cardCount: 12,
        changeCount: 3,
        changeTypes: ['rank', 'suit'],
        cols,
      })
      const marked = figure.changed
        .map((flag, index) => (flag ? index : -1))
        .filter((index) => index >= 0)
      const adjacent = marked.some((a, i2) =>
        marked.slice(i2 + 1).some((b) => {
          const dr = Math.abs(Math.floor(a / cols) - Math.floor(b / cols))
          const dc = Math.abs((a % cols) - (b % cols))
          return dr + dc <= 1
        }),
      )
      if (adjacent) clustered++
    }
    // A 4x3 grid with three changes always has a spread solution; the relaxed
    // fallback should essentially never fire.
    expect(clustered / trials).toBeLessThan(0.02)
  })

  it('honours rank-only changes', () => {
    for (let i = 0; i < 120; i++) {
      const figure = buildCardsChangedFigure(rngFor(i + 2000), {
        cardCount: 12,
        changeCount: 3,
        changeTypes: ['rank'],
        cols: 4,
      })
      figure.after.forEach((cell, index) => {
        if (!figure.changed[index]) {
          expect(cardIndex(cell.card)).toBe(cardIndex(figure.before[index].card))
          return
        }
        expect(cell.card.suit).toBe(figure.before[index].card.suit)
        expect(cell.card.rank).not.toBe(figure.before[index].card.rank)
      })
    }
  })
})

describe('cards-changed canonical form', () => {
  it('collapses a turned grid', () => {
    const figure = buildCardsChangedFigure(rngFor(11), {
      cardCount: 9,
      changeCount: 3,
      changeTypes: ['rank', 'suit'],
      cols: 3,
    })
    const turn = <T,>(cells: readonly T[]): T[] => {
      const out: T[] = []
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) out.push(cells[(2 - c) * 3 + r])
      }
      return out
    }
    const turned = {
      ...figure,
      before: turn(figure.before),
      after: turn(figure.after),
      changed: turn(figure.changed),
    }
    expect(cardsChangedCanonicalForm(turned)).toBe(cardsChangedCanonicalForm(figure))
  })
})

describe('cards-changed entropy (§4.5 / §9.4)', () => {
  it('clears the floor at every tier', () => {
    for (const tier of ['easy', 'medium', 'hard']) {
      expect(cardsChangedPageEntropyBits({ ...base, tier })).toBeGreaterThanOrEqual(
        STUDIO_ENTROPY_FLOOR_BITS,
      )
      expect(cardsChangedTemplate.validateConfig!({ ...base, tier })).toBeNull()
    }
  })

  it('samples 20,000 figures without a canonical collision', () => {
    const seen = new Set<string>()
    const samples = 20_000
    for (let i = 0; i < samples; i++) {
      seen.add(
        cardsChangedCanonicalForm(
          buildCardsChangedFigure(rngFor(i), {
            cardCount: 9,
            changeCount: 3,
            changeTypes: ['rank', 'suit'],
            cols: 3,
          }),
        ),
      )
    }
    expect(samples - seen.size).toBe(0)
  }, 40_000)
})

describe('cards-changed page', () => {
  beforeEach(() => clearStudioRecentContent())

  it('prints two spreads and one hidden ring per change', () => {
    resetObjectCounter()
    const [page] = cardsChangedTemplate.generate(base, CTX())
    const cards = flatten(page.objects).filter((o) => o.data?.source === 'playing-card')
    // Easy asks for 9; ring-clearance gutters may clamp on a tight trim.
    expect(cards.length % 2).toBe(0)
    expect(cards.length / 2).toBeGreaterThanOrEqual(4)
    expect(cards.length / 2).toBeLessThanOrEqual(9)
    const answers = harvestAnswers(page.objects)
    expect(answers).toHaveLength(3)
    expect(answers.every((a) => a.visible === false)).toBe(true)
  })

  it('shows only the After spread on the solution page', () => {
    resetObjectCounter()
    const [page] = cardsChangedTemplate.generate(base, CTX())
    const puzzleCards = flatten(page.objects).filter((o) => o.data?.source === 'playing-card')
    const perSpread = puzzleCards.length / 2
    const key = buildAnswerPage(page.answerSourceObjects!, STUDIO_ANSWER_INK_MONO)
    const cards = flatten(key).filter((o) => o.data?.source === 'playing-card')
    expect(cards.length).toBe(perSpread)
    const rings = harvestAnswers(key)
    expect(rings).toHaveLength(3)
    expect(rings.every((r) => r.stroke === STUDIO_ANSWER_INK_MONO)).toBe(true)
    expect(rings.every((r) => r.visible === true)).toBe(true)
    // No Before/After section label on the key — the rings are the answer.
    const labels = new Set(
      flatten(key)
        .filter((o) => typeof o.text === 'string')
        .map((o) => String(o.text)),
    )
    for (const pair of CARDS_CHANGED_SPREAD_LABELS) {
      expect(labels.has(pair.before)).toBe(false)
      expect(labels.has(pair.after)).toBe(false)
    }
  })

  it('keeps answer rings from overlapping neighbouring cards', () => {
    resetObjectCounter()
    const [page] = cardsChangedTemplate.generate(
      { ...base, tier: 'hard', changeTypes: ['rank', 'suit', 'swap'] },
      CTX(),
    )
    const key = buildAnswerPage(page.answerSourceObjects!, STUDIO_ANSWER_INK_MONO)
    const rings = harvestAnswers(key)
    expect(rings.length).toBeGreaterThanOrEqual(2)
    for (let i = 0; i < rings.length; i++) {
      for (let j = i + 1; j < rings.length; j++) {
        const a = rings[i]
        const b = rings[j]
        const aRight = (a.left ?? 0) + (a.width ?? 0)
        const aBottom = (a.top ?? 0) + (a.height ?? 0)
        const bRight = (b.left ?? 0) + (b.width ?? 0)
        const bBottom = (b.top ?? 0) + (b.height ?? 0)
        const separated =
          aRight <= (b.left ?? 0) + 0.01 ||
          bRight <= (a.left ?? 0) + 0.01 ||
          aBottom <= (b.top ?? 0) + 0.01 ||
          bBottom <= (a.top ?? 0) + 0.01
        expect(separated).toBe(true)
      }
    }
  })

  it('centers the After spread in the answer-key body', () => {
    resetObjectCounter()
    const ctx = CTX()
    const [page] = cardsChangedTemplate.generate(
      { ...base, tier: 'hard', changeTypes: ['rank', 'suit', 'swap'] },
      ctx,
    )
    const key = buildAnswerPage(page.answerSourceObjects!, STUDIO_ANSWER_INK_MONO)
    const figure = key.find((o) => o.type === 'group')!
    const contentLeft = ctx.margin.left
    const contentRight = ctx.pageWidth - ctx.margin.right
    const contentTop = ctx.margin.top
    const contentBottom = ctx.pageHeight - ctx.margin.bottom
    const contentCenterX = (contentLeft + contentRight) / 2
    const contentCenterY = (contentTop + contentBottom) / 2
    const figureCenterX = figure.left! + figure.width! / 2
    const figureCenterY = figure.top! + figure.height! / 2
    // Horizontal: shrink-wrapped pack must sit on the content midline.
    expect(Math.abs(figureCenterX - contentCenterX)).toBeLessThan(8)
    // Vertical: must not sit in the lower half where the puzzle-page After band lived.
    expect(figureCenterY).toBeLessThan(contentCenterY + (contentBottom - contentTop) * 0.15)
    expect(figureCenterY).toBeGreaterThan(contentCenterY - (contentBottom - contentTop) * 0.25)
  })

  it('generates every tier and change mix inside the safe margin', () => {
    const ctx = CTX()
    for (const tier of ['easy', 'medium', 'hard']) {
      for (const changeTypes of [
        ['rank'],
        ['suit'],
        ['swap', 'rank'],
        ['rank', 'suit', 'swap'],
      ]) {
        clearStudioRecentContent()
        resetObjectCounter()
        const [page] = cardsChangedTemplate.generate({ ...base, tier, changeTypes }, ctx)
        assertObjectsInSafeMargin(page.objects, ctx)
        const key = buildAnswerPage(page.answerSourceObjects!, STUDIO_ANSWER_INK_MONO)
        assertObjectsInSafeMargin(key, ctx)
      }
    }
  }, 60_000)

  it('keeps the figure clear of the safe-area guides (not flush)', () => {
    // Card borders used to sit ~6px from the margin guide and read as outside
    // on bulk books. Require real air on every side of the puzzle group.
    const minClearance = 10
    for (const seed of [1, 7, 42, 99]) {
      clearStudioRecentContent()
      resetObjectCounter()
      const ctx = CTX({ seed, instanceId: `clearance-${seed}` })
      const [page] = cardsChangedTemplate.generate(
        { ...base, tier: 'hard', changeTypes: ['rank', 'suit', 'swap'], seed },
        ctx,
      )
      const figure = page.objects.find((o) => o.type === 'group')!
      expect(figure.left!).toBeGreaterThanOrEqual(ctx.margin.left + minClearance)
      expect(figure.top!).toBeGreaterThanOrEqual(ctx.margin.top + minClearance)
      expect(figure.left! + figure.width!).toBeLessThanOrEqual(
        ctx.pageWidth - ctx.margin.right - minClearance,
      )
      expect(figure.top! + figure.height!).toBeLessThanOrEqual(
        ctx.pageHeight - ctx.margin.bottom - minClearance,
      )

      const key = buildAnswerPage(page.answerSourceObjects!, STUDIO_ANSWER_INK_MONO)
      const keyFigure = key.find((o) => o.type === 'group')!
      expect(keyFigure.left!).toBeGreaterThanOrEqual(ctx.margin.left + minClearance)
      expect(keyFigure.left! + keyFigure.width!).toBeLessThanOrEqual(
        ctx.pageWidth - ctx.margin.right - minClearance,
      )
    }
  })

  it('omits the card-size control', () => {
    const keys = cardsChangedTemplate.configSchema.map((field) => field.key)
    expect(keys).not.toContain('cardSize')
  })

  it('offers Hard as 12 cards with 4 changes — not an unprintable 16', () => {
    const tier = cardsChangedTemplate.configSchema.find((f) => f.key === 'tier')
    expect(tier?.options?.find((o) => o.value === 'hard')?.label).toMatch(/12 cards, 4 changes/)
    resetObjectCounter()
    // Letter-class trim: large enough to hold the Hard count without clamping.
    const ctx = CTX({
      pageWidth: 816,
      pageHeight: 1056,
      margin: { top: 48, right: 48, bottom: 48, left: 96 },
    })
    const [page] = cardsChangedTemplate.generate(
      { ...base, tier: 'hard', changeTypes: ['rank', 'suit', 'swap'] },
      ctx,
    )
    const cards = flatten(page.objects).filter((o) => o.data?.source === 'playing-card')
    expect(cards.length / 2).toBe(12)
    expect(harvestAnswers(page.objects)).toHaveLength(4)
  })

  it('keeps rank changes always on and out of the form', () => {
    const field = cardsChangedTemplate.configSchema.find((f) => f.key === 'changeTypes')
    expect(field?.type).toBe('multiSelect')
    expect(field?.options?.map((o) => o.value)).toEqual(['suit', 'swap'])
    expect(field?.default).toEqual(['suit'])
    // Suit-only (and empty) configs still clear the floor because rank is forced.
    expect(cardsChangedTemplate.validateConfig!({ ...base, changeTypes: ['suit'] })).toBeNull()
    expect(cardsChangedTemplate.validateConfig!({ ...base, changeTypes: [] })).toBeNull()
    expect(cardsChangedTemplate.validateConfig!({ ...base, changeTypes: ['swap'] })).toBeNull()
  })

  it('is registered as a card-tagged memory template', () => {
    const registered = getStudioTemplate('cards-changed')!
    expect(registered.category).toBe('memory')
    expect(registered.tags).toContain('card')
    expect(registered.producesAnswerKey).toBe(true)
  })
})
