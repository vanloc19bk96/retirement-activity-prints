import { describe, it, expect } from 'vitest'
import type {
  StudioConfig,
  StudioFabricObject,
  StudioGenerateContext,
  StudioPageOutput,
} from '@/types/studio-template.types'
import { DPI } from '@/types/canvas-settings.types'
import { STUDIO_TEMPLATES, buildDefaultConfig, getStudioTemplate } from '@/constants/studio-templates'
import { resetObjectCounter } from '../studio-fabric-builders'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import { isStudioHeaderTitle } from '../studio-layout'
import { assertObjectsInSafeMargin, runGeneratorContractTests } from '../studio-generator-test'
import { whoKnowsBestTemplate } from './generate'
import {
  WKB_AI_EMPTY_MESSAGE,
  WKB_DEFAULT_TITLE,
  WKB_PAGE_TOO_SMALL_MESSAGE,
  WKB_QUESTIONS,
  WKB_SHORT_MESSAGE,
  cleanWkbPool,
  numberWkbSet,
  orderWkbSet,
  pickWkbSet,
} from './content'
import { WKB_BOX_KEY, WKB_QUESTION_KEY, WKB_SHEET_KEY } from './draw'
import {
  ANSWER_PITCH_MIN,
  QUESTION_FONT_MIN,
  SCOREBOARD_TITLE,
  fitWkbQuestions,
  paginateWkbSheet,
  pxToPt,
  usableHeight,
  wkbLayout,
  wkbPrintNote,
} from './layout'
import { runWkbKdpPreflight } from './kdp-preflight'
import { WKB_FIXTURE, WKB_FIXTURE_ITEMS } from './fixture'

const FONT = 'PT Serif'

/** The draft a seller has in front of them — common header fields included. */
const base: StudioConfig = {
  ...buildDefaultConfig(whoKnowsBestTemplate),
  showTitle: true,
  title: WKB_DEFAULT_TITLE,
  showInstructions: true,
  seed: 42,
  fontFamily: FONT,
}

