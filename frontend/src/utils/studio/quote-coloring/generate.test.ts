import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect, beforeEach } from 'vitest'
import type { StudioConfig, StudioFabricObject, StudioGenerateContext } from '@/types/studio-template.types'
import { STUDIO_TEMPLATES, buildDefaultConfig } from '@/constants/studio-templates'
import { DPI } from '@/types/canvas-settings.types'
import { STUDIO_INK } from '@/constants/studio.constants'
import { resetObjectCounter } from '../studio-fabric-builders'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import { clearStudioRecentContent } from '../studio-variety'
import { createRng } from '../studio-rng'
import { assertGeneratorEntropy, assertObjectsInSafeMargin, runGeneratorContractTests } from '../studio-generator-test'
import { composeQuotePage, QC_ALL_INK_WEIGHTS, QC_MIN_MOTIFS, type QcDesign } from './compose'
import { QC_CONFIG_SCHEMA } from './config'
import {
  QC_AI_EMPTY_MESSAGE,
  QC_DEFAULT_TITLE,
  QC_DETAILS,
  QC_FONTS_MISSING_MESSAGE,
  QC_PAGE_TOO_SMALL_MESSAGE,
  QC_SAYING_LIMITS,
  QC_TEMPLATE_KEY,
  parseQcBook,
  qcDetailSpec,
  qcPageLabel,
  sayingsRepeat,
  selectQcSayings,
  validQcSaying,
} from './content'
import { dealQcDesign, qcSetHint } from './design'
import { QC_FIXTURE_ITEMS, qcFixture, qcTestFonts } from './fixture'
import { QC_LETTER_STYLES } from './fonts'
import { runQcKdpPreflight } from './kdp-preflight'
import { glyphText, letteredText, readBack } from './lettering'
import { quoteColoringTemplate } from './generate'
import { parseQcRemoteData } from './prefetch'

/** A real KDP interior: DPI 96, inside margin 0.375", the rest 0.25". */
const kdpCtx = (wIn: number, hIn: number, remoteData: unknown = qcFixture(), seed = 42): StudioGenerateContext => ({
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
  ownerSalt: '5a'.repeat(16),
  remoteData,
})

const TRIMS = [
  [5, 8],
  [5.5, 8.5],
  [6, 9],
  [7, 10],
  [8, 10],
  [8.5, 11],
] as const

const base: StudioConfig = {
  ...buildDefaultConfig(quoteColoringTemplate),
  fontFamily: 'PT Serif',
  showTitle: true,
  title: QC_DEFAULT_TITLE,
  showInstructions: true,
}

function generate(config: StudioConfig, ctx: StudioGenerateContext) {
  resetObjectCounter()
  return quoteColoringTemplate.generate(config, ctx)
}

const panelOf = (objects: StudioFabricObject[]) => objects.find((o) => o.type === 'group' && o.data?.source === QC_TEMPLATE_KEY)
const labelOf = (objects: StudioFabricObject[]) => String(panelOf(objects)?.data?.[STUDIO_CONTENT_LABEL_KEY] ?? '')
const sayingOf = (objects: StudioFabricObject[]) => parseQcBook([labelOf(objects)])[0]?.saying
const fixtureSayings = QC_FIXTURE_ITEMS.map((item) => item.text)

beforeEach(() => clearStudioRecentContent())

runGeneratorContractTests(quoteColoringTemplate, {
  expectAnswers: false,
  configOverrides: { showTitle: true, title: QC_DEFAULT_TITLE, showInstructions: true },
  contextOverrides: { remoteData: qcFixture() },
})
assertGeneratorEntropy(quoteColoringTemplate, { seeds: 12, contextOverrides: { remoteData: qcFixture() } })

