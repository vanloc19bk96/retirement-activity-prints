import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { TopFiveGuessRequest } from '@/types/studio-top-five-guess.types'

vi.mock('@/api/studio-top-five-guess.api', () => ({
  generateTopFiveGuess: vi.fn(),
}))

import { generateTopFiveGuess } from '@/api/studio-top-five-guess.api'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { clearStudioRecentContent } from '../studio-variety'
import { MAX_ANSWER_CHARS, MAX_QUESTION_CHARS, TOP_FIVE_AI_EMPTY_MESSAGE } from './content'
import { TOP_FIVE_FIXTURE, TOP_FIVE_FIXTURE_ITEMS } from './fixture'
import { topFiveGuessTemplate } from './generate'
import { TOP_FIVE_REQUEST_COUNT, topFiveGuessPrefetch } from './prefetch'

const generateMock = vi.mocked(generateTopFiveGuess)
const signal = () => new AbortController().signal
const config = (overrides: Record<string, unknown> = {}) => ({
  ...buildDefaultConfig(topFiveGuessTemplate),
  seed: 42,
  ...overrides,
})
const lastRequest = (): TopFiveGuessRequest => generateMock.mock.calls.at(-1)![0]

describe('topFiveGuessPrefetch', () => {
  beforeEach(() => {
    generateMock.mockReset()
    clearStudioRecentContent()
  })

  it('asks for the budgets the page plans for, with spares', async () => {
    generateMock.mockResolvedValue(TOP_FIVE_FIXTURE)
    await topFiveGuessPrefetch(config(), signal())
    const req = lastRequest()
    expect(req.maxQuestionChars).toBe(MAX_QUESTION_CHARS)
    expect(req.maxAnswerChars).toBe(MAX_ANSWER_CHARS)
    expect(req.count).toBe(TOP_FIVE_REQUEST_COUNT)
  })

  it('sends the chosen theme, or the one the seller typed', async () => {
    generateMock.mockResolvedValue(TOP_FIVE_FIXTURE)
    await topFiveGuessPrefetch(config({ theme: 'gardening' }), signal())
    expect(lastRequest().theme.toLowerCase()).toContain('garden')

    await topFiveGuessPrefetch(
      config({ theme: 'custom', customTheme: 'weekends at the lake' }),
      signal(),
    )
    expect(lastRequest().theme).toBe('weekends at the lake')
  })

  it('returns only validated sets, never a repaired one', async () => {
    generateMock.mockResolvedValue({
      items: [
        TOP_FIVE_FIXTURE_ITEMS[0]!,
        { question: 'Name a hobby you enjoy.', answers: ['Golf'] },
        {
          question: 'Name something you will never miss about work.',
          answers: ['Meetings', 'Long meetings', 'Emails', 'Deadlines', 'Commute'],
        },
        { question: 'We asked 100 people to name a hobby.', answers: ['A', 'B', 'C', 'D', 'E'] },
      ],
    })
    const remote = await topFiveGuessPrefetch(config(), signal())
    expect(remote.items).toEqual([TOP_FIVE_FIXTURE_ITEMS[0]])
  })

  it('remembers printed questions and never returns them again', async () => {
    generateMock.mockResolvedValue(TOP_FIVE_FIXTURE)
    const first = await topFiveGuessPrefetch(config({ theme: 'gardening' }), signal())
    expect(first.items.length).toBeGreaterThan(0)

    const printed = first.items.map((item) => item.question)

    // The model ignores the avoid list and repeats itself: only new sets survive.
    const second = await topFiveGuessPrefetch(config({ theme: 'gardening' }), signal())
    // The history store keeps labels without their closing punctuation.
    expect(lastRequest().avoid).toEqual(
      expect.arrayContaining(printed.map((question) => question.replace(/[.?]$/, ''))),
    )
    expect(second.items.length).toBeGreaterThan(0)
    for (const item of second.items) expect(printed).not.toContain(item.question)

    // Once everything it offers has been printed, the page says so instead.
    await expect(topFiveGuessPrefetch(config({ theme: 'gardening' }), signal())).rejects.toThrow(
      TOP_FIVE_AI_EMPTY_MESSAGE,
    )
  })

  it('retries once when a reply is unusable, then fails clearly', async () => {
    generateMock.mockResolvedValue({ items: [{ question: 'Nope', answers: [] }] })
    await expect(topFiveGuessPrefetch(config(), signal())).rejects.toThrow(
      TOP_FIVE_AI_EMPTY_MESSAGE,
    )
    expect(generateMock).toHaveBeenCalledTimes(2)
  })

  it('recovers when the first call fails', async () => {
    generateMock
      .mockRejectedValueOnce(new Error('Top Five Guess failed (502)'))
      .mockResolvedValueOnce(TOP_FIVE_FIXTURE)
    const remote = await topFiveGuessPrefetch(config(), signal())
    expect(remote.items.length).toBeGreaterThan(0)
    expect(generateMock).toHaveBeenCalledTimes(2)
  })

  it('does not retry a rate limit', async () => {
    generateMock.mockRejectedValue(
      new Error('Too many Top Five Guess requests. Please wait a minute and try again.'),
    )
    await expect(topFiveGuessPrefetch(config(), signal())).rejects.toThrow(/Too many/)
    expect(generateMock).toHaveBeenCalledTimes(1)
  })

  it('stops at once when the run is cancelled', async () => {
    const controller = new AbortController()
    generateMock.mockImplementation(async () => {
      controller.abort()
      throw new DOMException('Aborted', 'AbortError')
    })
    await expect(topFiveGuessPrefetch(config(), controller.signal)).rejects.toThrow()
    expect(generateMock).toHaveBeenCalledTimes(1)
  })
})
