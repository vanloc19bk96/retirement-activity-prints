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
import { everOrNeverTemplate, validateEonConfig } from './generate'
import { instructionFor } from './config'
import {
  EON_AI_EMPTY_MESSAGE,
  EON_DEFAULT_TITLE,
  EON_EVER,
  EON_NEVER,
  compactStatementLabel,
  isParticiple,
  normalizeStatement,
  orderForVariety,
  selectEonStatements,
  statementsRepeat,
} from './content'
import { fitEonStatements } from './fit'
import { runEonKdpPreflight } from './kdp-preflight'
import {
  MAX_STATEMENT_LINES,
  MAX_STATEMENTS_PER_PAGE,
  STATEMENT_FONT_MIN,
  TALLY_LABEL,
  eonBodyField,
  eonPrintNote,
  eonWorstCasePlan,
  pxToPt,
} from './layout'
import { STORY_LABEL } from './draw'
import { EON_FIXTURE, EON_FIXTURE_ITEMS } from './fixture'

const FONT = 'PT Serif'

/** The draft a seller has in front of them — common header fields included. */
const base: StudioConfig = {
  ...buildDefaultConfig(everOrNeverTemplate),
  showTitle: true,
  title: EON_DEFAULT_TITLE,
  showInstructions: true,
  seed: 42,
  fontFamily: FONT,
}

