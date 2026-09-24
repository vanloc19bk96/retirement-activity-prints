import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { FillInFunniesRequest } from '@/types/studio-fill-in-funnies.types'
import type { StudioPrefetchContext } from '@/types/studio-template.types'

vi.mock('@/api/studio-fill-in-funnies.api', () => ({
  generateFillInFunnies: vi.fn(),
}))

import { generateFillInFunnies } from '@/api/studio-fill-in-funnies.api'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { clearStudioRecentContent } from '../studio-variety'
import {
  FIF_AI_EMPTY_MESSAGE,
  FIF_MAX_BLANKS,
  FIF_MAX_WORDS,
  FIF_MIN_BLANKS,
  bookStoryLabel,
  compactStoryLabel,
  normalizeFifStory,
} from './content'
import { FIF_FIXTURE, FIF_FIXTURE_STORIES } from './fixture'
import { fillInFunniesTemplate } from './generate'
import { FIF_REQUEST_COUNT, fillInFunniesPrefetch } from './prefetch'

const generateMock = vi.mocked(generateFillInFunnies)
const signal = () => new AbortController().signal
const config = (overrides: Record<string, unknown> = {}) => ({
  ...buildDefaultConfig(fillInFunniesTemplate),
  seed: 42,
  ...overrides,
})
const lastRequest = (): FillInFunniesRequest => generateMock.mock.calls.at(-1)![0]
const book = (labels: string[]): StudioPrefetchContext => ({ bookContentLabels: () => labels })
const story = (index: number) => normalizeFifStory(FIF_FIXTURE_STORIES[index])!

describe('fillInFunniesPrefetch', () => {
  beforeEach(() => {
    generateMock.mockReset()
    clearStudioRecentContent()
  })

  it('asks for the budgets the page plans for, with spares, mixed by default', async () => {
    generateMock.mockResolvedValue(FIF_FIXTURE)
    await fillInFunniesPrefetch(config(), signal())
    const req = lastRequest()
    expect(req.count).toBe(FIF_REQUEST_COUNT)
    expect(req.minBlanks).toBe(FIF_MIN_BLANKS)
    expect(req.maxBlanks).toBe(FIF_MAX_BLANKS)
    expect(req.maxWords).toBe(FIF_MAX_WORDS)
    expect(req.mixedTopics).toBe(true)
  })

  it('sends the chosen theme and the typed theme', async () => {
    generateMock.mockResolvedValue(FIF_FIXTURE)
    await fillInFunniesPrefetch(config({ theme: 'gardening' }), signal())
    expect(lastRequest().theme.toLowerCase()).toContain('garden')
    expect(lastRequest().mixedTopics).toBe(false)

    clearStudioRecentContent()
    await fillInFunniesPrefetch(config({ theme: 'custom', customTheme: 'our first caravan trip' }), signal())
    expect(lastRequest().theme).toBe('our first caravan trip')
  })

  it('returns only validated, verified stories', async () => {
    generateMock.mockResolvedValue({
      stories: [
        { ...FIF_FIXTURE_STORIES[0]!, verified: false },
        { ...FIF_FIXTURE_STORIES[1]!, blanks: ['noun'] },
        FIF_FIXTURE_STORIES[2]!,
      ],
    })
    const res = await fillInFunniesPrefetch(config(), signal())
    expect(res.stories.map((s) => s.title)).toEqual([FIF_FIXTURE_STORIES[2]!.title])
    expect(res.stories[0]!.verified).toBe(true)
  })

  it('drops stories the book already prints and tells the service about them', async () => {
    generateMock.mockResolvedValue(FIF_FIXTURE)
    const res = await fillInFunniesPrefetch(config(), signal(), book([bookStoryLabel(story(0))]))
    expect(res.stories.map((s) => s.title)).not.toContain(FIF_FIXTURE_STORIES[0]!.title)
    expect(lastRequest().avoid).toContain(compactStoryLabel(story(0)))
  })

  it('remembers what it printed, so the next activity avoids it', async () => {
    generateMock.mockResolvedValue(FIF_FIXTURE)
    await fillInFunniesPrefetch(config(), signal())
    // The same reply again is all repeats of this seller's recent stories.
    await expect(fillInFunniesPrefetch(config(), signal())).rejects.toThrow(FIF_AI_EMPTY_MESSAGE)
    expect(lastRequest().avoid).toContain(compactStoryLabel(story(0)))
  })

  it('tries once more when nothing usable came back, then gives up with a clear message', async () => {
    generateMock.mockResolvedValue({ stories: [{ ...FIF_FIXTURE_STORIES[0]!, verified: false }] })
    await expect(fillInFunniesPrefetch(config(), signal())).rejects.toThrow(FIF_AI_EMPTY_MESSAGE)
    expect(generateMock).toHaveBeenCalledTimes(2)
    expect(lastRequest().seed).not.toBe(generateMock.mock.calls[0]![0].seed)
  })

  it('stops after one story is in hand', async () => {
    generateMock.mockResolvedValue({ stories: [FIF_FIXTURE_STORIES[1]!] })
    const res = await fillInFunniesPrefetch(config(), signal())
    expect(generateMock).toHaveBeenCalledTimes(1)
    expect(res.stories).toHaveLength(1)
  })

  it('does not retry a rate limit', async () => {
    generateMock.mockRejectedValue(new Error('Too many requests. Try again in a minute.'))
    await expect(fillInFunniesPrefetch(config(), signal())).rejects.toThrow(/too many/i)
    expect(generateMock).toHaveBeenCalledTimes(1)
  })
})
