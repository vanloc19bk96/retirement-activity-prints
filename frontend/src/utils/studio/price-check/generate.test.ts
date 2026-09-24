import { describe, it, expect } from 'vitest'
import type {
  StudioConfig,
  StudioFabricObject,
  StudioGenerateContext,
} from '@/types/studio-template.types'
import { DPI } from '@/types/canvas-settings.types'
import { STUDIO_TEMPLATES, buildDefaultConfig, getStudioTemplate } from '@/constants/studio-templates'
import {
  STUDIO_ANSWER_INK_MONO,
  STUDIO_ANSWER_INK_MONO_TEMPLATES,
  STUDIO_STROKE_BOLD,
} from '@/constants/studio.constants'
import { resetObjectCounter } from '../studio-fabric-builders'
import { buildAnswerPage, harvestAnswers } from '../studio-answer-key'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import {
  assertGeneratorEntropy,
  assertObjectsInSafeMargin,
  runGeneratorContractTests,
} from '../studio-generator-test'
import { priceCheckTemplate } from './generate'
import { instructionFor } from './config'
import {
  PC_BOOK_FULL_MESSAGE,
  PC_DEFAULT_TITLE,
  PC_FIRST_YEAR,
  PC_LAST_YEAR,
  PC_LETTERS,
  PRICE_FACTS,
  answerText,
  bookFacts,
  buildChoices,
  buildQuestions,
  choicesAreFair,
  decadeOf,
  factByKey,
  factsRepeat,
  formatPrice,
  isValidQuestion,
  isValidSeries,
  pickFacts,
  type PriceCheckLevel,
  type PriceSeries,
} from './content'
import { PRICE_SERIES } from './data'
import { fitPcQuestions } from './fit'
import { runPcKdpPreflight } from './kdp-preflight'
import { MAX_QUESTIONS_PER_PAGE, TEXT_FONT_MIN, pcPrintNote, pcWorstCasePlan, pxToPt } from './layout'
import { parsePcRemoteData, priceCheckPrefetch } from './prefetch'
import { createRng } from '../studio-rng'

const FONT = 'PT Serif'
const LEVELS: PriceCheckLevel[] = ['gentle', 'classic']

const base: StudioConfig = {
  ...buildDefaultConfig(priceCheckTemplate),
  showTitle: true,
  title: PC_DEFAULT_TITLE,
  showInstructions: true,
  seed: 42,
  fontFamily: FONT,
}

