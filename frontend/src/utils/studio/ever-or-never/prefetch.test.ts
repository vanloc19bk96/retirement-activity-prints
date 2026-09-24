import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { EverOrNeverRequest } from '@/types/studio-ever-or-never.types'
import type { StudioPrefetchContext } from '@/types/studio-template.types'

vi.mock('@/api/studio-ever-or-never.api', () => ({
  generateEverOrNever: vi.fn(),
}))

import { generateEverOrNever } from '@/api/studio-ever-or-never.api'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { clearStudioRecentContent } from '../studio-variety'
import { EON_AI_EMPTY_MESSAGE, MAX_STATEMENT_CHARS } from './content'
import { EON_FIXTURE, EON_FIXTURE_ITEMS } from './fixture'
import { everOrNeverTemplate } from './generate'
import { EON_REQUEST_COUNT, everOrNeverPrefetch } from './prefetch'

const generateMock = vi.mocked(generateEverOrNever)
const signal = () => new AbortController().signal
const config = (overrides: Record<string, unknown> = {}) => ({
  ...buildDefaultConfig(everOrNeverTemplate),
  seed: 42,
  ...overrides,
})
const lastRequest = (): EverOrNeverRequest => generateMock.mock.calls.at(-1)![0]
const book = (labels: string[]): StudioPrefetchContext => ({ bookContentLabels: () => labels })

describe('everOrNeverPrefetch', () => {
  beforeEach(() => {
    generateMock.mockReset()
    clearStudioRecentContent()
  })

  it('asks for the budget the page plans for, with spares, mixed by default', async () => {
    generateMock.mockResolvedValue(EON_FIXTURE)
    await everOrNeverPrefetch(config(), signal())
    const req = lastRequest()
    expect(req.maxStatementChars).toBe(MAX_STATEMENT_CHARS)
    expect(req.count).toBe(EON_REQUEST_COUNT)
    expect(req.mixedTopics).toBe(true)
    expect(req.style).toBe('balanced')
  })

  it('sends the chosen theme, the typed theme, and the tone', async () => {
    generateMock.mockResolvedValue(EON_FIXTURE)
    await everOrNeverPrefetch(config({ theme: 'gardening', tone: 'playful' }), signal())
    expect(lastRequest().theme.toLowerCase()).toContain('garden')
    expect(lastRequest().mixedTopics).toBe(false)
    expect(lastRequest().style).toBe('playful')

    clearStudioRecentContent()
    await everOrNeverPrefetch(config({ theme: 'custom', customTheme: 'summers at the lake' }), signal())
    expect(lastRequest().theme).toBe('summers at the lake')
  })

  it('returns only validated statements', async () => {
    generateMock.mockResolvedValue({
      items: [
        EON_FIXTURE_ITEMS[0]!,
        { statement: 'Ever relaxed?' },
        { statement: 'Ever visited the doctor on a Monday?' },
        { statement: 'Ever not woken up early on a Monday?' },
      ],
    })
    const result = await everOrNeverPrefetch(config(), signal())
    expect(result.items.map((i) => i.statement)).toEqual([EON_FIXTURE_ITEMS[0]!.statement])
  })

  it('never returns a statement the book already prints, and tells the service', async () => {
    generateMock.mockResolvedValue(EON_FIXTURE)
    const printed = [EON_FIXTURE_ITEMS[3]!.statement]
    const result = await everOrNeverPrefetch(config(), signal(), book(printed))
    expect(result.items.map((i) => i.statement)).not.toContain(EON_FIXTURE_ITEMS[3]!.statement)
    expect(lastRequest().avoid!.some((label) => label.includes('tomato'))).toBe(true)
    expect(lastRequest().avoid!.every((label) => label.length <= 60)).toBe(true)
  })

  it('checks the whole book whatever the theme', async () => {
    generateMock.mockResolvedValue(EON_FIXTURE)
    const context = { bookContentLabels: vi.fn(() => [EON_FIXTURE_ITEMS[0]!.statement]) }
    const result = await everOrNeverPrefetch(config({ theme: 'gardening' }), signal(), context)
    expect(context.bookContentLabels).toHaveBeenCalledWith('ever-or-never')
    expect(result.items.map((i) => i.statement)).not.toContain(EON_FIXTURE_ITEMS[0]!.statement)
  })

  it('remembers what it printed, so the next page avoids it', async () => {
    generateMock.mockResolvedValue(EON_FIXTURE)
    await everOrNeverPrefetch(config(), signal())
    await expect(everOrNeverPrefetch(config({ seed: 43 }), signal())).rejects.toThrow(
      EON_AI_EMPTY_MESSAGE,
    )
    expect(lastRequest().avoid!.length).toBeGreaterThan(0)
  })

  it('tops up a short pool with a second call, then stops', async () => {
    generateMock
      .mockResolvedValueOnce({ items: EON_FIXTURE_ITEMS.slice(0, 3) })
      .mockResolvedValueOnce({ items: EON_FIXTURE_ITEMS.slice(3) })
    const result = await everOrNeverPrefetch(config(), signal())
    expect(generateMock).toHaveBeenCalledTimes(2)
    expect(result.items).toHaveLength(EON_FIXTURE_ITEMS.length)
    // The second call is told what the first already kept.
    expect(lastRequest().avoid!.some((label) => label.includes('pyjamas'))).toBe(true)
  })

  it('does not retry a rate limit', async () => {
    generateMock.mockRejectedValue(new Error('Too many Ever or Never requests.'))
    await expect(everOrNeverPrefetch(config(), signal())).rejects.toThrow(/too many/i)
    expect(generateMock).toHaveBeenCalledTimes(1)
  })

  it('survives a malformed reply', async () => {
    generateMock.mockResolvedValue({ items: null } as never)
    await expect(everOrNeverPrefetch(config(), signal())).rejects.toThrow(EON_AI_EMPTY_MESSAGE)
  })
})
