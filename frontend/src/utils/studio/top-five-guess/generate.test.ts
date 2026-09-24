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
import {
  assertObjectsInSafeMargin,
  runGeneratorContractTests,
  STUDIO_TEST_CTX,
} from '../studio-generator-test'
import { topFiveGuessTemplate, validateTopFiveConfig } from './generate'
import { instructionFor } from './config'
import {
  TOP_FIVE_AI_EMPTY_MESSAGE,
  TOP_FIVE_DEFAULT_TITLE,
  TOP_FIVE_MAX_SCORE,
  TOP_FIVE_POINTS,
  answersOverlap,
  normalizeAnswer,
  normalizeQuestion,
  selectTopFiveSets,
} from './content'
import { fitTopFiveSets } from './fit'
import { runTopFiveKdpPreflight } from './kdp-preflight'
import {
  MAX_QUESTIONS_PER_PAGE,
  QUESTION_FONT_MIN,
  ROW_MIN,
  pxToPt,
  topFivePrintNote,
  topFiveWorstCasePlan,
} from './layout'
import { TOP_FIVE_FIXTURE, TOP_FIVE_FIXTURE_ITEMS } from './fixture'

const FONT = 'PT Serif'

/** The draft a seller has in front of them — common header fields included. */
const base: StudioConfig = {
  ...buildDefaultConfig(topFiveGuessTemplate),
  showTitle: true,
  title: TOP_FIVE_DEFAULT_TITLE,
  showInstructions: true,
  seed: 42,
  fontFamily: FONT,
}

/** A real KDP interior: DPI 96, inside margin 0.375", the rest 0.25". */
const kdpCtx = (wIn: number, hIn: number, remoteData: unknown = TOP_FIVE_FIXTURE): StudioGenerateContext => ({
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
  [8.5, 11],
] as const

function generate(config: StudioConfig, ctx: StudioGenerateContext) {
  resetObjectCounter()
  return topFiveGuessTemplate.generate(config, ctx)
}

const texts = (objects: StudioFabricObject[]) =>
  objects.map((o) => String(o.text ?? '').replace(/ /g, ' ')).filter(Boolean)

// Content comes from the prefetch; with one fixed reply the page is the same
// for every seed, and freshness is the prefetch's job (see prefetch.test.ts).
runGeneratorContractTests(topFiveGuessTemplate, {
  expectSeedVariance: false,
  configOverrides: { showTitle: true, title: TOP_FIVE_DEFAULT_TITLE, showInstructions: true },
  contextOverrides: { remoteData: TOP_FIVE_FIXTURE },
})

describe('top-five-guess registry', () => {
  it('is registered once, in the word tab, with an answer page', () => {
    const matches = STUDIO_TEMPLATES.filter((t) => t.key === 'top-five-guess')
    expect(matches).toHaveLength(1)
    const registered = getStudioTemplate('top-five-guess')!
    expect(registered.category).toBe('word')
    expect(registered.producesAnswerKey).toBe(true)
    expect(registered.defaultPageTitle).toBe(TOP_FIVE_DEFAULT_TITLE)
    expect(registered.prefetch).toBeTypeOf('function')
  })

  it('prints its answer key in black ink', () => {
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has('top-five-guess')).toBe(true)
  })

  it('asks only for a theme (plus a typed theme when chosen)', () => {
    expect(topFiveGuessTemplate.configSchema.map((field) => field.key)).toEqual([
      'theme',
      'customTheme',
    ])
    const custom = topFiveGuessTemplate.configSchema.find((f) => f.key === 'customTheme')!
    expect(custom.visibleWhen?.({ theme: 'mixed' })).toBe(false)
    expect(custom.visibleWhen?.({ theme: 'custom' })).toBe(true)
  })

  it('refuses an empty custom theme', () => {
    expect(validateTopFiveConfig({ theme: 'custom', customTheme: '' })?.field).toBe('customTheme')
    expect(validateTopFiveConfig({ theme: 'custom', customTheme: 'Lake days' })).toBeNull()
    expect(validateTopFiveConfig({ theme: 'mixed' })).toBeNull()
  })
})

describe('top-five-guess scoring', () => {
  it('scores 5-4-3-2-1 for a total of 15', () => {
    expect(TOP_FIVE_POINTS).toEqual([5, 4, 3, 2, 1])
    expect(TOP_FIVE_MAX_SCORE).toBe(15)
  })
})

