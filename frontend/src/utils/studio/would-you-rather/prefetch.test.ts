import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WouldYouRatherRequest } from '@/types/studio-would-you-rather.types'
import type { StudioPrefetchContext } from '@/types/studio-template.types'

vi.mock('@/api/studio-would-you-rather.api', () => ({
  generateWouldYouRather: vi.fn(),
}))

import { generateWouldYouRather } from '@/api/studio-would-you-rather.api'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { clearStudioRecentContent } from '../studio-variety'
import { MAX_OPTION_CHARS, WYR_AI_EMPTY_MESSAGE, pairLabel } from './content'
import { WYR_FIXTURE, WYR_FIXTURE_ITEMS } from './fixture'
import { wouldYouRatherTemplate } from './generate'
import { WYR_REQUEST_COUNT, wouldYouRatherPrefetch } from './prefetch'

const generateMock = vi.mocked(generateWouldYouRather)
const signal = () => new AbortController().signal
const config = (overrides: Record<string, unknown> = {}) => ({
  ...buildDefaultConfig(wouldYouRatherTemplate),
  seed: 42,
  ...overrides,
})
const lastRequest = (): WouldYouRatherRequest => generateMock.mock.calls.at(-1)![0]
const book = (labels: string[]): StudioPrefetchContext => ({ bookContentLabels: () => labels })

describe('wouldYouRatherPrefetch', () => {
  beforeEach(() => {
    generateMock.mockReset()
    clearStudioRecentContent()
  })

  it('asks for the budget the page plans for, with spares, mixed by default', async () => {
    generateMock.mockResolvedValue(WYR_FIXTURE)
    await wouldYouRatherPrefetch(config(), signal())
    const req = lastRequest()
    expect(req.maxOptionChars).toBe(MAX_OPTION_CHARS)
    expect(req.count).toBe(WYR_REQUEST_COUNT)
    expect(req.mixedTopics).toBe(true)
    expect(req.style).toBe('balanced')
  })

  it('sends the chosen theme, the typed theme, and the tone', async () => {
    generateMock.mockResolvedValue(WYR_FIXTURE)
    await wouldYouRatherPrefetch(config({ theme: 'gardening', tone: 'playful' }), signal())
    expect(lastRequest().theme.toLowerCase()).toContain('garden')
    expect(lastRequest().mixedTopics).toBe(false)
    expect(lastRequest().style).toBe('playful')

    await wouldYouRatherPrefetch(config({ theme: 'custom', customTheme: 'summers at the lake' }), signal())
    expect(lastRequest().theme).toBe('summers at the lake')
  })

  it('returns only validated pairs', async () => {
    generateMock.mockResolvedValue({
      items: [
        WYR_FIXTURE_ITEMS[0]!,
        { optionA: 'sail', optionB: 'fly' },
        { optionA: 'visit the doctor', optionB: 'visit the dentist' },
        { optionA: 'Retire to the coast', optionB: 'Never retire to the coast' },
      ],
    })
    const result = await wouldYouRatherPrefetch(config(), signal())
    expect(result.items.map((i) => i.optionA)).toEqual([WYR_FIXTURE_ITEMS[0]!.optionA])
  })

  it('never returns a question the book already prints, and tells the service', async () => {
    generateMock.mockResolvedValue(WYR_FIXTURE)
    const printed = [pairLabel(WYR_FIXTURE_ITEMS[1]!)]
    const result = await wouldYouRatherPrefetch(config(), signal(), book(printed))
    expect(result.items.map((i) => i.optionA)).not.toContain(WYR_FIXTURE_ITEMS[1]!.optionA)
    expect(lastRequest().avoid!.some((label) => label.includes('piano'))).toBe(true)
    expect(lastRequest().avoid!.every((label) => label.length <= 60)).toBe(true)
  })

  it('checks the whole book whatever the theme', async () => {
    generateMock.mockResolvedValue(WYR_FIXTURE)
    const context = { bookContentLabels: vi.fn(() => [pairLabel(WYR_FIXTURE_ITEMS[0]!)]) }
    const result = await wouldYouRatherPrefetch(config({ theme: 'gardening' }), signal(), context)
    expect(context.bookContentLabels).toHaveBeenCalledWith('would-you-rather')
    expect(result.items.map((i) => i.optionA)).not.toContain(WYR_FIXTURE_ITEMS[0]!.optionA)
  })

  it('remembers what it printed, so the next page avoids it', async () => {
    generateMock.mockResolvedValue(WYR_FIXTURE)
    await wouldYouRatherPrefetch(config(), signal())
    await expect(wouldYouRatherPrefetch(config({ seed: 43 }), signal())).rejects.toThrow(
      WYR_AI_EMPTY_MESSAGE,
    )
    expect(lastRequest().avoid!.length).toBeGreaterThan(0)
  })

  it('tops up a short pool with a second call, then stops', async () => {
    generateMock
      .mockResolvedValueOnce({ items: WYR_FIXTURE_ITEMS.slice(0, 2) })
      .mockResolvedValueOnce({ items: WYR_FIXTURE_ITEMS.slice(2) })
    const result = await wouldYouRatherPrefetch(config(), signal())
    expect(generateMock).toHaveBeenCalledTimes(2)
    expect(result.items).toHaveLength(WYR_FIXTURE_ITEMS.length)
    // The second call is told what the first already kept.
    expect(lastRequest().avoid!.some((label) => label.includes('cottage'))).toBe(true)
  })

  it('does not retry a rate limit', async () => {
    generateMock.mockRejectedValue(new Error('Too many Would You Rather requests.'))
    await expect(wouldYouRatherPrefetch(config(), signal())).rejects.toThrow(/too many/i)
    expect(generateMock).toHaveBeenCalledTimes(1)
  })

  it('survives a malformed reply', async () => {
    generateMock.mockResolvedValue({ items: null } as never)
    await expect(wouldYouRatherPrefetch(config(), signal())).rejects.toThrow(WYR_AI_EMPTY_MESSAGE)
  })
})
