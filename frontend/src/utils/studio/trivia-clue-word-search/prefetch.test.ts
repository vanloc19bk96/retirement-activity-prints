import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { TriviaCluesRequest } from '@/types/studio-trivia-clues.types'

vi.mock('@/api/studio-trivia-clues.api', () => ({
  generateTriviaClues: vi.fn(),
}))

import { generateTriviaClues } from '@/api/studio-trivia-clues.api'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { clearStudioRecentContent } from '../studio-variety'
import { triviaCluesPrefetch } from './prefetch'
import { triviaClueWordSearchTemplate } from './generate'
import { TRIVIA_AI_EMPTY_MESSAGE } from './content'
import { TRIVIA_LEVELS } from './levels'
import { TRIVIA_FIXTURE, TRIVIA_FIXTURE_ITEMS } from './fixture'

const generateMock = vi.mocked(generateTriviaClues)

const config = (overrides: Record<string, unknown> = {}) => ({
  ...buildDefaultConfig(triviaClueWordSearchTemplate),
  seed: 42,
  ...overrides,
})

function lastRequest(): TriviaCluesRequest {
  return generateMock.mock.calls.at(-1)![0]
}

describe('triviaCluesPrefetch', () => {
  beforeEach(() => {
    generateMock.mockReset()
    clearStudioRecentContent()
  })

  it('asks for the level’s bands, so one paid call is enough', async () => {
    generateMock.mockResolvedValue(TRIVIA_FIXTURE)
    await triviaCluesPrefetch(config({ level: 'gentle' }), new AbortController().signal)

    const level = TRIVIA_LEVELS.find((l) => l.id === 'gentle')!
    const req = lastRequest()
    expect(req.minLetters).toBe(level.minLetters)
    expect(req.maxLetters).toBe(level.maxLetters)
    expect(req.maxClueChars).toBe(level.clueMaxChars)
    expect(req.difficulty).toBe(level.apiDifficulty)
    // Over-requested: the gates drop pairs, and the placer needs spares.
    expect(req.count).toBeGreaterThan(level.targetClues)
  })

  it('returns only pairs a page could print', async () => {
    generateMock.mockResolvedValue({
      items: [
        ...TRIVIA_FIXTURE_ITEMS,
        // A phrase, not a single word — the grid prints one unbroken run.
        { answer: 'ROAD TRIP', clue: 'A holiday taken by car' },
        // A palindrome reads both ways, so the key can only circle one of two.
        { answer: 'LEVEL', clue: 'Flat and even, like good ground' },
        // The clue hands over its own answer.
        { answer: 'SUPPER', clue: 'The supper eaten late in the day' },
      ],
    })
    const remote = await triviaCluesPrefetch(config(), new AbortController().signal)
    const answers = remote.items.map((item) => item.answer)
    expect(answers).not.toContain('ROAD TRIP')
    expect(answers).not.toContain('LEVEL')
    expect(answers).not.toContain('SUPPER')
    expect(answers.length).toBeGreaterThan(0)
  })

  it('tells the next attempt not to repeat a pool that came back short', async () => {
    generateMock
      .mockResolvedValueOnce({ items: TRIVIA_FIXTURE_ITEMS.slice(0, 3) })
      .mockResolvedValueOnce(TRIVIA_FIXTURE)
    const remote = await triviaCluesPrefetch(config(), new AbortController().signal)

    expect(generateMock).toHaveBeenCalledTimes(2)
    expect(lastRequest().avoid).toEqual(
      expect.arrayContaining([TRIVIA_FIXTURE_ITEMS[0]!.answer]),
    )
    expect(remote.items.length).toBeGreaterThan(3)
  })

  it('fails visibly rather than printing a thin page', async () => {
    generateMock.mockResolvedValue({ items: TRIVIA_FIXTURE_ITEMS.slice(0, 2) })
    await expect(
      triviaCluesPrefetch(config(), new AbortController().signal),
    ).rejects.toThrow(TRIVIA_AI_EMPTY_MESSAGE)
  })

  it('surfaces the service’s own message when the call fails', async () => {
    generateMock.mockRejectedValue(new Error('Too many requests. Try again in a minute.'))
    await expect(
      triviaCluesPrefetch(config(), new AbortController().signal),
    ).rejects.toThrow('Too many requests')
  })

  it('stops immediately when the run is cancelled', async () => {
    const controller = new AbortController()
    controller.abort()
    generateMock.mockRejectedValue(new Error('aborted'))
    await expect(triviaCluesPrefetch(config(), controller.signal)).rejects.toThrow()
    expect(generateMock).toHaveBeenCalledTimes(1)
  })

  it('remembers what it printed, so the next page asks for something else', async () => {
    generateMock.mockResolvedValue(TRIVIA_FIXTURE)
    await triviaCluesPrefetch(config({ theme: 'gardening' }), new AbortController().signal)
    generateMock.mockClear()
    generateMock.mockResolvedValue(TRIVIA_FIXTURE)
    await triviaCluesPrefetch(config({ theme: 'gardening' }), new AbortController().signal)
    expect(lastRequest().avoid?.length ?? 0).toBeGreaterThan(0)
  })
})
