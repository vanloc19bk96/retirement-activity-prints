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
import { isStudioHeaderTitle } from '../studio-layout'
import { assertObjectsInSafeMargin, runGeneratorContractTests } from '../studio-generator-test'
import { bucketListTemplate } from './generate'
import { instructionFor } from './config'
import {
  BL_AI_EMPTY_MESSAGE,
  BL_DEFAULT_TITLE,
  BL_INSTRUCTION,
  BL_PAGE_TOO_SMALL_MESSAGE,
  BL_SHORT_MESSAGE,
  balanceBlSections,
  blShortfall,
  cleanBlSections,
  ideaKey,
  ideasRepeat,
  keysRepeat,
  normalizeIdea,
  spreadOpenings,
  type BlSection,
} from './content'
import { BL_WRITE_IN_KEY } from './draw'
import {
  CHECK_MIN,
  CONTINUED,
  CONTINUED_SHORT,
  IDEA_FONT_MIN,
  OWN_IDEAS_TITLE,
  WRITE_ROW_MIN,
  blFields,
  blPrintNote,
  blWorstCasePlan,
  paginateBucketList,
  pxToPt,
  usableHeight,
  type FittedBlSection,
} from './layout'
import { runBlKdpPreflight } from './kdp-preflight'
import { BL_FIXTURE, BL_FIXTURE_IDEAS, BL_FIXTURE_SECTIONS } from './fixture'

const FONT = 'PT Serif'

/** The draft a seller has in front of them — common header fields included. */
const base: StudioConfig = {
  ...buildDefaultConfig(bucketListTemplate),
  showTitle: true,
  title: BL_DEFAULT_TITLE,
  showInstructions: true,
  seed: 42,
  fontFamily: FONT,
}

