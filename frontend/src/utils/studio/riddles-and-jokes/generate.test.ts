import { describe, it, expect } from 'vitest'
import type {
  StudioConfig,
  StudioFabricObject,
  StudioGenerateContext,
} from '@/types/studio-template.types'
import { DPI } from '@/types/canvas-settings.types'
import { STUDIO_TEMPLATES, buildDefaultConfig, getStudioTemplate } from '@/constants/studio-templates'
import { STUDIO_ANSWER_INK_MONO, STUDIO_ANSWER_INK_MONO_TEMPLATES } from '@/constants/studio.constants'
import { resetObjectCounter } from '../studio-fabric-builders'
import { buildAnswerPage, harvestAnswers } from '../studio-answer-key'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import {
  assertObjectsInSafeMargin,
  runGeneratorContractTests,
  STUDIO_TEST_CTX,
} from '../studio-generator-test'
import { riddlesJokesTemplate, validateRjConfig } from './generate'
import { instructionFor } from './config'
import {
  MAX_SAME_OPENER_PER_PAGE,
  RJ_AI_EMPTY_MESSAGE,
  RJ_DEFAULT_TITLE,
  answersRepeat,
  normalizeRjItem,
  openerKey,
  orderRjItems,
  rjInstruction,
  selectRjItems,
  setupsRepeat,
} from './content'
import { fitRjItems } from './fit'
import { runRjKdpPreflight } from './kdp-preflight'
import {
  MAX_ITEMS_PER_PAGE,
  TEXT_FONT_MIN,
  breakSetup,
  pxToPt,
  rjPrintNote,
  rjWorstCasePlan,
} from './layout'
import { RJ_FIXTURE, RJ_FIXTURE_ITEMS } from './fixture'

const FONT = 'PT Serif'

/** The draft a seller has in front of them — common header fields included. */
const base: StudioConfig = {
  ...buildDefaultConfig(riddlesJokesTemplate),
  showTitle: true,
  title: RJ_DEFAULT_TITLE,
  showInstructions: true,
  seed: 42,
  fontFamily: FONT,
}

/** A real KDP interior: DPI 96, inside margin 0.375", the rest 0.25". */
const kdpCtx = (wIn: number, hIn: number, remoteData: unknown = RJ_FIXTURE, seed = 42): StudioGenerateContext => ({
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
  remoteData,
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
  return riddlesJokesTemplate.generate(config, ctx)
}

const clean = (text: unknown) => String(text ?? '').replace(/ /g, ' ')
const oneLine = (text: string) => text.replace(/\n/g, ' ')
const texts = (objects: StudioFabricObject[]) => objects.map((o) => oneLine(clean(o.text))).filter(Boolean)
const numbers = (objects: StudioFabricObject[]) => texts(objects).filter((t) => /^\d\.$/.test(t))

const setups = new Map(RJ_FIXTURE_ITEMS.map((item) => [item.setup, item]))
const answers = new Set(RJ_FIXTURE_ITEMS.map((item) => item.answer))
const fixtureItems = () => selectRjItems(RJ_FIXTURE_ITEMS, { cap: 20 })

/** The text object sitting on the same row as a number, right of it. */
function rowText(objects: StudioFabricObject[], numberObj: StudioFabricObject): string {
  const row = objects.filter(
    (o) => o !== numberObj && o.type === 'textbox' && o.top === numberObj.top && o.left > numberObj.left,
  )
  expect(row).toHaveLength(1)
  return oneLine(clean(row[0]!.text))
}

// The key is built from `answerSourceObjects` (asserted below); the puzzle page
// deliberately carries no answer text at all, hidden or not, so a punchline
// cannot surface through an ungroup or a visibility toggle.
runGeneratorContractTests(riddlesJokesTemplate, {
  expectAnswers: false,
  configOverrides: { showTitle: true, title: RJ_DEFAULT_TITLE, showInstructions: true },
  contextOverrides: { remoteData: RJ_FIXTURE },
})

describe('riddles-and-jokes registry', () => {
  it('is registered once, in the word tab, with an answer page', () => {
    expect(STUDIO_TEMPLATES.filter((t) => t.key === 'riddles-and-jokes')).toHaveLength(1)
    const registered = getStudioTemplate('riddles-and-jokes')!
    expect(registered.category).toBe('word')
    expect(registered.producesAnswerKey).toBe(true)
    expect(registered.defaultPageTitle).toBe(RJ_DEFAULT_TITLE)
    expect(registered.prefetch).toBeTypeOf('function')
  })

  it('prints its answer key in black ink', () => {
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has('riddles-and-jokes')).toBe(true)
  })

  it('asks only for a theme and the mix (plus a typed theme when chosen)', () => {
    expect(riddlesJokesTemplate.configSchema.map((field) => field.key)).toEqual(['theme', 'customTheme', 'mix'])
    const custom = riddlesJokesTemplate.configSchema.find((f) => f.key === 'customTheme')!
    expect(custom.visibleWhen?.({ theme: 'mixed' })).toBe(false)
    expect(custom.visibleWhen?.({ theme: 'custom' })).toBe(true)
    expect(buildDefaultConfig(riddlesJokesTemplate)).toMatchObject({ theme: 'mixed', mix: 'both' })
  })

  it('refuses an empty custom theme', () => {
    expect(validateRjConfig({ theme: 'custom', customTheme: '' })?.field).toBe('customTheme')
    expect(validateRjConfig({ theme: 'custom', customTheme: 'Allotments' })).toBeNull()
    expect(validateRjConfig({ theme: 'mixed' })).toBeNull()
  })

  it('tells the reader what to do for the mix they get', () => {
    expect(instructionFor({ mix: 'riddles' })).toBe(rjInstruction('riddles'))
    expect(instructionFor({ mix: 'jokes' })).toMatch(/punchline/)
    expect(instructionFor({ mix: 'both', showInstructions: false })).toBe('')
  })
})

