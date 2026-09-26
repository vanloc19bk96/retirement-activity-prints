import { beforeEach, describe, expect, it } from 'vitest'
import type {
  StudioConfig,
  StudioFabricObject,
  StudioGenerateContext,
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
import { travelWishMapTemplate } from './generate'
import { instructionFor } from './config'
import {
  TWM_DEFAULT_TITLE,
  TWM_MODES,
  WHY_LABEL,
  pickTwmSections,
  twmBookLabel,
  twmBookNames,
  twmEntryCount,
  twmNameProblem,
  twmSectionsProblem,
  type TwmMode,
  type TwmSection,
} from './content'
import { COUNTRY_GROUPS, PLACE_GROUPS, US_STATE_GROUPS, WORLD_REGION_GROUPS } from './data'
import { TWM_GROUP_KEY, TWM_WRITE_IN_KEY } from './draw'
import {
  CHECK_MIN,
  NAME_FONT_MIN,
  OWN_PLACES_TITLE,
  PITCH_MIN,
  TWM_SPACES,
  planTravelWishMap,
  pxToPt,
  twmFields,
  twmPrintNote,
  type TwmSpace,
} from './layout'
import { parseTwmRemoteData, travelWishMapPrefetch } from './prefetch'

const FONT = 'PT Serif'
const MODES = TWM_MODES.map((m) => m.value)
const SPACES = TWM_SPACES.map((s) => s.value)

const base: StudioConfig = {
  ...buildDefaultConfig(travelWishMapTemplate),
  showTitle: true,
  title: TWM_DEFAULT_TITLE,
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
  [8.5, 11],
] as const

function generate(config: StudioConfig, ctx: StudioGenerateContext) {
  resetObjectCounter()
  return travelWishMapTemplate.generate(config, ctx)
}

const cfg = (mode: TwmMode, space: TwmSpace = 'standard'): StudioConfig => ({
  ...base,
  destinations: mode,
  writingSpace: space,
})

const clean = (text: unknown) => String(text ?? '').replace(/ /g, ' ')
/** Destination names as printed, in order across the pages. */
const printedNames = (pages: { objects: StudioFabricObject[] }[]) =>
  pages.flatMap((p) => p.objects.filter((o) => o.data?.[TWM_GROUP_KEY] !== undefined).map((o) => clean(o.text)))
const allTexts = (pages: { objects: StudioFabricObject[] }[]) =>
  pages.flatMap((p) => p.objects.map((o) => clean(o.text)).filter(Boolean))

beforeEach(() => clearStudioRecentContent())

runGeneratorContractTests(travelWishMapTemplate, { expectSeedVariance: false })
describe('countries', () => {
  runGeneratorContractTests(travelWishMapTemplate, { configOverrides: { destinations: 'countries' } })
})
describe('places', () => {
  runGeneratorContractTests(travelWishMapTemplate, { configOverrides: { destinations: 'places' } })
})
assertGeneratorEntropy(travelWishMapTemplate, { configOverrides: { destinations: 'countries' } })
assertGeneratorEntropy(travelWishMapTemplate, { configOverrides: { destinations: 'places' } })

describe('registry', () => {
  it('is registered with two settings on top of the common ones', () => {
    const def = getStudioTemplate('travel-wish-map')!
    expect(def).toBeDefined()
    expect(def.producesAnswerKey).toBe(false)
    const own = travelWishMapTemplate.configSchema.map((f) => f.key)
    expect(own).toEqual(['destinations', 'writingSpace'])
  })
})

describe('bundled geography', () => {
  it('lists the 50 states once each, under the four Census regions', () => {
    const names = US_STATE_GROUPS.flatMap((g) => g.names)
    expect(names).toHaveLength(50)
    expect(new Set(names).size).toBe(50)
    expect(US_STATE_GROUPS.map((g) => g.names.length)).toEqual([9, 12, 16, 13])
    for (const group of US_STATE_GROUPS) {
      expect([...group.names]).toEqual([...group.names].sort((a, b) => a.localeCompare(b, 'en')))
    }
    for (const state of ['Hawaii', 'Alaska', 'Texas', 'Maine', 'Ohio', 'Delaware', 'West Virginia']) {
      expect(names).toContain(state)
    }
    expect(names).not.toContain('District of Columbia')
  })

  it.each([
    ['regions', WORLD_REGION_GROUPS],
    ['countries', COUNTRY_GROUPS],
    ['places', PLACE_GROUPS],
  ] as const)('%s: every name is printable and appears under exactly one heading', (_, groups) => {
    const names = groups.flatMap((g) => g.names)
    expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(names.length)
    for (const name of names) expect(twmNameProblem(name)).toBeNull()
  })

  it('never lists a country that shares a name with a U.S. state', () => {
    const states = new Set(US_STATE_GROUPS.flatMap((g) => g.names))
    for (const country of COUNTRY_GROUPS.flatMap((g) => g.names)) expect(states.has(country)).toBe(false)
  })

  it('draws each sampled heading from a pool at least twice its share', () => {
    for (const group of [...COUNTRY_GROUPS, ...PLACE_GROUPS]) {
      expect(group.quota).toBeGreaterThanOrEqual(3)
      expect(group.names.length).toBeGreaterThanOrEqual(group.quota! * 2)
    }
    expect(COUNTRY_GROUPS.flatMap((g) => g.names).length).toBeGreaterThanOrEqual(100)
  })

  it('keeps disputed or time-sensitive names out of the country pool', () => {
    const countries = COUNTRY_GROUPS.flatMap((g) => g.names)
    for (const name of ['Taiwan', 'Kosovo', 'Palestine', 'Hong Kong', 'Greenland', 'Puerto Rico', 'Russia']) {
      expect(countries).not.toContain(name)
    }
  })
})

describe('list validation', () => {
  const valid = (mode: TwmMode) => pickTwmSections({ mode, seed: 9 })

  it('accepts every mode as dealt', () => {
    for (const mode of MODES) expect(twmSectionsProblem(mode, valid(mode))).toBeNull()
  })

  it('rejects an invented or misfiled country, a repeat, and an incomplete state list', () => {
    const invent = valid('countries').map((s, i): TwmSection => (i === 0 ? { ...s, names: [...s.names.slice(1), 'Atlantis'] } : s))
    expect(twmSectionsProblem('countries', invent)).toMatch(/Atlantis/)

    const misfiled = valid('countries').map((s, i): TwmSection => (i === 0 ? { ...s, names: [...s.names.slice(1), 'Japan'] } : s))
    expect(twmSectionsProblem('countries', misfiled)).toMatch(/Japan/)

    const doubled = valid('places').map((s, i): TwmSection => (i === 1 ? { ...s, names: [...s.names.slice(0, -1), s.names[0]!] } : s))
    expect(twmSectionsProblem('places', doubled)).toMatch(/twice/)

    const missing = valid('states').map((s, i): TwmSection => (i === 2 ? { ...s, names: s.names.slice(1) } : s))
    expect(twmSectionsProblem('states', missing)).toMatch(/missing/)
  })

  it('rejects malformed names', () => {
    expect(twmNameProblem('')).not.toBeNull()
    expect(twmNameProblem(' Peru')).not.toBeNull()
    expect(twmNameProblem('Visit 3 places!')).not.toBeNull()
    expect(twmNameProblem('A'.repeat(60))).not.toBeNull()
  })
})

describe('dealing', () => {
  it('prints fixed lists whole, whatever the book already holds', () => {
    const book = new Set(['Texas', 'Ohio'])
    const states = pickTwmSections({ mode: 'states', seed: 3, book }).flatMap((s) => s.names)
    expect(states).toHaveLength(50)
    expect(states).toContain('Texas')
    expect(pickTwmSections({ mode: 'regions', seed: 3 }).flatMap((s) => s.names)).toHaveLength(25)
  })

  it('deals each continent its share, alphabetically', () => {
    const sections = pickTwmSections({ mode: 'countries', seed: 11 })
    expect(sections.map((s) => s.names.length)).toEqual(COUNTRY_GROUPS.map((g) => g.quota))
    for (const s of sections) {
      const sorted = [...s.names].sort((a, b) => a.replace(/^The /, '').localeCompare(b.replace(/^The /, ''), 'en'))
      expect(s.names).toEqual(sorted)
    }
  })

  it('does not repeat countries the book already prints while the pool lasts', () => {
    const first = pickTwmSections({ mode: 'countries', seed: 1 }).flatMap((s) => s.names)
    const labels = first.map((name) => twmBookLabel('countries', name))
    const book = twmBookNames('countries', labels)
    const second = pickTwmSections({ mode: 'countries', seed: 2, book }).flatMap((s) => s.names)
    expect(second.filter((name) => book.has(name))).toEqual([])
    // A third list still has room on every continent but Oceania.
    const both = new Set([...first, ...second])
    const third = pickTwmSections({ mode: 'countries', seed: 3, book: both }).flatMap((s) => s.names)
    const oceania = new Set(COUNTRY_GROUPS.find((g) => g.key === 'oceania')!.names)
    expect(third.filter((name) => both.has(name) && !oceania.has(name))).toEqual([])
    expect(new Set(third).size).toBe(third.length)
  })

  it('leans away from the seller’s recent lists', () => {
    const recent = pickTwmSections({ mode: 'places', seed: 5 }).flatMap((s) => s.names)
    const next = pickTwmSections({ mode: 'places', seed: 6, recent }).flatMap((s) => s.names)
    expect(next.filter((name) => recent.includes(name))).toEqual([])
  })

  it('only reads its own mode’s labels back from the book', () => {
    const labels = ['countries:Peru', 'places:A castle', 'countries:Atlantis', 'Peru']
    expect([...twmBookNames('countries', labels)]).toEqual(['Peru'])
    expect([...twmBookNames('places', labels)]).toEqual(['A castle'])
  })
})

describe('pages', () => {
  it.each(MODES)('%s prints its whole list in order, on every KDP trim and writing space', (mode) => {
    for (const [w, h] of TRIMS) {
      for (const space of SPACES) {
        const ctx = kdpCtx(w, h)
        clearStudioRecentContent()
        const pages = generate(cfg(mode, space), ctx)
        const names = printedNames(pages)
        expect(names, `${mode} ${w}x${h} ${space}`).toHaveLength(twmEntryCount(mode))
        expect(new Set(names).size).toBe(names.length)
        expect(allTexts(pages).filter((t) => t === WHY_LABEL).length).toBeGreaterThanOrEqual(names.length)
        for (const page of pages) assertObjectsInSafeMargin(page.objects, ctx)
      }
    }
  })

  it('prints all 50 states and nothing else', () => {
    const names = printedNames(generate(cfg('states'), kdpCtx(6, 9)))
    expect([...names].sort()).toEqual(US_STATE_GROUPS.flatMap((g) => g.names).sort())
  })

  it('keeps every page titled, the how-to on the first only, and headings with their entries', () => {
    const pages = generate(cfg('states'), kdpCtx(6, 9))
    expect(pages.length).toBeGreaterThan(4)
    const instruction = instructionFor(base)
    pages.forEach((page, i) => {
      const texts = page.objects.map((o) => clean(o.text))
      expect(texts).toContain(TWM_DEFAULT_TITLE)
      expect(texts.includes(instruction)).toBe(i === 0)
    })
    const texts = allTexts(pages)
    expect(texts.some((t) => /\((continued|cont\.)\)$/.test(t))).toBe(true)
  })

  it('stays large print with pen-sized boxes and wide-ruled lines', () => {
    for (const [w, h] of TRIMS) {
      for (const mode of MODES) {
        const fields = twmFields(kdpCtx(w, h), base, instructionFor(base))
        const plan = planTravelWishMap(fields, FONT, mode, 'roomy')!
        expect(plan, `${mode} ${w}x${h}`).not.toBeNull()
        expect(plan.metrics.font).toBeGreaterThanOrEqual(NAME_FONT_MIN)
        expect(plan.metrics.labelFont).toBeGreaterThanOrEqual(NAME_FONT_MIN)
        expect(plan.metrics.check).toBeGreaterThanOrEqual(CHECK_MIN)
        expect(plan.metrics.pitch).toBeGreaterThanOrEqual(PITCH_MIN)
      }
    }
  })

  it('reports the page count it prints', () => {
    for (const mode of MODES) {
      for (const space of SPACES) {
        const ctx = kdpCtx(6, 9)
        const note = twmPrintNote({
          page: ctx,
          config: cfg(mode, space),
          instruction: instructionFor(base),
          font: FONT,
          mode,
          space,
        })
        const pages = generate(cfg(mode, space), ctx)
        const fields = twmFields(ctx, base, instructionFor(base))
        const plan = planTravelWishMap(fields, FONT, mode, space)!
        expect(note).toContain(`${pages.length} pages in ${pxToPt(plan.metrics.font)} pt`)
      }
    }
  })

  it('gives more room to write with three lines, over more pages', () => {
    const standard = generate(cfg('countries', 'standard'), kdpCtx(6, 9))
    clearStudioRecentContent()
    const roomy = generate(cfg('countries', 'roomy'), kdpCtx(6, 9))
    expect(roomy.length).toBeGreaterThan(standard.length)
  })

  it('closes with write-in places only on the last page, when it has room', () => {
    let seen = false
    for (const [w, h] of TRIMS) {
      for (const mode of MODES) {
        const pages = generate(cfg(mode), kdpCtx(w, h))
        pages.forEach((page, i) => {
          const hasWriteIn = page.objects.some((o) => o.data?.[TWM_WRITE_IN_KEY])
          const hasHeading = page.objects.some((o) => clean(o.text) === OWN_PLACES_TITLE)
          expect(hasWriteIn).toBe(hasHeading)
          if (hasWriteIn) {
            seen = true
            expect(i).toBe(pages.length - 1)
            expect(page.objects.some((o) => o.data?.[TWM_GROUP_KEY] !== undefined)).toBe(true)
          }
        })
      }
    }
    expect(seen).toBe(true)
  })

  it('stamps sampled destinations for the book, and fixed ones not at all', () => {
    const labelsOf = (pages: { objects: StudioFabricObject[] }[]) =>
      pages.flatMap((p) => p.objects.map((o) => o.data?.[STUDIO_CONTENT_LABEL_KEY]).filter(Boolean))
    expect(labelsOf(generate(cfg('states'), kdpCtx(6, 9)))).toEqual([])
    const countries = generate(cfg('countries'), kdpCtx(6, 9))
    expect(labelsOf(countries)).toEqual(printedNames(countries).map((n) => twmBookLabel('countries', n)))
  })

  it('deals a second country list away from the book’s first', () => {
    const first = generate(cfg('countries'), kdpCtx(6, 9, 100))
    const labels = printedNames(first).map((n) => twmBookLabel('countries', n))
    clearStudioRecentContent()
    const second = printedNames(generate(cfg('countries'), kdpCtx(6, 9, 200, labels)))
    expect(second.filter((n) => printedNames(first).includes(n))).toEqual([])
  })

  it('says so plainly on a page too small to write on', () => {
    const tiny: StudioGenerateContext = { ...kdpCtx(3, 4), pageWidth: 3 * DPI, pageHeight: 4 * DPI }
    const pages = generate(cfg('countries'), tiny)
    expect(pages).toHaveLength(1)
    expect(allTexts(pages).some((t) => /too small/.test(t))).toBe(true)
  })
})

describe('prefetch', () => {
  it('reads back only this template’s labels, without a network call', async () => {
    const data = await travelWishMapPrefetch(base, new AbortController().signal, {
      bookContentLabels: (key) => (key === 'travel-wish-map' ? ['countries:Peru'] : ['other']),
    })
    expect(data).toEqual({ bookLabels: ['countries:Peru'] })
    expect(parseTwmRemoteData(null)).toEqual({ bookLabels: [] })
    expect(parseTwmRemoteData({ bookLabels: ['a', 3] })).toEqual({ bookLabels: ['a'] })
  })
})