/** A real KDP interior: DPI 96, inside margin 0.375", the rest 0.25". */
const kdpCtx = (wIn: number, hIn: number, seed = 42, bookKeys: string[] = []): StudioGenerateContext => ({
  pageWidth: Math.round(wIn * DPI),
  pageHeight: Math.round(hIn * DPI),
  margin: {
    top: Math.round(0.25 * DPI),
    right: Math.round(0.25 * DPI),
    bottom: Math.round(0.25 * DPI),
    left: Math.round(0.375 * DPI),
  },
  seed,
  instanceId: 'kdp',
  remoteData: { bookKeys },
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
  return priceCheckTemplate.generate(config, ctx)
}

const clean = (text: unknown) => String(text ?? '').replace(/ /g, ' ')
const oneLine = (text: string) => text.replace(/\n/g, ' ')
const texts = (objects: StudioFabricObject[]) => objects.map((o) => oneLine(clean(o.text))).filter(Boolean)
const isNumber = (o: StudioFabricObject) => /^\d\.$/.test(clean(o.text))
const isRing = (o: StudioFabricObject) => o.type === 'circle' && o.studioRole === 'answer'
/** A choice letter whose glyph sits inside `ring` (a centre-origin circle). */
const ringedLetter = (o: StudioFabricObject, ring: StudioFabricObject) =>
  o.studioRole === 'prompt' &&
  (PC_LETTERS as readonly string[]).includes(clean(o.text)) &&
  o.left! > ring.left! - ring.radius! &&
  o.left! < ring.left! &&
  o.top! > ring.top! - ring.radius! &&
  o.top! < ring.top!

/** Each printed question: its fact key, and its four lettered prices as drawn. */
function readPuzzle(objects: StudioFabricObject[]) {
  const out: { key: string; letters: string[]; prices: string[] }[] = []
  objects.forEach((o, i) => {
    const key = o.data?.[STUDIO_CONTENT_LABEL_KEY]
    if (typeof key !== 'string') return
    const options = objects.slice(i + 1, i + 9).map((x) => clean(x.text))
    out.push({
      key,
      letters: options.filter((_, j) => j % 2 === 0),
      prices: options.filter((_, j) => j % 2 === 1),
    })
  })
  return out
}

const labelsOf = (objects: StudioFabricObject[]) =>
  objects.map((o) => o.data?.[STUDIO_CONTENT_LABEL_KEY]).filter((l): l is string => typeof l === 'string')

// The key is built from `answerSourceObjects` (asserted below); the puzzle page
// deliberately carries no answer at all, hidden or not.
runGeneratorContractTests(priceCheckTemplate, {
  expectAnswers: false,
  configOverrides: { showTitle: true, title: PC_DEFAULT_TITLE, showInstructions: true },
})
assertGeneratorEntropy(priceCheckTemplate, { seeds: 60 })

describe('price-check registry', () => {
  it('is registered once, in the word tab, with an answer page', () => {
    expect(STUDIO_TEMPLATES.filter((t) => t.key === 'price-check')).toHaveLength(1)
    const registered = getStudioTemplate('price-check')!
    expect(registered.category).toBe('word')
    expect(registered.producesAnswerKey).toBe(true)
    expect(registered.defaultPageTitle).toBe(PC_DEFAULT_TITLE)
  })

  it('prints its answer key in black ink', () => {
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has('price-check')).toBe(true)
  })

  it('asks only for a level, defaulting to gentle', () => {
    expect(priceCheckTemplate.configSchema.map((field) => field.key)).toEqual(['level'])
    expect(buildDefaultConfig(priceCheckTemplate)).toMatchObject({ level: 'gentle' })
  })

  it('reads the book back without any network call', async () => {
    const context = { bookContentLabels: (key: string) => (key === 'price-check' ? ['eggs@1985'] : ['nope']) }
    await expect(priceCheckPrefetch(base, new AbortController().signal, context)).resolves.toEqual({
      bookKeys: ['eggs@1985'],
    })
    await expect(priceCheckPrefetch(base, new AbortController().signal)).resolves.toEqual({ bookKeys: [] })
    for (const raw of [undefined, null, 'x', { bookKeys: 'x' }, { bookKeys: [1, null] }]) {
      expect(parsePcRemoteData(raw)).toEqual({ bookKeys: [] })
    }
  })
})

describe('price-check dataset', () => {
  it('holds hundreds of sourced U.S. facts across 1950 to 2000', () => {
    expect(PRICE_FACTS.length).toBeGreaterThan(350)
    expect(PRICE_SERIES.every(isValidSeries)).toBe(true)
    // Every series made it through validation — none was silently dropped.
    expect(new Set(PRICE_FACTS.map((f) => f.series.key)).size).toBe(PRICE_SERIES.length)
    for (const fact of PRICE_FACTS) {
      expect(fact.year).toBeGreaterThanOrEqual(PC_FIRST_YEAR)
      expect(fact.year).toBeLessThanOrEqual(PC_LAST_YEAR)
      expect(Number.isInteger(fact.cents) && fact.cents > 0).toBe(true)
    }
    const decades = new Set(PRICE_FACTS.map((f) => Math.floor(f.year / 10) * 10))
    expect([...decades].sort()).toEqual([1950, 1960, 1970, 1980, 1990, 2000])
  })

  it('matches the published figures it was built from', () => {
    const cents = (key: string) => factByKey(key)?.cents
    // USPS Historian: 8¢ from May 16, 1971; 13¢ from Dec 31, 1975.
    expect(cents('first-class-stamp@1972')).toBe(8)
    expect(cents('first-class-stamp@1976')).toBe(13)
    // NATO annual averages.
    expect(cents('movie-ticket@1975')).toBe(203)
    expect(cents('movie-ticket@2000')).toBe(539)
    // EIA Table 5.24: leaded regular 1965 $0.312; unleaded regular 1980 $1.245.
    expect(cents('gasoline-regular@1965')).toBe(31)
    expect(cents('gasoline-unleaded@1980')).toBe(125)
  })

  it('leaves out years a source does not cover in full', () => {
    // A rate change mid-year (1958, 1971, 1974, 1978, 1981, 1985, 1988, 1991).
    for (const year of [1958, 1971, 1974, 1978, 1981, 1985, 1988, 1991]) {
      expect(factByKey(`first-class-stamp@${year}`), String(year)).toBeUndefined()
    }
    // NATO marks 1989 as a break in method.
    expect(factByKey('movie-ticket@1989')).toBeUndefined()
    // Whole milk by the gallon starts mid-1995.
    expect(factByKey('milk-gallon@1995')).toBeUndefined()
  })

  it('refuses a series without a unit, a source, or with a unit its question never states', () => {
    const good = PRICE_SERIES.find((s) => s.key === 'eggs')!
    const broken: Partial<PriceSeries>[] = [
      { source: ' ' },
      { unit: '' },
      { unit: 'a pound' },
      { item: 'eggs' },
      { basis: 'estimate' as never },
      { key: 'Eggs 2' },
    ]
    for (const change of broken) expect(isValidSeries({ ...good, ...change }), JSON.stringify(change)).toBe(false)
  })
})

