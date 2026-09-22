import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { HiddenMessageResponse } from '@/types/studio-hidden-message.types'
import { FIXTURE_MESSAGE, FIXTURE_WORDS } from './fixture'

vi.mock('@/api/studio-hidden-message.api', () => ({
  generateHiddenMessage: vi.fn(),
}))

import { generateHiddenMessage } from '@/api/studio-hidden-message.api'
import { hiddenMessagePrefetch } from './prefetch'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { hiddenMessageWordSearchTemplate } from './generate'
import { HIDDEN_MESSAGE_AI_EMPTY_MESSAGE } from './content'

const generateMock = vi.mocked(generateHiddenMessage)

describe('hiddenMessagePrefetch', () => {
  beforeEach(() => {
    generateMock.mockReset()
  })

  it('retries invalid JSON then a too-short pool, then succeeds', async () => {
    generateMock
      .mockRejectedValueOnce(new Error('invalid JSON'))
      .mockResolvedValueOnce({ message: FIXTURE_MESSAGE, words: ['TEA'] })
      .mockResolvedValueOnce({ message: FIXTURE_MESSAGE, words: FIXTURE_WORDS })

    const remote = await hiddenMessagePrefetch(
      {
        ...buildDefaultConfig(hiddenMessageWordSearchTemplate),
        seed: 42,
        wordsFrom: 'ai-theme',
        theme: 'Life after work',
        difficulty: 'easy',
      },
      new AbortController().signal,
    )
    expect(remote.words.length).toBeGreaterThanOrEqual(26)
    expect(generateMock).toHaveBeenCalledTimes(3)
  })

  it('throws a clear error after three failed attempts', async () => {
    generateMock.mockResolvedValue({
      message: 'HI',
      words: ['TEA'],
    } as HiddenMessageResponse)
    await expect(
      hiddenMessagePrefetch(
        {
          ...buildDefaultConfig(hiddenMessageWordSearchTemplate),
          seed: 1,
          wordsFrom: 'ai-theme',
          theme: 'Life after work',
        },
        new AbortController().signal,
      ),
    ).rejects.toThrow(HIDDEN_MESSAGE_AI_EMPTY_MESSAGE)
    expect(generateMock).toHaveBeenCalledTimes(3)
  })
})
