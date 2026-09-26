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
import { officeAwardsTemplate } from './generate'
import {
  OA_AI_EMPTY_MESSAGE,
  OA_COUNTS,
  OA_DEFAULT_COUNT,
  OA_DEFAULT_TITLE,
  OA_PAGE_TOO_SMALL_MESSAGE,
  OA_SHORT_MESSAGE,
  cleanOaPool,
  numberOaSet,
  orderOaSet,
  pickOaSet,
} from './content'
import { OA_AWARD_KEY, OA_LINE_KEY } from './draw'
import {
  AWARD_FONT_MIN,
  NAME_LINE_MIN,
  ROW_PITCH_MIN,
  fitOaAwards,
  oaContentBox,
  oaLayout,
  oaPrintNote,
  paginateOa,
  pxToPt,
  usableHeight,
} from './layout'
import { runOaKdpPreflight } from './kdp-preflight'
import { OA_FIXTURE, OA_FIXTURE_ITEMS } from './fixture'

const FONT = 'PT Serif'

/** The draft a seller has in front of them — common header fields included. */
const base: StudioConfig = {
  ...buildDefaultConfig(officeAwardsTemplate),
  showTitle: true,
  title: OA_DEFAULT_TITLE,
  showInstructions: true,
  seed: 42,
  fontFamily: FONT,
}

/** A real KDP interior: DPI 96, inside margin 0.375", the rest 0.25". */
const kdpCtx = (wIn: number, hIn: number, remoteData: unknown = OA_FIXTURE): StudioGenerateContext => ({
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
  return officeAwardsTemplate.generate(config, ctx)
}

const textOf = (o: StudioFabricObject) => String(o.text ?? '').replace(/ /g, ' ')
const texts = (pages: StudioPageOutput[]) => pages.flatMap((p) => p.objects.map(textOf))
const titlesOn = (objects: StudioFabricObject[]) =>
  objects.filter((o) => typeof o.data?.[OA_AWARD_KEY] === 'number')
const linesOn = (objects: StudioFabricObject[], kind: 'winner' | 'why') =>
  objects.filter((o) => o.data?.[OA_LINE_KEY] === kind)
const numbersOf = (pages: StudioPageOutput[]) =>
  pages.flatMap((p) => titlesOn(p.objects).map((o) => o.data![OA_AWARD_KEY] as number))
const headingOf = (page: StudioPageOutput) =>
  textOf(page.objects.find(isStudioHeaderTitle) ?? ({} as StudioFabricObject))

// Content comes from the prefetch; the seed changes the reading order.
runGeneratorContractTests(officeAwardsTemplate, {
  configOverrides: { showTitle: true, title: OA_DEFAULT_TITLE, showInstructions: true },
  contextOverrides: { remoteData: OA_FIXTURE },
})

describe('office-awards registry', () => {
  it('is registered once, in the word tab, with no answer key', () => {
    expect(STUDIO_TEMPLATES.filter((t) => t.key === 'office-awards')).toHaveLength(1)
    const registered = getStudioTemplate('office-awards')!
    expect(registered.category).toBe('word')
    expect(registered.producesAnswerKey).toBe(false)
    expect(registered.defaultPageTitle).toBe(OA_DEFAULT_TITLE)
    expect(registered.prefetch).toBeTypeOf('function')
  })

  it('asks only the name, the workplace, how many awards and the reason line', () => {
    expect(officeAwardsTemplate.configSchema.map((f) => f.key)).toEqual([
      'retireeName',
      'workplace',
      'awards',
      'reasonLine',
    ])
    const config = buildDefaultConfig(officeAwardsTemplate)
    expect(config.retireeName).toBe('')
    expect(config.workplace).toBe('any')
    expect(config.awards).toBe(OA_DEFAULT_COUNT)
    expect(config.reasonLine).toBe(false)
  })

  it('refuses a name that is not a name, under the name field', () => {
    expect(officeAwardsTemplate.validateConfig!({ ...base, retireeName: '<Linda>' })?.field).toBe('retireeName')
    expect(officeAwardsTemplate.validateConfig!({ ...base, retireeName: 'Linda' })).toBeNull()
  })
})

describe.each([false, true])('with the “Why” line %s', (reasonLine) => {
  it.each(TRIMS)('prints every award whole, numbered in order, on a %s x %s trim', (w, h) => {
    const ctx = kdpCtx(w, h)
    for (const awards of [OA_DEFAULT_COUNT, 24]) {
      const pages = generate({ ...base, awards, reasonLine }, ctx)
      expect(numbersOf(pages)).toEqual(Array.from({ length: awards }, (_, i) => i + 1))
      for (const page of pages) {
        assertObjectsInSafeMargin(page.objects, ctx)
        const cards = titlesOn(page.objects).length
        expect(cards).toBeGreaterThan(0)
        // A card never parts from its lines: each lands on the same page as its title.
        expect(linesOn(page.objects, 'winner')).toHaveLength(cards)
        expect(linesOn(page.objects, 'why')).toHaveLength(reasonLine ? cards : 0)
        for (const line of linesOn(page.objects, 'winner')) expect(line.width!).toBeGreaterThanOrEqual(NAME_LINE_MIN)
        for (const title of titlesOn(page.objects)) {
          expect(title.fontSize).toBeGreaterThanOrEqual(AWARD_FONT_MIN)
          expect(textOf(title).split('\n').length).toBeLessThanOrEqual(2)
        }
      }
      // Spread evenly: no page more than one card heavier than another, the how-to page aside.
      const counts = pages.slice(1).map((p) => titlesOn(p.objects).length)
      if (counts.length > 1) expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1)
    }
  })
})

