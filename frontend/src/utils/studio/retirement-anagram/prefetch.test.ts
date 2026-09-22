import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { RetirementAnagramRequest } from '@/types/studio-retirement-anagram.types'

vi.mock('@/api/studio-retirement-anagram.api', () => ({
  generateRetirementAnagram: vi.fn(),
}))

import { generateRetirementAnagram } from '@/api/studio-retirement-anagram.api'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { clearStudioRecentContent } from '../studio-variety'
import { retirementAnagramPrefetch } from './prefetch'
import { retirementAnagramTemplate } from './generate'
import { MAX_CLUE_CHARS, RETIREMENT_ANAGRAM_AI_EMPTY_MESSAGE } from './content'
import { ANAGRAM_LEVELS, parseAnagramLevel } from './levels'
import { anagramFixtureResponse } from './fixture'

const generateMock = vi.mocked(generateRetirementAnagram)

const config = (overrides: Record<string, unknown> = {}) => ({
  ...buildDefaultConfig(retirementAnagramTemplate),
  seed: 42,
  ...overrides,
})

const ok = anagramFixtureResponse()

function requestAt(i: number): RetirementAnagramRequest {
  return generateMock.mock.calls[i]![0]
}

function lastRequest(): RetirementAnagramRequest {
  return generateMock.mock.calls.at(-1)![0]
}

describe('retirementAnagramPrefetch', () => {
  beforeEach(() => {
    generateMock.mockReset()
    clearStudioRecentContent()
  })

  it('asks for the level letter band and the printed clue budget', async () => {
    for (const level of ANAGRAM_LEVELS) {
      generateMock.mockReset()
      clearStudioRecentContent()
      generateMock.mockResolvedValue(ok)
      await retirementAnagramPrefetch(
        config({ level: level.id }),
        new AbortController().signal,
      )
      const req = lastRequest()
      expect(req.minLetters).toBe(level.minLetters)
      expect(req.maxLetters).toBe(level.maxLetters)
      expect(req.maxClueChars).toBe(MAX_CLUE_CHARS)
      // Over-requested: the dictionary gate in the browser drops some, and a
      // second paid call costs far more than a longer list.
      expect(req.count).toBeGreaterThan(level.targetItems)
    }
  })

  it('sends the chosen theme, and a typed one when the seller wrote it', async () => {
    generateMock.mockResolvedValue(ok)
    await retirementAnagramPrefetch(
      config({ theme: 'gardening' }),
      new AbortController().signal,
    )
    expect(lastRequest().theme.toLowerCase()).toContain('garden')

    generateMock.mockReset()
    generateMock.mockResolvedValue(ok)
    await retirementAnagramPrefetch(
      config({ theme: 'custom', customTheme: 'weekends by the canal' }),
      new AbortController().signal,
    )
    expect(lastRequest().theme).toBe('weekends by the canal')
  })

  it('returns words paired with the clue they were written for', async () => {
    generateMock.mockResolvedValue(ok)
    const remote = await retirementAnagramPrefetch(
      config(),
      new AbortController().signal,
    )
    const level = parseAnagramLevel(config())
    expect(remote.items.length).toBeGreaterThanOrEqual(level.targetItems)
    const byWord = new Map(ok.items.map((item) => [item.word, item.clue]))
    for (const item of remote.items) {
      expect(item.clue).toBe(byWord.get(item.word))
      expect(item.word.length).toBeGreaterThanOrEqual(level.minLetters)
      expect(item.word.length).toBeLessThanOrEqual(level.maxLetters)
    }
  })

  it('retries on a different seed, and does not ask twice for the same words', async () => {
    // Words the default level can actually use — a pool it would reject tests
    // the rejection path, not the retry.
    const short = { items: ok.items.filter((item) => item.word.length === 5).slice(0, 3) }
    generateMock.mockResolvedValueOnce(short).mockResolvedValueOnce(ok)

    await retirementAnagramPrefetch(config(), new AbortController().signal)

    expect(generateMock).toHaveBeenCalledTimes(2)
    expect(requestAt(1).seed).not.toBe(requestAt(0).seed)
    // Whatever the short first pass did yield is spent — asking for it again
    // would burn the retry on the same answer.
    expect(requestAt(1).avoid).toEqual(
      expect.arrayContaining(short.items.map((item) => item.word)),
    )
  })

  it('remembers what printed, so the next page is asked for something else', async () => {
    generateMock.mockResolvedValue(ok)
    // A fixed theme, because `mixed` rotates per seed and two pages of a book
    // land in different buckets on purpose.
    const themed = { theme: 'gardening' }
    const first = await retirementAnagramPrefetch(
      config(themed),
      new AbortController().signal,
    )
    await retirementAnagramPrefetch(
      config({ ...themed, seed: 43 }),
      new AbortController().signal,
    )

    const avoid = lastRequest().avoid ?? []
    expect(avoid).toEqual(expect.arrayContaining(first.items.map((item) => item.word)))
  })

  it('keeps each rotating theme in its own bucket', async () => {
    generateMock.mockResolvedValue(ok)
    const first = await retirementAnagramPrefetch(
      config(),
      new AbortController().signal,
    )
    await retirementAnagramPrefetch(config({ seed: 43 }), new AbortController().signal)

    // Different theme, different vocabulary: the second page is not told to
    // avoid words the first one printed about something else.
    if (requestAt(1).theme !== requestAt(0).theme) {
      expect(lastRequest().avoid ?? []).not.toEqual(
        expect.arrayContaining(first.items.map((item) => item.word)),
      )
    }
  })

  it('fails visibly rather than printing a short page', async () => {
    generateMock.mockResolvedValue({ items: ok.items.slice(0, 1) })
    await expect(
      retirementAnagramPrefetch(config(), new AbortController().signal),
    ).rejects.toThrow(RETIREMENT_ANAGRAM_AI_EMPTY_MESSAGE)
    expect(generateMock).toHaveBeenCalledTimes(3)
  })

  it('surfaces the service message when every attempt errored', async () => {
    generateMock.mockRejectedValue(new Error('Too many requests, try again shortly'))
    await expect(
      retirementAnagramPrefetch(config(), new AbortController().signal),
    ).rejects.toThrow('Too many requests, try again shortly')
  })

  it('gives up immediately when the seller cancelled', async () => {
    const controller = new AbortController()
    controller.abort()
    generateMock.mockRejectedValue(new Error('aborted'))
    await expect(
      retirementAnagramPrefetch(config(), controller.signal),
    ).rejects.toThrow('aborted')
    expect(generateMock).toHaveBeenCalledTimes(1)
  })
})
