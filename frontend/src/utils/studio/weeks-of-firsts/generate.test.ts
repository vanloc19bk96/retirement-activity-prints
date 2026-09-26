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
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import { assertObjectsInSafeMargin, runGeneratorContractTests } from '../studio-generator-test'
import { weeksOfFirstsTemplate } from './generate'
import { instructionFor } from './config'
import {
  WF_AI_EMPTY_MESSAGE,
  WF_DEFAULT_TITLE,
  WF_PAGE_TOO_SMALL_MESSAGE,
  WF_SHORT_MESSAGE,
  WF_WEEKS,
  cleanWfAreas,
  numberWfWeeks,
  orderWfYear,
  pickWfYear,
} from './content'
import { WF_WEEK_KEY } from './draw'
import {
  DATE_LINE_MIN,
  IDEA_FONT_MIN,
  NOTE_PITCH_MIN,
  cardHeight,
  fitWfWeeks,
  minLinesFor,
  paginateWeeksOfFirsts,
  pxToPt,
  usableHeight,
  wfFields,
  wfPrintNote,
  wfWorstCasePlan,
  type WfWritingSpace,
} from './layout'
import { runWfKdpPreflight } from './kdp-preflight'
import { WF_FIXTURE, WF_FIXTURE_ALL } from './fixture'

const FONT = 'PT Serif'

/** The draft a seller has in front of them — common header fields included. */
const base: StudioConfig = {
  ...buildDefaultConfig(weeksOfFirstsTemplate),
  showTitle: true,
  title: WF_DEFAULT_TITLE,
  showInstructions: true,
  seed: 42,
  fontFamily: FONT,
}

