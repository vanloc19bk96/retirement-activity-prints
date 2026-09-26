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
import { assertObjectsInSafeMargin, runGeneratorContractTests } from '../studio-generator-test'
import { rollADayTemplate } from './generate'
import { instructionFor } from './config'
import {
  MAX_ACTIVITY_CHARS,
  RD_AI_EMPTY_MESSAGE,
  RD_DEFAULT_TITLE,
  RD_HEADINGS,
  RD_PAGE_TOO_SMALL_MESSAGE,
  buildRdTable,
  cleanRdPools,
  parseRdPayload,
} from './content'
import { RD_DIE_FACE_KEY } from './draw'
import { runRdKdpPreflight } from './kdp-preflight'
import {
  ACTIVITY_FONT_MIN,
  ACTIVITY_PROBE,
  WRITE_IN_LABEL,
  breakActivity,
  pxToPt,
  rdBodyField,
  rdWorstCasePlan,
} from './layout'
import { RD_FIXTURE, RD_FIXTURE_AFTERNOON, RD_FIXTURE_MORNING } from './fixture'

const FONT = 'PT Serif'

/** The draft a seller has in front of them — common header fields included. */
const base: StudioConfig = {
  ...buildDefaultConfig(rollADayTemplate),
  showTitle: true,
  title: RD_DEFAULT_TITLE,
  showInstructions: true,
  seed: 42,
  fontFamily: FONT,
}

