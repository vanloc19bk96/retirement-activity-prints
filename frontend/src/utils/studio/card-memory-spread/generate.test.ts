import { describe, it, expect, beforeEach } from 'vitest'
import type { StudioFabricObject, StudioGenerateContext } from '@/types/studio-template.types'
import { buildDefaultConfig, getStudioTemplate } from '@/constants/studio-templates'
import { resetObjectCounter } from '../studio-fabric-builders'
import { runGeneratorContractTests } from '../studio-generator-test'
import { harvestAnswers } from '../studio-answer-key'
import { clearStudioRecentContent } from '../studio-variety'
import { objectExtent } from '../studio-object-bounds'
import { cardIndex } from '../_shared/playing-card'
import { CARD_LABEL_FIGURE_GAP } from '../_shared/card-page'
import {
  STUDIO_ENTROPY_FLOOR_BITS,
  createRngFromSeedInput,
} from '../_shared/uniqueness'
import { buildCardMemoryFigure, cardMemoryCanonicalForm } from './build'
import { cardMemoryPageEntropyBits, cardMemorySpreadTemplate } from './generate'

const CTX = (over: Partial<StudioGenerateContext> = {}): StudioGenerateContext => ({
  pageWidth: 576,
  pageHeight: 864,
  margin: { top: 36, right: 36, bottom: 36, left: 48 },
  seed: 42,
  instanceId: 'test-run',
  ownerKey: 'user:test',
  ...over,
})

const base = { ...buildDefaultConfig(cardMemorySpreadTemplate), fontFamily: 'PT Serif' }

const rngFor = (n: number) =>
  createRngFromSeedInput({
    ownerSalt: 'test-salt',
    templateKey: 'card-memory-spread',
    configHash: 'test',
    pageNonce: n,
  })

function flatten(objects: StudioFabricObject[]): StudioFabricObject[] {
  return objects.flatMap((o) => (o.objects ? [o, ...flatten(o.objects)] : [o]))
}

const cardCount = (objects: StudioFabricObject[]): number =>
  flatten(objects).filter((o) => o.data?.source === 'playing-card').length

runGeneratorContractTests(cardMemorySpreadTemplate, {
  configOverrides: { fontFamily: 'PT Serif' },
})

describe('card-memory-spread construction', () => {
  it('never repeats a card inside the studied spread', () => {
    for (let i = 0; i < 200; i++) {
      const figure = buildCardMemoryFigure(rngFor(i), { studiedCount: 12 })
      const indices = figure.studied.map(cardIndex)
      expect(new Set(indices).size).toBe(indices.length)
    }
  })
})

describe('card-memory-spread entropy (§4.5 / §9.4)', () => {
  it('clears the floor at every tier', () => {
    for (const tier of ['easy', 'medium', 'hard']) {
      const config = { ...base, tier }
      expect(cardMemoryPageEntropyBits(config)).toBeGreaterThanOrEqual(
        STUDIO_ENTROPY_FLOOR_BITS,
      )
      expect(cardMemorySpreadTemplate.validateConfig!(config)).toBeNull()
    }
  })

  it('samples 20,000 spreads without a canonical collision', () => {
    const seen = new Set<string>()
    const samples = 20_000
    for (let i = 0; i < samples; i++) {
      seen.add(
        cardMemoryCanonicalForm(
          buildCardMemoryFigure(rngFor(i), { studiedCount: 9 }),
        ),
      )
    }
    expect(samples - seen.size).toBe(0)
  }, 40_000)
})