/** A real KDP interior: DPI 96, inside margin 0.375", the rest 0.25". */
const kdpCtx = (wIn: number, hIn: number, remoteData: unknown = BL_FIXTURE): StudioGenerateContext => ({
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
  return bucketListTemplate.generate(config, ctx)
}

const ideasOn = (objects: StudioFabricObject[]) =>
  objects.filter((o) => typeof o.data?.[STUDIO_CONTENT_LABEL_KEY] === 'string')
const isWriteIn = (o: StudioFabricObject) => o.data?.[BL_WRITE_IN_KEY] === true
const boxesOn = (objects: StudioFabricObject[]) =>
  objects.filter((o) => o.type === 'rect' && o.studioRole === 'structure' && !isWriteIn(o))
const numbersOn = (objects: StudioFabricObject[]) =>
  objects.filter((o) => o.type === 'textbox' && /^\d+\.$/.test(String(o.text)))
const textOf = (o: StudioFabricObject) => String(o.text ?? '').replace(/ /g, ' ')

function extent(o: StudioFabricObject) {
  const w = o.width ?? 0
  const h =
    o.type === 'textbox'
      ? fabricTextHeight(String(o.text).split('\n').length, o.fontSize!, o.lineHeight)
      : (o.height ?? 0)
  const left = o.originX === 'center' ? o.left - w / 2 : o.originX === 'right' ? o.left - w : o.left
  return { left, top: o.top, right: left + w, bottom: o.top + h }
}

const overlaps = (a: ReturnType<typeof extent>, b: ReturnType<typeof extent>) =>
  a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5

const section = (key: string, target: number, ideas: string[]): BlSection => ({
  key,
  title: key.charAt(0).toUpperCase() + key.slice(1),
  target,
  items: ideas.map((idea) => ({ idea, concept: '' })),
})

// Content comes from the prefetch; with one fixed reply the list is the same
// for every seed, and freshness is the prefetch's job (see prefetch.test.ts).
runGeneratorContractTests(bucketListTemplate, {
  expectSeedVariance: false,
  configOverrides: { showTitle: true, title: BL_DEFAULT_TITLE, showInstructions: true },
  contextOverrides: { remoteData: BL_FIXTURE },
})

describe('bucket-list registry', () => {
  it('is registered once, in the word tab, with no answer page', () => {
    expect(STUDIO_TEMPLATES.filter((t) => t.key === 'bucket-list')).toHaveLength(1)
    const registered = getStudioTemplate('bucket-list')!
    expect(registered.category).toBe('word')
    expect(registered.producesAnswerKey).toBe(false)
    expect(registered.defaultPageTitle).toBe(BL_DEFAULT_TITLE)
    expect(registered.prefetch).toBeTypeOf('function')
  })

  it('asks only how many ideas and what mix', () => {
    expect(bucketListTemplate.configSchema.map((field) => field.key)).toEqual(['ideaCount', 'focus'])
    const count = bucketListTemplate.configSchema[0]!
    expect(count.default).toBe(100)
    expect(count.options!.map((o) => o.value)).toEqual([50, 75, 100])
  })

  it.each(TRIMS)('reports what a %s x %s trim prints', (w, h) => {
    const help = bucketListTemplate.configSchema[0]!.helpWhen!(base, kdpCtx(w, h))
    expect(help).toMatch(/^100 ideas under about 12 themed headings — about \d+ pages in (1[4-8]) pt large print\.$/)
  })

  it('estimates the pages the list really takes', () => {
    for (const [w, h] of TRIMS) {
      const note = blPrintNote({ page: kdpCtx(w, h), config: base, instruction: BL_INSTRUCTION, font: FONT, count: 100 })
      const promised = Number(note.match(/about (\d+) pages/)![1])
      const printed = generate(base, kdpCtx(w, h)).length
      expect(Math.abs(printed - promised), `${w} x ${h}`).toBeLessThanOrEqual(1)
    }
  })
})

describe('bucket-list pages', () => {
  it.each(TRIMS)('prints all 100 ideas, numbered 1 to 100 across pages, on %s x %s', (w, h) => {
    const ctx = kdpCtx(w, h)
    const pages = generate(base, ctx)
    expect(pages.length).toBeGreaterThan(1)
    const numbers = pages.flatMap((p) => numbersOn(p.objects).map(textOf))
    expect(numbers).toEqual(Array.from({ length: 100 }, (_, i) => `${i + 1}.`))
    const ideas = pages.flatMap((p) => ideasOn(p.objects))
    expect(ideas).toHaveLength(100)
    for (const idea of ideas) {
      expect(textOf(idea).replace(/\s+/g, ' ')).toBe(idea.data![STUDIO_CONTENT_LABEL_KEY])
    }
    for (const page of pages) {
      assertObjectsInSafeMargin(page.objects, ctx)
      expect(boxesOn(page.objects)).toHaveLength(ideasOn(page.objects).length)
      expect(page.pageRole).toBe('single')
    }
  })

  it.each(TRIMS)('keeps every box beside its own idea on %s x %s', (w, h) => {
    for (const page of generate(base, kdpCtx(w, h))) {
      const boxes = boxesOn(page.objects)
      const numbers = numbersOn(page.objects)
      const ideas = ideasOn(page.objects)
      ideas.forEach((idea, i) => {
        const box = extent(boxes[i]!)
        const number = extent(numbers[i]!)
        const text = extent(idea)
        // Box, then number, then idea, left to right, none touching.
        expect(box.right).toBeLessThan(number.left)
        expect(number.right).toBeLessThanOrEqual(text.left)
        // The box sits on the idea's first line.
        const firstLine = idea.fontSize! * 1.13
        expect(box.top).toBeGreaterThanOrEqual(text.top - 1)
        expect(box.bottom).toBeLessThanOrEqual(text.top + firstLine + 2)
        // Boxes are big enough for a pen and share one column.
        expect(boxes[i]!.width).toBeGreaterThanOrEqual(CHECK_MIN)
        expect(boxes[i]!.left).toBe(boxes[0]!.left)
        expect(idea.fontSize!).toBeGreaterThanOrEqual(IDEA_FONT_MIN)
      })
      const rows = ideas.map(extent)
      rows.forEach((row, i) => rows.slice(i + 1).forEach((other) => expect(overlaps(row, other)).toBe(false)))
    }
  })

  it('groups the ideas under headings, carrying a heading over a page break', () => {
    const pages = generate(base, kdpCtx(6, 9))
    const headings = pages.flatMap((p) =>
      p.objects
        .filter((o) => o.type === 'textbox' && o.fontWeight === 700 && !/^\d+\.$/.test(String(o.text)))
        .filter((o) => !isStudioHeaderTitle(o))
        .map(textOf),
    )
    const titles = BL_FIXTURE_SECTIONS.map((s) => s.title)
    const suffix = (h: string) => [CONTINUED, CONTINUED_SHORT].find((c) => h.endsWith(c))
    const listed = headings.filter((h) => h !== OWN_IDEAS_TITLE)
    expect(listed.filter((h) => !suffix(h))).toEqual(titles)
    for (const h of listed.filter(suffix)) expect(titles).toContain(h.slice(0, -suffix(h)!.length))
  })

  it.each(TRIMS)('closes with write-in lines only where the last page has room, on %s x %s', (w, h) => {
    const ctx = kdpCtx(w, h)
    const pages = generate(base, ctx)
    pages.slice(0, -1).forEach((page) => expect(page.objects.some(isWriteIn)).toBe(false))
    const last = pages.at(-1)!.objects
    const lines = last.filter((o) => isWriteIn(o) && o.studioRole === 'decoration')
    const boxes = last.filter((o) => isWriteIn(o) && o.studioRole === 'structure')
    expect(lines).toHaveLength(boxes.length)
    if (lines.length > 0) {
      expect(lines.length).toBeGreaterThanOrEqual(3)
      expect(last.map(textOf)).toContain(OWN_IDEAS_TITLE)
      const tops = lines.map((l) => l.top)
      tops.slice(1).forEach((top, i) => expect(top - tops[i]!).toBeGreaterThanOrEqual(WRITE_ROW_MIN - 1))
      // Each box sits on its own line, left of it.
      boxes.forEach((box, i) => {
        expect(box.left + box.width!).toBeLessThan(lines[i]!.left)
        expect(box.top + box.height!).toBeLessThanOrEqual(lines[i]!.top)
      })
    } else {
      expect(last.map(textOf)).not.toContain(OWN_IDEAS_TITLE)
    }
  })

  it('titles every page and gives the how-to on the first only', () => {
    const pages = generate(base, kdpCtx(6, 9))
    pages.forEach((page, i) => {
      const texts = page.objects.map(textOf)
      expect(page.objects.some(isStudioHeaderTitle)).toBe(true)
      expect(texts.includes(BL_INSTRUCTION)).toBe(i === 0)
    })
  })

  it('prints a balanced list with no idea repeated', () => {
    const ideas = generate(base, kdpCtx(8.5, 11)).flatMap((p) => ideasOn(p.objects).map(textOf))
    const keys = ideas.map((idea) => ideaKey(idea.replace(/\s+/g, ' ')))
    keys.forEach((k, i) => keys.slice(0, i).forEach((other) => expect(keysRepeat(k, other)).toBe(false)))
  })

  it('prints fewer pages for a shorter list', () => {
    const pages = (count: number) => generate({ ...base, ideaCount: count }, kdpCtx(6, 9)).length
    expect(pages(50)).toBeLessThan(pages(75))
    expect(pages(75)).toBeLessThan(pages(100))
    const fifty = generate({ ...base, ideaCount: 50 }, kdpCtx(6, 9))
    expect(fifty.flatMap((p) => ideasOn(p.objects))).toHaveLength(50)
  })

  it('has no hidden answers and no answer page', () => {
    for (const page of generate(base, kdpCtx(6, 9))) {
      expect(harvestAnswers(page.objects)).toHaveLength(0)
      expect(page.answerSourceObjects).toBeUndefined()
    }
  })

  it('prints only black, white and grey', () => {
    const objects = generate(base, kdpCtx(8.5, 11)).flatMap((p) => p.objects)
    const colours = new Set(
      objects.flatMap((o) => [o.fill, o.stroke]).filter((c): c is string => !!c && c !== 'transparent'),
    )
    for (const colour of colours) {
      const hex = colour.replace('#', '')
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16))
      expect(Math.max(r!, g!, b!) - Math.min(r!, g!, b!)).toBeLessThanOrEqual(24)
    }
  })

  it('never prints an idea that fails a gate, whatever the payload says', () => {
    const tainted = {
      sections: BL_FIXTURE.sections.map((s, i) =>
        i === 0
          ? { ...s, items: [{ idea: 'Take your grandchildren to the zoo' }, { idea: 'Learn new things' }, ...s.items] }
          : s,
      ),
    }
    const ideas = generate(base, kdpCtx(6, 9, tainted)).flatMap((p) => ideasOn(p.objects).map(textOf))
    expect(ideas).toHaveLength(100)
    expect(ideas.join(' ')).not.toMatch(/grandchildren|new things/)
  })

  it('says so plainly when the list cannot be made', () => {
    const message = (remote: unknown, ctx = kdpCtx(6, 9, remote)) =>
      generate(base, ctx)
        .flatMap((p) => p.objects)
        .map(textOf)
    expect(message(null)).toContain(BL_AI_EMPTY_MESSAGE)
    const thin = { sections: BL_FIXTURE.sections.slice(0, 4) }
    expect(message(thin)).toContain(BL_SHORT_MESSAGE)
    expect(message(BL_FIXTURE, kdpCtx(2.5, 3))).toContain(BL_PAGE_TOO_SMALL_MESSAGE)
  })

  it('keeps large print on every trim, and reports it', () => {
    for (const [w, h] of TRIMS) {
      const plan = blWorstCasePlan({ page: kdpCtx(w, h), config: base, instruction: instructionFor(base), font: FONT })!
      expect(pxToPt(plan.metrics.font)).toBeGreaterThanOrEqual(14)
      expect(plan.ideaLines).toBeLessThanOrEqual(3)
    }
  })
})

