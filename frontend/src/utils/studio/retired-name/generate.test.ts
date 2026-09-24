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
import {
  assertObjectsInSafeMargin,
  runGeneratorContractTests,
} from '../studio-generator-test'
import { retiredNameTemplate, validateRnConfig } from './generate'
import { instructionFor } from './config'
import {
  MAX_FIRST_CHARS,
  MAX_LAST_CHARS,
  RN_AI_EMPTY_MESSAGE,
  RN_DEFAULT_TITLE,
  RN_LETTERS,
  RN_LETTERS_HEADING,
  RN_MONTHS,
  RN_MONTHS_HEADING,
  RN_PAGE_TOO_SMALL_MESSAGE,
  buildRnTable,
  chooseRnExample,
  isAgentHead,
  labelKind,
  lastNamesRepeat,
  namesClash,
  normalizeFirstName,
  normalizeLastName,
  parseRnPayload,
  rnTableProblem,
  selectFirstNames,
  selectLastNames,
  type RnTable,
} from './content'
import { runRnKdpPreflight } from './kdp-preflight'
import {
  FIRST_PROBE,
  LAST_PROBE,
  NAME_FONT_MIN,
  WRITE_IN_LABEL,
  exampleLines,
  pxToPt,
  rnBodyField,
  rnPrintNote,
  rnWorstCasePlan,
} from './layout'
import { RN_FIXTURE, RN_FIXTURE_FIRST, RN_FIXTURE_LAST } from './fixture'

const FONT = 'PT Serif'

/** The draft a seller has in front of them — common header fields included. */
const base: StudioConfig = {
  ...buildDefaultConfig(retiredNameTemplate),
  showTitle: true,
  title: RN_DEFAULT_TITLE,
  showInstructions: true,
  seed: 42,
  fontFamily: FONT,
}