describe('quote coloring registry and form', () => {
  it('is registered once, in the spatial tab, with no answer page', () => {
    const found = STUDIO_TEMPLATES.filter((t) => t.key === QC_TEMPLATE_KEY)
    expect(found).toHaveLength(1)
    expect(found[0]!.category).toBe('spatial')
    expect(found[0]!.producesAnswerKey).toBe(false)
    expect(found[0]!.prefetch).toBeTypeOf('function')
  })

  it('asks four questions, each with a default, and nothing technical', () => {
    expect(QC_CONFIG_SCHEMA.map((f) => f.key)).toEqual(['theme', 'customTheme', 'tone', 'pattern', 'detail'])
    for (const field of QC_CONFIG_SCHEMA) expect(field.default).not.toBeUndefined()
    const visible = QC_CONFIG_SCHEMA.filter((f) => !f.visibleWhen || f.visibleWhen(buildDefaultConfig(quoteColoringTemplate)))
    expect(visible.map((f) => f.key)).toEqual(['theme', 'tone', 'pattern', 'detail'])
  })

  it('needs a typed theme only when the seller chose to write one', () => {
    expect(quoteColoringTemplate.validateConfig!(base)).toBeNull()
    expect(quoteColoringTemplate.validateConfig!({ ...base, theme: 'custom', customTheme: '' })?.field).toBe('customTheme')
    expect(quoteColoringTemplate.validateConfig!({ ...base, theme: 'custom', customTheme: 'life by the sea' })).toBeNull()
  })

  it('says so in the form when the trim is too small', () => {
    const detail = QC_CONFIG_SCHEMA.find((f) => f.key === 'detail')!
    const small = detail.helpWhen!(base, { pageWidth: 4 * DPI, pageHeight: 5 * DPI, margin: { top: 24, right: 24, bottom: 24, left: 36 } })
    expect(small).toMatch(/too small/)
    const fine = detail.helpWhen!(base, { pageWidth: 6 * DPI, pageHeight: 9 * DPI, margin: { top: 24, right: 24, bottom: 24, left: 36 } })
    expect(fine).toMatch(/Pattern shapes/)
  })

  it('keeps its saying limits in step with the service', () => {
    const path = fileURLToPath(new URL('../../../../../backend/app/data/studio/quote-coloring/prompt.json', import.meta.url))
    const limits = JSON.parse(readFileSync(path, 'utf8')).limits
    expect(QC_SAYING_LIMITS.minWords).toBe(limits.minWords)
    expect(QC_SAYING_LIMITS.maxWords).toBe(limits.maxWords)
    expect(QC_SAYING_LIMITS.maxWordLetters).toBe(limits.maxWordLetters)
    expect(QC_SAYING_LIMITS.minChars).toBe(limits.minChars)
    expect(QC_SAYING_LIMITS.maxChars).toBeLessThanOrEqual(limits.maxChars)
  })
})

describe('quote coloring sayings', () => {
  it('accepts every fixture saying unchanged', () => {
    expect(selectQcSayings(QC_FIXTURE_ITEMS)).toEqual(fixtureSayings)
  })

  it.each([
    ['', 'empty'],
    ['the porch is my office', 'no capital'],
    ['THE PORCH IS MY OFFICE', 'shouted'],
    ['The porch is my office ', 'untrimmed'],
    ['The porch is my 1st office', 'digit'],
    ['The porch: my office', 'colon'],
    ['The porch ,my office', 'broken spacing'],
    ['Wow!! The porch is mine', 'doubled punctuation'],
    ['Porch', 'one word'],
    ['Retirement is extraordinarily splendid', 'word too long to letter'],
    ['Coffee, garden, walk, lunch, nap, book, sunset, stars, dreams, more tea, cake', 'too long'],
  ])('refuses %j (%s)', (text) => {
    expect(validQcSaying(text)).toBeNull()
  })

  it('never takes an unverified saying', () => {
    expect(selectQcSayings([{ text: 'Plant something new each spring', verified: false }])).toEqual([])
    expect(selectQcSayings('nope')).toEqual([])
  })

  it('treats a reworded saying as the same saying', () => {
    expect(sayingsRepeat('Retirement means more time for what matters', 'Retirement gives you more time for what really matters')).toBe(true)
    expect(sayingsRepeat('My mornings are for tea and birdsong', 'Mornings are for coffee and birdsong')).toBe(true)
    expect(sayingsRepeat('The porch is my new corner office', 'Plant something new each spring')).toBe(false)
  })

  it('round-trips a page label', () => {
    const entry = { saying: 'Pack light, wander far', style: 'classic', layout: 'band', cartouche: 'oval', frame: 'tiled', fill: 'pack', set: 'travel' }
    expect(parseQcBook([qcPageLabel(entry), 'garbage'])).toEqual([entry])
  })
})

