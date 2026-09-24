import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { RetiredNameRequest } from '@/types/studio-retired-name.types'
import type { StudioPrefetchContext } from '@/types/studio-template.types'

vi.mock('@/api/studio-retired-name.api', () => ({
  generateRetiredName: vi.fn(),
}))

import { generateRetiredName } from '@/api/studio-retired-name.api'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { clearStudioRecentContent } from '../studio-variety'
import { MAX_FIRST_CHARS, MAX_LAST_CHARS, RN_AI_EMPTY_MESSAGE } from './content'
import { RN_FIXTURE, RN_FIXTURE_FIRST, RN_FIXTURE_LAST } from './fixture'
import { retiredNameTemplate } from './generate'
import { RN_FIRST_REQUEST, RN_LAST_REQUEST, retiredNamePrefetch } from './prefetch'

const generateMock = vi.mocked(generateRetiredName)
const signal = () => new AbortController().signal
const config = (overrides: Record<string, unknown> = {}) => ({
  ...buildDefaultConfig(retiredNameTemplate),
  seed: 42,
  ...overrides,
})
const lastRequest = (): RetiredNameRequest => generateMock.mock.calls.at(-1)![0]
const book = (labels: string[]): StudioPrefetchContext => ({ bookContentLabels: () => labels })
const sorted = (names: readonly string[]) => [...names].sort()

/** A second, unrelated set of last names — what a real next call would write. */
const FRESH_LAST = [
  'Lemonade Sipper', 'Canoe Paddler', 'Pottery Spinner', 'Quilt Stitcher', 'Bread Kneader',
  'Stamp Collector', 'Postcard Writer', 'Choir Singer', 'Ukulele Strummer', 'Sandcastle Maker',
  'Pickleball Ace', 'Museum Visitor', 'Bingo Caller',
]

