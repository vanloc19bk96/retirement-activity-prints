import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { MissingVowelsRequest } from '@/types/studio-missing-vowels.types'

vi.mock('@/api/studio-missing-vowels.api', () => ({
  generateMissingVowels: vi.fn(),
}))

import { generateMissingVowels } from '@/api/studio-missing-vowels.api'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { clearStudioRecentContent } from '../studio-variety'
import { missingVowelsPrefetch } from './prefetch'
import { missingVowelsTemplate } from './generate'
import { MAX_CLUE_CHARS, MISSING_VOWELS_AI_EMPTY_MESSAGE } from './content'
import { MISSING_VOWELS_LEVELS } from './levels'
import { missingVowelsFixtureResponse } from './fixture'

const generateMock = vi.mocked(generateMissingVowels)

const config = (overrides: Record<string, unknown> = {}) => ({
  ...buildDefaultConfig(missingVowelsTemplate),
  seed: 42,
  ...overrides,
})

const ok = missingVowelsFixtureResponse()

function lastRequest(): MissingVowelsRequest {
  return generateMock.mock.calls.at(-1)![0]
}

describe('missingVowelsPrefetch', () => {
  beforeEach(() => {
    generateMock.mockReset()
    clearStudioRecentContent()
  })

  it('asks for the level band, its word limit and the printed clue budget', async () => {
    for (const level of MISSING_VOWELS_LEVELS) {
      generateMock.mockReset()
      clearStudioRecentContent()
      generateMock.mockResolvedValue(ok)
      await missingVowelsPrefetch(
        config({ level: level.id }),
        new AbortController().signal,
      )
      const req = lastRequest()
      expect(req.minLetters).toBe(level.minLetters)
      expect(req.maxLetters).toBe(level.maxLetters)
      expect(req.maxWords).toBe(level.maxWords)
      expect(req.maxClueChars).toBe(MAX_CLUE_CHARS)
      // Over-requested: the vowel-pattern gate in the browser drops some, and a
      // second paid call costs far more than a longer list.
      expect(req.count).toBeGreaterThan(level.targetItems)
    }
  })

  it('sends the chosen theme, and a typed one when the seller wrote it', async () => {
    generateMock.mockResolvedValue(ok)
    await missingVowelsPrefetch(config({ theme: 'gardening' }), new AbortController().signal)
    expect(lastRequest().theme.toLowerCase()).toContain('garden')

    generateMock.mockReset()
    generateMock.mockResolvedValue(ok)
    await missingVowelsPrefetch(
      config({ theme: 'custom', customTheme: 'weekends by the canal' }),
      new AbortController().signal,
    )
    expect(lastRequest().theme).toBe('weekends by the canal')
  })

  it('returns answers paired with the clue they were written for', async () => {
    generateMock.mockResolvedValue(ok)
    const remote = await missingVowelsPrefetch(config(), new AbortController().signal)
    expect(remote.items.length).toBeGreaterThan(0)
    for (const item of remote.items) {
      expect(item.answer).toMatch(/^[A-Z]+(?: [A-Z]+)*$/)
      expect(item.clue.length).toBeGreaterThanOrEqual(8)
      expect(item.clue.length).toBeLessThanOrEqual(MAX_CLUE_CHARS)
    }
  })

  it('retries with what it already rejected, then gives up in words', async () => {
    generateMock.mockResolvedValue({ items: [{ answer: 'PICNIC', clue: 'Lunch in the park' }] })
    await expect(
      missingVowelsPrefetch(config(), new AbortController().signal),
    ).rejects.toThrow(MISSING_VOWELS_AI_EMPTY_MESSAGE)
    expect(generateMock).toHaveBeenCalledTimes(3)
    // The second call is told not to send back what the first one wasted.
    expect(generateMock.mock.calls[1]![0].avoid).toContain('PICNIC')
  })

  it("surfaces the service's own message rather than a generic one", async () => {
    generateMock.mockRejectedValue(new Error('Too many requests. Try again in a minute.'))
    await expect(
      missingVowelsPrefetch(config(), new AbortController().signal),
    ).rejects.toThrow('Too many requests')
  })

  it('rotates a different theme per page when the seller asked for mixed', async () => {
    const themes = new Set<string>()
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      generateMock.mockReset()
      clearStudioRecentContent()
      generateMock.mockResolvedValue(ok)
      await missingVowelsPrefetch(
        config({ theme: 'mixed', seed }),
        new AbortController().signal,
      )
      themes.add(lastRequest().theme)
    }
    expect(themes.size).toBeGreaterThan(1)
  })
})