describe('price-check choices', () => {
  it('always offers one true price and three plainly different ones, cheapest first', () => {
    const rng = createRng(7)
    for (const level of LEVELS) {
      let built = 0
      for (const fact of PRICE_FACTS) {
        for (let rank = 0; rank < 4; rank++) {
          const options = buildChoices(fact.cents, rank, level, rng)
          if (!options) continue
          built++
          expect(options[rank]).toBe(fact.cents)
          expect(choicesAreFair(options, fact.cents, level)).toBe(true)
          expect([...options].sort((a, b) => a - b)).toEqual(options)
          // No absurd outlier: the whole spread stays within a believable range.
          // Under 20¢ the two-cent minimum step sets the spread instead.
          if (options[0]! >= 20) expect(options[3]! / options[0]!).toBeLessThan(level === 'gentle' ? 8 : 4.5)
          else expect(options[3]!).toBeLessThanOrEqual(Math.max(fact.cents * 8, 30))
        }
      }
      expect(built).toBeGreaterThan(PRICE_FACTS.length * 3)
    }
  })

  it('can always seat the true price somewhere', () => {
    for (const level of LEVELS) {
      const questions = buildQuestions(PRICE_FACTS, level, 3)
      expect(questions).toHaveLength(PRICE_FACTS.length)
      expect(questions.every((q) => isValidQuestion(q, level))).toBe(true)
    }
  })

  it('spreads the right answer across A, B, C and D', () => {
    const counts = [0, 0, 0, 0]
    for (let seed = 1; seed <= 200; seed++) {
      for (const q of buildQuestions(pickFacts({ count: 6, seed }), 'gentle', seed)) counts[q.correct]!++
    }
    const total = counts.reduce((a, b) => a + b, 0)
    for (const count of counts) expect(count / total).toBeGreaterThan(0.15)
  })

  it('writes every price in one style per question', () => {
    expect(formatPrice(8, false)).toBe('8¢')
    expect(formatPrice(125, true)).toBe('$1.25')
    expect(formatPrice(57, true)).toBe('$0.57')
    for (const q of buildQuestions(PRICE_FACTS, 'classic', 11)) {
      expect(q.dollars).toBe(q.options.some((c) => c >= 100))
    }
  })

  it('asks averages as averages and a set rate plainly, always naming the unit, year and country', () => {
    for (const q of buildQuestions(PRICE_FACTS, 'gentle', 5)) {
      expect(q.question).toContain(String(q.fact.year))
      expect(q.question).toContain(q.fact.series.item)
      expect(q.question).toMatch(/U\.S\./)
      expect(q.answer).toContain(q.fact.series.unit)
      if (q.fact.series.basis === 'official') {
        expect(q.question).not.toMatch(/about|average/i)
        expect(q.answer).toContain('U.S. rate')
      } else {
        expect(q.question).toMatch(/about|average/i)
        expect(q.answer).toContain('U.S. average')
      }
    }
  })
})