describe('bucket-list ideas', () => {
  it.each([
    ['12. Take a scenic train journey.', 'Take a scenic train journey'],
    ['☐ grow a pot of herbs on a windowsill', 'Grow a pot of herbs on a windowsill'],
    ['Learn calligraphy', 'Learn calligraphy'],
    ['Taste a real crème brûlée', 'Taste a real crème brûlée'],
  ])('normalises %s', (raw, expected) => {
    expect(normalizeIdea(raw)).toBe(expected)
  })

  it.each([
    'Experience more adventure',
    'Learn new things',
    'Travel somewhere you have never been',
    'Bake bread and sell it at a market',
    'Visit Rome or Paris',
    'Visiting a museum',
    'Go skydiving over the desert',
    'Take your grandchildren to the zoo',
    'See the ocean before it’s too late',
    'Visit Disneyland',
    'TAKE A SCENIC TRAIN JOURNEY',
    'Take a slow and scenic train journey through the mountain villages of the north',
  ])('rejects %s', (raw) => {
    expect(normalizeIdea(raw)).toBeNull()
  })

  it.each([
    ['Visit a new country', 'Take a trip to a country you have never visited', true],
    ['Learn painting', 'Try painting', true],
    ['Try painting', 'Take a painting class', true],
    ['See the northern lights', 'Watch the aurora', true],
    ['Learn to knit', 'Take up knitting', true],
    ['Take a painting class', 'Paint a portrait of a friend', false],
    ['Take a scenic train journey', 'Take a day trip by train on a whim', false],
    ['Join a book club', 'Join a walking group', false],
  ] as const)('%s / %s repeat: %s', (a, b, expected) => {
    expect(ideasRepeat(a, b)).toBe(expected)
    expect(ideasRepeat(b, a)).toBe(expected)
  })

  it('passes every fixture idea, none repeating another', () => {
    const keys = BL_FIXTURE_IDEAS.map((idea) => {
      expect(normalizeIdea(idea), idea).toBe(idea)
      return ideaKey(idea)
    })
    keys.forEach((k, i) => keys.slice(0, i).forEach((o) => expect(keysRepeat(k, o), k.text).toBe(false)))
  })
})