/** A real KDP interior: DPI 96, inside margin 0.375", the rest 0.25". */
const kdpCtx = (wIn: number, hIn: number, remoteData: unknown = RN_FIXTURE): StudioGenerateContext => ({
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

/** Every KDP trim the page supports; 5 x 8 is too narrow for 38 entries at 12 pt. */
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
  return retiredNameTemplate.generate(config, ctx)
}

const planFor = (w: number, h: number, config: StudioConfig = base) =>
  rnWorstCasePlan({ page: kdpCtx(w, h), config, instruction: instructionFor(config), font: FONT })

const texts = (objects: StudioFabricObject[]) =>
  objects.map((o) => String(o.text ?? '').replace(/ /g, ' ')).filter(Boolean)

const names = (objects: StudioFabricObject[]) =>
  objects.filter((o) => typeof o.data?.[STUDIO_CONTENT_LABEL_KEY] === 'string')

function extent(o: StudioFabricObject) {
  const w = o.width ?? 0
  const h =
    o.type === 'textbox'
      ? fabricTextHeight(String(o.text).split('\n').length, o.fontSize!, o.lineHeight)
      : (o.height ?? 0)
  const left = o.originX === 'center' ? o.left - w / 2 : o.originX === 'right' ? o.left - w : o.left
  const top = o.originY === 'center' ? o.top - h / 2 : o.originY === 'bottom' ? o.top - h : o.top
  return { left, top, right: left + w, bottom: top + h }
}

const overlaps = (a: ReturnType<typeof extent>, b: ReturnType<typeof extent>) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

const alwaysFits = { first: () => true, last: () => true }
const fixtureTable = () => buildRnTable(parseRnPayload(RN_FIXTURE), alwaysFits)!

// Content comes from the prefetch; with one fixed reply the page is the same
// for every seed, and freshness is the prefetch's job (see prefetch.test.ts).
runGeneratorContractTests(retiredNameTemplate, {
  expectSeedVariance: false,
  configOverrides: { showTitle: true, title: RN_DEFAULT_TITLE, showInstructions: true },
  contextOverrides: { remoteData: RN_FIXTURE },
})

describe('retired-name registry', () => {
  it('is registered once, in the word tab, with no answer page', () => {
    expect(STUDIO_TEMPLATES.filter((t) => t.key === 'retired-name')).toHaveLength(1)
    const registered = getStudioTemplate('retired-name')!
    expect(registered.category).toBe('word')
    expect(registered.producesAnswerKey).toBe(false)
    expect(registered.pageCount).toBe(1)
    expect(registered.defaultPageTitle).toBe(RN_DEFAULT_TITLE)
    expect(registered.prefetch).toBeTypeOf('function')
  })

  it('asks only for a theme', () => {
    expect(retiredNameTemplate.configSchema.map((field) => field.key)).toEqual(['theme', 'customTheme'])
    const custom = retiredNameTemplate.configSchema.find((f) => f.key === 'customTheme')!
    expect(custom.visibleWhen?.({ theme: 'mixed' })).toBe(false)
    expect(custom.visibleWhen?.({ theme: 'custom' })).toBe(true)
  })

  it('refuses an empty custom theme', () => {
    expect(validateRnConfig({ theme: 'custom', customTheme: '' })?.field).toBe('customTheme')
    expect(validateRnConfig({ theme: 'custom', customTheme: 'Golf' })).toBeNull()
    expect(validateRnConfig({ theme: 'mixed' })).toBeNull()
  })

  it('reports what the trim prints in the theme help', () => {
    const help = retiredNameTemplate.configSchema[0]!.helpWhen!(base, kdpCtx(6, 9))
    expect(help).toMatch(/All 26 letters and 12 months/)
    expect(help).toMatch(/\d+ pt/)
    const tooSmall = retiredNameTemplate.configSchema[0]!.helpWhen!(base, kdpCtx(5, 8))
    expect(tooSmall).toMatch(/too small/)
  })
})

describe('retired-name page', () => {
  it('prints every letter and month once, each with a stamped name', () => {
    const [page] = generate(base, kdpCtx(6, 9))
    const all = texts(page!.objects)
    const plan = planFor(6, 9)!
    for (const letter of RN_LETTERS) expect(all.filter((t) => t === letter)).toHaveLength(1)
    for (const label of plan.monthLabels) expect(all.filter((t) => t === label)).toHaveLength(1)
    const stamped = names(page!.objects)
    expect(stamped).toHaveLength(RN_LETTERS.length + RN_MONTHS.length)
    for (const obj of stamped) expect(obj.text).toBe(obj.data![STUDIO_CONTENT_LABEL_KEY])
    expect(new Set(stamped.map((o) => o.text)).size).toBe(stamped.length)
    expect(all).toContain(RN_LETTERS_HEADING)
    expect(all).toContain(RN_MONTHS_HEADING)
  })

  it('shows a worked example that is a real lookup on this page', () => {
    const [page] = generate(base, kdpCtx(8.5, 11))
    const all = texts(page!.objects)
    const lead = all.find((t) => t.startsWith('Example: '))!
    const result = all.find((t) => / \+ .+ = /.test(t))!
    expect(lead).toBeDefined()
    expect(result).toBeDefined()
    const letter = result.charAt(0)
    expect(lead.slice('Example: '.length).startsWith(letter)).toBe(true)
    const [, printed] = result.split(' = ')
    const first = all[all.indexOf(letter) + 1]
    expect(printed!.replace(/\n/g, ' ').startsWith(`${first} `)).toBe(true)
    expect(all).toContain(WRITE_IN_LABEL)
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
        const config = { ...base, showTitle, showInstructions, title: showTitle ? RN_DEFAULT_TITLE : '' }
        const ctx = kdpCtx(w, h)
        const [page] = generate(config, ctx)
        expect(names(page!.objects)).toHaveLength(38)
        assertObjectsInSafeMargin(page!.objects, ctx)

        const solid = page!.objects.filter((o) => o.type === 'textbox')
        const boxes = solid.map(extent)
        for (let i = 0; i < boxes.length; i++) {
          for (let j = i + 1; j < boxes.length; j++) {
            expect(overlaps(boxes[i]!, boxes[j]!), `${solid[i]!.text} / ${solid[j]!.text}`).toBe(false)
          }
        }
      }
    }
  })

  it('never sets type below the floor, and sets it larger on larger trims', () => {
    for (const [w, h] of TRIMS) {
      const plan = planFor(w, h)
      expect(plan).not.toBeNull()
      expect(plan!.metrics.font).toBeGreaterThanOrEqual(NAME_FONT_MIN)
    }
    expect(planFor(6, 9)!.metrics.font).toBeGreaterThan(planFor(5.5, 8.5)!.metrics.font)
    expect(planFor(8.5, 11)!.metrics.font).toBeGreaterThan(planFor(6, 9)!.metrics.font)
    expect(pxToPt(planFor(8.5, 11)!.metrics.font)).toBeGreaterThanOrEqual(16)
  })

  it('keeps the worked example on every supported trim', () => {
    for (const [w, h] of TRIMS) expect(planFor(w, h)!.example).not.toBeNull()
  })

  it('plans for the longest names the gates admit', () => {
    expect(FIRST_PROBE).toHaveLength(MAX_FIRST_CHARS)
    expect(LAST_PROBE).toHaveLength(MAX_LAST_CHARS)
  })

  it('the form note matches the printed page', () => {
    for (const [w, h] of TRIMS) {
      const ctx = kdpCtx(w, h)
      const note = rnPrintNote({ page: ctx, config: base, instruction: instructionFor(base), font: FONT })
      expect(note).toContain(`${pxToPt(planFor(w, h)!.metrics.font)} pt`)
      expect(names(generate(base, ctx)[0]!.objects)).toHaveLength(38)
    }
  })

  it('says so, rather than printing small type, on a trim too small for the table', () => {
    const [page] = generate(base, kdpCtx(5, 8))
    expect(texts(page!.objects)).toContain(RN_PAGE_TOO_SMALL_MESSAGE)
    expect(names(page!.objects)).toHaveLength(0)
  })

  it('shows an error page when the reply is empty, malformed or short of a table', () => {
    for (const remote of [
      undefined,
      null,
      {},
      { firstNames: 'nope', lastNames: [] },
      { firstNames: RN_FIXTURE_FIRST.slice(0, 20), lastNames: RN_FIXTURE_LAST },
      { firstNames: RN_FIXTURE_FIRST, lastNames: RN_FIXTURE_LAST.slice(0, 11) },
      { firstNames: RN_FIXTURE_FIRST, lastNames: ['Wine Sipper', 'Grumpy Golfer', ...RN_FIXTURE_LAST.slice(0, 10)] },
    ]) {
      const [page] = generate(base, { ...kdpCtx(6, 9), remoteData: remote })
      expect(texts(page!.objects)).toContain(RN_AI_EMPTY_MESSAGE)
      expect(names(page!.objects)).toHaveLength(0)
    }
  })

  it('passes the preflight on every trim', () => {
    for (const [w, h] of TRIMS) {
      const ctx = kdpCtx(w, h)
      const plan = planFor(w, h)!
      const table = fixtureTable()
      const example = chooseRnExample(table, plan.monthLabels, (candidate) => {
        const lines = exampleLines(candidate, { metrics: plan.metrics, example: plan.example! }, FONT)
        return lines.lead.length <= plan.example!.leadLines && lines.result.length <= plan.example!.resultLines
      })
      const field = rnBodyField(ctx, base, instructionFor(base))
      const result = runRnKdpPreflight({ table, plan, example, field, font: FONT })
      expect(result.errors).toEqual([])
    }
  })

  it('the preflight refuses a table with a gap, a repeat or a made-up example', () => {
    const ctx = kdpCtx(6, 9)
    const plan = planFor(6, 9)!
    const field = rnBodyField(ctx, base, instructionFor(base))
    const check = (table: RnTable, example = chooseRnExample(table, plan.monthLabels, () => true)) =>
      runRnKdpPreflight({ table, plan, example, field, font: FONT }).errors

    const gap = fixtureTable()
    gap.letters = gap.letters.slice(0, 25)
    expect(check(gap).length).toBeGreaterThan(0)

    const repeat = fixtureTable()
    repeat.months[1] = { ...repeat.months[1]!, name: repeat.months[0]!.name }
    expect(check(repeat)).toContain('Two last names on this page are too alike.')

    const table = fixtureTable()
    expect(check(table, { lead: 'Example: Pat, born in July', result: 'P + Jul = Captain Hammock Snoozer' }))
      .toContain('The example does not match the tables on this page.')
  })
})