/** A real KDP interior: DPI 96, inside margin 0.375", the rest 0.25". */
const kdpCtx = (wIn: number, hIn: number, remoteData: unknown = EON_FIXTURE): StudioGenerateContext => ({
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
  return everOrNeverTemplate.generate(config, ctx)
}

const planFor = (w: number, h: number, config: StudioConfig = base) =>
  eonWorstCasePlan({
    page: kdpCtx(w, h),
    config,
    instruction: instructionFor(config),
    font: FONT,
    storyLine: config.storyLine === true,
  })

const texts = (objects: StudioFabricObject[]) =>
  objects.map((o) => String(o.text ?? '').replace(/ /g, ' ')).filter(Boolean)

const statements = (objects: StudioFabricObject[]) =>
  objects.filter((o) => typeof o.data?.[STUDIO_CONTENT_LABEL_KEY] === 'string')

const checkboxes = (objects: StudioFabricObject[]) =>
  objects.filter((o) => o.type === 'rect' && o.studioRole === 'structure')

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

// Content comes from the prefetch; with one fixed reply the page is the same
// for every seed, and freshness is the prefetch's job (see prefetch.test.ts).
runGeneratorContractTests(everOrNeverTemplate, {
  expectSeedVariance: false,
  configOverrides: { showTitle: true, title: EON_DEFAULT_TITLE, showInstructions: true },
  contextOverrides: { remoteData: EON_FIXTURE },
})

describe('ever-or-never registry', () => {
  it('is registered once, in the word tab, with no answer page', () => {
    expect(STUDIO_TEMPLATES.filter((t) => t.key === 'ever-or-never')).toHaveLength(1)
    const registered = getStudioTemplate('ever-or-never')!
    expect(registered.category).toBe('word')
    expect(registered.producesAnswerKey).toBe(false)
    expect(registered.pageCount).toBe(1)
    expect(registered.defaultPageTitle).toBe(EON_DEFAULT_TITLE)
    expect(registered.prefetch).toBeTypeOf('function')
  })

  it('asks only for theme, tone and a story line', () => {
    expect(everOrNeverTemplate.configSchema.map((field) => field.key)).toEqual([
      'theme',
      'customTheme',
      'tone',
      'storyLine',
    ])
    const custom = everOrNeverTemplate.configSchema.find((f) => f.key === 'customTheme')!
    expect(custom.visibleWhen?.({ theme: 'mixed' })).toBe(false)
    expect(custom.visibleWhen?.({ theme: 'custom' })).toBe(true)
  })

  it('refuses an empty custom theme', () => {
    expect(validateEonConfig({ theme: 'custom', customTheme: '' })?.field).toBe('customTheme')
    expect(validateEonConfig({ theme: 'custom', customTheme: 'Lake days' })).toBeNull()
    expect(validateEonConfig({ theme: 'mixed' })).toBeNull()
  })

  it('reports what the trim prints in the theme help', () => {
    const help = everOrNeverTemplate.configSchema[0]!.helpWhen!(base, kdpCtx(6, 9))
    expect(help).toMatch(/\d+ statements a page/)
    expect(help).toMatch(/\d+ pt/)
  })
})

describe('ever-or-never page', () => {
  it('prints a number, the statement, Ever and Never on every row, and a tally', () => {
    const [page] = generate(base, kdpCtx(6, 9))
    const all = texts(page!.objects)
    const rows = statements(page!.objects)
    expect(rows.length).toBeGreaterThan(0)
    expect(all.filter((t) => t === EON_EVER)).toHaveLength(rows.length)
    expect(all.filter((t) => t === EON_NEVER)).toHaveLength(rows.length)
    expect(checkboxes(page!.objects)).toHaveLength(rows.length * 2)
    rows.forEach((_, i) => expect(all).toContain(`${i + 1}.`))
    expect(all).toContain(TALLY_LABEL)
    expect(all).toContain(`out of ${rows.length}`)
    for (const row of rows) {
      const printed = String(row.text).replace(/\s+/g, ' ')
      expect(printed).toBe(row.data![STUDIO_CONTENT_LABEL_KEY])
      expect(printed).toMatch(/^Ever .+\?$/)
    }
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

  it('puts the answers beside the statement on wide trims and under it on narrow ones', () => {
    expect(planFor(8.5, 11)!.arrangement).toBe('inline')
    expect(planFor(5, 8)!.arrangement).toBe('stacked')
  })

  it.each(TRIMS)('fits %s x %s in the safe area with nothing overlapping', (w, h) => {
    for (const storyLine of [false, true]) {
      for (const showTitle of [false, true]) {
        const config = { ...base, storyLine, showTitle, title: showTitle ? EON_DEFAULT_TITLE : '' }
        const ctx = kdpCtx(w, h)
        const [page] = generate(config, ctx)
        const rows = statements(page!.objects)
        expect(rows.length).toBeGreaterThan(0)
        assertObjectsInSafeMargin(page!.objects, ctx)

        // No two text boxes or checkboxes collide — statements, numbers,
        // answer labels, boxes, story labels and the tally alike.
        const solid = page!.objects.filter(
          (o) => o.type === 'textbox' || (o.type === 'rect' && o.studioRole === 'structure'),
        )
        const boxes = solid.map(extent)
        for (let i = 0; i < boxes.length; i++) {
          for (let j = i + 1; j < boxes.length; j++) {
            expect(overlaps(boxes[i]!, boxes[j]!), `${solid[i]!.text ?? 'box'} / ${solid[j]!.text ?? 'box'}`).toBe(false)
          }
        }
      }
    }
  })

  it('draws every Ever box in one column and every Never box in another', () => {
    for (const [w, h] of TRIMS) {
      const [page] = generate(base, kdpCtx(w, h))
      const lefts = checkboxes(page!.objects).map((o) => o.left)
      expect(new Set(lefts.filter((_, i) => i % 2 === 0)).size).toBe(1)
      expect(new Set(lefts.filter((_, i) => i % 2 === 1)).size).toBe(1)
    }
  })

  it('never sets type below the large-print floor, nor a statement past three lines', () => {
    for (const [w, h] of TRIMS) {
      for (const storyLine of [false, true]) {
        const plan = planFor(w, h, { ...base, storyLine })
        expect(plan).not.toBeNull()
        expect(plan!.metrics.font).toBeGreaterThanOrEqual(STATEMENT_FONT_MIN)
        expect(plan!.count).toBeLessThanOrEqual(MAX_STATEMENTS_PER_PAGE)
        expect(plan!.statementLines).toBeLessThanOrEqual(MAX_STATEMENT_LINES)
      }
    }
  })

  it('holds a full page of statements on the common trims', () => {
    expect(planFor(6, 9)!.count).toBeGreaterThanOrEqual(6)
    expect(planFor(8.5, 11)!.count).toBeGreaterThanOrEqual(8)
  })

  it('fits fewer statements when the story line is on, and draws it only then', () => {
    expect(planFor(8.5, 11, { ...base, storyLine: true })!.count).toBeLessThan(planFor(8.5, 11)!.count)
    expect(texts(generate(base, kdpCtx(6, 9))[0]!.objects)).not.toContain(STORY_LABEL)
    expect(texts(generate({ ...base, storyLine: true }, kdpCtx(6, 9))[0]!.objects)).toContain(STORY_LABEL)
  })

  it('the form note matches the printed page', () => {
    for (const [w, h] of TRIMS) {
      const ctx = kdpCtx(w, h)
      const note = eonPrintNote({ page: ctx, config: base, instruction: instructionFor(base), font: FONT, storyLine: false })
      const plan = planFor(w, h)!
      expect(note).toContain(`${plan.count} statements a page`)
      expect(note).toContain(`${pxToPt(plan.metrics.font)} pt`)
      expect(statements(generate(base, ctx)[0]!.objects)).toHaveLength(plan.count)
    }
  })

  it('shows an error page when the reply is empty or malformed', () => {
    for (const remote of [undefined, null, {}, { items: 'nope' }, { items: [{ statement: 'Ever relaxed?' }] }]) {
      const [page] = generate(base, { ...kdpCtx(6, 9), remoteData: remote })
      expect(texts(page!.objects)).toContain(EON_AI_EMPTY_MESSAGE)
      expect(statements(page!.objects)).toHaveLength(0)
    }
  })

  it('passes the preflight on every trim', () => {
    for (const [w, h] of TRIMS) {
      for (const storyLine of [false, true]) {
        const config = { ...base, storyLine }
        const ctx = kdpCtx(w, h)
        const plan = planFor(w, h, config)!
        const fitted = fitEonStatements(selectEonStatements(EON_FIXTURE.items, { cap: 20 }), plan, FONT)!
        const field = eonBodyField(ctx, config, instructionFor(config))
        const result = runEonKdpPreflight({ items: fitted.items, plan: fitted.plan, fieldHeight: field.height })
        expect(result.errors).toEqual([])
      }
    }
  })
})

describe('ever-or-never content gates', () => {
  it.each([
    ['Ever taken a nap before lunch?', 'Ever taken a nap before lunch?'],
    ['ever taken a nap before lunch', 'Ever taken a nap before lunch?'],
    ['1. Ever taken a nap before lunch?', 'Ever taken a nap before lunch?'],
    ['Have you ever taken a nap before lunch?', 'Ever taken a nap before lunch?'],
    ['Ever or Never: taken a nap before lunch?', 'Ever taken a nap before lunch?'],
    ['Taken a nap before lunch?', 'Ever taken a nap before lunch?'],
  ])('normalises %j', (raw, expected) => {
    expect(normalizeStatement(raw)).toBe(expected)
  })

  it.each([
    '',
    'Ever relaxed?',
    'Ever the best day of the week?',
    'Ever taking a nap before lunch?',
    'Ever napped on the couch or the porch?',
    'Ever not woken up early on a Monday?',
    'Ever woken up early? Then gone back to bed',
    'EVER TAKEN A NAP BEFORE LUNCH?',
    'Ever visited the doctor twice in a week?',
    'Ever forgotten what day of the week it is?',
    'Ever binge-watched Netflix until 3 in the morning?',
    'Ever garden in the rain on a Monday?',
    'Ever taken a long lazy nap in a hammock under the apple tree after a big lunch?',
  ])('rejects %j', (raw) => {
    expect(normalizeStatement(raw)).toBeNull()
  })

  it('recognises past participles', () => {
    for (const word of ['taken', 'napped', 'sung', 'grown', 'been', 'tried']) expect(isParticiple(word)).toBe(true)
    for (const word of ['garden', 'taking', 'the', 'nap']) expect(isParticiple(word)).toBe(false)
  })

  it('treats near-identical statements as repeats', () => {
    expect(statementsRepeat('Ever taken a nap before lunch?', 'Ever taken naps after lunch?')).toBe(true)
    expect(statementsRepeat('Ever taken a nap before lunch?', 'Ever grown a tomato bigger than your fist?')).toBe(false)
  })

  it('drops statements the book already prints, by full or compact label', () => {
    const [first, second] = EON_FIXTURE_ITEMS
    const full = selectEonStatements(EON_FIXTURE.items, { cap: 20, avoid: [first!.statement] })
    expect(full.map((s) => s.statement)).not.toContain(first!.statement)
    const compact = compactStatementLabel(second!.statement)
    expect(compact.length).toBeLessThanOrEqual(60)
    const viaCompact = selectEonStatements(EON_FIXTURE.items, { cap: 20, avoid: [compact] })
    expect(viaCompact.map((s) => s.statement)).not.toContain(second!.statement)
    expect(viaCompact).toHaveLength(EON_FIXTURE_ITEMS.length - 1)
  })

  it('keeps every fixture statement', () => {
    expect(selectEonStatements(EON_FIXTURE.items, { cap: 20 })).toHaveLength(EON_FIXTURE_ITEMS.length)
  })

  it('spreads opening verbs and topics across a page', () => {
    const pool = [
      { statement: 'Ever taken a nap at noon?', topic: 'naps' },
      { statement: 'Ever taken a train on a whim?', topic: 'travel' },
      { statement: 'Ever baked bread for a friend?', topic: 'cooking' },
    ]
    expect(orderForVariety(pool).map((s) => s.statement)).toEqual([
      'Ever taken a nap at noon?',
      'Ever baked bread for a friend?',
      'Ever taken a train on a whim?',
    ])
  })
})