describe('price-check variety', () => {
  it('never asks about one thing twice on a page, and spans the decades', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const facts = pickFacts({ count: 6, seed })
      expect(facts).toHaveLength(6)
      expect(new Set(facts.map((f) => f.series.family)).size).toBe(6)
      expect(new Set(facts.map((f) => decadeOf(f.year))).size).toBeGreaterThanOrEqual(4)
    }
  })

  it('treats the same item a few years apart, or at the same price, as a repeat', () => {
    const f = (key: string) => factByKey(key)!
    expect(factsRepeat(f('eggs@1985'), f('eggs@1987'))).toBe(true)
    expect(factsRepeat(f('eggs@1985'), f('eggs@1995'))).toBe(false)
    expect(factsRepeat(f('first-class-stamp@1950'), f('first-class-stamp@1957'))).toBe(true)
    expect(factsRepeat(f('milk-gallon@2000'), f('milk-half-gallon@1997'))).toBe(true)
    expect(factsRepeat(f('eggs@1985'), f('bacon@1985'))).toBe(false)
  })

  it('never repeats a question already in the book, across a long book', () => {
    const book: string[] = []
    for (let page = 0; page < 20; page++) {
      const [out] = generate({ ...base, seed: 100 + page }, kdpCtx(8.5, 11, 100 + page, book))
      const keys = labelsOf(out!.objects)
      expect(keys.length, `page ${page + 1}`).toBeGreaterThan(0)
      for (const key of keys) expect(book, `page ${page + 1}`).not.toContain(key)
      book.push(...keys)
    }
    // Early pages keep clear of near-repeats too, not just exact ones.
    const early = bookFacts(book.slice(0, 30))
    early.forEach((fact, i) => {
      for (const other of early.slice(0, i)) expect(factsRepeat(fact, other), `${fact.key} ~ ${other.key}`).toBe(false)
    })
  })

  it('ignores book labels that are not facts', () => {
    expect(bookFacts(['', 'eggs@1850', 'nonsense', ' eggs@1985 ']).map((f) => f.key)).toEqual(['eggs@1985'])
  })
})

describe('price-check page', () => {
  it('prints what the form promises on every KDP trim, in large print, inside the safe area', () => {
    for (const [w, h] of TRIMS) {
      for (const showTitle of [true, false]) {
        for (const level of LEVELS) {
          const config = { ...base, showTitle, title: showTitle ? PC_DEFAULT_TITLE : '', level }
          const ctx = kdpCtx(w, h)
          const plan = pcWorstCasePlan({ page: ctx, config, instruction: instructionFor(config), font: FONT })!
          expect(plan, `${w}x${h}`).not.toBeNull()
          expect(plan.count).toBeLessThanOrEqual(MAX_QUESTIONS_PER_PAGE)
          expect(plan.metrics.font).toBeGreaterThanOrEqual(TEXT_FONT_MIN)

          const [page] = generate(config, ctx)
          expect(page!.objects.filter(isNumber), `${w}x${h}`).toHaveLength(plan.count)
          const note = pcPrintNote({ page: ctx, config, instruction: instructionFor(config), font: FONT })
          expect(note).toContain(`${plan.count} questions a page`)
          expect(note).toContain(`${pxToPt(plan.metrics.font)} pt`)

          assertObjectsInSafeMargin(page!.objects, ctx)
          assertObjectsInSafeMargin(page!.answerSourceObjects!, ctx)
        }
      }
    }
  })

  it('holds a comfortable number of questions on common trims', () => {
    for (const [w, h] of [[6, 9], [7, 10], [8.5, 11]] as const) {
      const plan = pcWorstCasePlan({ page: kdpCtx(w, h), config: base, instruction: instructionFor(base), font: FONT })!
      expect(plan.count, `${w}x${h}`).toBeGreaterThanOrEqual(5)
      expect(pxToPt(plan.metrics.font), `${w}x${h}`).toBeGreaterThanOrEqual(16)
    }
  })

  it('shows no answer anywhere on the puzzle page, hidden or not', () => {
    const [page] = generate(base, kdpCtx(8.5, 11))
    expect(harvestAnswers(page!.objects)).toHaveLength(0)
    expect(texts(page!.objects).some((t) => /U\.S\. (average|rate)\)/.test(t))).toBe(false)
    expect(page!.objects.some(isRing)).toBe(false)
    // The answer page adds a ring and a fact line to every question, both hidden until revealed.
    const hidden = harvestAnswers(page!.answerSourceObjects!)
    expect(hidden).toHaveLength(page!.objects.filter(isNumber).length * 2)
    expect(hidden.every((o) => o.visible === false)).toBe(true)
  })

  it('sets every question again on the answer page, ringing the letter of the price its fact names', () => {
    for (const level of LEVELS) {
      for (const seed of [42, 7, 1234]) {
        for (const [w, h] of TRIMS) {
          const [page] = generate({ ...base, seed, level }, kdpCtx(w, h, seed))
          const puzzle = readPuzzle(page!.objects)
          const key = buildAnswerPage(page!.answerSourceObjects!, STUDIO_ANSWER_INK_MONO)
          const keyNumbers = key.filter(isNumber).map((o) => clean(o.text))
          expect(keyNumbers).toEqual(page!.objects.filter(isNumber).map((o) => clean(o.text)))
          // The same questions, in the same order, with the same four prices.
          expect(readPuzzle(key)).toEqual(puzzle)

          const rings = key.filter(isRing)
          const facts = key.filter((o) => o.studioRole === 'answer' && o.type !== 'circle').map((o) => oneLine(clean(o.text)))
          expect(rings).toHaveLength(puzzle.length)
          expect(facts).toHaveLength(puzzle.length)

          puzzle.forEach((q, i) => {
            const fact = factByKey(q.key)!
            expect(q.letters).toEqual([...PC_LETTERS])
            const ringed = key.filter((o) => ringedLetter(o, rings[i]!)).map((o) => clean(o.text))
            expect(ringed, `${w}x${h} #${i + 1}`).toHaveLength(1)
            const letter = ringed[0]!
            const printed = q.prices[PC_LETTERS.indexOf(letter as never)]!
            // The ring stays in the letter column, clear of the price beside it.
            const letterObj = key.find((o) => ringedLetter(o, rings[i]!))!
            const priceObj = key[key.indexOf(letterObj) + 1]!
            expect(clean(priceObj.text)).toBe(printed)
            expect(rings[i]!.left! + rings[i]!.radius! + STUDIO_STROKE_BOLD).toBeLessThan(priceObj.left!)
            const dollars = q.prices.some((p) => p.startsWith('$'))
            expect(printed, `${w}x${h} #${i + 1}`).toBe(formatPrice(fact.cents, dollars))
            expect(`${letter} — ${facts[i]}`).toBe(answerText(fact, letter, dollars))
            // Only the true price is on the page once.
            expect(q.prices.filter((p) => p === printed)).toHaveLength(1)
          })
          // Oldest first: the page reads as a walk through the decades.
          const years = puzzle.map((q) => factByKey(q.key)!.year)
          expect([...years].sort((a, b) => a - b)).toEqual(years)
          // The how-to line stays on the puzzle page.
          expect(texts(key).some((t) => t === instructionFor(base))).toBe(false)
        }
      }
    }
  })

  it('breaks a fact line only between its two halves', () => {
    for (const [w, h] of TRIMS) {
      const [page] = generate(base, kdpCtx(w, h))
      for (const o of harvestAnswers(page!.answerSourceObjects!).filter((a) => a.type !== 'circle')) {
        const lines = clean(o.text).split('\n')
        expect(lines.length).toBeLessThanOrEqual(2)
        if (lines.length === 2) expect(lines[1]).toMatch(/^\((U\.S\. average|official U\.S\. rate)\)$/)
      }
    }
  })

  it('writes an error page, not a broken page, when the book has used every fact', () => {
    const everything = PRICE_FACTS.map((f) => f.key)
    const [page] = generate(base, kdpCtx(6, 9, 42, everything))
    expect(page!.answerSourceObjects).toBeUndefined()
    expect(texts(page!.objects)).toContain(PC_BOOK_FULL_MESSAGE)
  })
})

