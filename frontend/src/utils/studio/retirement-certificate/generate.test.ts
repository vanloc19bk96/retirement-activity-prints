import { beforeEach, describe, expect, it } from 'vitest'
import type {
  StudioConfig,
  StudioFabricObject,
  StudioGenerateContext,
  StudioPageOutput,
} from '@/types/studio-template.types'
import { DPI } from '@/types/canvas-settings.types'
import { buildDefaultConfig, getStudioTemplate } from '@/constants/studio-templates'
import { resetObjectCounter } from '../studio-fabric-builders'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import { clearStudioRecentContent } from '../studio-variety'
import {
  assertGeneratorEntropy,
  assertObjectsInSafeMargin,
  runGeneratorContractTests,
} from '../studio-generator-test'
import { retirementCertificateTemplate } from './generate'
import {
  CR_CITATIONS,
  CR_DEFAULT_TITLE,
  CR_HEADINGS,
  CR_LEADS,
  CR_PAGE_TOO_SMALL_MESSAGE,
  CR_PROMOTIONS,
  CR_SERVICE,
  CR_SIGN_LABELS,
  CR_TITLE_TEXTS,
  CR_TONES,
  citationText,
  crCitationsFor,
  crTitlesFor,
  parseCrDate,
  parseCrName,
  parseCrYears,
  type CrTone,
} from './content'
import { SIZES } from './layout'
import { parseCrRemoteData, retirementCertificatePrefetch } from './prefetch'

const FONT = 'PT Serif'
const NBSP = / /g

const base: StudioConfig = {
  ...buildDefaultConfig(retirementCertificateTemplate),
  showTitle: true,
  title: CR_DEFAULT_TITLE,
  seed: 42,
  fontFamily: FONT,
}

const full: StudioConfig = {
  ...base,
  retireeName: 'Linda Moore',
  yearsOfService: '32',
  retirementDate: '2026-06-30',
  workplace: 'Riverside Library',
}

/** A real KDP interior: DPI 96, inside margin 0.375", the rest 0.25". */
const kdpCtx = (wIn: number, hIn: number, seed = 42, bookLabels: string[] = []): StudioGenerateContext => ({
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
  remoteData: { bookLabels },
})

const TRIMS = [
  [5, 8],
  [5.5, 8.5],
  [6, 9],
  [7, 10],
  [8, 10],
  [8.5, 11],
] as const

function run(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  resetObjectCounter()
  return retirementCertificateTemplate.generate({ ...config, seed: ctx.seed }, ctx)
}

const plain = (o: StudioFabricObject) => (o.text ?? '').replace(NBSP, ' ').replace(/\n/g, ' ')
const texts = (page: StudioPageOutput) => page.objects.filter((o) => o.type === 'textbox').map(plain)
const labels = (pages: StudioPageOutput[]) =>
  pages.flatMap((p) =>
    p.objects.flatMap((o) => {
      const label = o.data?.[STUDIO_CONTENT_LABEL_KEY]
      return typeof label === 'string' ? [label] : []
    }),
  )
const labelled = (page: StudioPageOutput, prefix: string) =>
  page.objects.find((o) => String(o.data?.[STUDIO_CONTENT_LABEL_KEY] ?? '').startsWith(prefix))
const isErrorPage = (pages: StudioPageOutput[]) =>
  pages.length === 1 && !pages[0]!.objects.some((o) => o.studioRole === 'structure')

beforeEach(() => clearStudioRecentContent())

runGeneratorContractTests(retirementCertificateTemplate, {
  expectAnswers: false,
  contextOverrides: { remoteData: { bookLabels: [] } },
})

assertGeneratorEntropy(retirementCertificateTemplate, {
  seeds: 40,
  contextOverrides: { remoteData: { bookLabels: [] } },
})

describe('retirement-certificate registry', () => {
  it('is a one-page, no-answer-key word template with a short form', () => {
    const def = getStudioTemplate('retirement-certificate')
    expect(def).toBeDefined()
    expect(def!.producesAnswerKey).toBe(false)
    expect(def!.pageCount).toBe(1)
    expect(def!.category).toBe('word')
    expect(retirementCertificateTemplate.configSchema.map((f) => f.key)).toEqual([
      'retireeName',
      'yearsOfService',
      'retirementDate',
      'workplace',
      'tone',
      'promotedTo',
    ])
  })

  it('offers no instructions toggle, and explains the varied default heading', () => {
    const fields = getStudioTemplate('retirement-certificate')!.configSchema
    expect(fields.some((f) => f.key === 'showInstructions')).toBe(false)
    expect(fields.find((f) => f.key === 'title')?.help).toContain('own')
    // Other templates keep the toggle.
    expect(getStudioTemplate('well-wishes-signatures')!.configSchema.some((f) => f.key === 'showInstructions')).toBe(true)
  })
})

