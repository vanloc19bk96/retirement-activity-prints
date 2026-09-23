import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PhraseFinderRequest } from '@/types/studio-phrase-finder.types'

vi.mock('@/api/studio-phrase-finder.api', () => ({
  generatePhraseFinder: vi.fn(),
}))

import { generatePhraseFinder } from '@/api/studio-phrase-finder.api'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { clearStudioRecentContent } from '../studio-variety'
import { MAX_CLUE_CHARS, PHRASE_FINDER_AI_EMPTY_MESSAGE } from './content'
import { phraseFinderFixtureResponse } from './fixture'
import { phraseFinderTemplate } from './generate'
import { PHRASE_FINDER_LEVELS } from './levels'
import { phraseFinderPrefetch } from './prefetch'

const generateMock = vi.mocked(generatePhraseFinder)

const config = (overrides: Record<string, unknown> = {}) => ({
  ...buildDefaultConfig(phraseFinderTemplate),
  seed: 42,
  ...overrides,
})

const ok = phraseFinderFixtureResponse()

function requestAt(i: number): PhraseFinderRequest {
  return generateMock.mock.calls[i]![0]
}

describe('phraseFinderPrefetch', () => {
  beforeEach(() => {
    generateMock.mockReset()
    clearStudioRecentContent()
  })

  it('asks for the level length band and enough candidates to discard', async () => {
    for (const level of PHRASE_FINDER_LEVELS) {
      generateMock.mockReset()
      clearStudioRecentContent()
      generateMock.mockResolvedValue(ok)
      await phraseFinderPrefetch(
        config({ level: level.id }),
        new AbortController().signal,
      )
      const req = requestAt(0)
      expect(req.length).toBe(level.length)
      expect(req.itemCount).toBe(level.targetPuzzles)
      // The clue budget is the width of the column it prints in, so it is the
      // page's number to send rather than the writer's to guess.
      expect(req.maxClueChars).toBe(MAX_CLUE_CHARS)
    }
  })

  it('sends the theme the seller picked, and a typed one when they wrote it', async () => {
    generateMock.mockResolvedValue(ok)
    await phraseFinderPrefetch(
      config({ theme: 'custom', customTheme: 'weekends in the garden' }),
      new AbortController().signal,
    )
    expect(requestAt(0).theme).toContain('weekends in the garden')
  })

  it('returns only the phrases the page could actually set', async () => {
    generateMock.mockResolvedValue({
      items: [
        { text: 'NO', clue: 'Far too short to print' },
        { text: 'TOO SHORT', clue: 'Still under the band' },
        ...ok.items,
      ],
    })
    const result = await phraseFinderPrefetch(
      config({ level: 'classic' }),
      new AbortController().signal,
    )
    expect(result.items.map((item) => item.text)).not.toContain('NO')
    expect(result.items.length).toBeGreaterThanOrEqual(3)
  })

  it('drops a saying that came back without a clue to solve it from', async () => {
    const unclued = ok.items.map((item) => ({ text: item.text, clue: '' }))
    generateMock.mockResolvedValueOnce({ items: unclued }).mockResolvedValue(ok)
    const result = await phraseFinderPrefetch(
      config({ level: 'classic' }),
      new AbortController().signal,
    )
    expect(generateMock).toHaveBeenCalledTimes(2)
    for (const item of result.items) expect(item.clue.length).toBeGreaterThan(0)
  })

  it('retries with what it already rejected on the avoid list', async () => {
    generateMock
      .mockResolvedValueOnce({
        items: [
          {
            text: 'THE BEST PART OF THE DAY IS THE ONE YOU DID NOT PLAN',
            clue: 'An hour nobody wrote in the diary',
          },
        ],
      })
      .mockResolvedValueOnce(ok)
    await phraseFinderPrefetch(
      config({ level: 'classic' }),
      new AbortController().signal,
    )
    expect(generateMock).toHaveBeenCalledTimes(2)
    expect(requestAt(1).avoid).toContain(
      'THE BEST PART OF THE DAY IS THE ONE YOU DID NOT PLAN',
    )
    // A fresh seed each attempt, so the model is not handed the same prompt.
    expect(requestAt(1).seed).not.toBe(requestAt(0).seed)
  })

  it('fails visibly rather than falling back to a packaged phrase list', async () => {
    generateMock.mockResolvedValue({ items: [] })
    await expect(
      phraseFinderPrefetch(config(), new AbortController().signal),
    ).rejects.toThrow(PHRASE_FINDER_AI_EMPTY_MESSAGE)
    expect(generateMock).toHaveBeenCalledTimes(3)
  })

  it('surfaces the service error when there is one to show', async () => {
    generateMock.mockRejectedValue(new Error('Phrase Finder generation failed (429)'))
    await expect(
      phraseFinderPrefetch(config(), new AbortController().signal),
    ).rejects.toThrow('429')
  })

  it('gives up immediately when the seller cancels', async () => {
    const controller = new AbortController()
    generateMock.mockImplementation(() => {
      controller.abort()
      return Promise.reject(new Error('aborted'))
    })
    await expect(
      phraseFinderPrefetch(config(), controller.signal),
    ).rejects.toThrow('aborted')
    expect(generateMock).toHaveBeenCalledTimes(1)
  })
})