describe.each(TRIMS)('on a %s x %s trim', (w, h) => {
  const ctx = kdpCtx(w, h)

  it('stamps every printed award so later runs can avoid it', () => {
    const pages = generate(base, ctx)
    const labels = pages.flatMap((p) =>
      p.objects.filter((o) => typeof o.data?.[STUDIO_CONTENT_LABEL_KEY] === 'string').map((o) => o.data![STUDIO_CONTENT_LABEL_KEY]),
    )
    expect(labels).toHaveLength(OA_DEFAULT_COUNT)
    expect(new Set(labels).size).toBe(OA_DEFAULT_COUNT)
  })

  it('reports in the form what it prints', () => {
    const note = oaPrintNote({ page: ctx, config: base, font: FONT, name: '', count: 10, reasonLine: false })
    const layout = oaLayout({ page: ctx, config: base, font: FONT, name: '', reasonLine: false })!
    expect(note).toMatch(/^10 awards on (one page|about \d+ pages) in \d+ pt large print/)
    expect(note).toContain(`${pxToPt(layout.plan.metrics.font)} pt`)
  })
})

describe('the page', () => {
  it('fills a 6 x 9 with the default set on two pages', () => {
    expect(generate(base, kdpCtx(6, 9))).toHaveLength(2)
  })

  it('never shrinks type below 14 pt, and wider trims never print smaller', () => {
    const sizes = TRIMS.map(
      ([w, h]) => oaLayout({ page: kdpCtx(w, h), config: base, font: FONT, name: '', reasonLine: true })!.plan.metrics.font,
    )
    for (const size of sizes) expect(size).toBeGreaterThanOrEqual(AWARD_FONT_MIN)
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]!).toBeGreaterThanOrEqual(sizes[i - 1]!)
    expect(pxToPt(sizes.at(-1)!)).toBe(18)
    const layout = oaLayout({ page: kdpCtx(5, 8), config: base, font: FONT, name: '', reasonLine: true })!
    expect(layout.plan.metrics.rowH).toBeGreaterThanOrEqual(ROW_PITCH_MIN)
  })

  it('prints in black ink with grey writing lines only: no fills that print as blocks', () => {
    const pages = generate({ ...base, reasonLine: true }, kdpCtx(6, 9))
    for (const o of pages.flatMap((p) => p.objects)) {
      // The shared how-to line is the Studio's muted ink; everything else is black.
      if (o.type === 'textbox') expect([STUDIO_INK, STUDIO_INK_MUTED]).toContain(o.fill)
      else if (o.data?.[OA_LINE_KEY]) expect(o.height).toBe(1)
      else expect(['transparent', '#FFFFFF', undefined]).toContain(o.fill)
    }
  })

  it('keeps every page’s heading and gives the how-to once', () => {
    const pages = generate({ ...base, awards: 24 }, kdpCtx(6, 9))
    expect(pages.length).toBeGreaterThan(2)
    for (const page of pages) expect(headingOf(page)).toBe(OA_DEFAULT_TITLE)
    expect(texts(pages).filter((t) => t.includes('anyone can win'))).toHaveLength(1)
  })
})