describe('retired-name content gates', () => {
  it.each([
    ['Captain', 'Captain'],
    ['captain', 'Captain'],
    ['  BREEZY. ', 'Breezy'],
    ['big cheese', 'Big Cheese'],
    [{ name: 'Commodore' }, 'Commodore'],
  ])('normalises first name %j', (raw, expected) => {
    expect(normalizeFirstName(raw)).toBe(expected)
  })

  it.each([
    '', 'Sir', 'Lady Luck', 'Grandma', 'Old Timer', 'Lazy', 'Grumpy', 'Golf Pro', 'Chief Snoozer',
    'Captain Jack Sparrow', 'Extraordinaire', 'Sunny2', 'Xzqrtp', 'Disney', 'Tipsy',
  ])('rejects first name %j', (raw) => {
    expect(normalizeFirstName(raw)).toBeNull()
  })

  it.each([
    ['Hammock Snoozer', 'Hammock Snoozer'],
    ['hammock snoozer', 'Hammock Snoozer'],
    ['tee-time tinker', 'Tee-Time Tinker'],
    ['Crossword Champ', 'Crossword Champ'],
    ['Book Lover', 'Book Lover'],
    ['Porch Rocker!!', 'Porch Rocker'],
  ])('normalises last name %j', (raw, expected) => {
    expect(normalizeLastName(raw)).toBe(expected)
  })

  it.each([
    'Hammock', 'Hammock Snoozer Deluxe', 'Garden Flower', 'Garden Sunflower', 'Snoozer Hammock',
    'Wine Sipper', 'Grumpy Golfer', 'Hammock Queen', 'Pill Counter', 'Birdfeeder Whisperer',
  ])('rejects last name %j', (raw) => {
    expect(normalizeLastName(raw)).toBeNull()
  })

  it('recognises doer words', () => {
    for (const word of ['Snoozer', 'Collector', 'Florist', 'Champ', 'Whiz']) expect(isAgentHead(word)).toBe(true)
    for (const word of ['Water', 'Sunflower', 'Hammock', 'Winter', 'Doctor']) expect(isAgentHead(word)).toBe(false)
  })

  it('compares names on their word roots', () => {
    expect(namesClash('Snoozy', 'Hammock Snoozer')).toBe(true)
    expect(namesClash('Sunny', 'Sunset Chaser')).toBe(false)
    expect(lastNamesRepeat('Hammock Snoozer', 'Hammock Snoozers')).toBe(true)
    expect(lastNamesRepeat('Hammock Snoozer', 'Porch Snoozer')).toBe(false)
  })

  it('tells first names from last names in book labels', () => {
    expect(labelKind('Hammock Snoozer')).toBe('last')
    expect(labelKind('Captain')).toBe('first')
    expect(labelKind('Big Cheese')).toBe('first')
    expect(labelKind('???')).toBeNull()
  })

  it('drops near-repeats within a list and last names already printed', () => {
    expect(selectFirstNames(['Sunny', 'Sunnyside', 'Breezy', 'Breezier'])).toEqual(['Sunny', 'Breezy'])
    expect(
      selectLastNames(['Porch Rocker', 'Porch Swinger', 'Hammock Snoozer'], { avoid: ['hammock snoozers'] }),
    ).toEqual(['Porch Rocker'])
  })

  it('keeps every fixture name', () => {
    expect(selectFirstNames(RN_FIXTURE_FIRST)).toEqual(RN_FIXTURE_FIRST)
    expect(selectLastNames(RN_FIXTURE_LAST)).toEqual(RN_FIXTURE_LAST)
  })

  it('builds a whole table in order, A to Z and January to December', () => {
    const table = fixtureTable()
    expect(table.letters.map((e) => e.key)).toEqual(RN_LETTERS)
    expect(table.months.map((e) => e.key)).toEqual(RN_MONTHS)
    expect(table.letters.map((e) => e.name)).toEqual(RN_FIXTURE_FIRST.slice(0, 26))
    expect(rnTableProblem(table)).toBeNull()
  })

  it('passes over a name that will not fit, or that echoes a last name, for a spare', () => {
    const payload = {
      firstNames: ['Snoozy', ...RN_FIXTURE_FIRST],
      lastNames: RN_FIXTURE_LAST,
    }
    const table = buildRnTable(payload, { first: (name) => name !== 'Captain', last: () => true })!
    const printed = table.letters.map((e) => e.name)
    expect(printed).not.toContain('Snoozy')
    expect(printed).not.toContain('Captain')
    expect(printed).toHaveLength(26)
  })

  it('never builds a table with a gap', () => {
    expect(buildRnTable({ firstNames: RN_FIXTURE_FIRST.slice(0, 25), lastNames: RN_FIXTURE_LAST }, alwaysFits)).toBeNull()
    expect(buildRnTable({ firstNames: RN_FIXTURE_FIRST, lastNames: RN_FIXTURE_LAST.slice(0, 11) }, alwaysFits)).toBeNull()
  })

  it('picks the example from the content, not the seed', () => {
    const table = fixtureTable()
    const a = chooseRnExample(table, RN_MONTHS, () => true)
    const b = chooseRnExample(fixtureTable(), RN_MONTHS, () => true)
    expect(a).toEqual(b)
    expect(a!.result).toMatch(/^[A-Z] \+ \w+ = /)
  })
})