/** A real KDP interior: DPI 96, inside margin 0.375", the rest 0.25". */
const kdpCtx = (wIn: number, hIn: number, remoteData: unknown = WKB_FIXTURE): StudioGenerateContext => ({
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
  return whoKnowsBestTemplate.generate(config, ctx)
}

const numbersOn = (objects: StudioFabricObject[]) =>
  objects.filter((o) => typeof o.data?.[WKB_QUESTION_KEY] === 'number')
const questionsOn = (objects: StudioFabricObject[]) =>
  objects.filter((o) => typeof o.data?.[STUDIO_CONTENT_LABEL_KEY] === 'string')
const textOf = (o: StudioFabricObject) => String(o.text ?? '').replace(/ /g, ' ')
const texts = (pages: StudioPageOutput[]) => pages.flatMap((p) => p.objects.map(textOf))
const titleOf = (page: StudioPageOutput) => textOf(page.objects.find(isStudioHeaderTitle) ?? ({} as StudioFabricObject))

/** Every sheet in page order: which sheet each page belongs to, by the blocks it carries. */
function sheetsOf(pages: StudioPageOutput[]) {
  const sheets = new Map<string, { pages: number[]; numbers: number[]; boxes: number }>()
  let current = ''
  pages.forEach((page, index) => {
    const numbers = numbersOn(page.objects)
    if (numbers.length > 0) current = String(numbers[0]!.data![WKB_SHEET_KEY])
    const sheet = sheets.get(current) ?? { pages: [], numbers: [], boxes: 0 }
    sheet.pages.push(index)
    sheet.numbers.push(...numbers.map((o) => o.data![WKB_QUESTION_KEY] as number))
    sheet.boxes += page.objects.filter((o) => typeof o.data?.[WKB_BOX_KEY] === 'number').length
    sheets.set(current, sheet)
  })
  return sheets
}

// Content comes from the prefetch; the seed changes the reading order.
runGeneratorContractTests(whoKnowsBestTemplate, {
  configOverrides: { showTitle: true, title: WKB_DEFAULT_TITLE, showInstructions: true },
  contextOverrides: { remoteData: WKB_FIXTURE },
})

describe('who-knows-retiree-best registry', () => {
  it('is registered once, in the word tab, with no answer key', () => {
    expect(STUDIO_TEMPLATES.filter((t) => t.key === 'who-knows-retiree-best')).toHaveLength(1)
    const registered = getStudioTemplate('who-knows-retiree-best')!
    expect(registered.category).toBe('word')
    expect(registered.producesAnswerKey).toBe(false)
    expect(registered.defaultPageTitle).toBe(WKB_DEFAULT_TITLE)
    expect(registered.prefetch).toBeTypeOf('function')
  })

  it('asks only the name, who is playing and how many', () => {
    expect(whoKnowsBestTemplate.configSchema.map((f) => f.key)).toEqual(['retireeName', 'audience', 'players'])
    const config = buildDefaultConfig(whoKnowsBestTemplate)
    expect(config.retireeName).toBe('')
    expect(config.audience).toBe('mixed')
    expect(config.players).toBe(2)
  })

  it('refuses a name that is not a name, under the name field', () => {
    expect(whoKnowsBestTemplate.validateConfig!({ ...base, retireeName: '<Linda>' })?.field).toBe('retireeName')
    expect(whoKnowsBestTemplate.validateConfig!({ ...base, retireeName: 'Linda' })).toBeNull()
  })
})

describe.each([1, 2, 4])('%s player(s)', (players) => {
  it.each(TRIMS)('prints every sheet whole, numbered 1 to 12, on a %s x %s trim', (w, h) => {
    const ctx = kdpCtx(w, h)
    const pages = generate({ ...base, players }, ctx)
    const sheets = sheetsOf(pages)
    expect([...sheets.keys()]).toEqual([...Array.from({ length: players }, (_, i) => `player-${i + 1}`), 'answers'])

    const expected = Array.from({ length: WKB_QUESTIONS }, (_, i) => i + 1)
    for (const [id, sheet] of sheets) {
      expect(sheet.numbers, id).toEqual(expected)
      // A tick box beside every question on a player's sheet, none on the retiree's.
      expect(sheet.boxes, id).toBe(id === 'answers' ? 0 : WKB_QUESTIONS)
    }

    // Every player answers the same questions, in the same order, on the same pages.
    const questionsBySheet = [...sheets.values()].map((sheet) =>
      sheet.pages.flatMap((p) => questionsOn(pages[p]!.objects).map((o) => o.data![STUDIO_CONTENT_LABEL_KEY])),
    )
    for (const list of questionsBySheet) expect(list).toEqual(questionsBySheet[0])
    const playerPageCounts = [...sheets.entries()].filter(([id]) => id !== 'answers').map(([, s]) => s.pages.length)
    expect(new Set(playerPageCounts).size).toBe(1)

    for (const page of pages) assertObjectsInSafeMargin(page.objects, ctx)
    const boards = texts(pages).filter((t) => t === SCOREBOARD_TITLE).length
    expect(boards).toBe(players > 1 ? 1 : 0)
  })
})

describe.each(TRIMS)('on a %s x %s trim', (w, h) => {
  const ctx = kdpCtx(w, h)

  it('keeps every question in large print, beside its own box and lines', () => {
    const pages = generate(base, ctx)
    for (const page of pages) {
      for (const q of questionsOn(page.objects)) expect(q.fontSize).toBeGreaterThanOrEqual(QUESTION_FONT_MIN)
      // A question never parts from its box: both land on the same page.
      const numbers = numbersOn(page.objects).filter((o) => o.data![WKB_SHEET_KEY] !== 'answers')
      const boxes = page.objects.filter((o) => typeof o.data?.[WKB_BOX_KEY] === 'number')
      expect(boxes.map((o) => o.data![WKB_BOX_KEY])).toEqual(numbers.map((o) => o.data![WKB_QUESTION_KEY]))
    }
  })

  it('never crowds a sheet: at most a handful of questions per page, and no page without one', () => {
    const pages = generate(base, ctx)
    for (const page of pages) {
      const count = numbersOn(page.objects).length
      const isBoard = page.objects.some((o) => textOf(o) === SCOREBOARD_TITLE)
      if (!isBoard) expect(count).toBeGreaterThan(0)
      expect(count).toBeLessThanOrEqual(WKB_QUESTIONS)
    }
  })

  it('reports in the form what it prints', () => {
    const note = wkbPrintNote({ page: ctx, config: base, font: FONT, name: '', players: 2 })
    const layout = wkbLayout({ page: ctx, config: base, font: FONT, name: '', players: 2 })!
    expect(note).toContain(`${pxToPt(layout.plan.metrics.font)} pt large print`)
    expect(note).toMatch(/Each of 2 players gets a \d+-page answer sheet/)
  })
})

describe('the type size', () => {
  it('is the largest the trim allows, never below 14 pt', () => {
    const sizes = TRIMS.map(([w, h]) => wkbLayout({ page: kdpCtx(w, h), config: base, font: FONT, name: '', players: 2 })!.plan.metrics.font)
    for (const size of sizes) expect(size).toBeGreaterThanOrEqual(QUESTION_FONT_MIN)
    // Wider trims never print smaller.
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]!).toBeGreaterThanOrEqual(sizes[i - 1]!)
    expect(pxToPt(sizes.at(-1)!)).toBe(18)
  })

  it('keeps answer lines far enough apart for an older hand', () => {
    const layout = wkbLayout({ page: kdpCtx(6, 9), config: base, font: FONT, name: '', players: 2 })!
    expect(layout.plan.metrics.pitch).toBeGreaterThanOrEqual(ANSWER_PITCH_MIN)
  })
})