describe('quote coloring pages', () => {
  it('letters one of the service sayings, exactly, as outlines — never a text box', () => {
    const [page] = generate(base, kdpCtx(8.5, 11))
    const panel = panelOf(page!.objects)!
    expect(panel).toBeTruthy()
    expect(fixtureSayings).toContain(sayingOf(page!.objects))
    expect(panel.objects!.every((o) => o.type === 'path')).toBe(true)
    // The only text on the page is the heading and the instruction.
    const texts = page!.objects.filter((o) => o.type === 'textbox').map((o) => String(o.text))
    expect(texts.some((t) => t.includes(sayingOf(page!.objects)!))).toBe(false)
  })

  it('prints pure black line art at print weights, inside the safe area, on every KDP trim and level', () => {
    for (const [w, h] of TRIMS) {
      for (const detail of QC_DETAILS) {
        const ctx = kdpCtx(w, h)
        const [page] = generate({ ...base, detail: detail.value }, ctx)
        const panel = panelOf(page!.objects)
        expect(panel, `${w}x${h} ${detail.value}`).toBeTruthy()
        assertObjectsInSafeMargin(page!.objects, ctx)
        for (const child of panel!.objects!) {
          expect(child.stroke).toBe(STUDIO_INK)
          expect(child.fill).toBe('transparent')
          expect(QC_ALL_INK_WEIGHTS.has(child.strokeWidth!)).toBe(true)
          for (const command of child.path!) {
            const x = Number(command[1])
            const y = Number(command[2])
            expect(x).toBeGreaterThanOrEqual(ctx.margin.left)
            expect(x).toBeLessThanOrEqual(ctx.pageWidth - ctx.margin.right)
            expect(y).toBeGreaterThanOrEqual(ctx.margin.top)
            expect(y).toBeLessThanOrEqual(ctx.pageHeight - ctx.margin.bottom)
          }
        }
      }
    }
  }, 120000)

  it('builds a colorable, readable page in every face, layout and cartouche', () => {
    const fonts = qcTestFonts()
    // A letter-size panel holds every layout; a 5 x 8 one letters right across the page.
    const letter = { minX: 40, minY: 90, maxX: 40 + 7.3 * DPI, maxY: 90 + 9.4 * DPI }
    const small = { minX: 40, minY: 90, maxX: 40 + 4.25 * DPI, maxY: 90 + 5.6 * DPI }
    const smallRefusals = new Set<string>()
    for (const detail of QC_DETAILS) {
      for (const style of QC_LETTER_STYLES) {
        for (const [layout, box, frame] of [['medallion', letter, null], ['band', letter, null], ['band', small, 'single']] as const) {
          for (const cartouche of ['rounded', 'oval', 'scalloped', 'double', 'pill'] as const) {
            const rng = createRng(style.id.length * 31 + cartouche.length)
            const dealt = dealQcDesign({ style, pattern: 'mix', book: [], detail, rng })
            const design: QcDesign = { ...dealt, layout, cartouche, frame: frame ?? dealt.frame }
            const saying = 'Pack light, wander far'
            const page = composeQuotePage({ box, font: fonts[style.id]!, saying, design, detail, rng })
            const where = `${detail.value} ${style.id} ${layout} ${cartouche} ${box === small ? 'small' : 'letter'}`
            // On the small panel the widest faces may not fit the saying at a
            // colorable size; that is a lettering refusal, never a bad page.
            if (box === small && !page.ok && page.stage === 'lettering') {
              smallRefusals.add(`${detail.value}:${style.id}:${cartouche}`)
              continue
            }
            expect(page.ok, `${where}: ${page.ok ? '' : page.reason}`).toBe(true)
            if (!page.ok) continue
            const pre = runQcKdpPreflight({ saying, design, page, detail })
            expect(pre.errors, where).toEqual([])
            expect(readBack(page.lettering)).toBe(letteredText(saying, style.caps))
            expect(glyphText(page.lettering)).toBe(letteredText(saying, style.caps).replace(/ /g, ''))
            expect(page.lettering.size).toBeGreaterThanOrEqual(style.minEm)
            expect(page.report.narrowest).toBeGreaterThanOrEqual(detail.floor.minWidth)
            expect(page.report.smallest).toBeGreaterThanOrEqual(detail.floor.minArea)
            expect(page.motifs.length).toBeGreaterThanOrEqual(QC_MIN_MOTIFS)
          }
        }
      }
    }
    // On the small trim the widest faces and the double cartouche may not fit;
    // every level still letters the saying in at least one face.
    for (const detail of QC_DETAILS) {
      const refused = [...smallRefusals].filter((key) => key.startsWith(`${detail.value}:`)).length
      expect(refused, detail.value).toBeLessThan(QC_LETTER_STYLES.length * 5)
    }
  }, 120000)

  it('picks a saying the trim can letter at a colorable size, not just the first', () => {
    const long = { text: 'Less rushing, more wandering down quiet side streets', verified: true }
    const short = { text: 'Pack light, wander far', verified: true }
    const [page] = generate(base, kdpCtx(5, 8, qcFixture([long, short])))
    expect(sayingOf(page!.objects)).toBe(short.text)
  })

  it('never prints a saying the book already has, however it is reworded', () => {
    const first = QC_FIXTURE_ITEMS[0]!.text
    const labels = [qcPageLabel({ saying: 'My calendar only lists the sunsets', style: 'classic', layout: 'band', cartouche: 'oval', frame: 'single', fill: 'pack', set: 'floral' })]
    const [page] = generate(base, kdpCtx(8.5, 11, qcFixture(QC_FIXTURE_ITEMS, labels)))
    const saying = sayingOf(page!.objects)!
    expect(saying).not.toBe(first)
    expect(sayingsRepeat(saying, first)).toBe(false)
  })

  it('builds a book of different pages: no saying twice, faces and designs rotating', () => {
    const labels: string[] = []
    const pages: string[] = []
    for (let i = 0; i < QC_FIXTURE_ITEMS.length; i++) {
      clearStudioRecentContent()
      const [page] = generate({ ...base, seed: 100 + i }, kdpCtx(8.5, 11, qcFixture(QC_FIXTURE_ITEMS, [...labels]), 100 + i))
      const label = labelOf(page!.objects)
      expect(label, `page ${i}`).not.toBe('')
      labels.push(label)
      pages.push(label)
    }
    const book = parseQcBook(pages)
    const sayings = book.map((e) => e.saying)
    expect(new Set(sayings).size).toBe(sayings.length)
    expect(new Set(book.map((e) => e.style)).size).toBeGreaterThanOrEqual(4)
    expect(new Set(book.map((e) => e.set)).size).toBe(3)
    for (let i = 1; i < book.length; i++) {
      expect(book[i]!.cartouche, `page ${i}`).not.toBe(book[i - 1]!.cartouche)
      expect(book[i]!.frame, `page ${i}`).not.toBe(book[i - 1]!.frame)
    }
  }, 60000)

  it('two sellers with the same settings and sayings get different pages', () => {
    const a = generate(base, { ...kdpCtx(8.5, 11), ownerSalt: '11'.repeat(16) })
    const b = generate(base, { ...kdpCtx(8.5, 11), ownerSalt: '22'.repeat(16) })
    expect(JSON.stringify(panelOf(a[0]!.objects)!.objects)).not.toEqual(JSON.stringify(panelOf(b[0]!.objects)!.objects))
  })

  it('lets a mixed pattern suit the saying, without every page going one way', () => {
    expect(qcSetHint('Today I report to the garden')).toBe('floral')
    expect(qcSetHint('Pack light, wander far')).toBe('travel')
    expect(qcSetHint('Every Tuesday feels like a picnic')).toBeNull()
    const style = QC_LETTER_STYLES[0]!
    const detail = qcDetailSpec('classic')
    const garden = 'Today I report to the garden'
    expect(dealQcDesign({ style, pattern: 'mix', book: [], detail, rng: createRng(1), saying: garden }).set).toBe('floral')
    const floralBook = ['A', 'B'].map((x) => ({ saying: x, style: 'classic', layout: 'band', cartouche: 'oval', frame: 'single', fill: 'pack', set: 'floral' }))
    expect(dealQcDesign({ style, pattern: 'mix', book: floralBook, detail, rng: createRng(1), saying: garden }).set).not.toBe('floral')
    expect(dealQcDesign({ style, pattern: 'geometric', book: [], detail, rng: createRng(1), saying: garden }).set).toBe('geometric')
  })

  it('follows the chosen pattern', () => {
    for (const pattern of ['floral', 'geometric', 'travel'] as const) {
      const [page] = generate({ ...base, pattern }, kdpCtx(8.5, 11))
      expect(parseQcBook([labelOf(page!.objects)])[0]!.set).toBe(pattern)
    }
  })

  it('says so plainly instead of printing a broken page', () => {
    const message = (objects: StudioFabricObject[]) => objects.filter((o) => o.type === 'textbox').map((o) => String(o.text)).join(' ')
    const noFonts = generate(base, kdpCtx(8.5, 11, { ...qcFixture(), fonts: {} }))[0]!.objects
    expect(panelOf(noFonts)).toBeUndefined()
    expect(message(noFonts)).toContain(QC_FONTS_MISSING_MESSAGE)
    const noSayings = generate(base, kdpCtx(8.5, 11, qcFixture([])))[0]!.objects
    expect(message(noSayings)).toContain(QC_AI_EMPTY_MESSAGE)
    const unverified = generate(base, kdpCtx(8.5, 11, qcFixture(QC_FIXTURE_ITEMS.map((i) => ({ ...i, verified: false })))))[0]!.objects
    expect(message(unverified)).toContain(QC_AI_EMPTY_MESSAGE)
    const tiny = generate(base, kdpCtx(4, 5))[0]!.objects
    expect(message(tiny)).toContain(QC_PAGE_TOO_SMALL_MESSAGE)
  })

  it('reads remote data defensively', () => {
    expect(parseQcRemoteData(undefined)).toEqual({ items: [], bookLabels: [], fonts: {} })
    const parsed = parseQcRemoteData({ items: [], bookLabels: ['a', 3], fonts: { classic: {}, bogus: qcTestFonts().classic } })
    expect(parsed.bookLabels).toEqual(['a'])
    expect(parsed.fonts).toEqual({})
  })

  it('stamps the saying and design for the book, and a canonical key for uniqueness', () => {
    const [page] = generate(base, kdpCtx(8.5, 11))
    const panel = panelOf(page!.objects)!
    expect(parseQcBook([labelOf(page!.objects)])).toHaveLength(1)
    expect(String(panel.data?.studioCanonicalKey ?? Object.values(panel.data ?? {}).find((v) => String(v).startsWith(`${QC_TEMPLATE_KEY}:`)))).toContain(QC_TEMPLATE_KEY)
  })

  it('uses every detail level’s own floor', () => {
    const relaxed = qcDetailSpec('relaxed')
    const detailed = qcDetailSpec('detailed')
    expect(relaxed.floor.minWidth).toBeGreaterThan(detailed.floor.minWidth)
    expect(relaxed.pack[0]).toBeGreaterThan(detailed.pack[0])
  })
})
