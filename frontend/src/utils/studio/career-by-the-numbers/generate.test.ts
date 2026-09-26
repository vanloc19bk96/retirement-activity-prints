import { describe, it, expect } from 'vitest'
import type {
  StudioConfig,
  StudioFabricObject,
  StudioGenerateContext,
  StudioPageOutput,
} from '@/types/studio-template.types'
import { DPI } from '@/types/canvas-settings.types'
import { STUDIO_INK, STUDIO_INK_MUTED } from '@/constants/studio.constants'
import { STUDIO_TEMPLATES, buildDefaultConfig, getStudioTemplate } from '@/constants/studio-templates'
import { resetObjectCounter } from '../studio-fabric-builders'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import { isStudioHeaderTitle } from '../studio-layout'
import { assertObjectsInSafeMargin, runGeneratorContractTests } from '../studio-generator-test'
import { careerNumbersTemplate } from './generate'
import {
  CBN_AI_EMPTY_MESSAGE,
  CBN_COUNTS,
  CBN_DEFAULT_COUNT,
  CBN_DEFAULT_TITLE,
  CBN_PAGE_TOO_SMALL_MESSAGE,
  CBN_SHORT_MESSAGE,
  cleanCbnPool,
  numberCbnSet,
  orderCbnSet,
  pickCbnSet,
} from './content'
import { CBN_LINE_KEY, CBN_MOTIF_KEY, CBN_QUESTION_KEY, CBN_UNIT_KEY } from './draw'
import {
  NUMBER_LINE_MIN,
  PROMPT_FONT_MIN,
  ANSWER_ROW_MIN,
  answerLineWidth,
  cbnContentBox,
  cbnLayout,
  cbnPrintNote,
  fitCbnQuestions,
  paginateCbn,
  pxToPt,
  usableHeight,
} from './layout'
import { runCbnKdpPreflight } from './kdp-preflight'
import { CBN_FIXTURE, CBN_FIXTURE_ITEMS } from './fixture'

const FONT = 'PT Serif'

/** The draft a seller has in front of them — common header fields included. */
const base: StudioConfig = {
  ...buildDefaultConfig(careerNumbersTemplate),
  showTitle: true,
  title: CBN_DEFAULT_TITLE,
  showInstructions: true,
  seed: 42,
  fontFamily: FONT,
}

