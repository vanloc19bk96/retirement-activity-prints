import { describe, it, expect } from 'vitest'
import type {
  StudioConfig,
  StudioFabricObject,
  StudioGenerateContext,
} from '@/types/studio-template.types'
import { DPI } from '@/types/canvas-settings.types'
import { STUDIO_TEMPLATES, buildDefaultConfig, getStudioTemplate } from '@/constants/studio-templates'
import { resetObjectCounter } from '../studio-fabric-builders'
import { fabricTextHeight } from '../studio-text-metrics'
import { harvestAnswers } from '../studio-answer-key'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import {
  assertObjectsInSafeMargin,
  runGeneratorContractTests,
} from '../studio-generator-test'
import { validateWyrConfig, wouldYouRatherTemplate } from './generate'
import { instructionFor } from './config'
import {
  WYR_AI_EMPTY_MESSAGE,
  WYR_DEFAULT_TITLE,
  WYR_LEAD,
  WYR_OR,
  compactPairLabel,
  normalizeOption,
  optionsMatch,
  orderForVariety,
  pairLabel,
  pairProblem,
  pairsRepeat,
  selectWyrPairs,
} from './content'
import { fitWyrPairs } from './fit'
import { runWyrKdpPreflight } from './kdp-preflight'
import {
  MAX_OPTION_LINES,
  MAX_QUESTIONS_PER_PAGE,
  OPTION_FONT_MIN,
  pxToPt,
  wyrBodyField,
  wyrPrintNote,
  wyrWorstCasePlan,
} from './layout'
import { WYR_FIXTURE, WYR_FIXTURE_ITEMS } from './fixture'

const FONT = 'PT Serif'

/** The draft a seller has in front of them — common header fields included. */
const base: StudioConfig = {
  ...buildDefaultConfig(wouldYouRatherTemplate),
  showTitle: true,
  title: WYR_DEFAULT_TITLE,
  showInstructions: true,
  seed: 42,
  fontFamily: FONT,
}

/** A real KDP interior: DPI 96, inside margin 0.375", the rest 0.25". */
const kdpCtx = (wIn: number, hIn: number, remoteData: unknown = WYR_FIXTURE): StudioGenerateContext => ({
  pageWidth: Math.round(wIn * DPI),
  pageHeight: Math.round(hIn * DPI),
  margin: {
    top: Math.round(0.25 * DPI),
    right: Math.round(0.25 * DPI),
    bottom: Math.round(0.25 * DPI),
    left: Math.round(0.375 * DPI),
  },
  seed: 42,
  instanceId: 'kdp',
  remoteData,
})

const TRIMS = [
  [5, 8],
  [5.5, 8.5],
  [6, 9],
  [7, 10],
  [8.5, 11],
] as const

function generate(config: StudioConfig, ctx: StudioGenerateContext) {
  resetObjectCounter()
  return wouldYouRatherTemplate.generate(config, ctx)
}

const texts = (objects: StudioFabricObject[]) =>
  objects.map((o) => String(o.text ?? '').replace(/ /g, ' ')).filter(Boolean)

const leads = (objects: StudioFabricObject[]) =>
  objects.filter((o) => typeof o.data?.[STUDIO_CONTENT_LABEL_KEY] === 'string')

const choiceBoxes = (objects: StudioFabricObject[]) =>
  objects.filter((o) => o.type === 'rect' && (o.rx ?? 0) > 2)

function extent(o: StudioFabricObject) {
  const w = o.width ?? (o.radius ?? 0) * 2
  const h = o.height ?? (o.radius ?? 0) * 2
  const left = o.originX === 'center' ? o.left - w / 2 : o.originX === 'right' ? o.left - w : o.left
  const top = o.originY === 'center' ? o.top - h / 2 : o.originY === 'bottom' ? o.top - h : o.top
  return { left, top, right: left + w, bottom: top + h }
}

// Content comes from the prefetch; with one fixed reply the page is the same
// for every seed, and freshness is the prefetch's job (see prefetch.test.ts).
runGeneratorContractTests(wouldYouRatherTemplate, {
  expectSeedVariance: false,
  configOverrides: { showTitle: true, title: WYR_DEFAULT_TITLE, showInstructions: true },
  contextOverrides: { remoteData: WYR_FIXTURE },
})