describe('top-five-guess content gates', () => {
  it('treats variations of one idea as the same answer', () => {
    expect(answersOverlap('Meetings', 'Too many meetings')).toBe(true)
    expect(answersOverlap('Long meetings', 'Meetings')).toBe(true)
    expect(answersOverlap('Alarm clock', 'Early alarms')).toBe(true)
    expect(answersOverlap('Rush hour traffic', 'Road traffic')).toBe(true)
    expect(answersOverlap('Office politics', 'Office gossip')).toBe(false)
    expect(answersOverlap('Deadlines', 'The morning commute')).toBe(false)
  })

  it('drops a set with overlapping, missing, echoing or unsafe answers', () => {
    const q = 'Name something you will never miss about the office.'
    const bad = [
      { question: q, answers: ['Meetings', 'Long meetings', 'Emails', 'Deadlines', 'Commute'] },
      { question: q, answers: ['Meetings', 'Emails', 'Deadlines', 'Commute'] },
      { question: q, answers: ['The office', 'Emails', 'Deadlines', 'Commute', 'Dress code'] },
      { question: q, answers: ['Casino nights', 'Emails', 'Deadlines', 'Commute', 'Dress code'] },
      { question: q, answers: ['Meetings 40%', 'Emails', 'Deadlines', 'Commute', 'Dress code'] },
    ]
    expect(selectTopFiveSets(bad, { cap: 5 })).toEqual([])
  })

  it('reads only the first five answers and keeps their order', () => {
    const raw = { ...TOP_FIVE_FIXTURE_ITEMS[1]!, answers: [...TOP_FIVE_FIXTURE_ITEMS[1]!.answers, 'Bowls'] }
    const [set] = selectTopFiveSets([raw], { cap: 5 })
    expect(set!.answers).toEqual(TOP_FIVE_FIXTURE_ITEMS[1]!.answers)
  })

  it('refuses questions that imply polling or touch sensitive topics', () => {
    expect(normalizeQuestion('We asked 100 people to name a favourite hobby.')).toBeNull()
    expect(normalizeQuestion('Name something people worry about before surgery.')).toBeNull()
    expect(normalizeQuestion('Name a reason to visit the casino on a Friday.')).toBeNull()
    expect(normalizeQuestion('name a place you would love to visit')).toBe(
      'Name a place you would love to visit?',
    )
    expect(normalizeAnswer('1. the morning commute.')).toBe('The morning commute')
  })

  it('drops repeated questions, near-repeats and the book’s own history', () => {
    const near = { ...TOP_FIVE_FIXTURE_ITEMS[0]!, question: 'Name something you won’t miss about the office.' }
    const kept = selectTopFiveSets([TOP_FIVE_FIXTURE_ITEMS[0], near, TOP_FIVE_FIXTURE_ITEMS[1]], {
      cap: 5,
      avoid: [TOP_FIVE_FIXTURE_ITEMS[1]!.question],
    })
    expect(kept.map((s) => s.question)).toEqual([TOP_FIVE_FIXTURE_ITEMS[0]!.question])
  })

  it('treats malformed replies as empty rather than throwing', () => {
    for (const junk of [undefined, null, 'x', 5, [null, 'x', { question: 3 }]]) {
      expect(selectTopFiveSets(junk, { cap: 5 })).toEqual([])
    }
  })
})