describe('bucket-list balance', () => {
  const ideas = (prefix: string, n: number) =>
    Array.from({ length: n }, (_, i) => `Photograph the ${prefix} ${['lighthouse', 'harbour', 'meadow', 'orchard', 'windmill', 'canal', 'fountain', 'bandstand', 'archway', 'pier'][i]}`)

  it('takes each heading’s share, exactly the count', () => {
    const list = balanceBlSections([section('alpha', 4, ideas('amber', 6)), section('beta', 4, ideas('copper', 6))], 8)!
    expect(list.map((s) => s.items.length)).toEqual([4, 4])
  })

  it('spreads a shortfall over headings with spares, two over at most', () => {
    const list = balanceBlSections(
      [section('alpha', 4, ideas('amber', 2)), section('beta', 4, ideas('copper', 8)), section('gamma', 4, ideas('misty', 8))],
      12,
    )!
    expect(list.map((s) => s.key)).toEqual(['beta', 'gamma'])
    expect(list.map((s) => s.items.length)).toEqual([6, 6])
    expect(balanceBlSections([section('alpha', 4, ideas('amber', 4)), section('beta', 4, ideas('copper', 8))], 12)).toBeNull()
  })

  it('names the headings to top up', () => {
    expect(blShortfall([section('alpha', 5, ideas('amber', 2)), section('beta', 3, ideas('copper', 3))])).toEqual([
      { key: 'alpha', count: 3 },
    ])
  })

  it('drops repeats across headings and of the book, and merges a top-up', () => {
    const first = cleanBlSections(
      [
        { key: 'alpha', title: 'Alpha', target: 2, items: [{ idea: 'Try painting' }, { idea: 'Join a book club' }] },
        { key: 'beta', title: 'Beta', target: 2, items: [{ idea: 'Take a painting class' }, { idea: 'Bake a loaf of sourdough bread' }] },
      ],
      { avoid: ['Join a reading club'] },
    )
    expect(first.flatMap((s) => s.items.map((i) => i.idea))).toEqual(['Try painting', 'Bake a loaf of sourdough bread'])
    const merged = cleanBlSections(
      [{ key: 'alpha', title: 'Alpha', target: 9, items: [{ idea: 'Learn painting' }, { idea: 'Watch a meteor shower' }] }],
      { keep: first },
    )
    expect(merged.find((s) => s.key === 'alpha')!.items.map((i) => i.idea)).toEqual(['Try painting', 'Watch a meteor shower'])
    expect(merged.find((s) => s.key === 'alpha')!.target).toBe(2)
  })

  it('refuses headings that are not the service’s own', () => {
    expect(cleanBlSections([{ key: 'x', title: 'Click here: http://spam', target: 2, items: [{ idea: 'Try painting' }] }])).toEqual([])
    expect(cleanBlSections([{ key: 'BAD KEY', title: 'Travel', target: 2, items: [{ idea: 'Try painting' }] }])).toEqual([])
  })

  it('keeps ideas that open on the same verb apart', () => {
    const spread = spreadOpenings(
      ['Visit a castle', 'Visit a lavender farm', 'Learn calligraphy', 'Bake sourdough bread'].map((idea) => ({ idea, concept: '' })),
    ).map((i) => i.idea)
    expect(spread).toEqual(['Visit a castle', 'Learn calligraphy', 'Visit a lavender farm', 'Bake sourdough bread'])
  })
})