describe('retirement-certificate on every KDP trim', () => {
  for (const [w, h] of TRIMS) {
    for (const tone of CR_TONES.map((t) => t.value)) {
      for (const [label, config] of [
        ['blank', base],
        ['filled', full],
      ] as const) {
        it(`${w} x ${h}, ${tone}, ${label}`, () => {
          for (let seed = 1; seed <= 6; seed++) {
            clearStudioRecentContent()
            const ctx = kdpCtx(w, h, seed * 7919 + w)
            const out = run({ ...config, tone }, ctx)
            expect(isErrorPage(out)).toBe(false)
            expect(out).toHaveLength(1)
            const page = out[0]!
            assertObjectsInSafeMargin(page.objects, ctx)

            // Black ink only; no fills beyond hairlines and tiny dots.
            for (const o of page.objects) {
              for (const paint of [o.fill, o.stroke]) {
                if (!paint || paint === 'transparent') continue
                expect(['#000000', '#111827']).toContain(paint)
              }
              if (o.type === 'circle' && o.fill === '#000000') expect(o.radius!).toBeLessThanOrEqual(3)
              if (o.type === 'rect' && o.fill === '#111827') expect(o.height!).toBeLessThanOrEqual(2)
            }

            // Every word printed is at reading size and well formed.
            for (const o of page.objects.filter((x) => x.type === 'textbox')) {
              expect(o.fontSize!).toBeGreaterThanOrEqual(SIZES.signLabel.min)
              expect(plain(o)).not.toMatch(/[{}]|undefined|NaN| {2}/)
            }

            // The name is the largest text on the page when printed.
            const title = labelled(page, 't:')!
            expect(CR_TITLE_TEXTS.has(plain(title))).toBe(true)
            if (config === full) {
              const name = page.objects.find((o) => plain(o) === 'Linda Moore')!
              expect(name).toBeDefined()
              const sizes = page.objects.filter((o) => o.type === 'textbox').map((o) => o.fontSize!)
              expect(name.fontSize).toBe(Math.max(...sizes))
              expect(texts(page).join(' ')).toContain('32 years of')
              expect(texts(page).join(' ')).toContain('at Riverside Library')
              expect(texts(page)).toContain('June 30, 2026')
            }
          }
        })
      }
    }
  }

  it('says plainly when the page is too small', () => {
    const out = run(base, kdpCtx(3, 4))
    expect(isErrorPage(out)).toBe(true)
    expect(out[0]!.objects.some((o) => o.text === CR_PAGE_TOO_SMALL_MESSAGE)).toBe(true)
  })

  it('fits the longest allowed name, workplace, date and title on the smallest trim', () => {
    const config = {
      ...base,
      retireeName: 'Dr. Margaret O’Connell-Hughesby',
      yearsOfService: '45',
      retirementDate: 'September 30, 2026',
      workplace: 'Riverside County Public Library Dept',
      promotedTo: 'Director of Doing Exactly What She Likes',
    }
    for (const tone of CR_TONES.map((t) => t.value)) {
      for (let seed = 1; seed <= 10; seed++) {
        const ctx = kdpCtx(5, 8, seed)
        const out = run({ ...config, tone }, ctx)
        expect(isErrorPage(out)).toBe(false)
        assertObjectsInSafeMargin(out[0]!.objects, ctx)
        expect(texts(out[0]!).join(' ')).toContain('Director of Doing Exactly What She Likes')
      }
    }
  })
})