describe('card-memory-spread pages', () => {
  beforeEach(() => clearStudioRecentContent())

  it('emits a study page and a recall page', () => {
    resetObjectCounter()
    const pages = cardMemorySpreadTemplate.generate(base, CTX())
    expect(pages.map((p) => p.pageRole)).toEqual(['study', 'recall'])
  })

  it('prints write-in blanks with a ruled line and no answer key', () => {
    clearStudioRecentContent()
    resetObjectCounter()
    const pages = cardMemorySpreadTemplate.generate(base, CTX())
    const [study, recall] = pages
    expect(harvestAnswers(study.objects)).toHaveLength(0)
    expect(harvestAnswers(recall.objects)).toHaveLength(0)

    const blanks = flatten(recall.objects).filter(
      (o) => o.data?.source === 'playing-card',
    )
    expect(blanks.length).toBe(cardCount(study.objects))
    for (const blank of blanks) {
      expect(blank.objects?.filter((c) => c.type === 'rect')).toHaveLength(1)
      expect(blank.objects?.filter((c) => c.type === 'textbox') ?? []).toHaveLength(0)
    }

    const writeLines = flatten(recall.objects).filter((o) => o.type === 'line')
    expect(writeLines.length).toBe(blanks.length)

    const slotNumbers = flatten(recall.objects).filter(
      (o) => o.type === 'textbox' && /^\d+$/.test(String(o.text ?? '')),
    )
    expect(slotNumbers).toHaveLength(0)
  })

  it('tells the reader to write rank + suit, not redraw', () => {
    const pageText = (role: 'study' | 'recall') => {
      clearStudioRecentContent()
      resetObjectCounter()
      const pages = cardMemorySpreadTemplate.generate(base, CTX())
      const page = pages.find((p) => p.pageRole === role)!
      return flatten(page.objects)
        .map((o) => String(o.text ?? ''))
        .join(' ')
        .toLowerCase()
    }

    const study = pageText('study')
    const recall = pageText('recall')
    expect(study).toMatch(/rank|suit|write|a♠|♠♥♦♣/)
    expect(recall).toMatch(/rank|suit|write|a♠|7♦|q♣|3♥/)
    expect(recall).toMatch(/do not (redraw|draw)|not redraw|no drawing|write them/)
  })

  it('prints the study-time cue only when asked', () => {
    const hasHint = (showStudyTimeHint: boolean) => {
      clearStudioRecentContent()
      resetObjectCounter()
      const [study] = cardMemorySpreadTemplate.generate(
        { ...base, showStudyTimeHint },
        CTX(),
      )
      return flatten(study.objects).some((o) => /minute|60 seconds/i.test(String(o.text ?? '')))
    }
    expect(hasHint(true)).toBe(true)
    expect(hasHint(false)).toBe(false)
  })

  it('keeps air between a 16-card spread and the study-time cue', () => {
    clearStudioRecentContent()
    resetObjectCounter()
    const [study] = cardMemorySpreadTemplate.generate(
      { ...base, tier: 'hard', showStudyTimeHint: true },
      CTX(),
    )
    const figure = study.objects.find(
      (o) => o.type === 'group' && (o.objects ?? []).some((c) => c.data?.source === 'playing-card'),
    )
    const hint = flatten(study.objects).find((o) =>
      /minute|60 seconds/i.test(String(o.text ?? '')),
    )
    expect(figure).toBeDefined()
    expect(hint).toBeDefined()
    expect(hint!.top - objectExtent(figure!).bottom).toBeGreaterThanOrEqual(
      CARD_LABEL_FIGURE_GAP - 1,
    )
  })

  it('generates every tier inside the safe margin', () => {
    const ctx = CTX()
    for (const tier of ['easy', 'medium', 'hard']) {
      clearStudioRecentContent()
      resetObjectCounter()
      const pages = cardMemorySpreadTemplate.generate({ ...base, tier }, ctx)
      for (const page of pages) {
        for (const obj of page.objects) {
          expect(obj.left).toBeGreaterThanOrEqual(ctx.margin.left - 1)
          expect(obj.top).toBeGreaterThanOrEqual(ctx.margin.top - 1)
        }
      }
    }
  }, 60_000)

  it('omits recall-type, recognition, spread-shape, and card-size controls', () => {
    const keys = cardMemorySpreadTemplate.configSchema.map((field) => field.key)
    expect(keys).not.toContain('mode')
    expect(keys).not.toContain('gridShape')
    expect(keys).not.toContain('cardSize')
  })

  it('is registered as a two-page card-tagged memory template', () => {
    const registered = getStudioTemplate('card-memory-spread')!
    expect(registered.category).toBe('memory')
    expect(registered.tags).toContain('card')
    expect(registered.pageCount).toBe(2)
    expect(registered.producesAnswerKey).toBe(false)
  })
})
