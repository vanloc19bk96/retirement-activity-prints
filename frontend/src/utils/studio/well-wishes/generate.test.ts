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
import { isStudioHeaderTitle } from '../studio-layout'
import { createRng } from '../studio-rng'
import { clearStudioRecentContent } from '../studio-variety'
import {
  assertGeneratorEntropy,
  assertObjectsInSafeMargin,
  runGeneratorContractTests,
} from '../studio-generator-test'
import { wellWishesTemplate } from './generate'
import {
  WW_AUDIENCES,
  WW_DEFAULT_TITLE,
  WW_HEADINGS,
  WW_PAGE_COUNTS,
  WW_PAGE_TOO_SMALL_MESSAGE,
  WW_PROMPT_TEXTS,
  dealPrompts,
  parseWwName,
  wwNameProblem,
  wwPromptsFor,
  type WwAudience,
} from './content'
import { BOX_MIN_WIDTH, LABEL_FONT_MIN, PITCH_MIN } from './layout'
import { wwPrintNote } from './summary'
import { parseWwRemoteData, wellWishesPrefetch } from './prefetch'

const FONT = 'PT Serif'

const base: StudioConfig = {
  ...buildDefaultConfig(wellWishesTemplate),
  showTitle: true,
  title: WW_DEFAULT_TITLE,
  showInstructions: true,
  seed: 42,
  fontFamily: FONT,
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
  return wellWishesTemplate.generate({ ...config, seed: ctx.seed }, ctx)
}

const frames = (page: StudioPageOutput) => page.objects.filter((o) => o.studioRole === 'structure')
const prompts = (page: StudioPageOutput) => page.objects.filter((o) => o.studioRole === 'prompt')
const title = (page: StudioPageOutput) => page.objects.find(isStudioHeaderTitle)?.text?.replace(/ /g, ' ')
const labels = (pages: StudioPageOutput[]) =>
  pages.flatMap((p) =>
    p.objects.flatMap((o) => {
      const label = o.data?.[STUDIO_CONTENT_LABEL_KEY]
      return typeof label === 'string' ? [label] : []
    }),
  )

/** Frame extent, whether drawn as a rect (top-left) or a polygon (centre origin). */
function frameBox(o: StudioFabricObject) {
  const w = o.width ?? 0
  const h = o.height ?? 0
  const left = o.originX === 'center' ? o.left - w / 2 : o.left
  const top = o.originY === 'center' ? o.top - h / 2 : o.top
  return { left, top, right: left + w, bottom: top + h, width: w, height: h }
}

const isErrorPage = (pages: StudioPageOutput[]) =>
  pages.length === 1 && pages[0]!.objects.every((o) => o.studioRole !== 'structure')

beforeEach(() => clearStudioRecentContent())

runGeneratorContractTests(wellWishesTemplate, {
  expectAnswers: false,
  contextOverrides: { remoteData: { bookLabels: [] } },
})

assertGeneratorEntropy(wellWishesTemplate, {
  seeds: 40,
  contextOverrides: { remoteData: { bookLabels: [] } },
})

describe('well-wishes registry', () => {
  it('is registered as a no-answer-key word template with a small form', () => {
    const def = getStudioTemplate('well-wishes-signatures')
    expect(def).toBeDefined()
    expect(def!.producesAnswerKey).toBe(false)
    expect(def!.category).toBe('word')
    const own = wellWishesTemplate.configSchema.map((f) => f.key)
    expect(own).toEqual(['retireeName', 'audience', 'pages'])
  })

  it('explains the varied default heading in the title help', () => {
    const titleField = getStudioTemplate('well-wishes-signatures')!.configSchema.find((f) => f.key === 'title')
    expect(titleField?.help).toContain('Well Wishes')
    expect(titleField?.help).toContain('own')
  })
})

