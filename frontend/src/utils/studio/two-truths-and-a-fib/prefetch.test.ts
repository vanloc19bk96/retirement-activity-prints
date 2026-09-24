import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { TwoTruthsFibRequest } from '@/types/studio-two-truths-fib.types'

vi.mock('@/api/studio-two-truths-fib.api', () => ({
  generateTwoTruthsFib: vi.fn(),
}))

import { generateTwoTruthsFib } from '@/api/studio-two-truths-fib.api'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { clearStudioRecentContent } from '../studio-variety'
import {
  MAX_FACT_CHARS,
  MAX_STATEMENT_CHARS,
  MAX_TITLE_CHARS,
  TTF_AI_EMPTY_MESSAGE,
  compactTtfLabel,
} from './content'
import { TTF_FIXTURE, TTF_FIXTURE_ITEMS } from './fixture'
import { twoTruthsFibTemplate } from './generate'
import { TTF_REQUEST_COUNT, twoTruthsFibPrefetch } from './prefetch'

const generateMock = vi.mocked(generateTwoTruthsFib)
const signal = () => new AbortController().signal
const config = (overrides: Record<string, unknown> = {}) => ({
  ...buildDefaultConfig(twoTruthsFibTemplate),
  seed: 42,
  ...overrides,
})
const lastRequest = (): TwoTruthsFibRequest => generateMock.mock.calls.at(-1)![0]
const bookContext = (labels: string[]) => ({ bookContentLabels: () => labels })

describe('twoTruthsFibPrefetch', () => {
  beforeEach(() => {
    generateMock.mockReset()
    clearStudioRecentContent()
  })

  it('asks for the budgets the page plans for, with spares', async () => {
    generateMock.mockResolvedValue(TTF_FIXTURE)
    await twoTruthsFibPrefetch(config(), signal())
    const req = lastRequest()
    expect(req.maxStatementChars).toBe(MAX_STATEMENT_CHARS)
    expect(req.maxTitleChars).toBe(MAX_TITLE_CHARS)
    expect(req.maxFactChars).toBe(MAX_FACT_CHARS)
    expect(req.count).toBe(TTF_REQUEST_COUNT)
    expect(req.subject).toBe('mixed')
    expect(req.level).toBe('classic')
  })

  it('sends the chosen subject and level, or the subject the seller typed', async () => {
    generateMock.mockResolvedValue(TTF_FIXTURE)
    await twoTruthsFibPrefetch(config({ subject: 'inventions', level: 'gentle' }), signal())
    expect(lastRequest()).toMatchObject({ subject: 'inventions', level: 'gentle' })
    expect(lastRequest().customSubject).toBeUndefined()

    await twoTruthsFibPrefetch(config({ subject: 'custom', customSubject: 'canals and narrowboats' }), signal())
    expect(lastRequest()).toMatchObject({ subject: 'custom', customSubject: 'canals and narrowboats' })
  })

  it('returns only fact-checked, well-formed sets, never a repaired one', async () => {
    generateMock.mockResolvedValue({
      items: [
        TTF_FIXTURE_ITEMS[0]!,
        { ...TTF_FIXTURE_ITEMS[1]!, verified: false },
        { ...TTF_FIXTURE_ITEMS[2]!, truths: TTF_FIXTURE_ITEMS[2]!.truths.slice(0, 1) },
        { ...TTF_FIXTURE_ITEMS[3]!, fib: 'The zip fastener was never popular until today.' },
      ],
    })
    const remote = await twoTruthsFibPrefetch(config(), signal())
    expect(remote.items.map((item) => item.title)).toEqual([TTF_FIXTURE_ITEMS[0]!.title])
    expect(remote.items.every((item) => item.verified)).toBe(true)
  })

  it('never returns a set the book already prints, and tells the service what to avoid', async () => {
    generateMock.mockResolvedValue(TTF_FIXTURE)
    const printed = [TTF_FIXTURE_ITEMS[0]!.title, TTF_FIXTURE_ITEMS[2]!.truths[0]!]
    const remote = await twoTruthsFibPrefetch(config(), signal(), bookContext(printed))
    const titles = remote.items.map((item) => item.title)
    expect(titles).not.toContain(TTF_FIXTURE_ITEMS[0]!.title)
    expect(titles).not.toContain(TTF_FIXTURE_ITEMS[2]!.title)
    // Sent compact: content words only, which is what the service compares.
    expect(lastRequest().avoid).toContain(compactTtfLabel(TTF_FIXTURE_ITEMS[0]!.title))
  })

  it('remembers printed sets and never returns them again', async () => {
    generateMock.mockResolvedValue(TTF_FIXTURE)
    const first = await twoTruthsFibPrefetch(config({ subject: 'food' }), signal())
    expect(first.items.length).toBeGreaterThan(0)
    const printed = first.items.map((item) => item.title)

    // The model ignores the avoid list and repeats itself: nothing new survives.
    await expect(twoTruthsFibPrefetch(config({ subject: 'food' }), signal())).rejects.toThrow(
      TTF_AI_EMPTY_MESSAGE,
    )
    expect(lastRequest().avoid).toEqual(expect.arrayContaining(printed))
  })

  it('tops up across a second call when the first leaves the page short', async () => {
    generateMock
      .mockResolvedValueOnce({ items: [TTF_FIXTURE_ITEMS[0]!] })
      .mockResolvedValueOnce(TTF_FIXTURE)
    const remote = await twoTruthsFibPrefetch(config(), signal())
    expect(generateMock).toHaveBeenCalledTimes(2)
    const titles = remote.items.map((item) => item.title)
    expect(new Set(titles).size).toBe(titles.length)
    expect(titles.length).toBeGreaterThan(1)
  })

  it('recovers when the first call fails', async () => {
    generateMock
      .mockRejectedValueOnce(new Error('Two Truths and a Fib failed (502)'))
      .mockResolvedValueOnce(TTF_FIXTURE)
    const remote = await twoTruthsFibPrefetch(config(), signal())
    expect(remote.items.length).toBeGreaterThan(0)
    expect(generateMock).toHaveBeenCalledTimes(2)
  })

  it('does not retry a rate limit', async () => {
    generateMock.mockRejectedValue(
      new Error('Too many Two Truths and a Fib requests. Please wait a minute and try again.'),
    )
    await expect(twoTruthsFibPrefetch(config(), signal())).rejects.toThrow(/Too many/)
    expect(generateMock).toHaveBeenCalledTimes(1)
  })

  it('stops at once when the run is cancelled', async () => {
    const controller = new AbortController()
    generateMock.mockImplementation(async () => {
      controller.abort()
      throw new DOMException('Aborted', 'AbortError')
    })
    await expect(twoTruthsFibPrefetch(config(), controller.signal)).rejects.toThrow()
    expect(generateMock).toHaveBeenCalledTimes(1)
  })
})