describe('riddles-and-jokes content gates', () => {
  it('accepts every fixture item', () => {
    expect(fixtureItems().map((item) => item.setup)).toEqual(RJ_FIXTURE_ITEMS.map((item) => item.setup))
  })

  it('never prints an item the service did not check', () => {
    const unchecked = RJ_FIXTURE_ITEMS.map((item) => ({ ...item, verified: false }))
    expect(selectRjItems(unchecked, { cap: 5 })).toEqual([])
    const { verified: _dropped, ...noMark } = RJ_FIXTURE_ITEMS[0]!
    expect(normalizeRjItem(noMark)).toBeNull()
  })

  it('drops an item of the wrong shape', () => {
    const good = RJ_FIXTURE_ITEMS[2]!
    const broken = [
      { kind: 'limerick' },
      { setup: '' },
      { answer: '' },
      { setup: 'I have a trunk but never pack for a holiday.' },
      { setup: 'Is it a tree? Or is it a suitcase?' },
      { setup: 'I HAVE A TRUNK BUT NEVER PACK FOR A HOLIDAY. WHAT AM I?' },
      { setup: 'Knock knock. Who is there on a free Tuesday?' },
      { answer: 'Is it an oak tree?' },
      { answer: 'An enormous, very old oak tree standing in a field by the lane.' },
      { setup: 'I have a trunk and branches but I never pack for a trip. '.repeat(2) + 'What am I?' },
    ]
    for (const change of broken) expect(normalizeRjItem({ ...good, ...change }), JSON.stringify(change)).toBeNull()
  })

  it('refuses humour about age, memory, health, money or spouses, and brands', () => {
    const joke = RJ_FIXTURE_ITEMS[1]!
    for (const setup of [
      'Why did the retiree skip the doctor on a sunny Tuesday?',
      'What did the retiree forget at the retirement party?',
      'Why was the old man so slow at the golf course?',
      'What did the wife say when the husband retired?',
      'What do you call a retiree with no pension left?',
      'Why is the frail gardener still in the greenhouse?',
      'What is a retiree’s favourite Netflix show?',
    ]) {
      expect(normalizeRjItem({ ...joke, setup }), setup).toBeNull()
    }
  })

  it('never prints a riddle whose setup gives the answer away', () => {
    const riddle = { kind: 'riddle', setup: 'I am the alarm clock you no longer set. What am I?', answer: 'The alarm clock.', verified: true }
    expect(normalizeRjItem(riddle)).toBeNull()
  })

  it('keeps only the kinds the mix asks for', () => {
    expect(selectRjItems(RJ_FIXTURE_ITEMS, { cap: 20, mix: 'riddles' }).every((i) => i.kind === 'riddle')).toBe(true)
    expect(selectRjItems(RJ_FIXTURE_ITEMS, { cap: 20, mix: 'jokes' }).every((i) => i.kind === 'joke')).toBe(true)
    expect(selectRjItems(RJ_FIXTURE_ITEMS, { cap: 20, mix: 'jokes' })).toHaveLength(6)
  })

  it('treats the same joke with the nouns shuffled as a repeat', () => {
    expect(
      setupsRepeat(
        'Why did the retiree throw away the alarm clock?',
        'Why did the retired man get rid of his alarm clock?',
      ),
    ).toBe(true)
    expect(setupsRepeat('What do you call a retired gardener?', "What's a gardener's favourite day of the week?")).toBe(false)
    expect(answersRepeat('The alarm clock.', 'Your old alarm clock!')).toBe(true)
    expect(answersRepeat('Day.', 'Every square is a day off.')).toBe(false)
  })

  it('drops items that repeat the book or each other', () => {
    const book = [RJ_FIXTURE_ITEMS[0]!.setup, RJ_FIXTURE_ITEMS[3]!.answer]
    const kept = selectRjItems(RJ_FIXTURE_ITEMS, { cap: 20, avoid: book })
    expect(kept).toHaveLength(RJ_FIXTURE_ITEMS.length - 2)
    const twin = { ...RJ_FIXTURE_ITEMS[5]!, setup: 'Why was the hammock so popular on a Wednesday afternoon?' }
    expect(selectRjItems([...RJ_FIXTURE_ITEMS, twin], { cap: 20 })).toHaveLength(RJ_FIXTURE_ITEMS.length)
  })

  it('treats malformed replies as empty rather than throwing', () => {
    for (const raw of [undefined, null, 'nope', 42, [null, 'x', { kind: 'joke' }]]) {
      expect(selectRjItems(raw, { cap: 5 })).toEqual([])
    }
  })

  it('alternates riddles and jokes, seeded', () => {
    const ordered = orderRjItems(fixtureItems(), 42)
    for (let i = 1; i < ordered.length; i++) expect(ordered[i]!.kind).not.toBe(ordered[i - 1]!.kind)
    expect(orderRjItems(fixtureItems(), 42)).toEqual(ordered)
    const starts = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => orderRjItems(fixtureItems(), seed)[0]!.kind))
    expect(starts.size).toBe(2)
  })
})

