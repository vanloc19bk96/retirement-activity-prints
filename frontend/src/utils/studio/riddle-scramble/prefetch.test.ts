import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { RiddleScrambleRequest } from '@/types/studio-riddle-scramble.types'

vi.mock('@/api/studio-riddle-scramble.api', () => ({
  generateRiddleScramble: vi.fn(),
}))

import { generateRiddleScramble } from '@/api/studio-riddle-scramble.api'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { clearStudioRecentContent } from '../studio-variety'
import { riddleScramblePrefetch } from './prefetch'
import { riddleScrambleTemplate } from './generate'
import {
  MAX_CLUE_CHARS,
  MAX_RIDDLE_CHARS,
  RIDDLE_SCRAMBLE_AI_EMPTY_MESSAGE,
} from './content'
import { RIDDLE_SCRAMBLE_LEVELS, parseRiddleScrambleLevel } from './levels'
import { riddleScrambleFixtureResponse } from './fixture'

const generateMock = vi.mocked(generateRiddleScramble)

const config = (overrides: Record<string, unknown> = {}) => ({
  ...buildDefaultConfig(riddleScrambleTemplate),
  seed: 42,
  ...overrides,
})

const ok = riddleScrambleFixtureResponse()

function requestAt(i: number): RiddleScrambleRequest {
  return generateMock.mock.calls[i]![0]
}

function lastRequest(): RiddleScrambleRequest {
  return generateMock.mock.calls.at(-1)![0]
}

describe('riddleScramblePrefetch', () => {
  beforeEach(() => {
    generateMock.mockReset()
    clearStudioRecentContent()
  })

  it('asks for the level answer length, letter band and printed budgets', async () => {
    for (const level of RIDDLE_SCRAMBLE_LEVELS) {
      generateMock.mockReset()
      clearStudioRecentContent()
      generateMock.mockResolvedValue(ok)
      await riddleScramblePrefetch(
        config({ level: level.id }),
        new AbortController().signal,
      )
      const req = lastRequest()
      expect(req.answerLetters).toBe(level.answerLetters)
      expect(req.minLetters).toBe(level.minLetters)
      expect(req.maxLetters).toBe(level.maxLetters)
      expect(req.maxClueChars).toBe(MAX_CLUE_CHARS)
      expect(req.maxRiddleChars).toBe(MAX_RIDDLE_CHARS)
      // Over-requested on both counts: the page needs one word per answer
      // letter that actually carries it, and a second paid call costs a page.
      expect(req.riddleCount).toBeGreaterThan(1)
      expect(req.wordCount).toBeGreaterThan(level.answerLetters * 3)
    }
  })

  it('sends the chosen theme, and a typed one when the seller wrote it', async () => {
    generateMock.mockResolvedValue(ok)
    await riddleScramblePrefetch(
      config({ theme: 'gardening' }),
      new AbortController().signal,
    )
    expect(lastRequest().theme.toLowerCase()).toContain('garden')

    generateMock.mockReset()
    generateMock.mockResolvedValue(ok)
    await riddleScramblePrefetch(
      config({ theme: 'custom', customTheme: 'weekends by the canal' }),
      new AbortController().signal,
    )
    expect(lastRequest().theme).toBe('weekends by the canal')
  })

  it('returns only riddles and words the level can print', async () => {
    generateMock.mockResolvedValue(ok)
    const remote = await riddleScramblePrefetch(config(), new AbortController().signal)
    const level = parseRiddleScrambleLevel(config())
    expect(remote.riddles.length).toBeGreaterThan(0)
    for (const riddle of remote.riddles) {
      expect(riddle.answer).toHaveLength(level.answerLetters)
    }
    const byWord = new Map(ok.words.map((entry) => [entry.word, entry.clue]))
    for (const word of remote.words) {
      expect(word.clue).toBe(byWord.get(word.word))
      expect(word.word.length).toBeGreaterThanOrEqual(level.minLetters)
      expect(word.word.length).toBeLessThanOrEqual(level.maxLetters)
    }
  })

  // The gates alone cannot tell a usable pool from an unusable one: these
  // words are all perfectly good and still spell none of the riddles, which
  // is a fault only the builder can see. Finding it here costs a retry;
  // finding it in generate costs the page.
  it('retries when the pool passes every gate but spells no riddle', async () => {
    const unspellable = {
      riddles: ok.riddles,
      words: ok.words.filter((entry) => entry.word.startsWith('S')),
    }
    generateMock.mockResolvedValueOnce(unspellable).mockResolvedValueOnce(ok)

    await riddleScramblePrefetch(config(), new AbortController().signal)

    expect(generateMock).toHaveBeenCalledTimes(2)
    expect(requestAt(1).seed).not.toBe(requestAt(0).seed)
  })

  it('remembers the riddle answer, so the next page is asked for another', async () => {
    generateMock.mockResolvedValue(ok)
    // A fixed theme, because `mixed` rotates per seed and two pages of a book
    // land in different buckets on purpose.
    const themed = { theme: 'gardening' }
    await riddleScramblePrefetch(config(themed), new AbortController().signal)
    await riddleScramblePrefetch(
      config({ ...themed, seed: 43 }),
      new AbortController().signal,
    )

    const avoid = lastRequest().avoid ?? []
    expect(avoid.length).toBeGreaterThan(0)
    // The classic level's first spellable answer — the thing a reader would
    // notice repeating three pages later.
    expect(avoid).toContain('PORCH')
  })

  it('fails visibly rather than printing a page it cannot spell', async () => {
    generateMock.mockResolvedValue({ riddles: ok.riddles, words: ok.words.slice(0, 2) })
    await expect(
      riddleScramblePrefetch(config(), new AbortController().signal),
    ).rejects.toThrow(RIDDLE_SCRAMBLE_AI_EMPTY_MESSAGE)
    expect(generateMock).toHaveBeenCalledTimes(3)
  })

  it('surfaces the service message when every attempt errored', async () => {
    generateMock.mockRejectedValue(new Error('Too many requests, try again shortly'))
    await expect(
      riddleScramblePrefetch(config(), new AbortController().signal),
    ).rejects.toThrow('Too many requests, try again shortly')
  })

  it('gives up immediately when the seller cancelled', async () => {
    const controller = new AbortController()
    controller.abort()
    generateMock.mockRejectedValue(new Error('aborted'))
    await expect(
      riddleScramblePrefetch(config(), controller.signal),
    ).rejects.toThrow('aborted')
    expect(generateMock).toHaveBeenCalledTimes(1)
  })
})