describe('retirement-certificate personalization', () => {
  it('reads complete with nothing filled in: a name line, “many years”, a blank date line', () => {
    const out = run(base, kdpCtx(6, 9))
    const all = texts(out[0]!).join(' ')
    expect(all).toContain('many years of')
    expect(all).not.toMatch(/\bat\s*[.,—]/)
    expect(texts(out[0]!)).toContain('Date')
    // The long name line is drawn.
    const lines = out[0]!.objects.filter((o) => o.type === 'rect' && o.height === 2)
    expect(lines.length).toBe(1)
    expect(lines[0]!.width!).toBeGreaterThanOrEqual(DPI * 2.2)
  })

  it('prints a typed heading and a typed title verbatim', () => {
    const out = run({ ...full, title: 'Happy Trails, Pat!', promotedTo: 'Head Gardener' }, kdpCtx(6, 9))
    expect(texts(out[0]!)).toContain('Happy Trails, Pat!')
    expect(texts(out[0]!)).toContain('Head Gardener')
  })

  it('never prints a “Game N” number from a whole-book run as its heading', () => {
    const out = run({ ...full, title: 'Game 7' }, kdpCtx(6, 9))
    expect(texts(out[0]!).join(' ')).not.toContain('Game 7')
    expect(labels(out).some((l) => l.startsWith('h:'))).toBe(true)
  })

  it('prints no heading with the page title switched off, and still lays out', () => {
    const out = run({ ...full, showTitle: false, title: '' }, kdpCtx(6, 9))
    expect(isErrorPage(out)).toBe(false)
    expect(labels(out).some((l) => l.startsWith('h:'))).toBe(false)
  })

  it('puts the retirement year on the seal when a date is given', () => {
    let sawYear = false
    for (let seed = 1; seed <= 20 && !sawYear; seed++) {
      clearStudioRecentContent()
      const out = run(full, kdpCtx(8.5, 11, seed))
      sawYear = texts(out[0]!).includes('2026')
    }
    expect(sawYear).toBe(true)
  })

  it('validates each field and points at the one to fix', () => {
    const validate = retirementCertificateTemplate.validateConfig!
    expect(validate(full)).toBeNull()
    expect(validate(base)).toBeNull()
    expect(validate({ ...base, retireeName: '<script>' })?.field).toBe('retireeName')
    expect(validate({ ...base, yearsOfService: 'thirty' })?.field).toBe('yearsOfService')
    expect(validate({ ...base, yearsOfService: '0' })?.field).toBe('yearsOfService')
    expect(validate({ ...base, retirementDate: 'soon' })?.field).toBe('retirementDate')
    expect(validate({ ...base, workplace: '555-1234 <b>' })?.field).toBe('workplace')
    expect(validate({ ...base, promotedTo: 'x'.repeat(60) })?.field).toBe('promotedTo')
    expect(validate({ ...base, title: 'x'.repeat(60) })?.field).toBe('title')
  })

  it('parses names, years and dates into print-ready text', () => {
    expect(parseCrName("  Pat  O'Brien ")).toBe('Pat O’Brien')
    expect(parseCrName('123')).toBe('')
    expect(parseCrYears(' 32 ')).toBe(32)
    expect(parseCrYears('71')).toBe(0)
    expect(parseCrDate('2026-06-30')).toBe('June 30, 2026')
    expect(parseCrDate('30 June 2026')).toBe('30 June 2026')
    expect(parseCrDate('2026-13-01')).toBe('')
  })

  it('builds a clean sentence for every citation, with and without details', () => {
    for (const citation of CR_CITATIONS) {
      for (const service of CR_SERVICE) {
        for (const [years, place] of [
          [0, ''],
          [1, ''],
          [32, 'Riverside Library'],
        ] as const) {
          const text = citationText(citation, service, years, place)
          expect(text).not.toMatch(/[{}]| {2}|\s[,.]/)
          expect(text).toMatch(/[.]$/)
          if (years === 1) expect(text).toContain('1 year of')
        }
      }
    }
  })
})

