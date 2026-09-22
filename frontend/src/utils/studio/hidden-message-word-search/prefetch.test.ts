import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { HiddenMessageRequest } from '@/types/studio-hidden-message.types'

vi.mock('@/api/studio-hidden-message.api', () => ({
  generateHiddenMessage: vi.fn(),
}))

import { generateHiddenMessage } from '@/api/studio-hidden-message.api'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { clearStudioRecentContent } from '../studio-variety'
import { hiddenMessagePrefetch } from './prefetch'
import { hiddenMessageWordSearchTemplate } from './generate'
import { HIDDEN_MESSAGE_AI_EMPTY_MESSAGE } from './content'
import { HIDDEN_MESSAGE_LEVELS } from './levels'
import { FIXTURE_MESSAGE, FIXTURE_WORDS } from './fixture'

const generateMock = vi.mocked(generateHiddenMessage)

const config = (overrides: Record<string, unknown> = {}) => ({
  ...buildDefaultConfig(hiddenMessageWordSearchTemplate),
  seed: 42,
  ...overrides,
})

const ok = { message: FIXTURE_MESSAGE, words: FIXTURE_WORDS }

function lastRequest(): HiddenMessageRequest {
  return generateMock.mock.calls.at(-1)![0]
}

describe('hiddenMessagePrefetch', () => {
  beforeEach(() => {
    generateMock.mockReset()
    clearStudioRecentContent()
  })

  it('asks for both letter bands, so one paid call is enough', async () => {
    generateMock.mockResolvedValue(ok)
    await hiddenMessagePrefetch(config({ level: 'gentle' }), new AbortController().signal)

    const level = HIDDEN_MESSAGE_LEVELS.find((l) => l.id === 'gentle')!
    const req = lastRequest()
    expect(req.minLetters).toBe(level.minLetters)
    expect(req.maxLetters).toBe(level.maxLetters)
    expect(req.minMessageLetters).toBe(level.minMessageLetters)
    expect(req.maxMessageLetters).toBe(level.maxMessageLetters)
    // Over-requested: the packer needs spare words to land on an exact fill.
    expect(req.count).toBeGreaterThan(level.maxWords)
    expect(req.customMessage).toBeUndefined()
  })

  it('sends a typed message through for the writer to echo back', async () => {
    generateMock.mockResolvedValue({ message: 'IGNORED SAYING GOES HERE', words: FIXTURE_WORDS })
    const typed = 'Happy retirement Margaret'
    const remote = await hiddenMessagePrefetch(
      config({ customMessage: typed }),
      new AbortController().signal,
    )
    expect(lastRequest().customMessage).toBe(typed)
    expect(remote.message).toBe(typed)
  })

  it('picks the saying tone itself rather than asking the seller for one', async () => {
    generateMock.mockResolvedValue(ok)
    const tones = new Set<string>()
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      clearStudioRecentContent()
      await hiddenMessagePrefetch(config({ seed }), new AbortController().signal)
      tones.add(lastRequest().tone)
    }
    expect(tones.size).toBeGreaterThan(1)
    expect(tones.has('sassy')).toBe(false)
  })

  it('retries a broken call, then a short pool, then succeeds', async () => {
    generateMock
      .mockRejectedValueOnce(new Error('invalid JSON'))
      .mockResolvedValueOnce({ message: FIXTURE_MESSAGE, words: ['Tea'] })
      .mockResolvedValueOnce(ok)

    const remote = await hiddenMessagePrefetch(config(), new AbortController().signal)
    expect(remote.words.length).toBeGreaterThanOrEqual(24)
    expect(remote.message).toBe(FIXTURE_MESSAGE)
    expect(generateMock).toHaveBeenCalledTimes(3)
  })

  it('retries a saying outside the level band rather than printing it', async () => {
    generateMock
      .mockResolvedValueOnce({ message: 'TOO SHORT', words: FIXTURE_WORDS })
      .mockResolvedValueOnce(ok)

    const remote = await hiddenMessagePrefetch(config(), new AbortController().signal)
    expect(remote.message).toBe(FIXTURE_MESSAGE)
    expect(generateMock).toHaveBeenCalledTimes(2)
  })

  it('tells the next attempt what the last one already said', async () => {
    generateMock
      .mockResolvedValueOnce({ message: FIXTURE_MESSAGE, words: FIXTURE_WORDS.slice(0, 4) })
      .mockResolvedValueOnce(ok)

    await hiddenMessagePrefetch(config(), new AbortController().signal)
    expect(lastRequest().avoid).toEqual(expect.arrayContaining(['Garden']))
  })

  it('throws a clear error after three failed attempts', async () => {
    generateMock.mockResolvedValue({ message: 'HI', words: ['Tea'] })
    await expect(
      hiddenMessagePrefetch(config({ seed: 1 }), new AbortController().signal),
    ).rejects.toThrow(HIDDEN_MESSAGE_AI_EMPTY_MESSAGE)
    expect(generateMock).toHaveBeenCalledTimes(3)
  })
})