/** A real KDP interior: DPI 96, inside margin 0.375", the rest 0.25". */
const kdpCtx = (wIn: number, hIn: number, remoteData: unknown = CBN_FIXTURE): StudioGenerateContext => ({
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
  [8.25, 11],
  [8.5, 11],
] as const

function generate(config: StudioConfig, ctx: StudioGenerateContext) {
  resetObjectCounter()
  return careerNumbersTemplate.generate(config, ctx)
}

const textOf = (o: StudioFabricObject) => String(o.text ?? '').replace(/ /g, ' ')
const texts = (pages: StudioPageOutput[]) => pages.flatMap((p) => p.objects.map(textOf))
const questionsOn = (objects: StudioFabricObject[]) =>
  objects.filter((o) => typeof o.data?.[CBN_QUESTION_KEY] === 'number')
const tagged = (objects: StudioFabricObject[], key: string) => objects.filter((o) => o.data?.[key] !== undefined)
const numbersOf = (pages: StudioPageOutput[]) =>
  pages.flatMap((p) => questionsOn(p.objects).map((o) => o.data![CBN_QUESTION_KEY] as number))
const headingOf = (page: StudioPageOutput) =>
  textOf(page.objects.find(isStudioHeaderTitle) ?? ({} as StudioFabricObject))

// Content comes from the prefetch; the seed changes the reading order.
runGeneratorContractTests(careerNumbersTemplate, {
  configOverrides: { showTitle: true, title: CBN_DEFAULT_TITLE, showInstructions: true },
  contextOverrides: { remoteData: CBN_FIXTURE },
})

describe('career-by-the-numbers registry', () => {
  it('is registered once, in the word tab, with no answer key', () => {
    expect(STUDIO_TEMPLATES.filter((t) => t.key === 'career-by-the-numbers')).toHaveLength(1)
    const registered = getStudioTemplate('career-by-the-numbers')!
    expect(registered.category).toBe('word')
    expect(registered.producesAnswerKey).toBe(false)
    expect(registered.defaultPageTitle).toBe(CBN_DEFAULT_TITLE)
    expect(registered.prefetch).toBeTypeOf('function')
  })

  it('asks only the name, the kind of work, how many questions and the distance unit', () => {
    expect(careerNumbersTemplate.configSchema.map((f) => f.key)).toEqual([
      'retireeName',
      'workplace',
      'questions',
      'distance',
    ])
    const config = buildDefaultConfig(careerNumbersTemplate)
    expect(config.retireeName).toBe('')
    expect(config.workplace).toBe('any')
    expect(config.questions).toBe(CBN_DEFAULT_COUNT)
    expect(config.distance).toBe('miles')
  })

  it('refuses a name that is not a name, under the name field', () => {
    expect(careerNumbersTemplate.validateConfig!({ ...base, retireeName: '<Linda>' })?.field).toBe('retireeName')
    expect(careerNumbersTemplate.validateConfig!({ ...base, retireeName: 'Linda' })).toBeNull()
  })
})

describe.each(TRIMS)('on a %s x %s trim', (w, h) => {
  const ctx = kdpCtx(w, h)

  it('prints every question whole, numbered in order, each with its line and unit', () => {
    for (const questions of [CBN_DEFAULT_COUNT, 20]) {
      const pages = generate({ ...base, questions }, ctx)
      expect(numbersOf(pages)).toEqual(Array.from({ length: questions }, (_, i) => i + 1))
      const widths = new Set<number>()
      for (const page of pages) {
        assertObjectsInSafeMargin(page.objects, ctx)
        const rows = questionsOn(page.objects)
        expect(rows.length).toBeGreaterThan(0)
        // A row never parts from its line or its unit: each lands on the same page as its question.
        expect(tagged(page.objects, CBN_LINE_KEY).map((o) => o.data![CBN_LINE_KEY])).toEqual(
          rows.map((o) => o.data![CBN_QUESTION_KEY]),
        )
        expect(tagged(page.objects, CBN_UNIT_KEY).map((o) => o.data![CBN_UNIT_KEY])).toEqual(
          rows.map((o) => o.data![CBN_QUESTION_KEY]),
        )
        for (const line of tagged(page.objects, CBN_LINE_KEY)) {
          expect(line.width!).toBeGreaterThanOrEqual(NUMBER_LINE_MIN)
          widths.add(line.width!)
          // The unit starts just after its line, on the same row.
          const unit = tagged(page.objects, CBN_UNIT_KEY).find((u) => u.data![CBN_UNIT_KEY] === line.data![CBN_LINE_KEY])!
          expect(unit.left).toBeGreaterThan(line.left + line.width!)
          expect(Math.abs(unit.top + unit.fontSize! - line.top)).toBeLessThan(unit.fontSize!)
        }
        for (const q of rows) {
          expect(q.fontSize).toBeGreaterThanOrEqual(PROMPT_FONT_MIN)
          expect(textOf(q).split('\n').length).toBeLessThanOrEqual(3)
        }
      }
      // One writing-line length across the whole set.
      expect(widths.size).toBe(1)
      // Spread evenly: no page more than one row heavier than another, the how-to page aside.
      const counts = pages.slice(1).map((p) => questionsOn(p.objects).length)
      if (counts.length > 1) expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1)
    }
  })

  it('stamps every printed question so later runs can avoid it', () => {
    const pages = generate(base, ctx)
    const labels = pages.flatMap((p) =>
      p.objects.filter((o) => typeof o.data?.[STUDIO_CONTENT_LABEL_KEY] === 'string').map((o) => o.data![STUDIO_CONTENT_LABEL_KEY]),
    )
    expect(labels).toHaveLength(CBN_DEFAULT_COUNT)
    expect(new Set(labels).size).toBe(CBN_DEFAULT_COUNT)
  })

  it('reports in the form what it prints', () => {
    const note = cbnPrintNote({ page: ctx, config: base, font: FONT, name: '', count: 10 })
    const layout = cbnLayout({ page: ctx, config: base, font: FONT, name: '' })!
    expect(note).toMatch(/^10 questions on (one page|about \d+ pages) in \d+ pt large print/)
    expect(note).toContain(`${pxToPt(layout.plan.metrics.font)} pt`)
  })
})

