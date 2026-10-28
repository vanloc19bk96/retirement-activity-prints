import { beforeEach, describe, expect, it } from 'vitest'
import type {
  StudioConfig,
  StudioFabricObject,
  StudioGenerateContext,
  StudioPageOutput,
} from '@/types/studio-template.types'
import { DPI } from '@/types/canvas-settings.types'
import { STUDIO_SAFE_AREA_PADDING_X } from '@/constants/studio.constants'
import { buildDefaultConfig, getStudioTemplate } from '@/constants/studio-templates'
import { resetObjectCounter } from '../studio-fabric-builders'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import { isStudioHeaderTitle } from '../studio-layout'
import { clearStudioRecentContent } from '../studio-variety'
import {
  assertGeneratorEntropy,
  assertObjectsInSafeMargin,
  runGeneratorContractTests,
} from '../studio-generator-test'
import { adviceCardsTemplate } from './generate'
import {
  AC_AUDIENCES,
  AC_DEFAULT_TITLE,
  AC_HEADINGS,
  AC_LIST_PROMPTS,
  AC_PAGE_TOO_SMALL_MESSAGE,
  AC_PROMPT_TEXTS,
  acCrowdedMessage,
  acPromptsFor,
  type AcAudience,
} from './content'
import { CARD_MIN_WIDTH, LABEL_FONT_MIN, PITCH_MIN, acFit } from './layout'
import { adviceCardsPrefetch, parseAcRemoteData } from './prefetch'

const FONT = 'PT Serif'

const base: StudioConfig = {
  ...buildDefaultConfig(adviceCardsTemplate),
  showTitle: true,
  title: AC_DEFAULT_TITLE,
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
    right: Math.round(0.25 * DPI) + STUDIO_SAFE_AREA_PADDING_X,
    bottom: Math.round(0.25 * DPI),
    left: Math.round(0.375 * DPI) + STUDIO_SAFE_AREA_PADDING_X,
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
  return adviceCardsTemplate.generate({ ...config, seed: ctx.seed }, ctx)
}

/**
 * Every drawn mark, with the card and ornament groups opened up and each child
 * moved back to page coordinates (Fabric stores group children centre-relative).
 */
function leaves(objects: readonly StudioFabricObject[]): StudioFabricObject[] {
  return objects.flatMap((obj) => {
    if (obj.type !== 'group' || !obj.objects) return [obj]
    const cx = obj.left + obj.width! / 2
    const cy = obj.top + obj.height! / 2
    return leaves(obj.objects.map((child) => ({ ...child, left: child.left + cx, top: child.top + cy })))
  })
}

const text = (o: StudioFabricObject) => (o.text ?? '').replace(/ /g, ' ')
const frames = (page: StudioPageOutput) => leaves(page.objects).filter((o) => o.studioRole === 'structure')
const prompts = (page: StudioPageOutput) => leaves(page.objects).filter((o) => o.studioRole === 'prompt')
const promptText = (o: StudioFabricObject) => text(o).replace(/\n/g, ' ')
const cards = (page: StudioPageOutput) =>
  page.objects.filter((o) => o.type === 'group' && o.studioRole === 'structure')