describe('well-wishes pages on every KDP trim', () => {
  for (const [w, h] of TRIMS) {
    for (const pages of WW_PAGE_COUNTS) {
      for (const audience of WW_AUDIENCES.map((a) => a.value)) {
        it(`${w} x ${h}, ${pages} page(s), ${audience}`, () => {
          const ctx = kdpCtx(w, h, 1000 + pages * 31 + w * 7)
          const config = { ...base, pages, audience }
          const out = run(config, ctx)
          expect(isErrorPage(out)).toBe(false)
          expect(out).toHaveLength(pages)

          const note = wwPrintNote({ page: ctx, config, font: FONT, name: '', pages })
          const total = out.reduce((sum, p) => sum + frames(p).length, 0)
          expect(note).toContain(`${total} message boxes`)

          for (const page of out) {
            assertObjectsInSafeMargin(page.objects, ctx)
            const boxes = frames(page).map(frameBox)
            expect(boxes.length).toBeGreaterThan(0)
            expect(prompts(page)).toHaveLength(boxes.length)
            // One size per page, roomy enough for handwriting.
            for (const box of boxes) {
              expect(Math.abs(box.width - boxes[0]!.width)).toBeLessThanOrEqual(1)
              expect(Math.abs(box.height - boxes[0]!.height)).toBeLessThanOrEqual(1)
              expect(box.width).toBeGreaterThanOrEqual(BOX_MIN_WIDTH)
              expect(box.height).toBeGreaterThanOrEqual(DPI * 1.8)
            }
            // No two frames touch.
            for (let a = 0; a < boxes.length; a++) {
              for (let b = a + 1; b < boxes.length; b++) {
                const A = boxes[a]!
                const B = boxes[b]!
                const apart = A.right <= B.left || B.right <= A.left || A.bottom <= B.top || B.bottom <= A.top
                expect(apart).toBe(true)
              }
            }
            // Prompts are ours, large print, and never twice on a page.
            const texts = prompts(page).map((o) => o.text!.replace(/ /g, ' '))
            expect(new Set(texts).size).toBe(texts.length)
            for (const o of prompts(page)) {
              expect(WW_PROMPT_TEXTS.has(o.text!.replace(/ /g, ' '))).toBe(true)
              expect(o.fontSize).toBeGreaterThanOrEqual(LABEL_FONT_MIN)
            }
            // Black and grey ink only.
            for (const o of page.objects) {
              for (const paint of [o.fill, o.stroke]) {
                if (!paint || paint === 'transparent') continue
                expect(['#000000', '#111827', '#6B7280', '#9CA3AF', '#FFFFFF']).toContain(paint)
              }
            }
          }
        })
      }
    }
  }

  it('keeps writing lines at least wide-ruled and three or more per box', () => {
    const out = run(base, kdpCtx(6, 9))
    for (const page of out) {
      const lines = page.objects
        .filter((o) => o.type === 'rect' && o.height === 1 && o.fill === '#9CA3AF')
        .map((o) => o.top)
        .sort((a, b) => a - b)
      expect(lines.length).toBeGreaterThanOrEqual(frames(page).length * 3)
      const gaps = lines.slice(1).map((y, i) => y - lines[i]!).filter((gap) => gap > 0 && gap < DPI)
      expect(Math.min(...gaps)).toBeGreaterThanOrEqual(PITCH_MIN - 1)
    }
  })

  it('fills the page: no empty band under the boxes', () => {
    for (const [w, h] of TRIMS) {
      const ctx = kdpCtx(w, h)
      const out = run(base, ctx)
      for (const page of out) {
        const lowest = Math.max(...frames(page).map((o) => frameBox(o).bottom))
        const safeBottom = ctx.pageHeight - ctx.margin.bottom
        expect(safeBottom - lowest).toBeLessThan(DPI * 0.1)
      }
    }
  })

  it('uses two columns on wide trims and one on narrow ones', () => {
    const cols = (w: number, h: number) =>
      new Set(frames(run(base, kdpCtx(w, h))[0]!).map((o) => Math.round(frameBox(o).left))).size
    expect(cols(8.5, 11)).toBe(2)
    expect(cols(6, 9)).toBe(1)
    expect(cols(5, 8)).toBe(1)
  })

  it('says plainly when the page is too small', () => {
    const out = run(base, kdpCtx(3, 4))
    expect(isErrorPage(out)).toBe(true)
    expect(out[0]!.objects.some((o) => o.text === WW_PAGE_TOO_SMALL_MESSAGE)).toBe(true)
  })
})

describe('well-wishes headings and personalization', () => {
  it('picks one of its own headings when the title is left as the default', () => {
    const out = run(base, kdpCtx(6, 9))
    const headings = WW_HEADINGS.flatMap((h) => [h.plain, h.more])
    expect(headings).toContain(title(out[0]!))
    expect(WW_HEADINGS.map((h) => h.more)).toContain(title(out[1]!))
  })

  it('names the retiree in the heading or intro when a name is given', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const out = run({ ...base, retireeName: 'Linda' }, kdpCtx(6, 9, seed))
      const texts = out[0]!.objects.map((o) => o.text ?? '').join(' ').replace(/ /g, ' ')
      expect(texts).toContain('Linda')
    }
  })

  it('keeps a typed title on every page, verbatim', () => {
    const out = run({ ...base, title: 'Happy Trails, Pat!' }, kdpCtx(6, 9))
    expect(out.map(title)).toEqual(['Happy Trails, Pat!', 'Happy Trails, Pat!'])
  })

  it('prints no heading or ornament with the title and intro off', () => {
    const out = run({ ...base, showTitle: false, title: '', showInstructions: false }, kdpCtx(6, 9))
    for (const page of out) {
      expect(page.objects.some((o) => o.type === 'textbox' && isStudioHeaderTitle(o))).toBe(false)
      const firstFrame = Math.min(...frames(page).map((o) => frameBox(o).top))
      expect(firstFrame).toBeLessThan(Math.round(0.25 * DPI) + 20)
    }
  })

  it('fits a long name, falling back to the plain heading where it must', () => {
    const out = run({ ...base, retireeName: 'Aunt Josephine-Marie' }, kdpCtx(5, 8, 5))
    expect(isErrorPage(out)).toBe(false)
    for (const page of out) assertObjectsInSafeMargin(page.objects, kdpCtx(5, 8, 5))
  })

  it('accepts first names and nicknames only', () => {
    expect(parseWwName("  O'Brien ")).toBe('O’Brien')
    expect(parseWwName('Linda')).toBe('Linda')
    expect(parseWwName('<script>')).toBe('')
    expect(parseWwName('555-1234')).toBe('')
    expect(wwNameProblem('x'.repeat(40))).toMatch(/letters only/)
    expect(wwNameProblem('')).toBeNull()
    expect(wellWishesTemplate.validateConfig?.({ ...base, retireeName: '123 Main St' })?.field).toBe('retireeName')
  })
})