describe('retiredNamePrefetch', () => {
  beforeEach(() => {
    generateMock.mockReset()
    clearStudioRecentContent()
  })

  it('asks for a full table with spares, at the budgets the page plans for', async () => {
    generateMock.mockResolvedValue(RN_FIXTURE)
    await retiredNamePrefetch(config(), signal())
    const req = lastRequest()
    expect(req.firstCount).toBe(RN_FIRST_REQUEST)
    expect(req.lastCount).toBe(RN_LAST_REQUEST)
    expect(req.firstCount).toBeGreaterThan(26)
    expect(req.lastCount).toBeGreaterThan(12)
    expect(req.maxFirstChars).toBe(MAX_FIRST_CHARS)
    expect(req.maxLastChars).toBe(MAX_LAST_CHARS)
    expect(req.mixedTopics).toBe(true)
  })

  it('sends the chosen theme and the typed theme', async () => {
    generateMock.mockResolvedValue(RN_FIXTURE)
    await retiredNamePrefetch(config({ theme: 'gardening' }), signal())
    expect(lastRequest().theme.toLowerCase()).toContain('garden')
    expect(lastRequest().mixedTopics).toBe(false)

    clearStudioRecentContent()
    await retiredNamePrefetch(config({ theme: 'custom', customTheme: 'golf and the fairway' }), signal())
    expect(lastRequest().theme).toBe('golf and the fairway')
  })

  it('returns only validated names, shuffled by seed', async () => {
    generateMock.mockResolvedValue({
      firstNames: [...RN_FIXTURE_FIRST, 'Sir', 'Grumpy'],
      lastNames: [...RN_FIXTURE_LAST, 'Wine Sipper', 'Garden Flower'],
    })
    const a = await retiredNamePrefetch(config(), signal())
    expect(sorted(a.firstNames)).toEqual(sorted(RN_FIXTURE_FIRST))
    expect(sorted(a.lastNames)).toEqual(sorted(RN_FIXTURE_LAST))

    clearStudioRecentContent()
    const again = await retiredNamePrefetch(config(), signal())
    expect(again).toEqual(a)

    clearStudioRecentContent()
    const other = await retiredNamePrefetch(config({ seed: 7 }), signal())
    expect(other.firstNames).not.toEqual(a.firstNames)
  })

  it('drops last names the book already prints and ranks its first names last', async () => {
    generateMock.mockResolvedValue(RN_FIXTURE)
    const result = await retiredNamePrefetch(
      config(),
      signal(),
      book(['Hammock Snoozer', 'Captain']),
    )
    expect(result.lastNames).not.toContain('Hammock Snoozer')
    expect(result.lastNames).toHaveLength(RN_FIXTURE_LAST.length - 1)
    expect(result.firstNames.at(-1)).toBe('Captain')
    expect(lastRequest().avoid).toEqual(expect.arrayContaining(['Hammock Snoozer', 'Captain']))
  })

  it('makes a second call only when the first leaves a list short of a table', async () => {
    generateMock
      .mockResolvedValueOnce({ firstNames: [...RN_FIXTURE_FIRST], lastNames: RN_FIXTURE_LAST.slice(0, 8) })
      .mockResolvedValueOnce({ firstNames: [], lastNames: RN_FIXTURE_LAST.slice(8) })
    const result = await retiredNamePrefetch(config(), signal())
    expect(generateMock).toHaveBeenCalledTimes(2)
    expect(sorted(result.lastNames)).toEqual(sorted(RN_FIXTURE_LAST))
    // The second call is told what the first one kept.
    expect(lastRequest().avoid).toEqual(expect.arrayContaining(['Hammock Snoozer']))

    generateMock.mockReset()
    generateMock.mockResolvedValue(RN_FIXTURE)
    clearStudioRecentContent()
    await retiredNamePrefetch(config({ seed: 9 }), signal())
    expect(generateMock).toHaveBeenCalledTimes(1)
  })

  it('throws a friendly error rather than returning a partial table', async () => {
    generateMock.mockResolvedValue({ firstNames: RN_FIXTURE_FIRST.slice(0, 10), lastNames: [...RN_FIXTURE_LAST] })
    await expect(retiredNamePrefetch(config(), signal())).rejects.toThrow(RN_AI_EMPTY_MESSAGE)
    expect(generateMock).toHaveBeenCalledTimes(2)
  })

  it('stops on a rate limit and passes the message on', async () => {
    generateMock.mockRejectedValue(new Error('Too many Retired Name requests. Wait a minute.'))
    await expect(retiredNamePrefetch(config(), signal())).rejects.toThrow(/too many/i)
    expect(generateMock).toHaveBeenCalledTimes(1)
  })

  it('rethrows an abort without retrying', async () => {
    const controller = new AbortController()
    generateMock.mockImplementation(async () => {
      controller.abort()
      throw new DOMException('Aborted', 'AbortError')
    })
    await expect(retiredNamePrefetch(config(), controller.signal)).rejects.toThrow(/abort/i)
    expect(generateMock).toHaveBeenCalledTimes(1)
  })

  it('remembers what it printed, so the next page asks for something else', async () => {
    generateMock.mockResolvedValueOnce(RN_FIXTURE).mockResolvedValueOnce({
      firstNames: [...RN_FIXTURE_FIRST],
      lastNames: [...RN_FIXTURE_LAST.slice(0, 2), ...FRESH_LAST],
    })
    const first = await retiredNamePrefetch(config(), signal())
    const second = await retiredNamePrefetch(config({ seed: 43 }), signal())
    const avoid = lastRequest().avoid ?? []
    expect(avoid).toEqual(expect.arrayContaining(first.lastNames.slice(0, 12)))
    expect(avoid.length).toBeLessThanOrEqual(60)
    // A last name the first page printed is not printed again, even when the
    // service sends it back.
    for (const name of first.lastNames.slice(0, 12)) expect(second.lastNames).not.toContain(name)
  })

  it('does not repeat a last name this browser printed recently', async () => {
    generateMock.mockResolvedValue(RN_FIXTURE)
    await retiredNamePrefetch(config(), signal())
    // Same reply again: the recent last names are refused, leaving too few.
    await expect(retiredNamePrefetch(config({ seed: 43 }), signal())).rejects.toThrow(RN_AI_EMPTY_MESSAGE)
  })
})
