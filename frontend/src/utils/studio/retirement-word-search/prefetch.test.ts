import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { clearStudioRecentContent } from '../studio-variety'
import { RETIREMENT_THEME_CUSTOM } from '../_shared/retirement-theme-config'
import { WORD_SEARCH_AI_EMPTY_MESSAGE } from './content'
import { WORD_SEARCH_FIXTURE_POOL } from './fixture'

vi.mock('@/api/studio-word-search.api', () => ({
  generateWordSearchWords: vi.fn(),
}))

import { generateWordSearchWords } from '@/api/studio-word-search.api'
import { wordSearchTemplate } from './generate'
import { wordSearchPrefetch } from './prefetch'

const generateMock = vi.mocked(generateWordSearchWords)

const signal = () => new AbortController().signal

describe('wordSearchPrefetch', () => {
  beforeEach(() => {
    generateMock.mockReset()
    clearStudioRecentContent()
  })

  it('asks for the level’s letter band and retries with seed + 97', async () => {
    generateMock
      .mockResolvedValueOnce({ words: ['Tea', 'Nap'] })
      .mockResolvedValueOnce({ words: WORD_SEARCH_FIXTURE_POOL })

    const result = await wordSearchPrefetch(
      {
        ...buildDefaultConfig(wordSearchTemplate),
        theme: RETIREMENT_THEME_CUSTOM,
        customTheme: 'Retiring nurse',
        level: 'gentle',
        seed: 11,
        locale: 'en',
      },
      signal(),
    )

    expect(result.words.length).toBeGreaterThanOrEqual(10)
    expect(generateMock).toHaveBeenCalledTimes(2)
    expect(generateMock.mock.calls[0]![0]).toMatchObject({
      theme: 'Retiring nurse',
      minLetters: 4,
      maxLetters: 7,
      seed: 11,
      locale: 'en',
      avoid: expect.any(Array),
    })
    expect(generateMock.mock.calls[1]![0].seed).toBe(108)
    // Every entry is inside the band it asked for.
    for (const word of result.words) {
      const letters = word.replace(/[^A-Za-z]/g, '')
      expect(letters.length).toBeGreaterThanOrEqual(4)
      expect(letters.length).toBeLessThanOrEqual(7)
    }
  })

  it('tells the retry not to repeat the words the first attempt already used', async () => {
    generateMock
      .mockResolvedValueOnce({ words: ['Garden', 'Travel'] })
      .mockResolvedValueOnce({ words: WORD_SEARCH_FIXTURE_POOL })

    await wordSearchPrefetch(
      { ...buildDefaultConfig(wordSearchTemplate), seed: 3 },
      signal(),
    )
    expect(generateMock.mock.calls[1]![0].avoid).toEqual(
      expect.arrayContaining(['Garden', 'Travel']),
    )
  })

  it('gives up with the spec message after three unusable pools', async () => {
    generateMock.mockResolvedValue({ words: ['Tea'] })
    await expect(
      wordSearchPrefetch(
        { ...buildDefaultConfig(wordSearchTemplate), seed: 5 },
        signal(),
      ),
    ).rejects.toThrow(WORD_SEARCH_AI_EMPTY_MESSAGE)
    expect(generateMock).toHaveBeenCalledTimes(3)
  })

  it('surfaces the service’s own message when the call itself failed', async () => {
    generateMock.mockRejectedValue(new Error('Too many requests. Try again shortly.'))
    await expect(
      wordSearchPrefetch(
        { ...buildDefaultConfig(wordSearchTemplate), seed: 5 },
        signal(),
      ),
    ).rejects.toThrow('Too many requests')
  })
})