describe('bucket-list pagination', () => {
  const plan = blWorstCasePlan({ page: kdpCtx(6, 9), config: base, instruction: BL_INSTRUCTION, font: FONT })!
  const fields = blFields(kdpCtx(6, 9), base, BL_INSTRUCTION)
  let n = 0
  const make = (sizes: number[]): FittedBlSection[] =>
    sizes.map((size, s) => ({
      key: `s${s}`,
      title: `Heading ${s}`,
      ideas: Array.from({ length: size }, () => ({ number: ++n, idea: 'x', lines: ['x'] })),
    }))

  it('never strands a heading at the foot of a page, nor one idea at the top of the next', () => {
    n = 0
    const sections = make([9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 10])
    const pages = paginateBucketList(sections, plan, usableHeight(plan, fields))!
    for (const page of pages) {
      const last = page.blocks.at(-1)!
      expect(last.kind).toBe('row')
      page.blocks.forEach((block, i) => {
        if (block.kind !== 'heading') return
        const following = page.blocks.slice(i + 1, i + 3)
        const sectionLeft = following.filter((b) => b.kind === 'row').length
        expect(sectionLeft).toBeGreaterThanOrEqual(Math.min(2, following.length))
      })
    }
    // A carried-over heading keeps at least two ideas with it.
    for (const page of pages.slice(1)) {
      const first = page.blocks[0]
      if (first?.kind === 'heading' && first.continued) {
        expect(page.blocks.slice(1, 3).every((b) => b.kind === 'row')).toBe(true)
      }
    }
    const numbers = pages.flatMap((p) => p.blocks.flatMap((b) => (b.kind === 'row' ? [b.item.number] : [])))
    expect(numbers).toEqual(Array.from({ length: 100 }, (_, i) => i + 1))
  })

  it('passes the preflight, and fails it when numbering skips', () => {
    n = 0
    const sections = make([10, 10, 10, 10, 10])
    const usable = usableHeight(plan, fields)
    const pages = paginateBucketList(sections, plan, usable)!
    const ok = runBlKdpPreflight({ sections, pages, plan, usable, count: 50 })
    // Placeholder ideas fail the content gate; everything structural passes.
    expect(ok.errors.filter((e) => !/not suitable|repeats/.test(e))).toEqual([])
    const skipped = pages.map((p) => ({
      ...p,
      blocks: p.blocks.map((b) => (b.kind === 'row' && b.item.number === 7 ? { ...b, item: { ...b.item, number: 70 } } : b)),
    }))
    expect(runBlKdpPreflight({ sections, pages: skipped, plan, usable, count: 50 }).errors).toContain(
      'The ideas are not numbered in one unbroken run.',
    )
  })
})