describe('the page', () => {
  it('fills a 6 x 9 with the default set on two pages', () => {
    expect(generate(base, kdpCtx(6, 9))).toHaveLength(2)
  })

  it('never shrinks type below 14 pt, and wider trims never print smaller', () => {
    const sizes = TRIMS.map(([w, h]) => cbnLayout({ page: kdpCtx(w, h), config: base, font: FONT, name: '' })!.plan.metrics.font)
    for (const size of sizes) expect(size).toBeGreaterThanOrEqual(PROMPT_FONT_MIN)
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]!).toBeGreaterThanOrEqual(sizes[i - 1]!)
    expect(pxToPt(sizes.at(-1)!)).toBe(18)
    const layout = cbnLayout({ page: kdpCtx(5, 8), config: base, font: FONT, name: '' })!
    expect(layout.plan.metrics.rowH).toBeGreaterThanOrEqual(ANSWER_ROW_MIN)
  })

  it('prints in black ink with grey writing lines only: no fills that print as blocks', () => {
    const pages = generate({ ...base, questions: 20 }, kdpCtx(6, 9))
    for (const o of pages.flatMap((p) => p.objects)) {
      if (o.data?.[CBN_MOTIF_KEY]) continue
      // The shared how-to line is the Studio's muted ink; everything else is black.
      if (o.type === 'textbox') expect([STUDIO_INK, STUDIO_INK_MUTED]).toContain(o.fill)
      else if (o.data?.[CBN_LINE_KEY]) expect(o.height).toBe(1)
      else expect(['transparent', '#FFFFFF', undefined]).toContain(o.fill)
    }
  })

  it('closes with a small motif row only where the last page has room', () => {
    let drawn = 0
    for (const [w, h] of TRIMS) {
      for (const questions of CBN_COUNTS) {
        const pages = generate({ ...base, questions }, kdpCtx(w, h))
        pages.slice(0, -1).forEach((page) => expect(tagged(page.objects, CBN_MOTIF_KEY)).toHaveLength(0))
        const motifs = tagged(pages.at(-1)!.objects, CBN_MOTIF_KEY)
        expect([0, 3]).toContain(motifs.length)
        if (motifs.length) drawn++
      }
    }
    expect(drawn).toBeGreaterThan(0)
  })

  it('keeps every page’s heading and gives the how-to once, estimates welcome', () => {
    const pages = generate({ ...base, questions: 20 }, kdpCtx(6, 9))
    expect(pages.length).toBeGreaterThan(2)
    for (const page of pages) expect(headingOf(page)).toBe(CBN_DEFAULT_TITLE)
    expect(texts(pages).filter((t) => t.includes('best guess'))).toHaveLength(1)
    expect(texts(pages).join('\n')).toContain('nobody’s checking')
  })

  it('prints “About” before every line and never a number for the retiree', () => {
    const pages = generate(base, kdpCtx(6, 9))
    const all = texts(pages)
    expect(all.filter((t) => t === 'About')).toHaveLength(CBN_DEFAULT_COUNT)
    for (const page of pages) {
      for (const q of questionsOn(page.objects)) expect(textOf(q)).not.toMatch(/\d/)
    }
  })
})

describe('personal touches', () => {
  it('names the retiree in the heading only, and never in what the book remembers', () => {
    const pages = generate({ ...base, retireeName: 'Linda' }, kdpCtx(6, 9))
    expect(headingOf(pages[0]!)).toBe('Linda’s Career By the Numbers')
    const labels = pages.flatMap((p) => questionsOn(p.objects).map((o) => String(o.data![STUDIO_CONTENT_LABEL_KEY])))
    expect(labels.join('\n')).not.toContain('Linda')
  })

  it('keeps a heading the seller typed, and prints none when titles are off', () => {
    expect(headingOf(generate({ ...base, retireeName: 'Linda', title: 'Work in Numbers' }, kdpCtx(6, 9))[0]!)).toBe(
      'Work in Numbers',
    )
    const untitled = generate({ ...base, showTitle: false, title: '' }, kdpCtx(6, 9))
    expect(untitled.every((page) => !page.objects.some(isStudioHeaderTitle))).toBe(true)
  })

  it('drops the how-to when instructions are off', () => {
    expect(texts(generate({ ...base, showInstructions: false }, kdpCtx(6, 9))).join('\n')).not.toContain('best guess')
  })

  it('prints distances in kilometres when asked, never miles', () => {
    const pages = generate({ ...base, distance: 'km', questions: 20 }, kdpCtx(6, 9, {
      questions: [
        ...CBN_FIXTURE_ITEMS.filter((q) => q.unit !== 'miles'),
        {
          question: 'About how many kilometres did you travel getting to and from work over your career?',
          unit: 'kilometres',
          theme: 'commute',
          tone: 'playful',
          shape: 'career-total',
        },
      ],
    }))
    expect(texts(pages).join('\n')).not.toMatch(/\bmiles\b/)
  })
})

