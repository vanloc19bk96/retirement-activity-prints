import { describe, it, expect } from 'vitest'
import type { StudioConfig, StudioFabricObject, StudioGenerateContext } from '@/types/studio-template.types'
import { DPI } from '@/types/canvas-settings.types'
import { STUDIO_TEMPLATES, buildDefaultConfig, getStudioTemplate } from '@/constants/studio-templates'
import { STUDIO_ANSWER_INK_MONO, STUDIO_ANSWER_INK_MONO_TEMPLATES } from '@/constants/studio.constants'
import { resetObjectCounter } from '../studio-fabric-builders'
import { buildAnswerPage, harvestAnswers } from '../studio-answer-key'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import { assertObjectsInSafeMargin, runGeneratorContractTests } from '../studio-generator-test'
import { occupationTriviaTemplate } from './generate'
import { instructionFor } from './config'
import {
  OT_AI_EMPTY_MESSAGE,
  OT_DEFAULT_TITLE,
  OT_LETTERS,
  OT_MIN_QUESTIONS,
  OT_OCCUPATIONS,
  OT_TARGET_QUESTIONS,
  dealOtAnswerSlots,
  labelRepeats,
  normalizeOtQuestion,
  otInstruction,
  otLabel,
  questionsRepeat,
  selectOtQuestions,
} from './content'
import { MAX_QUIZ_PAGES, TEXT_FONT_MIN, otPrintNote, otWorstCasePlan, pxToPt } from './layout'
import { OT_FIXTURE, OT_FIXTURE_QUESTIONS } from './fixture'

const FONT = 'PT Serif'

const base: StudioConfig = {
  ...buildDefaultConfig(occupationTriviaTemplate),
  showTitle: true,
  title: OT_DEFAULT_TITLE,
  showInstructions: true,
  seed: 42,
  fontFamily: FONT,
}

/** A real KDP interior: DPI 96, inside margin 0.375", the rest 0.25". */
const kdpCtx = (wIn: number, hIn: number, remoteData: unknown = OT_FIXTURE, seed = 42): StudioGenerateContext => ({
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
  return occupationTriviaTemplate.generate(config, ctx)
}

const clean = (text: unknown) => String(text ?? '').replace(/ /g, ' ')
const oneLine = (text: string) => text.replace(/\n/g, ' ')
const textboxes = (objects: StudioFabricObject[]) => objects.filter((o) => o.type === 'textbox')
const numbers = (objects: StudioFabricObject[]) =>
  textboxes(objects).filter((o) => /^\d+\.$/.test(clean(o.text))).map((o) => clean(o.text))
const questionBoxes = (objects: StudioFabricObject[]) =>
  textboxes(objects).filter((o) => typeof o.data?.[STUDIO_CONTENT_LABEL_KEY] === 'string')

/** Each question's text → the letter printed beside each choice. */
function choicesByQuestion(pages: StudioFabricObject[][]) {
  const out = new Map<string, Map<string, string>>()
  for (const objects of pages) {
    const boxes = textboxes(objects)
    const qs = questionBoxes(objects).sort((a, b) => a.top - b.top)
    qs.forEach((q, i) => {
      const bottom = qs[i + 1]?.top ?? Number.POSITIVE_INFINITY
      const letters = boxes.filter((o) => /^[A-D]$/.test(clean(o.text)) && o.top > q.top && o.top < bottom)
      const map = new Map<string, string>()
      for (const letter of letters) {
        // The choice text sits on the letter's row, just right of its ring.
        const text = boxes
          .filter((o) => o.left > letter.left && Math.abs(o.top - letter.top) < 12 && !/^[A-D]$/.test(clean(o.text)))
          .sort((a, b) => a.left - b.left)[0]!
        map.set(oneLine(clean(text.text)), clean(letter.text))
      }
      out.set(oneLine(clean(q.text)), map)
    })
  }
  return out
}

// The quiz pages carry no answer at all, hidden or not; the key is built from
// the last page's `answerSourceObjects` (asserted below).
runGeneratorContractTests(occupationTriviaTemplate, {
  expectAnswers: false,
  configOverrides: { showTitle: true, title: OT_DEFAULT_TITLE, showInstructions: true },
  contextOverrides: { remoteData: OT_FIXTURE },
})

describe('occupation-trivia registry', () => {
  it('is registered once, in the word tab, with an answer page in black ink', () => {
    expect(STUDIO_TEMPLATES.filter((t) => t.key === 'occupation-trivia')).toHaveLength(1)
    const registered = getStudioTemplate('occupation-trivia')!
    expect(registered.category).toBe('word')
    expect(registered.producesAnswerKey).toBe(true)
    expect(registered.prefetch).toBeTypeOf('function')
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has('occupation-trivia')).toBe(true)
  })

  it('asks the seller only for the occupation and the level', () => {
    const own = occupationTriviaTemplate.configSchema.map((f) => f.key)
    expect(own).toEqual(['occupation', 'level'])
    const occupation = occupationTriviaTemplate.configSchema[0]!
    expect(occupation.options!.map((o) => o.value)).toEqual(OT_OCCUPATIONS.map((o) => o.value))
    for (const o of OT_OCCUPATIONS) {
      expect(occupation.helpWhen!({ ...base, occupation: o.value })).toBe(o.covers)
    }
  })

  it('names the job in the instruction', () => {
    expect(instructionFor({ ...base, occupation: 'postal' })).toBe(otInstruction('postal'))
    expect(otInstruction('trucker')).toMatch(/^Trucker trivia/)
    expect(instructionFor({ ...base, showInstructions: false })).toBe('')
  })
})