describe('personal touches', () => {
  it('names the retiree in the headings and how-to, never inventing anything else', () => {
    const pages = generate({ ...base, retireeName: 'Linda', players: 2 }, kdpCtx(6, 9))
    const titles = pages.map(titleOf)
    expect(titles[0]).toBe('Who Knows Linda Best?')
    expect(titles.at(-1)).toBe('Linda’s Real Answers')
    const all = texts(pages).join('\n')
    expect(all).toContain('you think Linda would give')
    expect(all).toContain('For Linda to fill in')
    expect(all).toContain('Who knows Linda best?')
    // The questions stay about "them": the name never goes into a question.
    for (const page of pages) for (const q of questionsOn(page.objects)) expect(textOf(q)).not.toContain('Linda')
  })

  it('keeps a heading the seller typed, and prints none when titles are off', () => {
    const custom = generate({ ...base, retireeName: 'Linda', title: 'Farewell Fun' }, kdpCtx(6, 9))
    expect(titleOf(custom[0]!)).toBe('Farewell Fun')
    expect(titleOf(custom.at(-1)!)).toBe('Linda’s Real Answers')
    const untitled = generate({ ...base, showTitle: false, title: '' }, kdpCtx(6, 9))
    expect(untitled.every((page) => !page.objects.some(isStudioHeaderTitle))).toBe(true)
  })

  it('drops the how-to lines when instructions are off', () => {
    const on = texts(generate(base, kdpCtx(6, 9))).join('\n')
    const off = texts(generate({ ...base, showInstructions: false }, kdpCtx(6, 9))).join('\n')
    expect(on).toContain('close enough counts')
    expect(off).not.toContain('close enough counts')
  })
})

describe('content that cannot print', () => {
  const messageOf = (pages: StudioPageOutput[]) => texts(pages).join('\n')

  it('says so when nothing came back', () => {
    const pages = generate(base, kdpCtx(6, 9, null))
    expect(pages).toHaveLength(1)
    expect(messageOf(pages)).toContain(WKB_AI_EMPTY_MESSAGE)
  })

  it('says so when the questions cannot make a balanced set', () => {
    const pages = generate(base, kdpCtx(6, 9, { questions: WKB_FIXTURE_ITEMS.slice(0, 8) }))
    expect(messageOf(pages)).toContain(WKB_SHORT_MESSAGE)
  })

  it('refuses a page too small to write on', () => {
    const tiny: StudioGenerateContext = { ...kdpCtx(6, 9), pageWidth: 200, pageHeight: 300 }
    expect(messageOf(generate(base, tiny))).toContain(WKB_PAGE_TOO_SMALL_MESSAGE)
  })

  it('re-validates whatever reached the page: a sensitive question is never printed', () => {
    const tampered = {
      questions: WKB_FIXTURE_ITEMS.map((q, i) => (i === 1 ? { ...q, question: 'How much is their pension worth?' } : q)),
    }
    const all = texts(generate(base, kdpCtx(6, 9, tampered))).join('\n')
    expect(all).not.toContain('pension')
  })
})

describe('runWkbKdpPreflight', () => {
  const ctx = kdpCtx(6, 9)
  const layout = wkbLayout({ page: ctx, config: base, font: FONT, name: '', players: 2 })!
  const { plan } = layout
  const questions = fitWkbQuestions(numberWkbSet(orderWkbSet(pickWkbSet(cleanWkbPool(WKB_FIXTURE.questions)).picks!, 1)), plan, FONT)
  const sheet = (kind: 'player' | 'answers') => {
    const spec = kind === 'player' ? layout.player : layout.answers
    const usable = usableHeight(plan, spec.fields)
    return { kind, usable, pages: paginateWkbSheet(questions, plan, usable, { kind, players: 2 })! }
  }
  const sheets = () => [sheet('player'), sheet('player'), sheet('answers')]

  it('passes the sheets as paginated', () => {
    expect(runWkbKdpPreflight({ questions, sheets: sheets(), plan, players: 2 }).errors).toEqual([])
  })

  it('catches a sheet that lost a question or its score line', () => {
    const broken = sheets()
    broken[0] = {
      ...broken[0]!,
      pages: broken[0]!.pages.map((page) => ({ blocks: page.blocks.filter((b) => b.kind !== 'score') })),
    }
    broken[1] = {
      ...broken[1]!,
      pages: broken[1]!.pages.map((page, i) => ({ blocks: i === 0 ? page.blocks.slice(0, -1) : page.blocks })),
    }
    const { errors } = runWkbKdpPreflight({ questions, sheets: broken, plan, players: 2 })
    expect(errors.join('\n')).toMatch(/score line/)
    expect(errors.join('\n')).toMatch(/questions 1 to 12/)
  })

  it('catches a missing scoreboard and a page run past its printable area', () => {
    const broken = sheets()
    const answers = broken[2]!
    broken[2] = { ...answers, pages: answers.pages.map((page) => ({ blocks: page.blocks.filter((b) => b.kind !== 'scoreboard') })) }
    broken[0] = { ...broken[0]!, usable: () => 100 }
    const { errors } = runWkbKdpPreflight({ questions, sheets: broken, plan, players: 2 })
    expect(errors.join('\n')).toMatch(/scoreboard/)
    expect(errors.join('\n')).toMatch(/printable area/)
  })
})
