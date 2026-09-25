import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { OccupationTriviaRequest } from '@/types/studio-occupation-trivia.types'

vi.mock('@/api/studio-occupation-trivia.api', () => ({
  generateOccupationTrivia: vi.fn(),
}))

import { generateOccupationTrivia } from '@/api/studio-occupation-trivia.api'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { clearStudioRecentContent } from '../studio-variety'
import {
  MAX_CHOICE_CHARS,
  MAX_EXPLANATION_CHARS,
  MAX_QUESTION_CHARS,
  OT_AI_EMPTY_MESSAGE,
  otLabel,
} from './content'
import { OT_FIXTURE, OT_FIXTURE_QUESTIONS } from './fixture'
import { occupationTriviaTemplate } from './generate'
import { OT_REQUEST_COUNT, occupationTriviaPrefetch } from './prefetch'

const generateMock = vi.mocked(generateOccupationTrivia)
const signal = () => new AbortController().signal
const config = (overrides: Record<string, unknown> = {}) => ({
  ...buildDefaultConfig(occupationTriviaTemplate),
  seed: 42,
  ...overrides,
})
const lastRequest = (): OccupationTriviaRequest => generateMock.mock.calls.at(-1)![0]
const bookContext = (labels: string[]) => ({ bookContentLabels: () => labels })

describe('occupationTriviaPrefetch', () => {
  beforeEach(() => {
    generateMock.mockReset()
    clearStudioRecentContent()
  })

  it('asks for the occupation, the level, the page budgets and a few spares', async () => {
    generateMock.mockResolvedValue(OT_FIXTURE)
    await occupationTriviaPrefetch(config({ level: 'gentle' }), signal())
    expect(lastRequest()).toMatchObject({
      occupation: 'teacher',
      level: 'gentle',
      count: OT_REQUEST_COUNT,
      maxQuestionChars: MAX_QUESTION_CHARS,
      maxChoiceChars: MAX_CHOICE_CHARS,
      maxExplanationChars: MAX_EXPLANATION_CHARS,
    })
  })

  it('returns only checked, well-formed questions, never a repaired one', async () => {
    generateMock.mockResolvedValue({
      occupation: 'teacher',
      questions: [
        ...OT_FIXTURE.questions.slice(0, 9),
        { ...OT_FIXTURE.questions[9]!, verified: false },
        { ...OT_FIXTURE.questions[10]!, distractors: ['Only one'] },
      ],
    })
    const remote = await occupationTriviaPrefetch(config(), signal())
    expect(remote.questions.map((q) => q.question)).toEqual(OT_FIXTURE_QUESTIONS.slice(0, 9).map((q) => q.question))
    expect(remote.questions.every((q) => q.verified)).toBe(true)
  })

  it('never returns a fact this pack’s occupation already printed in the book, and says so to the service', async () => {
    generateMock.mockResolvedValue(OT_FIXTURE)
    const printed = [otLabel('teacher', OT_FIXTURE_QUESTIONS[0]!), otLabel('trucker', OT_FIXTURE_QUESTIONS[1]!)]
    const remote = await occupationTriviaPrefetch(config(), signal(), bookContext(printed))
    const questions = remote.questions.map((q) => q.question)
    expect(questions).not.toContain(OT_FIXTURE_QUESTIONS[0]!.question)
    // Another occupation's label never rules a question out.
    expect(questions).toContain(OT_FIXTURE_QUESTIONS[1]!.question)
    expect(lastRequest().avoid).toContain(printed[0])
    expect(lastRequest().avoid).not.toContain(printed[1])
  })

  it('tops up a short reply with a second call, keeping each fact once', async () => {
    generateMock
      .mockResolvedValueOnce({ occupation: 'teacher', questions: OT_FIXTURE.questions.slice(0, 6) })
      .mockResolvedValueOnce({ occupation: 'teacher', questions: OT_FIXTURE.questions.slice(3) })
    const remote = await occupationTriviaPrefetch(config(), signal())
    expect(generateMock).toHaveBeenCalledTimes(2)
    expect(remote.questions).toHaveLength(OT_FIXTURE_QUESTIONS.length)
    expect(new Set(remote.questions.map((q) => q.question)).size).toBe(OT_FIXTURE_QUESTIONS.length)
  })

  it('refuses a reply written for another occupation', async () => {
    generateMock.mockResolvedValue({ ...OT_FIXTURE, occupation: 'postal' })
    await expect(occupationTriviaPrefetch(config(), signal())).rejects.toThrow(OT_AI_EMPTY_MESSAGE)
  })

  it('does not retry a rate limit', async () => {
    generateMock.mockRejectedValue(new Error('Too many requests. Please wait a minute.'))
    await expect(occupationTriviaPrefetch(config(), signal())).rejects.toThrow(/too many/i)
    expect(generateMock).toHaveBeenCalledTimes(1)
  })
})