describe('riddles-and-jokes page', () => {
  it('prints what the form promises on every KDP trim, in large print, inside the safe area', () => {
    for (const [w, h] of TRIMS) {
      for (const showTitle of [true, false]) {
        const config = { ...base, showTitle, title: showTitle ? RJ_DEFAULT_TITLE : '' }
        const ctx = kdpCtx(w, h)
        const plan = rjWorstCasePlan({ page: ctx, config, instruction: instructionFor(config), font: FONT })!
        expect(plan, `${w}x${h}`).not.toBeNull()
        expect(plan.count).toBeLessThanOrEqual(MAX_ITEMS_PER_PAGE)
        expect(plan.metrics.font).toBeGreaterThanOrEqual(TEXT_FONT_MIN)

        const [page] = generate(config, ctx)
        expect(numbers(page!.objects), `${w}x${h}`).toHaveLength(plan.count)
        const note = rjPrintNote({ page: ctx, config, instruction: instructionFor(config), font: FONT, mix: 'both' })
        expect(note).toContain(`${plan.count} riddles and jokes a page`)
        expect(note).toContain(`${pxToPt(plan.metrics.font)} pt`)

        assertObjectsInSafeMargin(page!.objects, ctx)
        assertObjectsInSafeMargin(page!.answerSourceObjects!, ctx)
      }
    }
  })

  it('aims for about eight, never below six on a common trim, at a comfortable size', () => {
    for (const [w, h] of [[6, 9], [7, 10], [8.5, 11]] as const) {
      const plan = rjWorstCasePlan({ page: kdpCtx(w, h), config: base, instruction: instructionFor(base), font: FONT })!
      expect(plan.count, `${w}x${h}`).toBeGreaterThanOrEqual(6)
      expect(pxToPt(plan.metrics.font), `${w}x${h}`).toBeGreaterThanOrEqual(16)
    }
    const letter = rjWorstCasePlan({ page: kdpCtx(8.5, 11), config: base, instruction: instructionFor(base), font: FONT })!
    expect(letter.count).toBe(MAX_ITEMS_PER_PAGE)
  })

  it('shows only numbered questions on the puzzle page — no answer anywhere, hidden or not', () => {
    const [page] = generate(base, kdpCtx(8.5, 11))
    const shown = texts(page!.objects)
    const questions = shown.filter((t) => setups.has(t))
    expect(questions).toHaveLength(numbers(page!.objects).length)
    expect(shown.some((t) => answers.has(t))).toBe(false)
    expect(harvestAnswers(page!.objects)).toHaveLength(0)
    // The answer source holds every answer, hidden until the key reveals it,
    // which is what makes the runner add the answer page.
    const hidden = harvestAnswers(page!.answerSourceObjects!)
    expect(hidden).toHaveLength(questions.length)
    expect(hidden.every((o) => o.visible === false && answers.has(oneLine(clean(o.text))))).toBe(true)
  })

  it('prints each answer under its own question’s number on the answer page', () => {
    for (const seed of [42, 7, 1234]) {
      for (const [w, h] of TRIMS) {
        const [page] = generate({ ...base, seed }, kdpCtx(w, h, RJ_FIXTURE, seed))
        const key = buildAnswerPage(page!.answerSourceObjects!, STUDIO_ANSWER_INK_MONO)
        const puzzleNumbers = page!.objects.filter((o) => /^\d\.$/.test(clean(o.text)))
        const keyNumbers = key.filter((o) => /^\d\.$/.test(clean(o.text)))
        expect(keyNumbers.map((o) => clean(o.text))).toEqual(puzzleNumbers.map((o) => clean(o.text)))

        puzzleNumbers.forEach((numberObj, i) => {
          const setup = rowText(page!.objects, numberObj)
          const answer = rowText(key, keyNumbers[i]!)
          expect(setups.get(setup)?.answer, `${w}x${h} #${i + 1}`).toBe(answer)
        })

        // Answers are revealed on the key, in bold — told apart without colour.
        const revealed = key.filter((o) => answers.has(oneLine(clean(o.text))))
        expect(revealed).toHaveLength(puzzleNumbers.length)
        expect(revealed.every((o) => o.visible === true && o.fontWeight === 700)).toBe(true)
        // The how-to line stays on the puzzle page.
        expect(texts(key).some((t) => t === instructionFor(base))).toBe(false)
      }
    }
  })

  it('stamps questions and answers so later pages can avoid them', () => {
    const [page] = generate(base, kdpCtx(6, 9))
    const labelsOf = (objects: StudioFabricObject[]) =>
      objects.map((o) => o.data?.[STUDIO_CONTENT_LABEL_KEY]).filter((l): l is string => typeof l === 'string')
    const puzzle = labelsOf(page!.objects)
    const key = labelsOf(page!.answerSourceObjects!)
    expect(puzzle.every((label) => setups.has(label))).toBe(true)
    expect(key.every((label) => answers.has(label))).toBe(true)
    expect(puzzle).toHaveLength(numbers(page!.objects).length)
    expect(key.map((answer) => [...setups.values()].find((i) => i.answer === answer)!.setup)).toEqual(puzzle)
  })

  it('never lets more than two questions on a page open the same way', () => {
    const whys = ['kettle', 'hammock', 'bicycle', 'jigsaw'].map((noun, i) => ({
      kind: 'joke' as const,
      setup: `Why did the ${noun} ${['whistle all morning', 'win a prize', 'stay in the shed', 'feel proud'][i]}?`,
      answer: ['It finally had time to sing.', 'It was great at hanging around.', 'It was two tired.', 'It had all its pieces together.'][i]!,
      verified: true,
    }))
    const [page] = generate(base, kdpCtx(8.5, 11, { items: [...whys, ...RJ_FIXTURE_ITEMS] }))
    const printed = texts(page!.objects).filter((t) => t.endsWith('?') && !t.startsWith('Read'))
    const whyCount = printed.filter((t) => openerKey(t) === 'why did the').length
    expect(whyCount).toBe(MAX_SAME_OPENER_PER_PAGE)
  })

  it('passes over an item that would overrun the line budget and prints the next one', () => {
    const ctx = kdpCtx(6, 9)
    const plan = rjWorstCasePlan({ page: ctx, config: base, instruction: instructionFor(base), font: FONT })!
    const items = fixtureItems()
    const lines = (setup: string) => breakSetup(setup, plan, FONT).length
    // One kind keeps its given order, so the longest setup reads first.
    const riddles = items
      .filter((item) => item.kind === 'riddle')
      .sort((a, b) => lines(b.setup) - lines(a.setup))
    const budget = Math.min(...riddles.map((item) => lines(item.setup)))
    const first = riddles[0]!
    expect(lines(first.setup)).toBeGreaterThan(budget)
    // A budget of the shortest setup: the longer item that reads first has
    // to be skipped for a later one that fits, at the same type size.
    const fitted = fitRjItems(riddles, { ...plan, pageLines: budget }, FONT, 42)!
    expect(fitted.items).toHaveLength(1)
    expect(fitted.items[0]!.setup).not.toBe(first.setup)
    expect(fitted.items[0]!.setupLines).toHaveLength(budget)
    expect(fitted.plan.count).toBe(1)
    expect(fitted.plan.metrics.font).toBe(plan.metrics.font)

    // At the real budget the page fills to its promised count.
    expect(fitRjItems(items, plan, FONT, 42)!.items).toHaveLength(plan.count)
  })

  it('prints a riddles-only page with no jokes on it', () => {
    const [page] = generate({ ...base, mix: 'riddles' }, kdpCtx(6, 9))
    const questions = texts(page!.objects).filter((t) => setups.has(t))
    expect(questions.length).toBeGreaterThan(0)
    expect(questions.every((t) => setups.get(t)!.kind === 'riddle')).toBe(true)
  })

  it('writes an error page, not a broken page, when content is missing', () => {
    for (const remoteData of [undefined, null, { items: [] }, { items: 'nope' }]) {
      const [page] = generate(base, { ...STUDIO_TEST_CTX, remoteData })
      expect(page!.answerSourceObjects).toBeUndefined()
      expect(texts(page!.objects)).toContain(RJ_AI_EMPTY_MESSAGE)
      expect(harvestAnswers(page!.objects)).toHaveLength(0)
    }
  })
})