describe('would-you-rather registry', () => {
  it('is registered once, in the word tab, with no answer page', () => {
    expect(STUDIO_TEMPLATES.filter((t) => t.key === 'would-you-rather')).toHaveLength(1)
    const registered = getStudioTemplate('would-you-rather')!
    expect(registered.category).toBe('word')
    expect(registered.producesAnswerKey).toBe(false)
    expect(registered.pageCount).toBe(1)
    expect(registered.defaultPageTitle).toBe(WYR_DEFAULT_TITLE)
    expect(registered.prefetch).toBeTypeOf('function')
  })

  it('asks only for theme, tone and a writing line', () => {
    expect(wouldYouRatherTemplate.configSchema.map((field) => field.key)).toEqual([
      'theme',
      'customTheme',
      'tone',
      'reasonLine',
    ])
    const custom = wouldYouRatherTemplate.configSchema.find((f) => f.key === 'customTheme')!
    expect(custom.visibleWhen?.({ theme: 'mixed' })).toBe(false)
    expect(custom.visibleWhen?.({ theme: 'custom' })).toBe(true)
  })

  it('refuses an empty custom theme', () => {
    expect(validateWyrConfig({ theme: 'custom', customTheme: '' })?.field).toBe('customTheme')
    expect(validateWyrConfig({ theme: 'custom', customTheme: 'Lake days' })).toBeNull()
    expect(validateWyrConfig({ theme: 'mixed' })).toBeNull()
  })

  it('reports what the trim prints in the theme help', () => {
    const theme = wouldYouRatherTemplate.configSchema[0]!
    const ctx = kdpCtx(6, 9)
    const help = theme.helpWhen!(base, ctx)
    expect(help).toMatch(/\d question/)
    expect(help).toMatch(/\d+ pt/)
  })
})