describe('top-five-guess page', () => {
  it('prints what the form promises on every KDP trim, inside the safe area', () => {
    for (const [w, h] of TRIMS) {
      for (const showTitle of [true, false]) {
        const config = { ...base, showTitle, title: showTitle ? TOP_FIVE_DEFAULT_TITLE : '' }
        const ctx = kdpCtx(w, h)
        const plan = topFiveWorstCasePlan({ page: ctx, config, instruction: instructionFor(config), font: FONT })!
        expect(plan, `${w}x${h}`).not.toBeNull()
        expect(plan.count).toBeGreaterThanOrEqual(1)
        expect(plan.count).toBeLessThanOrEqual(MAX_QUESTIONS_PER_PAGE)
        expect(plan.metrics.pitch).toBeGreaterThanOrEqual(ROW_MIN)
        expect(plan.metrics.questionFont).toBeGreaterThanOrEqual(QUESTION_FONT_MIN)

        const [page] = generate(config, ctx)
        const questions = TOP_FIVE_FIXTURE_ITEMS.map((item) => item.question)
        const printed = questions.filter((q) =>
          texts(page!.objects).some((t) => t.replace(/\n/g, ' ') === q),
        )
        expect(printed, `${w}x${h}`).toHaveLength(plan.count)
        const note = topFivePrintNote({ page: ctx, config, instruction: instructionFor(config), font: FONT })
        expect(note).toContain(`${plan.count} question`)
        expect(note).toContain(`${pxToPt(plan.metrics.questionFont)} pt`)

        assertObjectsInSafeMargin(page!.objects, ctx)
        assertObjectsInSafeMargin(page!.answerSourceObjects!, ctx)
      }
    }
  })

  it('hides every answer on the puzzle page and gives each line a score blank', () => {
    const [page] = generate(base, kdpCtx(6, 9))
    const answers = harvestAnswers(page!.objects)
    expect(answers.length).toBeGreaterThan(0)
    expect(answers.every((o) => o.visible === false)).toBe(true)
    const visible = texts(page!.objects.filter((o) => o.visible !== false))
    const count = visible.filter((t) => /^(\d\.\s+)?Name /.test(t)).length
    expect(visible.filter((t) => t === 'pts')).toHaveLength(5 * count)
    expect(visible.filter((t) => t === `/ ${TOP_FIVE_MAX_SCORE}`)).toHaveLength(count)
  })

  it('draws the answer page from the same sets, ranked and scored', () => {
    const [page] = generate(base, kdpCtx(6, 9))
    const key = buildAnswerPage(page!.answerSourceObjects!, STUDIO_ANSWER_INK_MONO)
    const keyTexts = texts(key)
    const puzzleQuestions = texts(page!.objects).filter((t) => t.startsWith('Name '))
    const keyQuestions = keyTexts.filter((t) => t.startsWith('Name '))
    expect(keyQuestions).toEqual(puzzleQuestions)

    for (const question of keyQuestions) {
      const set = TOP_FIVE_FIXTURE_ITEMS.find((item) => item.question === question.replace(/\n/g, ' '))!
      set.answers.forEach((answer, rank) => {
        expect(keyTexts).toContain(`${rank + 1}.  ${answer}`)
      })
    }
    expect(keyTexts.filter((t) => t === '5 pts')).toHaveLength(keyQuestions.length)
    expect(keyTexts.filter((t) => t === '1 pt')).toHaveLength(keyQuestions.length)
    // No blanks, no instruction and no tally on the key.
    expect(keyTexts).not.toContain('pts')
    expect(keyTexts.some((t) => t.startsWith('Write five guesses'))).toBe(false)
    // Every hidden puzzle answer is revealed on the key, in black.
    const revealed = harvestAnswers(key)
    expect(revealed.every((o) => o.visible === true && o.fill === STUDIO_ANSWER_INK_MONO)).toBe(true)
  })

  it('passes over a set that will not fit and prints the next one', () => {
    const long = {
      question: 'Name something wonderful you might finally do on a long and lazy summer day?',
      answers: ['Nap in a hammock', 'Read a novel', 'Go fishing', 'Visit a lake', 'Bake bread'],
    }
    const ctx = kdpCtx(5, 8, { items: [long, ...TOP_FIVE_FIXTURE_ITEMS] })
    const plan = topFiveWorstCasePlan({ page: ctx, config: base, instruction: instructionFor(base), font: FONT })!
    const sets = selectTopFiveSets([long, ...TOP_FIVE_FIXTURE_ITEMS], { cap: 8 })
    const fitted = fitTopFiveSets(sets, plan, FONT)!
    for (const set of fitted.sets) {
      expect(set.questionLines.length).toBeLessThanOrEqual(plan.questionLines)
    }
    expect(fitted.sets.length).toBe(plan.count)
  })

  it('writes an error page, not a broken puzzle, when content is missing', () => {
    for (const remoteData of [undefined, null, { items: [] }, { items: 'nope' }]) {
      const [page] = generate(base, { ...STUDIO_TEST_CTX, remoteData })
      expect(page!.answerSourceObjects).toBeUndefined()
      expect(texts(page!.objects)).toContain(TOP_FIVE_AI_EMPTY_MESSAGE)
      expect(harvestAnswers(page!.objects)).toHaveLength(0)
    }
  })
})

describe('top-five-guess preflight', () => {
  const ctx = kdpCtx(8.5, 11)
  const plan = topFiveWorstCasePlan({ page: ctx, config: base, instruction: instructionFor(base), font: FONT })!

  it('passes a clean page', () => {
    const fitted = fitTopFiveSets(selectTopFiveSets(TOP_FIVE_FIXTURE_ITEMS, { cap: 5 }), plan, FONT)!
    expect(runTopFiveKdpPreflight({ ...fitted, font: FONT })).toMatchObject({ ok: true })
  })

  it('refuses the same puzzle twice, overlapping answers and a short set', () => {
    const [first] = fitTopFiveSets(selectTopFiveSets(TOP_FIVE_FIXTURE_ITEMS, { cap: 5 }), plan, FONT)!.sets
    const twice = runTopFiveKdpPreflight({ sets: [first!, first!], plan: { ...plan, count: 2 }, font: FONT })
    expect(twice.ok).toBe(false)

    const overlap = { ...first!, answers: ['Meetings', 'Too many meetings', 'Emails', 'Deadlines', 'Commute'] }
    expect(runTopFiveKdpPreflight({ sets: [overlap], plan: { ...plan, count: 1 }, font: FONT }).ok).toBe(false)

    const short = { ...first!, answers: first!.answers.slice(0, 4) }
    expect(runTopFiveKdpPreflight({ sets: [short], plan: { ...plan, count: 1 }, font: FONT }).ok).toBe(false)
  })
})
