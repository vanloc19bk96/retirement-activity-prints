import { describe, it, expect } from 'vitest'
import type {
  StudioConfig,
  StudioFabricObject,
  StudioGenerateContext,
} from '@/types/studio-template.types'
import type { RetireeStyle } from '@/types/studio-retiree-quiz.types'
import { DPI } from '@/types/canvas-settings.types'
import { STUDIO_TEMPLATES, buildDefaultConfig, getStudioTemplate } from '@/constants/studio-templates'
import { resetObjectCounter } from '../studio-fabric-builders'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import {
  STUDIO_TEST_CTX,
  assertObjectsInSafeMargin,
  runGeneratorContractTests,
} from '../studio-generator-test'
import { retireeQuizTemplate, validateRqConfig } from './generate'
import { instructionFor } from './config'
import {
  MAX_DESCRIPTION_CHARS,
  MAX_QUESTIONS,
  MIN_QUESTIONS,
  RQ_AI_EMPTY_MESSAGE,
  RQ_DEFAULT_TITLE,
  RQ_FALLBACK_DESCRIPTIONS,
  RQ_LETTERS,
  RQ_PAGE_TOO_SMALL_MESSAGE,
  RQ_STYLES,
  contentTokens,
  normalizeAnswer,
  normalizeDescription,
  normalizeQuestion,
  normalizeRqQuestion,
  placeRqQuestions,
  resolveRqDescriptions,
  selectRqQuestions,
  textsMatch,
  type RqQuestion,
} from './content'
import { fitRqQuestions } from './fit'
import { runRqKdpPreflight } from './kdp-preflight'
import {
  QUIZ_FONT_MIN,
  planRqResults,
  ptToPx,
  pxToPt,
  rqBodyField,
  rqPrintNote,
  rqWorstCasePlan,
} from './layout'
import { RQ_FIXTURE, RQ_FIXTURE_QUESTIONS, RQ_FIXTURE_RESULTS } from './fixture'

const FONT = 'PT Serif'

/** The draft a seller has in front of them — common header fields included. */
const base: StudioConfig = {
  ...buildDefaultConfig(retireeQuizTemplate),
  showTitle: true,
  title: RQ_DEFAULT_TITLE,
  showInstructions: true,
  seed: 42,
  fontFamily: FONT,
}