describe('would-you-rather page', () => {
  it('prints the lead, both choices and the OR for every question', () => {
    const [page] = generate(base, kdpCtx(6, 9))
    const all = texts(page!.objects)
    const questionLeads = leads(page!.objects)
    expect(questionLeads.length).toBeGreaterThan(0)
    expect(all.filter((t) => t === WYR_OR)).toHaveLength(questionLeads.length)
    questionLeads.forEach((lead, i) => {
      expect(String(lead.text).replace(/ /g, ' ')).toBe(`${i + 1}.  ${WYR_LEAD}`)
    })
    const body = all.join(' ').replace(/\s+/g, ' ')
    for (const lead of questionLeads) {
      const [a, b] = String(lead.data![STUDIO_CONTENT_LABEL_KEY]).split(' / ')
      expect(body).toContain(a)
      expect(body).toContain(b)
    }
  })

  it('has no hidden answers and no answer page', () => {
    const pages = generate(base, kdpCtx(6, 9))
    expect(pages).toHaveLength(1)
    expect(harvestAnswers(pages[0]!.objects)).toHaveLength(0)
    expect(pages[0]!.answerSourceObjects).toBeUndefined()
  })

  it('prints only black, white and grey', () => {
    const [page] = generate(base, kdpCtx(8.5, 11))
    const colours = new Set(
      page!.objects.flatMap((o) => [o.fill, o.stroke]).filter((c): c is string => !!c && c !== 'transparent'),
    )
    for (const colour of colours) {
      const hex = colour.replace('#', '')
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16))
      // Neutral: channels within a few steps of each other.
      expect(Math.max(r!, g!, b!) - Math.min(r!, g!, b!)).toBeLessThanOrEqual(24)
    }
  })

  it('draws both boxes of a question the same size', () => {
    for (const [w, h] of TRIMS) {
      const [page] = generate(base, kdpCtx(w, h))
      const boxes = choiceBoxes(page!.objects)
      expect(boxes.length % 2).toBe(0)
      for (let i = 0; i < boxes.length; i += 2) {
        expect(boxes[i]!.width).toBe(boxes[i + 1]!.width)
        expect(boxes[i]!.height).toBe(boxes[i + 1]!.height)
      }
    }
  })

  it.each(TRIMS)('fits %s x %s in the safe area with nothing overlapping', (w, h) => {
    for (const reasonLine of [false, true]) {
      for (const showTitle of [false, true]) {
        const config = { ...base, reasonLine, showTitle, title: showTitle ? WYR_DEFAULT_TITLE : '' }
        const ctx = kdpCtx(w, h)
        const [page] = generate(config, ctx)
        expect(leads(page!.objects).length).toBeGreaterThan(0)
        assertObjectsInSafeMargin(page!.objects, ctx)

        // Choice text sits inside its box, and boxes never overlap each other.
        const boxes = choiceBoxes(page!.objects).map(extent)
        for (let i = 0; i < boxes.length; i++) {
          for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i]!
            const b = boxes[j]!
            const overlap = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
            expect(overlap).toBe(false)
          }
        }
        const choiceTexts = page!.objects.filter(
          (o) => o.type === 'textbox' && o.studioRole === 'prompt' && !o.data,
        )
        for (const text of choiceTexts) {
          const t = extent(text)
          const lines = String(text.text).split('\n').length
          const bottom = t.top + fabricTextHeight(lines, text.fontSize!, text.lineHeight)
          const inside = boxes.some(
            (b) => t.left >= b.left && t.right <= b.right + 1 && t.top >= b.top && bottom <= b.bottom + 2,
          )
          expect(inside, String(text.text)).toBe(true)
        }
      }
    }
  })

  it('never sets type below the large-print floor', () => {
    for (const [w, h] of TRIMS) {
      for (const reasonLine of [false, true]) {
        const plan = wyrWorstCasePlan({
          page: kdpCtx(w, h),
          config: { ...base, reasonLine },
          instruction: instructionFor({ ...base, reasonLine }),
          font: FONT,
          reasonLine,
        })
        expect(plan).not.toBeNull()
        expect(plan!.metrics.font).toBeGreaterThanOrEqual(OPTION_FONT_MIN)
        expect(plan!.count).toBeLessThanOrEqual(MAX_QUESTIONS_PER_PAGE)
      }
    }
  })

  it('never breaks a choice past three lines, and holds at least two questions on 6 x 9', () => {
    const plan = (w: number, h: number) =>
      wyrWorstCasePlan({ page: kdpCtx(w, h), config: base, instruction: instructionFor(base), font: FONT, reasonLine: false })!
    for (const [w, h] of TRIMS) expect(plan(w, h).optionLines).toBeLessThanOrEqual(MAX_OPTION_LINES)
    expect(plan(6, 9).count).toBeGreaterThanOrEqual(2)
  })

  it('fits fewer questions when the writing line is on', () => {
    const count = (reasonLine: boolean) =>
      wyrWorstCasePlan({
        page: kdpCtx(8.5, 11),
        config: { ...base, reasonLine },
        instruction: instructionFor({ ...base, reasonLine }),
        font: FONT,
        reasonLine,
      })!.count
    expect(count(true)).toBeLessThanOrEqual(count(false))
  })

  it('draws a Why? line only when asked', () => {
    const off = texts(generate(base, kdpCtx(6, 9))[0]!.objects)
    const on = texts(generate({ ...base, reasonLine: true }, kdpCtx(6, 9))[0]!.objects)
    expect(off).not.toContain('Why?')
    expect(on).toContain('Why?')
  })

  it('the form note matches the printed page', () => {
    for (const [w, h] of TRIMS) {
      const ctx = kdpCtx(w, h)
      const note = wyrPrintNote({ page: ctx, config: base, instruction: instructionFor(base), font: FONT, reasonLine: false })
      const plan = wyrWorstCasePlan({ page: ctx, config: base, instruction: instructionFor(base), font: FONT, reasonLine: false })!
      expect(note).toContain(`${pxToPt(plan.metrics.font)} pt`)
      const [page] = generate(base, ctx)
      expect(leads(page!.objects)).toHaveLength(plan.count)
    }
  })

  it('shows an error page when the reply is empty or malformed', () => {
    for (const remote of [undefined, null, {}, { items: 'nope' }, { items: [{ optionA: 'x' }] }]) {
      const [page] = generate(base, { ...kdpCtx(6, 9), remoteData: remote })
      expect(texts(page!.objects)).toContain(WYR_AI_EMPTY_MESSAGE)
      expect(leads(page!.objects)).toHaveLength(0)
    }
  })

  it('passes the preflight on every trim', () => {
    for (const [w, h] of TRIMS) {
      const ctx = kdpCtx(w, h)
      const plan = wyrWorstCasePlan({ page: ctx, config: base, instruction: instructionFor(base), font: FONT, reasonLine: false })!
      const fitted = fitWyrPairs(selectWyrPairs(WYR_FIXTURE.items, { cap: 10 }), plan, FONT)!
      const field = wyrBodyField(ctx, base, instructionFor(base))
      const result = runWyrKdpPreflight({ pairs: fitted.pairs, plan: fitted.plan, fieldHeight: field.height })
      expect(result.errors).toEqual([])
    }
  })
})