/** A real KDP interior: DPI 96, inside margin 0.375", the rest 0.25". */
const kdpCtx = (wIn: number, hIn: number, remoteData: unknown = RD_FIXTURE): StudioGenerateContext => ({
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

/** Every KDP trim the page supports; 5 x 8 is too narrow for twelve rows at large print. */
const TRIMS = [
  [5.5, 8.5],
  [6, 9],
  [7, 10],
  [8, 10],
  [8.25, 11],
  [8.5, 11],
] as const

function generate(config: StudioConfig, ctx: StudioGenerateContext) {
  resetObjectCounter()
  return rollADayTemplate.generate(config, ctx)
}

const planFor = (w: number, h: number, config: StudioConfig = base) =>
  rdWorstCasePlan({ page: kdpCtx(w, h), config, instruction: instructionFor(config), font: FONT })

const texts = (objects: StudioFabricObject[]) =>
  objects.map((o) => String(o.text ?? '').replace(/ /g, ' ')).filter(Boolean)

const activities = (objects: StudioFabricObject[]) =>
  objects.filter((o) => typeof o.data?.[STUDIO_CONTENT_LABEL_KEY] === 'string')

function extent(o: StudioFabricObject) {
  const w = o.width ?? (o.radius ?? 0) * 2
  const h =
    o.type === 'textbox'
      ? fabricTextHeight(String(o.text).split('\n').length, o.fontSize!, o.lineHeight)
      : (o.height ?? (o.radius ?? 0) * 2)
  const left = o.originX === 'center' ? o.left - w / 2 : o.originX === 'right' ? o.left - w : o.left
  const top = o.originY === 'center' ? o.top - h / 2 : o.originY === 'bottom' ? o.top - h : o.top
  return { left, top, right: left + w, bottom: top + h }
}

const overlaps = (a: ReturnType<typeof extent>, b: ReturnType<typeof extent>) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

/** Each drawn die, in page order, with the pips inside its outline. */
function dice(objects: StudioFabricObject[]) {
  const outlines = objects.filter((o) => typeof o.data?.[RD_DIE_FACE_KEY] === 'number')
  const pips = objects.filter((o) => o.type === 'circle')
  return outlines.map((outline) => {
    const box = extent(outline)
    const inside = pips.filter((pip) => {
      const p = extent(pip)
      return p.left >= box.left && p.right <= box.right && p.top >= box.top && p.bottom <= box.bottom
    })
    return { face: outline.data![RD_DIE_FACE_KEY] as number, pips: inside.length, top: box.top }
  })
}

const fixtureTable = () => buildRdTable(cleanRdPools(parseRdPayload(RD_FIXTURE)), () => true)!

// Content comes from the prefetch; with one fixed reply the page is the same
// for every seed, and freshness is the prefetch's job (see prefetch.test.ts).
runGeneratorContractTests(rollADayTemplate, {
  expectSeedVariance: false,
  configOverrides: { showTitle: true, title: RD_DEFAULT_TITLE, showInstructions: true },
  contextOverrides: { remoteData: RD_FIXTURE },
})

describe('roll-a-day registry', () => {
  it('is registered once, in the word tab, with no answer page', () => {
    expect(STUDIO_TEMPLATES.filter((t) => t.key === 'roll-a-day')).toHaveLength(1)
    const registered = getStudioTemplate('roll-a-day')!
    expect(registered.category).toBe('word')
    expect(registered.producesAnswerKey).toBe(false)
    expect(registered.pageCount).toBe(1)
    expect(registered.defaultPageTitle).toBe(RD_DEFAULT_TITLE)
    expect(registered.prefetch).toBeTypeOf('function')
  })

  it('asks only for the mix', () => {
    expect(rollADayTemplate.configSchema.map((field) => field.key)).toEqual(['focus'])
    expect(buildDefaultConfig(rollADayTemplate).focus).toBe('balanced')
  })

  it('reports what the trim prints in the mix help', () => {
    const help = rollADayTemplate.configSchema[0]!.helpWhen!(base, kdpCtx(6, 9))
    expect(help).toMatch(/Six morning and six afternoon ideas in \d+ pt/)
    expect(help).toMatch(/never repeated within your book/)
    const tooSmall = rollADayTemplate.configSchema[0]!.helpWhen!(base, kdpCtx(5, 8))
    expect(tooSmall).toMatch(/too small/)
  })
})

describe('roll-a-day page', () => {
  it('prints Roll #1 for the morning and Roll #2 for the afternoon, six stamped ideas each', () => {
    const [page] = generate(base, kdpCtx(6, 9))
    const all = texts(page!.objects)
    expect(all).toContain(RD_HEADINGS.morning)
    expect(all).toContain(RD_HEADINGS.afternoon)
    expect(all.indexOf(RD_HEADINGS.morning)).toBeLessThan(all.indexOf(RD_HEADINGS.afternoon))
    const stamped = activities(page!.objects)
    expect(stamped).toHaveLength(12)
    for (const obj of stamped) {
      expect(String(obj.text).replace(/\n/g, ' ')).toBe(obj.data![STUDIO_CONTENT_LABEL_KEY])
    }
    expect(new Set(stamped.map((o) => o.data![STUDIO_CONTENT_LABEL_KEY])).size).toBe(12)
    const morning = new Set(RD_FIXTURE_MORNING.map((item) => item.activity))
    const afternoon = new Set(RD_FIXTURE_AFTERNOON.map((item) => item.activity))
    const labels = stamped.map((o) => String(o.data![STUDIO_CONTENT_LABEL_KEY]))
    expect(labels.slice(0, 6).every((label) => morning.has(label))).toBe(true)
    expect(labels.slice(6).every((label) => afternoon.has(label))).toBe(true)
  })

  it('draws die faces 1 to 6 with the right pips beside every idea, twice', () => {
    const [page] = generate(base, kdpCtx(8.5, 11))
    const drawn = dice(page!.objects).sort((a, b) => a.top - b.top)
    expect(drawn.map((d) => d.face)).toEqual([1, 2, 3, 4, 5, 6, 1, 2, 3, 4, 5, 6])
    for (const die of drawn) expect(die.pips).toBe(die.face)
    // Each idea sits on the same row as its die.
    const stamped = activities(page!.objects).map(extent)
    const outlines = page!.objects.filter((o) => typeof o.data?.[RD_DIE_FACE_KEY] === 'number').map(extent)
    stamped.forEach((text, i) => {
      const die = outlines[i]!
      expect(text.top).toBeLessThan(die.bottom)
      expect(text.bottom).toBeGreaterThan(die.top)
      expect(text.left).toBeGreaterThan(die.right)
    })
  })

  it('closes with a place to note both rolls', () => {
    const [page] = generate(base, kdpCtx(6, 9))
    const all = texts(page!.objects)
    expect(all).toContain(WRITE_IN_LABEL)
    expect(all).toContain('Morning')
    expect(all).toContain('Afternoon')
  })

  it('has no hidden answers and no answer page', () => {
    const pages = generate(base, kdpCtx(6, 9))
    expect(pages).toHaveLength(1)
    expect(harvestAnswers(pages[0]!.objects)).toHaveLength(0)
    expect(pages[0]!.answerSourceObjects).toBeUndefined()
  })

  it('prints only black, white and grey', () => {
    const [page] = generate(base, kdpCtx(8.5, 11))
    const colours = new Set(
      page!.objects.flatMap((o) => [o.fill, o.stroke]).filter((c): c is string => !!c && c !== 'transparent'),
    )
    for (const colour of colours) {
      const hex = colour.replace('#', '')
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16))
      expect(Math.max(r!, g!, b!) - Math.min(r!, g!, b!)).toBeLessThanOrEqual(24)
    }
  })

  it.each(TRIMS)('fits %s x %s in the safe area with no text overlapping', (w, h) => {
    for (const showTitle of [false, true]) {
      for (const showInstructions of [false, true]) {
        const config = { ...base, showTitle, showInstructions, title: showTitle ? RD_DEFAULT_TITLE : '' }
        const ctx = kdpCtx(w, h)
        const [page] = generate(config, ctx)
        expect(activities(page!.objects)).toHaveLength(12)
        assertObjectsInSafeMargin(page!.objects, ctx)

        const solid = page!.objects.filter((o) => o.type === 'textbox')
        const boxes = solid.map(extent)
        for (let i = 0; i < boxes.length; i++) {
          for (let j = i + 1; j < boxes.length; j++) {
            expect(overlaps(boxes[i]!, boxes[j]!), `${solid[i]!.text} / ${solid[j]!.text}`).toBe(false)
          }
        }
        const outlines = page!.objects.filter((o) => typeof o.data?.[RD_DIE_FACE_KEY] === 'number').map(extent)
        for (const die of outlines) for (const box of boxes) expect(overlaps(die, box)).toBe(false)
      }
    }
  })

  it('never sets type below large print, and sets it larger on larger trims', () => {
    for (const [w, h] of TRIMS) {
      const plan = planFor(w, h)
      expect(plan).not.toBeNull()
      expect(plan!.metrics.font).toBeGreaterThanOrEqual(ACTIVITY_FONT_MIN)
      expect(pxToPt(plan!.metrics.font)).toBeGreaterThanOrEqual(14)
    }
    expect(planFor(6, 9)!.metrics.font).toBeGreaterThan(planFor(5.5, 8.5)!.metrics.font)
    expect(planFor(8.5, 11)!.metrics.font).toBeGreaterThan(planFor(6, 9)!.metrics.font)
    expect(pxToPt(planFor(6, 9)!.metrics.font)).toBeGreaterThanOrEqual(16)
    expect(pxToPt(planFor(8.5, 11)!.metrics.font)).toBeGreaterThanOrEqual(18)
  })

  it('keeps the write-in line on every supported trim', () => {
    for (const [w, h] of TRIMS) expect(planFor(w, h)!.writeIn).toBe(true)
  })

  it('plans for the longest idea the gates admit', () => {
    expect(ACTIVITY_PROBE).toHaveLength(MAX_ACTIVITY_CHARS)
    for (const [w, h] of TRIMS) {
      const plan = planFor(w, h)!
      expect(breakActivity(ACTIVITY_PROBE, plan, FONT).length).toBeLessThanOrEqual(plan.lines)
      for (const item of [...RD_FIXTURE_MORNING, ...RD_FIXTURE_AFTERNOON]) {
        expect(breakActivity(item.activity, plan, FONT).length).toBeLessThanOrEqual(plan.lines)
      }
    }
  })

  it('says so plainly when the page is too small', () => {
    const [page] = generate(base, kdpCtx(5, 8))
    expect(texts(page!.objects)).toContain(RD_PAGE_TOO_SMALL_MESSAGE)
    expect(activities(page!.objects)).toHaveLength(0)
  })

  it('never prints a table from a missing, malformed or short reply', () => {
    for (const remoteData of [
      undefined,
      null,
      'nonsense',
      { morning: [], afternoon: [] },
      { morning: RD_FIXTURE_MORNING.slice(0, 5), afternoon: RD_FIXTURE_AFTERNOON },
      { morning: RD_FIXTURE_MORNING.map((item) => ({ ...item, kind: 'rest' })), afternoon: RD_FIXTURE_AFTERNOON },
    ]) {
      // Set explicitly: `undefined` would fall back to kdpCtx's default fixture.
      const [page] = generate(base, { ...kdpCtx(6, 9), remoteData })
      expect(texts(page!.objects)).toContain(RD_AI_EMPTY_MESSAGE)
      expect(activities(page!.objects)).toHaveLength(0)
    }
  })

  it('re-validates the reply: a bad or clashing idea is passed over for a spare', () => {
    // The coffee spare clashes with the morning's first brief, which wins.
    const remote = {
      morning: [
        { activity: 'Meet a friend for lunch', concept: 'lunch', kind: 'people' },
        ...RD_FIXTURE_MORNING,
      ],
      afternoon: [
        ...RD_FIXTURE_AFTERNOON,
        { activity: 'Sip a coffee at a new cafe', concept: 'cafe', kind: 'outing' },
      ],
    }
    const [page] = generate(base, kdpCtx(6, 9, remote))
    const labels = activities(page!.objects).map((o) => o.data![STUDIO_CONTENT_LABEL_KEY])
    expect(labels).toHaveLength(12)
    expect(labels).not.toContain('Meet a friend for lunch')
    expect(labels).not.toContain('Sip a coffee at a new cafe')
  })
})