describe('price-check preflight', () => {
  const ctx = kdpCtx(8.5, 11)
  const plan = pcWorstCasePlan({ page: ctx, config: base, instruction: instructionFor(base), font: FONT })!
  const fitted = fitPcQuestions({ promised: plan, level: 'gentle', seed: 42, font: FONT })!

  it('passes a clean page', () => {
    expect(runPcKdpPreflight({ ...fitted, level: 'gentle' })).toMatchObject({ ok: true })
  })

  it('refuses a price that is not the dataset’s, or an answer naming the wrong letter', () => {
    const [first, ...rest] = fitted.questions
    const wrongPrice = { ...first!, fact: { ...first!.fact, cents: first!.fact.cents + 1 } }
    expect(runPcKdpPreflight({ questions: [wrongPrice, ...rest], plan: fitted.plan, level: 'gentle' }).ok).toBe(false)
    const other = (first!.correct + 1) % 4
    const wrongLetter = { ...first!, correct: other }
    expect(runPcKdpPreflight({ questions: [wrongLetter, ...rest], plan: fitted.plan, level: 'gentle' }).ok).toBe(false)
  })

  it('refuses the same item twice', () => {
    const [first] = fitted.questions
    const twice = runPcKdpPreflight({ questions: [first!, first!], plan: { ...plan, count: 2 }, level: 'gentle' })
    expect(twice.ok).toBe(false)
  })
})
