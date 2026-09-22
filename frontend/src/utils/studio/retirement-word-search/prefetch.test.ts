import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { FIXTURE_WORDS } from '../hidden-message-word-search/fixture'
import { WORD_SEARCH_BUILD_ERROR } from './content'

vi.mock('@/api/studio-word-search.api', () => ({
  generateWordSearchWords: vi.fn(),
}))

import { generateWordSearchWords } from '@/api/studio-word-search.api'
import { wordSearchTemplate } from './generate'
import { retirementWordSearchPrefetch } from './prefetch'

const generateMock = vi.mocked(generateWordSearchWords)

describe('retirementWordSearchPrefetch', () => {
  beforeEach(() => generateMock.mockReset())

  it('sends convention fields and retries with seed +97', async () => {
    generateMock
      .mockResolvedValueOnce({ words: ['TEA'] })
      .mockResolvedValueOnce({ words: FIXTURE_WORDS.slice(0, 30) })

    const config = {
      ...buildDefaultConfig(wordSearchTemplate),
      wordsFrom: 'ai-theme',
      theme: 'Retiring nurse',
      tone: 'funny',
      difficulty: 'easy',
      printStyle: 'standard',
      seed: 11,
      locale: 'en',
    }
    const result = await retirementWordSearchPrefetch(
      config,
      new AbortController().signal,
    )
    expect(result.words.length).toBe(30)
    expect(generateMock).toHaveBeenCalledTimes(2)
    expect(generateMock.mock.calls[0]![0]).toMatchObject({
      theme: 'Retiring nurse',
      tone: 'funny',
      difficulty: 'easy',
      printStyle: 'standard',
      seed: 11,
      locale: 'en',
      avoid: expect.any(Array),
    })
    expect(generateMock.mock.calls[1]![0].seed).toBe(108)
  })

  it('returns the final spec error after three unusable pools', async () => {
    generateMock.mockResolvedValue({ words: ['TEA'] })
    await expect(
      retirementWordSearchPrefetch(
        buildDefaultConfig(wordSearchTemplate),
        new AbortController().signal,
      ),
    ).rejects.toThrow(WORD_SEARCH_BUILD_ERROR)
    expect(generateMock).toHaveBeenCalledTimes(3)
  })
})