describe('riddles-and-jokes preflight', () => {
  const ctx = kdpCtx(8.5, 11)
  const plan = rjWorstCasePlan({ page: ctx, config: base, instruction: instructionFor(base), font: FONT })!
  const fitted = fitRjItems(fixtureItems(), plan, FONT, 42)!

  it('passes a clean page', () => {
    expect(runRjKdpPreflight({ ...fitted, mix: 'both' })).toMatchObject({ ok: true })
  })

  it('refuses an answer set under the wrong question', () => {
    const [first, second, ...rest] = fitted.items
    const swapped = { ...first!, answerLines: second!.answerLines }
    expect(runRjKdpPreflight({ items: [swapped, second!, ...rest], plan: fitted.plan, mix: 'both' }).ok).toBe(false)
  })

  it('refuses the same item twice, a missing answer, and a joke on a riddles-only page', () => {
    const [first] = fitted.items
    const twice = runRjKdpPreflight({ items: [first!, first!], plan: { ...plan, count: 2 }, mix: 'both' })
    expect(twice.ok).toBe(false)
    const blank = { ...first!, answer: '', answerLines: [] }
    expect(runRjKdpPreflight({ items: [blank], plan: { ...plan, count: 1 }, mix: 'both' }).ok).toBe(false)
    const joke = fitted.items.find((item) => item.kind === 'joke')!
    expect(runRjKdpPreflight({ items: [joke], plan: { ...plan, count: 1 }, mix: 'riddles' }).ok).toBe(false)
  })
})