describe('well-wishes variety and anti-duplication', () => {
  const lookOf = (pages: StudioPageOutput[]) => {
    const all = labels(pages)
    const design = all.find((l) => l.startsWith('d:'))!
    const heading = all.find((l) => l.startsWith('h:'))
    const motif = all.find((l) => l.startsWith('m:'))
    return { design, heading, motif, frame: design.split('/')[0] }
  }

  it('varies heading, frame, label placement and motif across seeds', () => {
    const looks = new Set<string>()
    const headings = new Set<string>()
    const frameStyles = new Set<string>()
    for (let seed = 1; seed <= 60; seed++) {
      clearStudioRecentContent()
      const look = lookOf(run(base, kdpCtx(6, 9, seed * 7919)))
      looks.add(`${look.heading}|${look.design}|${look.motif}`)
      headings.add(look.heading!)
      frameStyles.add(look.frame!)
    }
    expect(looks.size).toBeGreaterThanOrEqual(55)
    expect(headings.size).toBeGreaterThanOrEqual(8)
    expect(frameStyles.size).toBe(6)
  })

  it('never repeats the look or the prompts of a set already in the book', () => {
    for (let seed = 1; seed <= 20; seed++) {
      clearStudioRecentContent()
      const first = run(base, kdpCtx(6, 9, seed))
      clearStudioRecentContent()
      const second = run(base, kdpCtx(6, 9, seed + 500, labels(first)))
      const a = lookOf(first)
      const b = lookOf(second)
      expect(b.heading).not.toBe(a.heading)
      expect(b.frame).not.toBe(a.frame)
      expect(b.motif).not.toBe(a.motif)
      const firstPrompts = new Set(labels(first).filter((l) => l.startsWith('p:')))
      const shared = labels(second).filter((l) => l.startsWith('p:') && firstPrompts.has(l))
      expect(shared).toHaveLength(0)
    }
  })

  it('steers a seller’s next set away from their last one', () => {
    const first = lookOf(run(base, kdpCtx(6, 9, 11)))
    const second = lookOf(run(base, kdpCtx(6, 9, 12)))
    expect(second.heading).not.toBe(first.heading)
    expect(second.frame).not.toBe(first.frame)
  })

  it('deals prompts without repeating one next door, even past the pool', () => {
    const pool = wwPromptsFor('everyone').map((p) => p.text).slice(0, 5)
    const pages = dealPrompts(createRng(3), pool, [4, 4, 4], { book: new Set(), recent: new Set() })!
    const flat = pages.flat()
    expect(flat).toHaveLength(12)
    for (const page of pages) expect(new Set(page).size).toBe(page.length)
    for (let i = 1; i < flat.length; i++) expect(flat[i]).not.toBe(flat[i - 1])
  })

  it('keeps audience wording apart', () => {
    const work = (a: WwAudience) => wwPromptsFor(a).some((p) => /work|team|colleague/i.test(p.text))
    expect(work('everyone')).toBe(false)
    expect(work('family')).toBe(false)
    expect(work('coworkers')).toBe(true)
  })
})

describe('well-wishes prefetch', () => {
  it('reads back only this template’s labels from the book, no network', async () => {
    const seen: string[] = []
    const data = await wellWishesPrefetch(base, new AbortController().signal, {
      bookContentLabels: (key) => {
        seen.push(key)
        return ['h:cheers', 'p:a-note-to-keep']
      },
    })
    expect(seen).toEqual(['well-wishes-signatures'])
    expect(parseWwRemoteData(data).bookLabels).toEqual(['h:cheers', 'p:a-note-to-keep'])
    expect(parseWwRemoteData(null).bookLabels).toEqual([])
    expect(parseWwRemoteData({ bookLabels: [1, 'x'] }).bookLabels).toEqual(['x'])
  })
})