/** A real KDP interior: DPI 96, inside margin 0.375", the rest 0.25". */
const kdpCtx = (wIn: number, hIn: number, remoteData: unknown = WF_FIXTURE): StudioGenerateContext => ({
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
const SPACES: readonly WfWritingSpace[] = ['comfortable', 'roomy']

function generate(config: StudioConfig, ctx: StudioGenerateContext) {
  resetObjectCounter()
  return weeksOfFirstsTemplate.generate(config, ctx)
}

const ideasOn = (objects: StudioFabricObject[]) =>
  objects.filter((o) => typeof o.data?.[STUDIO_CONTENT_LABEL_KEY] === 'string')
const framesOn = (objects: StudioFabricObject[]) =>
  objects.filter((o) => typeof o.data?.[WF_WEEK_KEY] === 'number')
const textOf = (o: StudioFabricObject) => String(o.text ?? '').replace(/ /g, ' ')

function extent(o: StudioFabricObject) {
  const w = o.width ?? 0
  const h =
    o.type === 'textbox'
      ? fabricTextHeight(String(o.text).split('\n').length, o.fontSize!, o.lineHeight)
      : (o.height ?? 0)
  const left = o.originX === 'center' ? o.left - w / 2 : o.originX === 'right' ? o.left - w : o.left
  return { left, top: o.top, right: left + w, bottom: o.top + h }
}

const inside = (inner: ReturnType<typeof extent>, outer: ReturnType<typeof extent>) =>
  inner.left >= outer.left - 0.5 &&
  inner.right <= outer.right + 0.5 &&
  inner.top >= outer.top - 0.5 &&
  inner.bottom <= outer.bottom + 0.5

// Content comes from the prefetch; the seed only changes the reading order.
runGeneratorContractTests(weeksOfFirstsTemplate, {
  configOverrides: { showTitle: true, title: WF_DEFAULT_TITLE, showInstructions: true },
  contextOverrides: { remoteData: WF_FIXTURE },
})

describe('weeks-of-firsts registry', () => {
  it('is registered once, in the word tab, with no answer page', () => {
    expect(STUDIO_TEMPLATES.filter((t) => t.key === 'weeks-of-firsts')).toHaveLength(1)
    const registered = getStudioTemplate('weeks-of-firsts')!
    expect(registered.category).toBe('word')
    expect(registered.producesAnswerKey).toBe(false)
    expect(registered.defaultPageTitle).toBe(WF_DEFAULT_TITLE)
    expect(registered.prefetch).toBeTypeOf('function')
  })

  it('asks only the mix and the writing space', () => {
    expect(weeksOfFirstsTemplate.configSchema.map((f) => f.key)).toEqual(['focus', 'writingSpace'])
    const config = buildDefaultConfig(weeksOfFirstsTemplate)
    expect(config.focus).toBe('balanced')
    expect(config.writingSpace).toBe('comfortable')
  })
})

describe.each(SPACES)('a %s year', (space) => {
  it.each(TRIMS)('prints all 52 weeks, in order and whole, on a %s x %s trim', (w, h) => {
    const ctx = kdpCtx(w, h)
    const config = { ...base, writingSpace: space }
    const pages = generate(config, ctx)
    expect(pages.length).toBeGreaterThan(10)

    const weeks = pages.flatMap((page) => framesOn(page.objects).map((f) => f.data![WF_WEEK_KEY] as number))
    expect(weeks).toEqual(Array.from({ length: WF_WEEKS }, (_, i) => i + 1))

    const ideas = pages.flatMap((page) => ideasOn(page.objects).map((o) => String(o.data![STUDIO_CONTENT_LABEL_KEY])))
    expect(ideas).toHaveLength(WF_WEEKS)
    expect(new Set(ideas).size).toBe(WF_WEEKS)
    for (const idea of ideas) expect(WF_FIXTURE_ALL).toContain(idea)

    for (const page of pages) {
      assertObjectsInSafeMargin(page.objects, ctx)
      const frames = framesOn(page.objects).map(extent)
      // Cards never overlap one another.
      frames.forEach((a, i) => frames.slice(i + 1).forEach((b) => expect(a.bottom <= b.top || b.bottom <= a.top).toBe(true)))
      // Every week's label, date, idea and lines sit inside its own card.
      for (const idea of ideasOn(page.objects)) {
        expect(frames.some((frame) => inside(extent(idea), frame))).toBe(true)
      }
    }
  })

  it('keeps every week’s heading, date line and idea on the same page as its card', () => {
    const pages = generate({ ...base, writingSpace: space }, kdpCtx(6, 9))
    for (const page of pages) {
      const labels = page.objects.filter((o) => /^Week \d+$/.test(textOf(o))).map((o) => textOf(o))
      const frames = framesOn(page.objects).map((f) => `Week ${f.data![WF_WEEK_KEY]}`)
      expect(labels).toEqual(frames)
      const dates = page.objects.filter((o) => textOf(o) === 'Date:')
      expect(dates).toHaveLength(frames.length)
      expect(ideasOn(page.objects)).toHaveLength(frames.length)
    }
  })
})

describe('layout', () => {
  it.each(TRIMS)('holds large print, a real date line and roomy writing lines on %s x %s', (w, h) => {
    for (const space of SPACES) {
      const plan = wfWorstCasePlan({ page: kdpCtx(w, h), config: base, instruction: instructionFor(base), font: FONT, space })
      expect(plan, `${w}x${h} ${space}`).not.toBeNull()
      expect(plan!.metrics.font).toBeGreaterThanOrEqual(IDEA_FONT_MIN)
      expect(plan!.metrics.pitch).toBeGreaterThanOrEqual(NOTE_PITCH_MIN)
      expect(plan!.dateLineW).toBeGreaterThanOrEqual(DATE_LINE_MIN)
      expect(plan!.lines).toBeGreaterThanOrEqual(minLinesFor(space))
    }
  })

  it('gives a roomy year more writing space than a comfortable one', () => {
    const at = (space: WfWritingSpace) =>
      wfWorstCasePlan({ page: kdpCtx(6, 9), config: base, instruction: instructionFor(base), font: FONT, space })!
    expect(at('roomy').lines).toBeGreaterThan(at('comfortable').lines)
    expect(at('roomy').perPage).toBeLessThanOrEqual(at('comfortable').perPage)
  })

  it('never shrinks the type to squeeze more weeks onto a page', () => {
    const plan = wfWorstCasePlan({ page: kdpCtx(8.5, 11), config: base, instruction: instructionFor(base), font: FONT, space: 'comfortable' })!
    expect(pxToPt(plan.metrics.font)).toBeGreaterThanOrEqual(16)
  })

  it('opens with a start-date line and closes the year where the last page has room', () => {
    const ctx = kdpCtx(6, 9)
    const pages = generate(base, ctx)
    const first = pages[0]!.objects.map(textOf)
    expect(first.some((t) => t.startsWith('I began'))).toBe(true)
    const last = pages.at(-1)!.objects.map(textOf)
    expect(last.some((t) => t.startsWith('Looking Back'))).toBe(true)
  })

  it('reports in the form what actually prints', () => {
    for (const space of SPACES) {
      const ctx = kdpCtx(6, 9)
      const config = { ...base, writingSpace: space }
      const note = wfPrintNote({ page: ctx, config, instruction: instructionFor(config), font: FONT, space })
      const pages = generate(config, ctx)
      expect(note).toContain(`${pages.length} pages`)
      const plan = wfWorstCasePlan({ page: ctx, config, instruction: instructionFor(config), font: FONT, space })!
      expect(note).toContain(`${pxToPt(plan.metrics.font)} pt`)
    }
    expect(wfPrintNote({ page: undefined, config: base, instruction: '', font: FONT, space: 'comfortable' })).toMatch(/52/)
  })

  it('lays every later page out the same way', () => {
    const ctx = kdpCtx(6, 9)
    const pages = generate(base, ctx)
    const tops = (i: number) => framesOn(pages[i]!.objects).map((f) => f.top)
    for (let i = 2; i < pages.length - 1; i++) expect(tops(i)).toEqual(tops(1))
  })
})

describe('preflight', () => {
  const ctx = kdpCtx(6, 9)
  const plan = wfWorstCasePlan({ page: ctx, config: base, instruction: instructionFor(base), font: FONT, space: 'comfortable' })!
  const fields = wfFields(ctx, base, instructionFor(base))
  const usable = usableHeight(plan, fields)
  const weeks = fitWfWeeks(numberWfWeeks(orderWfYear(pickWfYear(cleanWfAreas(WF_FIXTURE.areas)).picks!, 42)), plan, FONT)
  const pages = paginateWeeksOfFirsts(weeks, plan, usable)!

  it('passes a well-formed year', () => {
    expect(runWfKdpPreflight({ weeks, pages, plan, usable })).toMatchObject({ ok: true, errors: [] })
  })

  it('catches a week dropped from the pages', () => {
    const dropped = pages.map((page, i) => (i === 3 ? { blocks: page.blocks.slice(1) } : page))
    expect(runWfKdpPreflight({ weeks, pages: dropped, plan, usable }).ok).toBe(false)
  })

  it('catches a card that runs past the printable area', () => {
    const tall = pages.map((page, i) =>
      i === 2
        ? { blocks: page.blocks.map((b) => (b.kind === 'card' ? { ...b, top: b.top + 400 } : b)) }
        : page,
    )
    const result = runWfKdpPreflight({ weeks, pages: tall, plan, usable })
    expect(result.errors.some((e) => /printable area|overlapping/.test(e))).toBe(true)
  })

  it('catches a week with too little room to write', () => {
    const cramped = pages.map((page, i) =>
      i === 1
        ? { blocks: page.blocks.map((b) => (b.kind === 'card' ? { ...b, lines: 2, height: cardHeight(plan, 2) } : b)) }
        : page,
    )
    expect(runWfKdpPreflight({ weeks, pages: cramped, plan, usable }).errors.join(' ')).toMatch(/room for notes/)
  })

  it('catches an idea set differently from the one written', () => {
    const edited = weeks.map((w, i) => (i === 0 ? { ...w, lines: ['Something', 'else'] } : w))
    const result = runWfKdpPreflight({ weeks: edited, pages, plan, usable })
    expect(result.ok).toBe(false)
  })
})

describe('weeks-of-firsts errors', () => {
  it('says so plainly when no ideas arrived', () => {
    const pages = generate(base, kdpCtx(6, 9, { areas: [] }))
    expect(pages).toHaveLength(1)
    expect(pages[0]!.objects.map(textOf)).toContain(WF_AI_EMPTY_MESSAGE)
  })

  it('never prints a short year', () => {
    const short = { areas: WF_FIXTURE.areas.map((a) => ({ ...a, items: a.items.slice(0, 2) })) }
    const pages = generate(base, kdpCtx(6, 9, short))
    expect(pages).toHaveLength(1)
    expect(pages[0]!.objects.map(textOf)).toContain(WF_SHORT_MESSAGE)
  })

  it('refuses a page too small for large print', () => {
    const pages = generate(base, kdpCtx(3, 4))
    expect(pages[0]!.objects.map(textOf)).toContain(WF_PAGE_TOO_SMALL_MESSAGE)
  })

  it('drops malformed remote data rather than printing it', () => {
    const junk = {
      areas: [
        ...WF_FIXTURE.areas,
        { key: 'kitchen', target: 3, items: [{ idea: 'Build a snowman' }, { idea: 42 }, null] },
      ],
    }
    const pages = generate(base, kdpCtx(6, 9, junk))
    const ideas = pages.flatMap((p) => ideasOn(p.objects).map((o) => String(o.data![STUDIO_CONTENT_LABEL_KEY])))
    expect(ideas).toHaveLength(WF_WEEKS)
    expect(ideas).not.toContain('Build a snowman')
  })
})