describe('occupation-trivia pages', () => {
  it.each(TRIMS)('prints a full, large-print pack on a %s x %s trim, as the form promised', (w, h) => {
    const ctx = kdpCtx(w, h)
    const pages = generate(base, ctx)
    const plan = otWorstCasePlan({ page: ctx, config: base, instruction: instructionFor(base), font: FONT })!
    expect(plan.metrics.font).toBeGreaterThanOrEqual(TEXT_FONT_MIN)
    expect(pages.length).toBeLessThanOrEqual(Math.min(plan.pages, MAX_QUIZ_PAGES))

    const printed = pages.flatMap((p) => numbers(p.objects))
    expect(printed).toEqual(Array.from({ length: plan.count }, (_, i) => `${i + 1}.`))
    expect(printed.length).toBeGreaterThanOrEqual(OT_MIN_QUESTIONS)
    // Even pages: never 2 / 4 / 4.
    const perPage = pages.map((p) => numbers(p.objects).length)
    expect(Math.max(...perPage) - Math.min(...perPage)).toBeLessThanOrEqual(1)

    const note = otPrintNote({ page: ctx, config: base, instruction: instructionFor(base), font: FONT })
    expect(note).toContain(`${plan.count} questions at ${pxToPt(plan.metrics.font)} pt`)

    for (const page of pages) assertObjectsInSafeMargin(page.objects, ctx)
    const key = pages.at(-1)!.answerSourceObjects!
    assertObjectsInSafeMargin(buildAnswerPage(key, STUDIO_ANSWER_INK_MONO), ctx)
  })

  it('prints ten questions on the common trims', () => {
    for (const [w, h] of [[6, 9], [7, 10], [8.5, 11]] as const) {
      const pages = generate(base, kdpCtx(w, h))
      expect(pages.flatMap((p) => numbers(p.objects))).toHaveLength(OT_TARGET_QUESTIONS)
    }
  })

  it('titles every quiz page, gives the how-to once, and says when the pack continues', () => {
    const pages = generate(base, kdpCtx(6, 9))
    expect(pages.length).toBeGreaterThan(1)
    const texts = pages.map((p) => textboxes(p.objects).map((o) => oneLine(clean(o.text))))
    for (const t of texts) expect(t).toContain(OT_DEFAULT_TITLE)
    expect(texts[0]).toContain(otInstruction('teacher'))
    for (const t of texts.slice(1)) expect(t).not.toContain(otInstruction('teacher'))
    for (const t of texts.slice(0, -1)) expect(t).toContain('Continued on the next page')
    expect(texts.at(-1)).not.toContain('Continued on the next page')
  })

  it('hides no answer on a quiz page and attaches the whole key to the last page only', () => {
    const pages = generate(base, kdpCtx(6, 9))
    for (const page of pages) expect(harvestAnswers(page.objects)).toHaveLength(0)
    pages.slice(0, -1).forEach((page) => expect(page.answerSourceObjects).toBeUndefined())
    const key = pages.at(-1)!.answerSourceObjects!
    expect(harvestAnswers(key).length).toBeGreaterThan(0)
    expect(harvestAnswers(key).every((o) => o.visible === false)).toBe(true)
  })

  it('prints every question exactly as written, each with one right answer among four choices', () => {
    const pages = generate(base, kdpCtx(6, 9))
    const byQuestion = choicesByQuestion(pages.map((p) => p.objects))
    expect(byQuestion.size).toBe(OT_TARGET_QUESTIONS)
    for (const [question, choices] of byQuestion) {
      const source = OT_FIXTURE_QUESTIONS.find((q) => q.question === question)!
      expect(source, question).toBeDefined()
      expect([...choices.keys()].sort()).toEqual([source.answer, ...source.distractors].sort())
      expect([...choices.values()].sort()).toEqual([...OT_LETTERS])
    }
  })

  it('keeps the answer page in step with the quiz: same numbers, the letter printed beside the answer', () => {
    for (const seed of [1, 42, 777]) {
      const pages = generate({ ...base, seed }, kdpCtx(6, 9, OT_FIXTURE, seed))
      const byQuestion = choicesByQuestion(pages.map((p) => p.objects))
      const order = pages.flatMap((p) => questionBoxes(p.objects).sort((a, b) => a.top - b.top)).map((o) => oneLine(clean(o.text)))
      const key = buildAnswerPage(pages.at(-1)!.answerSourceObjects!, STUDIO_ANSWER_INK_MONO)
      const keyBoxes = textboxes(key)
      const keyNumbers = keyBoxes.filter((o) => /^\d+\.$/.test(clean(o.text))).sort((a, b) => a.top - b.top)
      expect(keyNumbers.map((o) => clean(o.text))).toEqual(order.map((_, i) => `${i + 1}.`))

      keyNumbers.forEach((number, i) => {
        const row = keyBoxes.filter((o) => Math.abs(o.top - number.top) < 14 && o !== number).sort((a, b) => a.left - b.left)
        const letter = clean(row.find((o) => /^[A-D]$/.test(clean(o.text)))!.text)
        const answer = oneLine(clean(row.find((o) => o.fontWeight === 700 && !/^[A-D]$/.test(clean(o.text)))!.text))
        const source = OT_FIXTURE_QUESTIONS.find((q) => q.question === order[i])!
        expect(answer).toBe(source.answer)
        expect(byQuestion.get(order[i]!)!.get(answer)).toBe(letter)
      })
      // The notes are the fixture's own, word for word.
      const italic = keyBoxes.filter((o) => o.fontStyle === 'italic').map((o) => oneLine(clean(o.text)))
      for (const note of italic) expect(OT_FIXTURE_QUESTIONS.map((q) => q.explanation)).toContain(note)
      expect(key.every((o) => o.visible !== false)).toBe(true)
    }
  })

  it('stamps each question with its fact label so the book can refuse it later', () => {
    const pages = generate(base, kdpCtx(6, 9))
    const labels = pages.flatMap((p) => questionBoxes(p.objects).map((o) => String(o.data![STUDIO_CONTENT_LABEL_KEY])))
    expect(labels).toHaveLength(OT_TARGET_QUESTIONS)
    for (const label of labels) expect(label).toMatch(/^teacher: .+ = .+$/)
    expect(labels).toContain(otLabel('teacher', OT_FIXTURE_QUESTIONS[0]!))
  })

  it('spreads right answers across the letters', () => {
    for (const seed of [3, 9, 42, 1234]) {
      const slots = dealOtAnswerSlots(OT_TARGET_QUESTIONS, seed)
      const counts = [0, 1, 2, 3].map((s) => slots.filter((x) => x === s).length)
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1)
      slots.forEach((s, i) => {
        if (i >= 2) expect(s === slots[i - 1] && s === slots[i - 2]).toBe(false)
      })
    }
  })

  it('shows a plain message rather than a broken pack', () => {
    const empty = generate(base, kdpCtx(6, 9, { occupation: 'teacher', questions: [] }))
    expect(empty).toHaveLength(1)
    expect(textboxes(empty[0]!.objects).map((o) => clean(o.text))).toContain(OT_AI_EMPTY_MESSAGE)

    // A pack written for another job never prints under this one's name.
    const other = generate({ ...base, occupation: 'nurse' }, kdpCtx(6, 9))
    expect(textboxes(other[0]!.objects).map((o) => clean(o.text))).toContain(OT_AI_EMPTY_MESSAGE)

    // Unverified questions never print.
    const unverified = { occupation: 'teacher', questions: OT_FIXTURE_QUESTIONS.map((q) => ({ ...q, verified: false })) }
    expect(textboxes(generate(base, kdpCtx(6, 9, unverified))[0]!.objects).map((o) => clean(o.text))).toContain(
      OT_AI_EMPTY_MESSAGE,
    )
  })
})