describe('would-you-rather content gates', () => {
  it.each([
    ['Would you rather spend a week sailing?', 'Spend a week sailing'],
    ['A) spend a week sailing', 'Spend a week sailing'],
    ['Option B: spend a week sailing.', 'Spend a week sailing'],
    ['or spend a week sailing', 'Spend a week sailing'],
    ['to spend a week sailing', 'Spend a week sailing'],
  ])('strips labels and leads: %s', (raw, expected) => {
    expect(normalizeOption(raw)).toBe(expected)
  })

  it.each([
    '',
    'sail',
    'the beach house',
    'spending a week sailing',
    'sail to the islands or the lakes',
    'sail the islands. Then fly home',
    'SAIL THE ISLANDS ALL SUMMER',
    'visit the doctor twice a week',
    'go to the casino every Friday night',
    'win a trip to Disney with the grandchildren',
    'forget where you parked the car',
    'spend a week sailing between the islands with old friends and a picnic',
  ])('rejects %j', (raw) => {
    expect(normalizeOption(raw)).toBeNull()
  })

  it('rejects unfair pairs and keeps fair ones', () => {
    expect(pairProblem('Travel the world by train', 'Travel all the world by trains')).not.toBeNull()
    expect(pairProblem('Retire to the coast', 'Never retire to the coast')).not.toBeNull()
    expect(pairProblem('Bake bread', 'Spend every afternoon in a sunny workshop building a boat')).not.toBeNull()
    expect(pairProblem('Spend a week at the beach', 'Spend a week in the mountains')).toBeNull()
  })

  it('treats near-identical and swapped questions as repeats', () => {
    expect(optionsMatch('Spend a week at the beach', 'Spend a whole week on the beaches')).toBe(true)
    expect(optionsMatch('Spend a week at the beach', 'Spend a week in the mountains')).toBe(false)
    const a = { a: 'Learn to play the piano', b: 'Learn to speak Italian' }
    expect(pairsRepeat(a, { a: a.b, b: a.a })).toBe(true)
    expect(pairsRepeat(a, { a: 'Learn to play the piano!', b: 'Learn to paint with watercolours' })).toBe(true)
    expect(pairsRepeat(a, { a: 'Host a dinner party', b: 'Be the guest of honour' })).toBe(false)
  })

  it('drops pairs the book already prints, by full or compact label', () => {
    const [first, second] = WYR_FIXTURE_ITEMS
    const full = selectWyrPairs(WYR_FIXTURE.items, { cap: 10, avoid: [pairLabel(first!)] })
    expect(full.map((p) => p.optionA)).not.toContain(first!.optionA)
    const compact = compactPairLabel(second!)
    expect(compact.length).toBeLessThanOrEqual(60)
    const viaCompact = selectWyrPairs(WYR_FIXTURE.items, { cap: 10, avoid: [compact] })
    expect(viaCompact.map((p) => p.optionA)).not.toContain(second!.optionA)
    expect(viaCompact).toHaveLength(WYR_FIXTURE_ITEMS.length - 1)
  })

  it('drops a repeated pair inside one reply', () => {
    const [first] = WYR_FIXTURE_ITEMS
    const swapped = { optionA: first!.optionB, optionB: first!.optionA }
    expect(selectWyrPairs([first, swapped], { cap: 10 })).toHaveLength(1)
  })

  it('spreads opening verbs and topics across a page', () => {
    const pool = [
      { optionA: 'Learn to paint', optionB: 'Learn to sing', topic: 'hobbies' },
      { optionA: 'Learn to bake', optionB: 'Learn to sew', topic: 'hobbies' },
      { optionA: 'Host a picnic', optionB: 'Join a picnic', topic: 'friends' },
    ]
    expect(orderForVariety(pool).map((p) => p.optionA)).toEqual([
      'Learn to paint',
      'Host a picnic',
      'Learn to bake',
    ])
  })
})
