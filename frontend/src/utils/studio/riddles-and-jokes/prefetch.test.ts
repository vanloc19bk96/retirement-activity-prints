import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { RiddlesJokesRequest } from '@/types/studio-riddles-jokes.types'

vi.mock('@/api/studio-riddles-jokes.api', () => ({
  generateRiddlesJokes: vi.fn(),
}))

import { generateRiddlesJokes } from '@/api/studio-riddles-jokes.api'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { clearStudioRecentContent } from '../studio-variety'
import { MAX_ANSWER_CHARS, MAX_SETUP_CHARS, RJ_AI_EMPTY_MESSAGE, compactRjLabel } from './content'
import { RJ_FIXTURE, RJ_FIXTURE_ITEMS } from './fixture'
import { riddlesJokesTemplate } from './generate'
import { RJ_REQUEST_COUNT, riddlesJokesPrefetch } from './prefetch'

const generateMock = vi.mocked(generateRiddlesJokes)
const signal = () => new AbortController().signal
const config = (overrides: Record<string, unknown> = {}) => ({
  ...buildDefaultConfig(riddlesJokesTemplate),
  seed: 42,
  ...overrides,
})
const lastRequest = (): RiddlesJokesRequest => generateMock.mock.calls.at(-1)![0]
const bookContext = (labels: string[]) => ({ bookContentLabels: () => labels })

describe('riddlesJokesPrefetch', () => {
  beforeEach(() => {
    generateMock.mockReset()
    clearStudioRecentContent()
  })

  it('asks for the budgets the page plans for, with spares', async () => {
    generateMock.mockResolvedValue(RJ_FIXTURE)
    await riddlesJokesPrefetch(config(), signal())
    const req = lastRequest()
    expect(req.maxSetupChars).toBe(MAX_SETUP_CHARS)
    expect(req.maxAnswerChars).toBe(MAX_ANSWER_CHARS)
    expect(req.count).toBe(RJ_REQUEST_COUNT)
    expect(req).toMatchObject({ mixedTopics: true, mix: 'both' })
  })

  it('sends the chosen mix and theme, or the theme the seller typed', async () => {
    generateMock.mockResolvedValue(RJ_FIXTURE)
    await riddlesJokesPrefetch(config({ mix: 'riddles', theme: 'custom', customTheme: 'life on the allotment' }), signal())
    expect(lastRequest()).toMatchObject({ mix: 'riddles', mixedTopics: false, theme: 'life on the allotment' })
  })

  it('returns only checked, well-formed items of the asked-for kind, never a repaired one', async () => {
    generateMock.mockResolvedValue({
      items: [
        RJ_FIXTURE_ITEMS[0]!,
        { ...RJ_FIXTURE_ITEMS[2]!, verified: false },
        { ...RJ_FIXTURE_ITEMS[4]!, answer: '' },
        { ...RJ_FIXTURE_ITEMS[6]!, setup: 'What did the retiree forget at the party?' },
        RJ_FIXTURE_ITEMS[1]!,
      ],
    })
    const remote = await riddlesJokesPrefetch(config({ mix: 'riddles' }), signal())
    expect(remote.items.map((item) => item.setup)).toEqual([RJ_FIXTURE_ITEMS[0]!.setup])
    expect(remote.items.every((item) => item.verified)).toBe(true)
  })

  it('never returns an item the book already prints, and tells the service what to avoid', async () => {
    generateMock.mockResolvedValue(RJ_FIXTURE)
    const printed = [RJ_FIXTURE_ITEMS[0]!.setup, RJ_FIXTURE_ITEMS[3]!.answer]
    const remote = await riddlesJokesPrefetch(config(), signal(), bookContext(printed))
    const setups = remote.items.map((item) => item.setup)
    expect(setups).not.toContain(RJ_FIXTURE_ITEMS[0]!.setup)
    expect(setups).not.toContain(RJ_FIXTURE_ITEMS[3]!.setup)
    // Sent compact: content words only, which is what the service compares.
    expect(lastRequest().avoid).toContain(compactRjLabel(RJ_FIXTURE_ITEMS[0]!.setup))
  })

  it('remembers printed items and never returns them again', async () => {
    generateMock.mockResolvedValue(RJ_FIXTURE)
    const first = await riddlesJokesPrefetch(config({ theme: 'mixed' }), signal())
    expect(first.items.length).toBeGreaterThan(0)

    // The model ignores the avoid list and repeats itself: nothing new survives.
    await expect(riddlesJokesPrefetch(config({ theme: 'mixed', seed: 43 }), signal())).rejects.toThrow(
      RJ_AI_EMPTY_MESSAGE,
    )
    expect(lastRequest().avoid).toEqual(expect.arrayContaining([compactRjLabel(first.items[0]!.setup)]))
  })

  it('tops up across a second call when the first leaves the page short', async () => {
    generateMock
      .mockResolvedValueOnce({ items: RJ_FIXTURE_ITEMS.slice(0, 2) })
      .mockResolvedValueOnce(RJ_FIXTURE)
    const remote = await riddlesJokesPrefetch(config(), signal())
    expect(generateMock).toHaveBeenCalledTimes(2)
    const setups = remote.items.map((item) => item.setup)
    expect(new Set(setups).size).toBe(setups.length)
    expect(setups).toHaveLength(RJ_FIXTURE_ITEMS.length)
  })

  it('recovers when the first call fails', async () => {
    generateMock
      .mockRejectedValueOnce(new Error('Riddles & Jokes failed (502)'))
      .mockResolvedValueOnce(RJ_FIXTURE)
    const remote = await riddlesJokesPrefetch(config(), signal())
    expect(remote.items.length).toBeGreaterThan(0)
    expect(generateMock).toHaveBeenCalledTimes(2)
  })

  it('does not retry a rate limit', async () => {
    generateMock.mockRejectedValue(new Error('Too many Riddles & Jokes requests. Please wait a minute and try again.'))
    await expect(riddlesJokesPrefetch(config(), signal())).rejects.toThrow(/Too many/)
    expect(generateMock).toHaveBeenCalledTimes(1)
  })

  it('stops at once when the run is cancelled', async () => {
    const controller = new AbortController()
    generateMock.mockImplementation(async () => {
      controller.abort()
      throw new DOMException('Aborted', 'AbortError')
    })
    await expect(riddlesJokesPrefetch(config(), controller.signal)).rejects.toThrow()
    expect(generateMock).toHaveBeenCalledTimes(1)
  })
})