const cutLines = (page: StudioPageOutput) => leaves(page.objects).filter((o) => o.type === 'line')
const title = (page: StudioPageOutput) => page.objects.find(isStudioHeaderTitle)
const labels = (pages: StudioPageOutput[]) =>
  pages.flatMap((p) =>
    leaves(p.objects).flatMap((o) => {
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

const errorText = (pages: StudioPageOutput[]) => (pages.length === 1 ? pages[0]!.buildFailed : undefined)

beforeEach(() => clearStudioRecentContent())

runGeneratorContractTests(adviceCardsTemplate, {
  expectAnswers: false,
  contextOverrides: { remoteData: { bookLabels: [] } },
})

assertGeneratorEntropy(adviceCardsTemplate, {
  seeds: 40,
  contextOverrides: { remoteData: { bookLabels: [] } },
})

describe('advice cards registry', () => {
  it('is registered as a no-answer-key keepsake with a small form', () => {
    const def = getStudioTemplate('advice-for-the-retiree')
    expect(def).toBeDefined()
    expect(def!.producesAnswerKey).toBe(false)
    expect(def!.category).toBe('keepsake')
    expect(adviceCardsTemplate.configSchema.map((f) => f.key)).toEqual([
      'retireeName',
      'audience',
      'cardsPerPage',
      'pages',
      'cutApart',
    ])
  })

  it('explains the varied default heading in the title help', () => {
    const titleField = getStudioTemplate('advice-for-the-retiree')!.configSchema.find((f) => f.key === 'title')
    expect(titleField?.help).toContain('Advice for the Retiree')
    expect(titleField?.help).toContain('own')
  })
})

describe('advice cards on every KDP trim', () => {
  for (const [w, h] of TRIMS) {
    for (const cardsPerPage of [1, 2, 4]) {
      for (const cutApart of [false, true]) {
        it(`${w} x ${h}, ${cardsPerPage} per page${cutApart ? ', cut apart' : ''}`, () => {
          const ctx = kdpCtx(w, h, 1000 + cardsPerPage * 31 + w * 7)
          const config = { ...base, cardsPerPage, cutApart, pages: 3 }
          const out = run(config, ctx)
          const fit = acFit(ctx, config, cardsPerPage, cutApart)
          if (!fit.ok) {
            // Refused plainly, never squeezed: the form warns about the same grid.
            expect(errorText(out)).toBe(acCrowdedMessage(cardsPerPage))
            return
          }
          expect(errorText(out)).toBeUndefined()
          expect(out).toHaveLength(3)

          for (const page of out) {
            assertObjectsInSafeMargin(page.objects, ctx)
            expect(cards(page)).toHaveLength(cardsPerPage)
            const boxes = frames(page).map(frameBox)
            expect(boxes).toHaveLength(cardsPerPage)
            expect(prompts(page)).toHaveLength(cardsPerPage)
            // One size per page, roomy enough for handwriting.
            for (const box of boxes) {
              expect(Math.abs(box.width - boxes[0]!.width)).toBeLessThanOrEqual(1)
              expect(Math.abs(box.height - boxes[0]!.height)).toBeLessThanOrEqual(1)
              expect(box.width).toBeGreaterThanOrEqual(CARD_MIN_WIDTH - 2)
            }
            // No two frames touch.
            for (let a = 0; a < boxes.length; a++) {
              for (let b = a + 1; b < boxes.length; b++) {
                const A = boxes[a]!
                const B = boxes[b]!
                expect(A.right <= B.left || B.right <= A.left || A.bottom <= B.top || B.bottom <= A.top).toBe(true)
              }
            }
            // Prompts are ours, large print, at most two lines, never twice on a page.
            const texts = prompts(page).map(promptText)
            expect(new Set(texts).size).toBe(texts.length)
            for (const o of prompts(page)) {
              expect(AC_PROMPT_TEXTS.has(promptText(o))).toBe(true)
              expect(text(o).split('\n').length).toBeLessThanOrEqual(2)
              expect(o.fontSize).toBeGreaterThanOrEqual(LABEL_FONT_MIN)
            }
            // Cut lines only on cut-apart sets with more than one card.
            expect(cutLines(page).length > 0).toBe(cutApart && cardsPerPage > 1)
            // Black and grey ink only.
            for (const o of leaves(page.objects)) {
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

  it('fits the classic four cards on the larger trims', () => {
    for (const [w, h] of [[7, 10], [8, 10], [8.5, 11]] as const) {
      expect(acFit(kdpCtx(w, h), base, 4, false).ok).toBe(true)
      expect(acFit(kdpCtx(w, h), base, 4, true).ok).toBe(true)
    }
    // Every trim takes the default two.
    for (const [w, h] of TRIMS) expect(acFit(kdpCtx(w, h), base, 2, true).ok).toBe(true)
  })

  it('keeps writing lines at least wide-ruled and three or more per card', () => {
    const out = run({ ...base, cardsPerPage: 4 }, kdpCtx(8.5, 11))
    for (const page of out) {
      for (const card of cards(page)) {
        const lines = leaves([card])
          .filter((o) => o.type === 'rect' && o.height === 1)
          .map((o) => o.top)
          .sort((a, b) => a - b)
        // Writing lines plus the signature line.
        expect(lines.length).toBeGreaterThanOrEqual(4)
        const gaps = lines.slice(1).map((y, i) => y - lines[i]!)
        expect(Math.min(...gaps)).toBeGreaterThanOrEqual(PITCH_MIN - 1)
      }
    }
  })

  it('numbers every line of a list card', () => {
    let seen = 0
    for (let seed = 1; seed <= 20 && seen < 3; seed++) {
      clearStudioRecentContent()
      for (const page of run({ ...base, cardsPerPage: 4, pages: 4 }, kdpCtx(8.5, 11, seed))) {
        for (const card of cards(page)) {
          const parts = leaves([card])
          const prompt = promptText(parts.find((o) => o.studioRole === 'prompt')!)
          const numbers = parts.filter((o) => /^\d+\.$/.test(text(o))).map(text)
          if (!AC_LIST_PROMPTS.has(prompt)) {
            expect(numbers).toHaveLength(0)
            continue
          }
          seen++
          expect(numbers.length).toBeGreaterThanOrEqual(3)
          expect(numbers).toEqual(numbers.map((_, i) => `${i + 1}.`))
        }
      }
    }
    expect(seen).toBeGreaterThan(0)
  })

  it('fills the page: no empty band under the cards', () => {
    for (const [w, h] of TRIMS) {
      const ctx = kdpCtx(w, h)
      for (const page of run(base, ctx)) {
        const lowest = Math.max(...frames(page).map((o) => frameBox(o).bottom))
        expect(ctx.pageHeight - ctx.margin.bottom - lowest).toBeLessThan(DPI * 0.1)
      }
    }
  })

  it('says plainly when the page is too small', () => {
    const out = run(base, kdpCtx(3, 4))
    expect(errorText(out)).toBe(AC_PAGE_TOO_SMALL_MESSAGE)
  })
})

describe('advice cards structure', () => {
  it('groups each card, with the sign-off kept on its line', () => {
    for (let seed = 1; seed <= 24; seed++) {
      clearStudioRecentContent()
      const out = run({ ...base, cardsPerPage: 2 }, kdpCtx(6, 9, seed * 7919))
      for (const page of out) {
        // Nothing of a card is left loose on the page.
        expect(page.objects.filter((o) => o.studioRole === 'prompt' || o.studioRole === 'structure')).toEqual(cards(page))
        for (const card of cards(page)) {
          const [frame, prompt, ...rest] = card.objects ?? []
          const signoff = rest.pop()!
          expect(leaves([frame!]).filter((o) => o.studioRole === 'structure')).toHaveLength(1)
          expect(prompt!.studioRole).toBe('prompt')
          expect(rest.length).toBeGreaterThanOrEqual(3)
          expect(signoff.type).toBe('group')
          expect(signoff.objects!.map((o) => o.type)).toEqual(['textbox', 'rect'])
        }
      }
    }
  })

  it('puts the heading on every cut-apart card, and none on bound ones', () => {
    const bound = run(base, kdpCtx(6, 9))
    const loose = run({ ...base, cutApart: true }, kdpCtx(6, 9))
    const cardTitles = (pages: StudioPageOutput[]) =>
      pages.flatMap((p) => cards(p).flatMap((c) => leaves([c]).filter((o) => o.fontWeight === 'bold').map(text)))
    expect(cardTitles(bound)).toHaveLength(0)
    const titles = cardTitles(loose)
    expect(titles).toHaveLength(4)
    expect(new Set(titles).size).toBe(1)
    expect(AC_HEADINGS.flatMap((h) => [h.plain, h.named('Linda')])).toContain(titles[0])
  })

  it('keeps a typed title on the cut-apart cards when it fits', () => {
    const out = run({ ...base, title: 'Tips for Pat', cutApart: true }, kdpCtx(6, 9))
    const titles = out.flatMap((p) => cards(p).flatMap((c) => leaves([c]).filter((o) => o.fontWeight === 'bold').map(text)))
    expect(new Set(titles)).toEqual(new Set(['Tips for Pat']))
  })
})

describe('advice cards headings and personalization', () => {
  it('picks one of its own headings when the title is left as the default', () => {
    const out = run(base, kdpCtx(6, 9))
    const heading = text(title(out[0]!)!)
    expect(AC_HEADINGS.map((h) => h.plain)).toContain(heading)
    expect(out.map((p) => text(title(p)!))).toEqual([heading, heading])
  })

  it('names the retiree in the heading or intro when a name is given', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const out = run({ ...base, retireeName: 'Linda' }, kdpCtx(6, 9, seed))
      expect(leaves(out[0]!.objects).map(text).join(' ')).toContain('Linda')
    }
  })

  it('keeps a typed title on every page, verbatim', () => {
    const out = run({ ...base, title: 'Happy Trails, Pat!' }, kdpCtx(6, 9))
    expect(out.map((p) => text(title(p)!))).toEqual(['Happy Trails, Pat!', 'Happy Trails, Pat!'])
  })

  it('prints no heading or ornament with the title and intro off', () => {
    const out = run({ ...base, showTitle: false, title: '', showInstructions: false }, kdpCtx(6, 9))
    for (const page of out) {
      expect(title(page)).toBeUndefined()
      const firstFrame = Math.min(...frames(page).map((o) => frameBox(o).top))
      expect(firstFrame).toBeLessThan(Math.round(0.25 * DPI) + 20)
    }
  })

  it('fits a long name on a small trim', () => {
    const ctx = kdpCtx(5, 8, 5)
    for (const cutApart of [false, true]) {
      const out = run({ ...base, retireeName: 'Aunt Josephine-Marie', cutApart }, ctx)
      expect(errorText(out)).toBeUndefined()
      for (const page of out) assertObjectsInSafeMargin(page.objects, ctx)
    }
  })

  it('refuses anything but a first name or nickname', () => {
    expect(adviceCardsTemplate.validateConfig?.({ ...base, retireeName: '123 Main St' })?.field).toBe('retireeName')
    expect(adviceCardsTemplate.validateConfig?.({ ...base, retireeName: 'Linda' })).toBeNull()
  })
})

describe('advice cards variety and anti-duplication', () => {
  const lookOf = (pages: StudioPageOutput[]) => {
    const all = labels(pages)
    return {
      heading: all.find((l) => l.startsWith('h:')),
      frame: all.find((l) => l.startsWith('f:')),
      motif: all.find((l) => l.startsWith('m:')),
      prompts: all.filter((l) => l.startsWith('p:')),
    }
  }

  it('varies heading, frame and motif across seeds', () => {
    const headings = new Set<string>()
    const frameStyles = new Set<string>()
    const motifs = new Set<string>()
    for (let seed = 1; seed <= 60; seed++) {
      clearStudioRecentContent()
      const look = lookOf(run(base, kdpCtx(6, 9, seed * 7919)))
      headings.add(look.heading!)
      frameStyles.add(look.frame!)
      motifs.add(look.motif!)
    }
    expect(headings.size).toBeGreaterThanOrEqual(6)
    expect(frameStyles.size).toBe(6)
    expect(motifs.size).toBeGreaterThanOrEqual(6)
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
      expect(b.prompts.filter((p) => a.prompts.includes(p))).toHaveLength(0)
    }
  })

  it('steers a seller’s next set away from their last one', () => {
    const first = lookOf(run(base, kdpCtx(6, 9, 11)))
    const second = lookOf(run(base, kdpCtx(6, 9, 12)))
    expect(second.heading).not.toBe(first.heading)
    expect(second.frame).not.toBe(first.frame)
  })

  it('keeps audience wording apart', () => {
    const work = (a: AcAudience) => acPromptsFor(a).some((p) => /meeting|email|work/i.test(p.text))
    expect(work('everyone')).toBe(false)
    expect(work('family')).toBe(false)
    expect(work('coworkers')).toBe(true)
    for (const audience of AC_AUDIENCES.map((a) => a.value)) {
      const out = run({ ...base, audience }, kdpCtx(6, 9))
      expect(errorText(out)).toBeUndefined()
    }
  })
})

describe('advice cards prefetch', () => {
  it('reads back only this template’s labels from the book, no network', async () => {
    const seen: string[] = []
    const data = await adviceCardsPrefetch(base, new AbortController().signal, {
      bookContentLabels: (key) => {
        seen.push(key)
        return ['h:words-of-wisdom', 'p:always-say-yes-to']
      },
    })
    expect(seen).toEqual(['advice-for-the-retiree'])
    expect(parseAcRemoteData(data).bookLabels).toEqual(['h:words-of-wisdom', 'p:always-say-yes-to'])
    expect(parseAcRemoteData(null).bookLabels).toEqual([])
  })
})