describe('occupation-trivia gates', () => {
  const good = { ...OT_FIXTURE_QUESTIONS[0]!, distractors: [...OT_FIXTURE_QUESTIONS[0]!.distractors] }

  it('accepts every fixture question', () => {
    expect(selectOtQuestions(OT_FIXTURE.questions, { occupation: 'teacher', cap: 99 })).toHaveLength(
      OT_FIXTURE_QUESTIONS.length,
    )
  })

  it.each([
    { question: 'What did you write on the blackboard with?' },
    { question: 'Do teachers still remember what they wrote on blackboards with?' },
    { question: 'Which of these was not used on a blackboard?' },
    { question: 'In 2019, what did teachers write on the blackboard with?' },
    { distractors: ['Charcoal', 'Crayon', 'All of the above'] },
    { distractors: ['Coloured chalk', 'Crayon', 'Graphite'] },
    { distractors: ['Charcoal', 'Crayon'] },
    { answer: 'Blackboard' },
    { explanation: 'Classroom lessons ran from nine until three each day.' },
  ])('refuses %o', (change) => {
    expect(normalizeOtQuestion({ ...good, ...change }, 'teacher')).toBeNull()
  })

  it('applies each job’s own care list', () => {
    const dose = { ...good, question: 'What did nurses check before giving a dose to a patient?', answer: 'The chart', distractors: ['The clock', 'The window', 'The ward list'], explanation: 'Nurses read the chart before giving a dose.' }
    expect(normalizeOtQuestion(dose, 'nurse')).toBeNull()
    expect(normalizeOtQuestion(dose, 'teacher')).not.toBeNull()
  })

  it('treats a reworded question on the same fact as a repeat', () => {
    const a = normalizeOtQuestion({ ...good, question: 'What tool did teachers commonly use to write on chalkboards?' }, 'teacher')!
    const b = normalizeOtQuestion(
      { ...good, topic: 'writing on the board', question: 'Which item was traditionally used by teachers to write on a blackboard?', distractors: ['Soapstone', 'Pastel', 'Lead pencil'] },
      'teacher',
    )!
    expect(questionsRepeat(a, b)).toBe(true)
    expect(labelRepeats(b, otLabel('teacher', a), 'teacher')).toBe(true)
    expect(labelRepeats(b, otLabel('teacher', a), 'trucker')).toBe(false)
  })
})