describe('personal touches', () => {
  it('names the retiree in the heading, how-to and farewell award, and nowhere else', () => {
    const pages = generate({ ...base, retireeName: 'Linda' }, kdpCtx(6, 9))
    expect(headingOf(pages[0]!)).toBe('Linda’s Farewell Office Awards')
    const all = texts(pages).join('\n')
    expect(all).toContain('even Linda!')
    expect(all).toContain('Linda’s Chair')
    expect(all).not.toContain('Retiree')
    // The book remembers what the service wrote, not the name.
    const labels = pages.flatMap((p) => titlesOn(p.objects).map((o) => o.data![STUDIO_CONTENT_LABEL_KEY]))
    expect(labels).toContain('Most Likely to Inherit the Retiree’s Chair')
  })

  it('keeps a heading the seller typed, and prints none when titles are off', () => {
    expect(headingOf(generate({ ...base, retireeName: 'Linda', title: 'Team Trophies' }, kdpCtx(6, 9))[0]!)).toBe('Team Trophies')
    const untitled = generate({ ...base, showTitle: false, title: '' }, kdpCtx(6, 9))
    expect(untitled.every((page) => !page.objects.some(isStudioHeaderTitle))).toBe(true)
  })

  it('drops the how-to when instructions are off', () => {
    expect(texts(generate({ ...base, showInstructions: false }, kdpCtx(6, 9))).join('\n')).not.toContain('anyone can win')
  })
})

describe('content that cannot print', () => {
  const messageOf = (pages: StudioPageOutput[]) => texts(pages).join('\n')

  it('says so when nothing came back', () => {
    const pages = generate(base, kdpCtx(6, 9, null))
    expect(pages).toHaveLength(1)
    expect(messageOf(pages)).toContain(OA_AI_EMPTY_MESSAGE)
  })

  it('says so when the awards cannot make a balanced set', () => {
    expect(messageOf(generate(base, kdpCtx(6, 9, { awards: OA_FIXTURE_ITEMS.slice(0, 6) })))).toContain(OA_SHORT_MESSAGE)
  })

  it('refuses a page too small to write on', () => {
    const tiny: StudioGenerateContext = { ...kdpCtx(6, 9), pageWidth: 200, pageHeight: 300 }
    expect(messageOf(generate(base, tiny))).toContain(OA_PAGE_TOO_SMALL_MESSAGE)
  })

  it('re-validates whatever reached the page: a mean award is never printed', () => {
    const tampered = {
      awards: OA_FIXTURE_ITEMS.map((a, i) => (i === 2 ? { ...a, award: 'Laziest Person on the Team' } : a)),
    }
    expect(messageOf(generate(base, kdpCtx(6, 9, tampered)))).not.toContain('Laziest')
  })
})

describe('runOaKdpPreflight', () => {
  const ctx = kdpCtx(6, 9)
  const layout = oaLayout({ page: ctx, config: base, font: FONT, name: '', reasonLine: false })!
  const size = 10
  const awards = fitOaAwards(
    numberOaSet(orderOaSet(pickOaSet(cleanOaPool(OA_FIXTURE.awards), size).picks!, 1)),
    layout.plan,
    FONT,
    '',
  )
  const usable = usableHeight(layout.plan, layout.fields)
  const pages = paginateOa(awards, layout.plan, usable)!
  const run = (overrides: Partial<Parameters<typeof runOaKdpPreflight>[0]>) =>
    runOaKdpPreflight({
      awards,
      pages,
      plan: layout.plan,
      size,
      columnWidth: oaContentBox(ctx).width,
      usable,
      ...overrides,
    })

  it('passes a set as generated', () => {
    expect(run({})).toEqual({ ok: true, warnings: [], errors: [] })
  })

  it('catches a missing award, an overflowing page and a card wider than the column', () => {
    expect(run({ pages: [pages[0]!] }).ok).toBe(false)
    expect(run({ usable: () => 50 }).errors).toContain('An award runs past the printable area.')
    expect(run({ columnWidth: 100 }).errors).toContain('The awards run wider than the printable area.')
  })

  it('catches a title set differently from the one written', () => {
    const changed = awards.map((a, i) => (i === 0 ? { ...a, lines: ['Something Else'] } : a))
    expect(run({ awards: changed }).ok).toBe(false)
  })
})

describe('every count', () => {
  it.each(OA_COUNTS)('prints %i awards on a 6 x 9', (count) => {
    const pages = generate({ ...base, awards: count }, kdpCtx(6, 9))
    expect(numbersOf(pages)).toHaveLength(count)
  })
})