describe('retirement-certificate wording', () => {
  const everything = [
    ...CR_HEADINGS.flatMap((h) => [h.main, h.over ?? '']),
    ...CR_LEADS.map((l) => l.text),
    ...CR_CITATIONS.map((c) => c.text),
    ...CR_PROMOTIONS.map((p) => p.text),
    ...CR_SIGN_LABELS.map((s) => s.text),
    ...CR_TITLE_TEXTS,
  ]

  it('keeps humour kind: nothing about age, health, memory, money or idleness', () => {
    const unkind =
      /\b(old|elderly|senior|senile|dementia|forget\w*|memory loss|grey|gray|wrinkl\w*|walker|cane|pill\w*|doctor'?s|nap\w*|lazy|useless|couch potato|over the hill|death|dying|broke|pension|funds|rocking)\b/i
    for (const text of everything) expect(text).not.toMatch(unkind)
  })

  it('has short, distinct titles for every tone', () => {
    for (const tone of CR_TONES.map((t) => t.value) as CrTone[]) {
      const titles = crTitlesFor(tone)
      expect(new Set(titles).size).toBe(titles.length)
      expect(titles.length).toBeGreaterThanOrEqual(20)
      for (const title of titles) {
        expect(title.length).toBeLessThanOrEqual(40)
        expect(title).not.toMatch(/^(the|a|an)\b/i)
      }
    }
    expect(CR_TITLE_TEXTS.size).toBeGreaterThanOrEqual(100)
  })

  it('has a citation for every tone and lead kind', () => {
    for (const tone of CR_TONES.map((t) => t.value) as CrTone[]) {
      expect(crCitationsFor(tone, 'that').length).toBeGreaterThanOrEqual(2)
      expect(crCitationsFor(tone, 'to').length).toBeGreaterThanOrEqual(2)
    }
  })
})

describe('retirement-certificate variety and anti-duplication', () => {
  const lookOf = (pages: StudioPageOutput[]) => {
    const all = labels(pages)
    return {
      design: all.find((l) => l.startsWith('d:'))!,
      heading: all.find((l) => l.startsWith('h:')),
      title: all.find((l) => l.startsWith('t:'))!,
      citation: all.find((l) => l.startsWith('c:'))!,
    }
  }

  it('varies wording and look across seeds', () => {
    const looks = new Set<string>()
    const titles = new Set<string>()
    const frames = new Set<string>()
    const headings = new Set<string>()
    for (let seed = 1; seed <= 60; seed++) {
      clearStudioRecentContent()
      const look = lookOf(run(full, kdpCtx(6, 9, seed * 7919)))
      looks.add(`${look.heading}|${look.design}|${look.title}|${look.citation}`)
      titles.add(look.title)
      frames.add(look.design.split('/')[0]!)
      headings.add(look.heading!)
    }
    expect(looks.size).toBe(60)
    expect(titles.size).toBeGreaterThanOrEqual(35)
    expect(frames.size).toBe(7)
    expect(headings.size).toBeGreaterThanOrEqual(6)
  })

  it('never repeats a title, heading or look already in the book', () => {
    for (let seed = 1; seed <= 20; seed++) {
      clearStudioRecentContent()
      const first = run(full, kdpCtx(6, 9, seed))
      clearStudioRecentContent()
      const second = run(full, kdpCtx(6, 9, seed + 500, labels(first)))
      const a = lookOf(first)
      const b = lookOf(second)
      expect(b.title).not.toBe(a.title)
      expect(b.heading).not.toBe(a.heading)
      expect(b.citation).not.toBe(a.citation)
      expect(b.design.split('/')[0]).not.toBe(a.design.split('/')[0])
    }
  })

  it('steers a seller’s next certificate away from their last one', () => {
    const first = lookOf(run(full, kdpCtx(6, 9, 11)))
    const second = lookOf(run(full, kdpCtx(6, 9, 12)))
    expect(second.title).not.toBe(first.title)
    expect(second.design.split('/')[0]).not.toBe(first.design.split('/')[0])
  })

  it('gives a team book a different title for every retiree', () => {
    const book: string[] = []
    const titles = new Set<string>()
    for (let n = 0; n < 12; n++) {
      const out = run({ ...full, tone: 'classic' }, kdpCtx(6, 9, 900 + n, book))
      book.push(...labels(out))
      titles.add(lookOf(out).title)
    }
    expect(titles.size).toBe(12)
  })
})

describe('retirement-certificate prefetch', () => {
  it('reads back only this template’s labels from the book, no network', async () => {
    const seen: string[] = []
    const data = await retirementCertificatePrefetch(base, new AbortController().signal, {
      bookContentLabels: (key) => {
        seen.push(key)
        return ['t:chief-leisure-officer', 'd:double/laurel/beaded/italic']
      },
    })
    expect(seen).toEqual(['retirement-certificate'])
    expect(parseCrRemoteData(data).bookLabels).toEqual(['t:chief-leisure-officer', 'd:double/laurel/beaded/italic'])
    expect(parseCrRemoteData(null).bookLabels).toEqual([])
  })
})