/** A real KDP interior: DPI 96, inside margin 0.375", the rest 0.25". */
const kdpCtx = (wIn: number, hIn: number, remoteData: unknown = RQ_FIXTURE, seed = 42): StudioGenerateContext => ({
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
  return retireeQuizTemplate.generate(config, ctx)
}

const clean = (text: unknown) => String(text ?? '').replace(/ /g, ' ')
const texts = (objects: StudioFabricObject[]) => objects.map((o) => clean(o.text)).filter(Boolean)
const labels = (objects: StudioFabricObject[]) =>
  objects.map((o) => o.data?.[STUDIO_CONTENT_LABEL_KEY]).filter((v): v is string => typeof v === 'string')

const fixtureQuestions = () => selectRqQuestions(RQ_FIXTURE_QUESTIONS, { cap: 20 })

runGeneratorContractTests(retireeQuizTemplate, {
  configOverrides: { showTitle: true, title: RQ_DEFAULT_TITLE, showInstructions: true },
  contextOverrides: { remoteData: RQ_FIXTURE },
})

describe('what-kind-of-retiree registry', () => {
  it('is registered once, in the word tab, with no answer key', () => {
    expect(STUDIO_TEMPLATES.filter((t) => t.key === 'what-kind-of-retiree')).toHaveLength(1)
    const registered = getStudioTemplate('what-kind-of-retiree')!
    expect(registered.category).toBe('word')
    expect(registered.producesAnswerKey).toBe(false)
    expect(registered.defaultPageTitle).toBe(RQ_DEFAULT_TITLE)
    expect(registered.prefetch).toBeTypeOf('function')
  })

  it('asks only for a theme (plus a typed theme when chosen)', () => {
    expect(retireeQuizTemplate.configSchema.map((field) => field.key)).toEqual(['theme', 'customTheme'])
    const custom = retireeQuizTemplate.configSchema.find((f) => f.key === 'customTheme')!
    expect(custom.visibleWhen?.({ theme: 'mixed' })).toBe(false)
    expect(custom.visibleWhen?.({ theme: 'custom' })).toBe(true)
  })

  it('refuses an empty custom theme', () => {
    expect(validateRqConfig({ theme: 'custom', customTheme: '' })?.field).toBe('customTheme')
    expect(validateRqConfig({ theme: 'custom', customTheme: 'Life by the sea' })).toBeNull()
    expect(validateRqConfig({ theme: 'mixed' })).toBeNull()
  })
})

describe('what-kind-of-retiree content gates', () => {
  it('accepts every fixture question and keeps them all as one varied quiz', () => {
    expect(fixtureQuestions().map((q) => q.question)).toEqual(RQ_FIXTURE_QUESTIONS.map((q) => q.question))
  })

  it('never prints a question the service did not style-check', () => {
    const unchecked = RQ_FIXTURE_QUESTIONS.map((item) => ({ ...item, verified: false }))
    expect(selectRqQuestions(unchecked, { cap: 12 })).toEqual([])
    const { verified: _dropped, ...noMark } = RQ_FIXTURE_QUESTIONS[0]!
    expect(normalizeRqQuestion(noMark)).toBeNull()
  })

  it('needs one answer for every style', () => {
    const { napper: _gone, ...three } = RQ_FIXTURE_QUESTIONS[0]!
    expect(normalizeRqQuestion(three)).toBeNull()
  })

  it.each([
    'What sounds best on a free Tuesday',
    'Which gift? Or which trip?',
    'It rains. You wake late. The kettle sings. What now?',
    'Which gift would your grandchildren pick for you?',
    'What would your husband say you love most?',
    'Which do you explore first on a free day?',
    'Which glass of wine goes with a free afternoon?',
    'Rain is drumming on the window. How do you spend the afternoon?',
  ])('refuses the question %j', (question) => {
    expect(normalizeQuestion(question)).toBeNull()
  })

  it.each([
    'Be lazy all afternoon',
    'Take a nap. Then another',
    'Explore a brand-new hiking trail',
    'A week on a luxury yacht',
    'A seat at the casino',
    'Run a marathon along the coast',
    'A very long answer that goes on well past the budget',
    'Go',
  ])('refuses the answer %j', (answer) => {
    expect(normalizeAnswer(answer)).toBeNull()
  })

  it('strips labels and end marks from answers without rewriting them', () => {
    expect(normalizeAnswer('A) a bus ride to a new town.')).toBe('A bus ride to a new town')
    expect(normalizeAnswer('Explorer: a bus ride to a new town')).toBe('A bus ride to a new town')
  })

  it('drops a question whose answers are lopsided or alike', () => {
    const lopsided = { ...RQ_FIXTURE_QUESTIONS[0]!, napper: 'A nap' }
    expect(normalizeRqQuestion(lopsided)).toBeNull()
    const alike = { ...RQ_FIXTURE_QUESTIONS[0]!, napper: 'A long lunch with good friends' }
    expect(normalizeRqQuestion(alike)).toBeNull()
  })

  it('catches a paraphrased question as a repeat', () => {
    expect(textsMatch('Which gift would make you grin?', 'Which gift would make you grin the most?')).toBe(true)
    expect(textsMatch('Which gift would make you grin?', 'Which flyer catches your eye?')).toBe(false)
  })

  it('drops repeats, repeated topics and a word one style leans on too often', () => {
    const [first, second, third] = RQ_FIXTURE_QUESTIONS as [typeof RQ_FIXTURE_QUESTIONS[0], typeof RQ_FIXTURE_QUESTIONS[0], typeof RQ_FIXTURE_QUESTIONS[0]]
    const paraphrase = { ...second, question: 'Which gift would make you grin the most?', topic: 'presents' }
    expect(selectRqQuestions([second, paraphrase], { cap: 5 })).toHaveLength(1)
    expect(selectRqQuestions([first, { ...third, topic: first.topic }], { cap: 5 })).toHaveLength(1)
    const blankets = [
      { ...first, napper: 'A blanket and the radio' },
      { ...second, napper: 'A blanket by the window' },
      { ...third, napper: 'A blanket over your knees' },
    ]
    expect(selectRqQuestions(blankets, { cap: 5 })).toHaveLength(2)
  })

  it('never repeats a question the book already prints', () => {
    const kept = selectRqQuestions(RQ_FIXTURE_QUESTIONS, { cap: 20, avoid: ['gift grin ear'] })
    expect(kept.map((q) => q.question)).not.toContain(RQ_FIXTURE_QUESTIONS[1]!.question)
  })
})

describe('what-kind-of-retiree write-ups', () => {
  it('keeps fresh write-ups that pass, and falls back per style for the rest', () => {
    const out = resolveRqDescriptions({ ...RQ_FIXTURE_RESULTS, napper: 'You are a lazy napper.' }, 7)
    expect(out.explorer).toBe(RQ_FIXTURE_RESULTS.explorer)
    expect(RQ_FALLBACK_DESCRIPTIONS.napper).toContain(out.napper)
  })

  it('has fallbacks that pass the same gate and fit the planned length', () => {
    for (const style of RQ_STYLES) {
      for (const text of RQ_FALLBACK_DESCRIPTIONS[style]) {
        expect(normalizeDescription(text)).toBe(text)
        expect(text.length).toBeLessThanOrEqual(MAX_DESCRIPTION_CHARS)
      }
    }
  })

  it('refuses write-ups that name a style or claim to be science', () => {
    expect(normalizeDescription('You are a true explorer at heart, always looking for somewhere new.')).toBeNull()
    expect(normalizeDescription('Science says you are the calmest person in the room. Relax and enjoy it.')).toBeNull()
  })
})

describe('what-kind-of-retiree scoring balance', () => {
  const quiz = (n: number) => fixtureQuestions().slice(0, n)

  it.each([8, 9, 10])('gives every style one answer per question and balances letters (%i questions)', (n) => {
    for (const seed of [1, 42, 999, 123456]) {
      const placed = placeRqQuestions(quiz(n), seed)
      const atLetter = new Map<RetireeStyle, number[]>(RQ_STYLES.map((s) => [s, [0, 0, 0, 0]]))
      placed.forEach((question, q) => {
        expect([...question.styles].sort()).toEqual([...RQ_STYLES].sort())
        question.styles.forEach((style, letter) => {
          // The style travels with its own answer.
          expect(question.answers[letter]).toBe(quiz(n)[q]!.answers[style])
          atLetter.get(style)![letter]! += 1
        })
      })
      for (const perLetter of atLetter.values()) {
        expect(perLetter.reduce((a, b) => a + b, 0)).toBe(n)
        expect(Math.max(...perLetter) - Math.min(...perLetter)).toBeLessThanOrEqual(1)
      }
    }
  })

  it('deals letters differently for a different seed', () => {
    const a = placeRqQuestions(quiz(8), 1).map((q) => q.styles.join())
    const b = placeRqQuestions(quiz(8), 2).map((q) => q.styles.join())
    expect(a).not.toEqual(b)
  })
})

describe('what-kind-of-retiree preflight', () => {
  const ctx = kdpCtx(6, 9)
  const plan = rqWorstCasePlan({ page: ctx, config: base, instruction: instructionFor(base), font: FONT })!
  const fitted = fitRqQuestions(fixtureQuestions(), plan.quiz, FONT, 42)!
  const descriptions = resolveRqDescriptions(RQ_FIXTURE_RESULTS, 42)
  const results = planRqResults({
    field: rqBodyField(ctx, base, ''),
    count: fitted.plan.count,
    descriptions,
    font: FONT,
    startSize: fitted.plan.metrics.font,
  })!
  const run = (overrides: Partial<Parameters<typeof runRqKdpPreflight>[0]> = {}) =>
    runRqKdpPreflight({ questions: fitted.questions, quiz: fitted.plan, results, descriptions, ...overrides })

  it('passes a real quiz', () => {
    expect(run().errors).toEqual([])
  })

  it('refuses a question scored twice for one style', () => {
    const broken = fitted.questions.map((q, i) =>
      i === 0 ? { ...q, styles: [q.styles[0]!, q.styles[0]!, q.styles[2]!, q.styles[3]!] } : q,
    )
    expect(run({ questions: broken }).ok).toBe(false)
  })

  it('refuses letters that lean towards one style', () => {
    const leaning = fitted.questions.map((q) => {
      const answers = RQ_STYLES.map((style) => q.answers[q.styles.indexOf(style)]!)
      return { ...q, styles: [...RQ_STYLES], answers, answerLines: answers.map((a) => [a]) }
    })
    expect(run({ questions: leaning }).errors).toContain('One answer letter leans towards a single retirement style.')
  })

  it('refuses a missing or unsuitable write-up', () => {
    expect(run({ descriptions: { ...descriptions, napper: '' } }).ok).toBe(false)
  })

  it('refuses a quiz that is too short to mean anything', () => {
    const short = fitted.questions.slice(0, MIN_QUESTIONS - 1)
    expect(run({ questions: short, quiz: { ...fitted.plan, count: short.length } }).ok).toBe(false)
  })
})

describe('what-kind-of-retiree on real KDP trims', () => {
  it.each(TRIMS)('%s x %s prints the quiz the form promised, inside the safe area', (w, h) => {
    const ctx = kdpCtx(w, h)
    const plan = rqWorstCasePlan({ page: ctx, config: base, instruction: instructionFor(base), font: FONT })!
    expect(plan).not.toBeNull()
    expect(plan.quiz.count).toBeGreaterThanOrEqual(MIN_QUESTIONS)
    expect(plan.quiz.count).toBeLessThanOrEqual(MAX_QUESTIONS)
    expect(plan.quiz.metrics.font).toBeGreaterThanOrEqual(QUIZ_FONT_MIN)

    const pages = generate(base, ctx)
    const resultPages = plan.results.onePage ? 1 : 2
    expect(pages).toHaveLength(plan.quiz.pages + resultPages)
    for (const page of pages) assertObjectsInSafeMargin(page.objects, ctx)

    // Every question prints once, numbered in order, and is stamped for the book's history.
    const quizPages = pages.slice(0, plan.quiz.pages)
    const printed = quizPages.flatMap((page) => labels(page.objects))
    expect(printed).toHaveLength(plan.quiz.count)
    expect(new Set(printed).size).toBe(printed.length)
    const numbers = quizPages.flatMap((page) => texts(page.objects).filter((t) => /^\d+\.$/.test(t)))
    expect(numbers).toEqual(Array.from({ length: plan.quiz.count }, (_, i) => `${i + 1}.`))

    // Questions and answers stay large print.
    for (const page of quizPages) {
      for (const o of page.objects) {
        if (o.type === 'textbox' && o.fontWeight !== 700 && o.fontStyle !== 'italic' && o.fill !== '#6B7280') {
          expect(o.fontSize!).toBeGreaterThanOrEqual(QUIZ_FONT_MIN)
        }
      }
    }

    const note = rqPrintNote({ page: ctx, config: base, instruction: instructionFor(base), font: FONT })
    expect(note).toContain(`${plan.quiz.count} questions on ${plan.quiz.pages} pages at ${pxToPt(plan.quiz.metrics.font)} pt`)
  })

  it('prints a scoring grid whose rows match the letters on the question pages', () => {
    const ctx = kdpCtx(6, 9)
    const plan = rqWorstCasePlan({ page: ctx, config: base, instruction: instructionFor(base), font: FONT })!
    const fitted = fitRqQuestions(fixtureQuestions(), plan.quiz, FONT, ctx.seed)!
    const pages = generate(base, ctx)
    const scoring = pages[plan.quiz.pages]!
    const cellLetters = texts(scoring.objects).filter((t) => (RQ_LETTERS as readonly string[]).includes(t))
    // Row by row, column by column (grid order), the letter beside that style's answer.
    const expected = fitted.questions.flatMap((q) => RQ_STYLES.map((style) => RQ_LETTERS[q.styles.indexOf(style)]!))
    expect(cellLetters).toEqual(expected)
    // And the same answer text sits beside that letter on the question page.
    const quizText = pages.slice(0, plan.quiz.pages).flatMap((page) => texts(page.objects))
    for (const q of fitted.questions) {
      q.answers.forEach((answer) => expect(quizText.join('\n')).toContain(answer.split(' ')[0]!))
    }
  })

  it('explains scoring, ties and every style on the results pages', () => {
    const ctx = kdpCtx(6, 9)
    const pages = generate(base, ctx)
    const plan = rqWorstCasePlan({ page: ctx, config: base, instruction: instructionFor(base), font: FONT })!
    const results = pages.slice(plan.quiz.pages).flatMap((page) => texts(page.objects)).join('\n')
    expect(results).toContain('Score Your Quiz')
    expect(results).toContain('A tie?')
    expect(results).toContain('Just for fun')
    for (const name of ['The Explorer', 'The Tinkerer', 'The Social Butterfly', 'The Professional Napper']) {
      expect(results).toContain(name)
    }
    for (const style of RQ_STYLES) {
      expect(results.replace(/\n/g, ' ')).toContain(RQ_FIXTURE_RESULTS[style])
    }
  })

  it('never depends on colour: ink is black, white or grey only', () => {
    const allowed = new Set(['#000000', '#6B7280', '#111827', '#9CA3AF', '#D1D5DB', '#FFFFFF', 'transparent'])
    for (const page of generate(base, kdpCtx(6, 9))) {
      for (const o of page.objects) {
        if (o.fill) expect(allowed).toContain(o.fill)
        if (o.stroke) expect(allowed).toContain(o.stroke)
      }
    }
  })

  it('prints no hidden answer objects — there is no answer page', () => {
    for (const page of generate(base, kdpCtx(6, 9))) {
      expect(page.objects.some((o) => o.studioRole === 'answer')).toBe(false)
    }
  })

  it('keeps the first quiz page instruction off when the seller turns it off', () => {
    const pages = generate({ ...base, showInstructions: false }, kdpCtx(6, 9))
    expect(texts(pages[0]!.objects)).not.toContain(instructionFor(base))
  })
})

describe('what-kind-of-retiree failure pages', () => {
  it('shows the AI message when nothing usable came back', () => {
    const pages = generate(base, kdpCtx(6, 9, { questions: [], results: {} }))
    expect(pages).toHaveLength(1)
    expect(texts(pages[0]!.objects)).toContain(RQ_AI_EMPTY_MESSAGE)
  })

  it('refuses to print a quiz shorter than the minimum', () => {
    const short = { questions: RQ_FIXTURE_QUESTIONS.slice(0, MIN_QUESTIONS - 1), results: RQ_FIXTURE_RESULTS }
    const pages = generate(base, kdpCtx(6, 9, short))
    expect(texts(pages[0]!.objects)).toContain(RQ_AI_EMPTY_MESSAGE)
  })

  it('says so when the page is too small rather than printing small type', () => {
    const pages = generate(base, kdpCtx(3, 4))
    expect(texts(pages[0]!.objects)).toContain(RQ_PAGE_TOO_SMALL_MESSAGE)
  })

  it('describes the quiz without a page, and reports the trim when there is one', () => {
    const noPage = rqPrintNote({ page: undefined, config: base, instruction: '', font: FONT })
    expect(noPage).toContain(`${MIN_QUESTIONS} to ${MAX_QUESTIONS} questions`)
    expect(ptToPx(14)).toBe(QUIZ_FONT_MIN)
  })
})

describe('what-kind-of-retiree long questions', () => {
  it('re-plans from the real text rather than refusing a quiz that runs long', () => {
    // Wide margins at 6 x 9: the typical plan picks large type these answers wrap at.
    const ctx: StudioGenerateContext = { ...STUDIO_TEST_CTX, remoteData: RQ_FIXTURE }
    const promised = rqWorstCasePlan({ page: ctx, config: base, instruction: instructionFor(base), font: FONT })!
    expect(fitRqQuestions(fixtureQuestions(), promised.quiz, FONT, 42)).toBeNull()

    const pages = generate(base, ctx)
    const printed = pages.flatMap((page) => labels(page.objects))
    expect(printed.length).toBeGreaterThanOrEqual(MIN_QUESTIONS)
    for (const page of pages) assertObjectsInSafeMargin(page.objects, ctx)
  })
})

describe('what-kind-of-retiree variety', () => {
  it('prints different letters and write-ups for different seeds from the same questions', () => {
    const a = generate(base, kdpCtx(6, 9, RQ_FIXTURE, 1))
    const b = generate({ ...base, seed: 2 }, kdpCtx(6, 9, RQ_FIXTURE, 2))
    expect(JSON.stringify(a)).not.toEqual(JSON.stringify(b))
  })

  it('never shares a word across more than two answers of one style', () => {
    const questions: RqQuestion[] = fixtureQuestions()
    for (const style of RQ_STYLES) {
      const counts = new Map<string, number>()
      for (const q of questions) {
        for (const word of contentTokens(q.answers[style])) {
          counts.set(word, (counts.get(word) ?? 0) + 1)
        }
      }
      expect(Math.max(...counts.values())).toBeLessThanOrEqual(2)
    }
  })
})