describe('roll-a-day preflight', () => {
  const field = (w: number, h: number) => rdBodyField(kdpCtx(w, h), base, instructionFor(base))

  it('passes the fixture on every trim', () => {
    for (const [w, h] of TRIMS) {
      const result = runRdKdpPreflight({ table: fixtureTable(), plan: planFor(w, h)!, field: field(w, h), font: FONT })
      expect(result.errors).toEqual([])
    }
  })

  it('catches a doubled face, a clash and a table that runs off the page', () => {
    const plan = planFor(6, 9)!
    const table = fixtureTable()
    const doubled = { ...table, afternoon: table.afternoon.map((e, i) => ({ ...e, face: i === 0 ? 2 : e.face })) }
    expect(runRdKdpPreflight({ table: doubled, plan, field: field(6, 9), font: FONT }).ok).toBe(false)
    const clash = {
      ...table,
      afternoon: table.afternoon.map((e, i) => (i === 1 ? { ...e, activity: 'Sip a coffee at a new cafe' } : e)),
    }
    expect(runRdKdpPreflight({ table: clash, plan, field: field(6, 9), font: FONT }).ok).toBe(false)
    const short = { ...field(6, 9), height: 200 }
    expect(runRdKdpPreflight({ table, plan, field: short, font: FONT }).ok).toBe(false)
  })
})
