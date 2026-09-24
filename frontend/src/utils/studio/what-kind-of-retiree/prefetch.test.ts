import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { RetireeQuizRequest } from '@/types/studio-retiree-quiz.types'

vi.mock('@/api/studio-retiree-quiz.api', () => ({
  generateRetireeQuiz: vi.fn(),
}))

import { generateRetireeQuiz } from '@/api/studio-retiree-quiz.api'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { clearStudioRecentContent } from '../studio-variety'
import {
  MAX_ANSWER_CHARS,
  MAX_DESCRIPTION_CHARS,
  MAX_QUESTION_CHARS,
  MIN_QUESTIONS,
  RQ_AI_EMPTY_MESSAGE,
  compactRqLabel,
} from './content'
import { RQ_FIXTURE, RQ_FIXTURE_QUESTIONS, RQ_FIXTURE_RESULTS } from './fixture'
import { retireeQuizTemplate } from './generate'
import { RQ_REQUEST_COUNT, retireeQuizPrefetch } from './prefetch'

const generateMock = vi.mocked(generateRetireeQuiz)
const signal = () => new AbortController().signal
const config = (overrides: Record<string, unknown> = {}) => ({
  ...buildDefaultConfig(retireeQuizTemplate),
  seed: 42,
  ...overrides,
})
const lastRequest = (): RetireeQuizRequest => generateMock.mock.calls.at(-1)![0]
const bookContext = (labels: string[]) => ({ bookContentLabels: () => labels })
const reply = (questions = RQ_FIXTURE_QUESTIONS, results = RQ_FIXTURE_RESULTS) => ({
  questions: questions.map((q) => ({ ...q })),
  results: { ...results },
})

describe('retireeQuizPrefetch', () => {
  beforeEach(() => {
    generateMock.mockReset()
    clearStudioRecentContent()
  })

  it('asks for the budgets the page plans for, with spares, on mixed topics by default', async () => {
    generateMock.mockResolvedValue(RQ_FIXTURE)
    await retireeQuizPrefetch(config(), signal())
    const req = lastRequest()
    expect(req.maxQuestionChars).toBe(MAX_QUESTION_CHARS)
    expect(req.maxAnswerChars).toBe(MAX_ANSWER_CHARS)
    expect(req.maxDescriptionChars).toBe(MAX_DESCRIPTION_CHARS)
    expect(req.count).toBe(RQ_REQUEST_COUNT)
    expect(req.mixedTopics).toBe(true)
  })

  it('sends a chosen or typed theme', async () => {
    generateMock.mockResolvedValue(RQ_FIXTURE)
    await retireeQuizPrefetch(config({ theme: 'custom', customTheme: 'life by the sea' }), signal())
    expect(lastRequest()).toMatchObject({ mixedTopics: false })
    expect(lastRequest().theme.toLowerCase()).toContain('life by the sea')
  })

  it('returns only style-checked, well-formed questions, never a repaired one', async () => {
    generateMock.mockResolvedValue(
      reply([
        ...RQ_FIXTURE_QUESTIONS.slice(0, 9),
        { ...RQ_FIXTURE_QUESTIONS[9]!, verified: false },
        { ...RQ_FIXTURE_QUESTIONS[10]!, napper: 'Be lazy all day' },
        { ...RQ_FIXTURE_QUESTIONS[11]!, question: 'Which gift would your grandkids choose?' },
      ]),
    )
    const remote = await retireeQuizPrefetch(config(), signal())
    expect(remote.questions.map((q) => q.question)).toEqual(RQ_FIXTURE_QUESTIONS.slice(0, 9).map((q) => q.question))
    expect(remote.questions.every((q) => q.verified)).toBe(true)
  })

  it('blanks a write-up that fails its gate, keeping the rest', async () => {
    generateMock.mockResolvedValue(reply(RQ_FIXTURE_QUESTIONS, { ...RQ_FIXTURE_RESULTS, napper: 'Lazy.' }))
    const remote = await retireeQuizPrefetch(config(), signal())
    expect(remote.results.napper).toBe('')
    expect(remote.results.explorer).toBe(RQ_FIXTURE_RESULTS.explorer)
  })

  it('never returns a question the book already prints, and tells the service about them', async () => {
    generateMock.mockResolvedValue(RQ_FIXTURE)
    const printed = RQ_FIXTURE_QUESTIONS[1]!.question
    const remote = await retireeQuizPrefetch(config(), signal(), bookContext([printed]))
    expect(remote.questions.map((q) => q.question)).not.toContain(printed)
    expect(lastRequest().avoid).toContain(compactRqLabel(printed))
  })

  it('asks again when the first reply is short, and merges both into one quiz', async () => {
    generateMock
      .mockResolvedValueOnce(reply(RQ_FIXTURE_QUESTIONS.slice(0, 5)))
      .mockResolvedValueOnce(reply(RQ_FIXTURE_QUESTIONS.slice(5)))
    const remote = await retireeQuizPrefetch(config(), signal())
    expect(generateMock).toHaveBeenCalledTimes(2)
    expect(remote.questions).toHaveLength(RQ_FIXTURE_QUESTIONS.length)
    // The second call is told what the first already wrote.
    expect(lastRequest().avoid).toContain(compactRqLabel(RQ_FIXTURE_QUESTIONS[0]!.question))
  })

  it('makes one call when the first reply is enough', async () => {
    generateMock.mockResolvedValue(RQ_FIXTURE)
    await retireeQuizPrefetch(config(), signal())
    expect(generateMock).toHaveBeenCalledTimes(1)
  })

  it('refuses a quiz shorter than the minimum rather than printing it', async () => {
    generateMock.mockResolvedValue(reply(RQ_FIXTURE_QUESTIONS.slice(0, MIN_QUESTIONS - 2)))
    await expect(retireeQuizPrefetch(config(), signal())).rejects.toThrow(RQ_AI_EMPTY_MESSAGE)
  })

  it('does not retry into a rate limit', async () => {
    generateMock.mockRejectedValue(new Error('Too many requests. Please wait a minute.'))
    await expect(retireeQuizPrefetch(config(), signal())).rejects.toThrow(/too many/i)
    expect(generateMock).toHaveBeenCalledTimes(1)
  })

  it('remembers what it printed, so the next quiz on the theme cannot repeat it', async () => {
    generateMock.mockResolvedValue(RQ_FIXTURE)
    await retireeQuizPrefetch(config(), signal())
    // The same reply again: every question now repeats the first quiz.
    await expect(retireeQuizPrefetch(config({ seed: 43 }), signal())).rejects.toThrow(RQ_AI_EMPTY_MESSAGE)
    expect(lastRequest().avoid).toContain(compactRqLabel(RQ_FIXTURE_QUESTIONS[0]!.question))
  })
})