describe('content that cannot print', () => {
  const messageOf = (pages: StudioPageOutput[]) => texts(pages).join('\n')

  it('says so when nothing came back', () => {
    const pages = generate(base, kdpCtx(6, 9, null))
    expect(pages).toHaveLength(1)
    expect(messageOf(pages)).toContain(CBN_AI_EMPTY_MESSAGE)
  })

  it('says so when the questions cannot make a balanced set', () => {
    expect(messageOf(generate(base, kdpCtx(6, 9, { questions: CBN_FIXTURE_ITEMS.slice(0, 6) })))).toContain(
      CBN_SHORT_MESSAGE,
    )
  })

  it('refuses a page too small to write on', () => {
    const tiny: StudioGenerateContext = { ...kdpCtx(6, 9), pageWidth: 200, pageHeight: 300 }
    expect(messageOf(generate(base, tiny))).toContain(CBN_PAGE_TOO_SMALL_MESSAGE)
  })

  it('re-validates whatever reached the page: an invented number or a sore subject never prints', () => {
    const tampered = {
      questions: CBN_FIXTURE_ITEMS.map((q, i) =>
        i === 2
          ? { ...q, question: 'You ate 4,000 biscuits over your career, didn’t you?' }
          : i === 3
            ? { ...q, question: 'How many sick days did you take over the years?', unit: 'sick days' }
            : q,
      ),
    }
    const all = messageOf(generate(base, kdpCtx(6, 9, tampered)))
    expect(all).not.toContain('4,000')
    expect(all).not.toContain('sick days')
  })
})

describe('runCbnKdpPreflight', () => {
  const ctx = kdpCtx(6, 9)
  const layout = cbnLayout({ page: ctx, config: base, font: FONT, name: '' })!
  const size = 10
  const questions = fitCbnQuestions(
    numberCbnSet(orderCbnSet(pickCbnSet(cleanCbnPool(CBN_FIXTURE.questions), size).picks!, 1)),
    layout.plan,
    FONT,
  )
  const lineW = answerLineWidth(layout.plan, questions.map((q) => q.unit), FONT)
  const usable = usableHeight(layout.plan, layout.fields)
  const pages = paginateCbn(questions, layout.plan, usable)!
  const run = (overrides: Partial<Parameters<typeof runCbnKdpPreflight>[0]>) =>
    runCbnKdpPreflight({
      questions,
      pages,
      plan: layout.plan,
      size,
      distance: 'miles',
      font: FONT,
      lineW,
      columnWidth: cbnContentBox(ctx).width,
      usable,
      ...overrides,
    })

  it('passes a set as generated', () => {
    expect(run({})).toEqual({ ok: true, warnings: [], errors: [] })
  })

  it('catches a missing question, an overflowing page and a row wider than the column', () => {
    expect(run({ pages: [pages[0]!] }).ok).toBe(false)
    expect(run({ usable: () => 50 }).errors).toContain('A question runs past the printable area.')
    expect(run({ columnWidth: 100 }).errors).toContain('The questions run wider than the printable area.')
  })

  it('catches a short writing line, a unit pushed off the row and a question set differently', () => {
    expect(run({ lineW: 40 }).errors).toContain('Writing lines must stay long enough for a big number.')
    expect(run({ lineW: layout.plan.textWidth }).ok).toBe(false)
    const changed = questions.map((q, i) => (i === 0 ? { ...q, lines: ['Something else?'] } : q))
    expect(run({ questions: changed }).ok).toBe(false)
  })
})

describe('every count', () => {
  it.each(CBN_COUNTS)('prints %i questions on a 6 x 9', (count) => {
    const pages = generate({ ...base, questions: count }, kdpCtx(6, 9))
    expect(numbersOf(pages)).toHaveLength(count)
  })
})
