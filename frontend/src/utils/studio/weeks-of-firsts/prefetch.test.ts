import { describe, it, expect, vi, beforeEach } from 'vitest'
import type {
  WeeksOfFirstsRequest,
  WeeksOfFirstsResponse,
} from '@/types/studio-weeks-of-firsts.types'
import type { StudioPrefetchContext } from '@/types/studio-template.types'

vi.mock('@/api/studio-weeks-of-firsts.api', () => ({
  generateWeeksOfFirsts: vi.fn(),
}))

import { generateWeeksOfFirsts } from '@/api/studio-weeks-of-firsts.api'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { clearStudioRecentContent, studioAvoidList, studioVarietyKey } from '../studio-variety'
import {
  MAX_IDEA_CHARS,
  WF_AI_EMPTY_MESSAGE,
  WF_SHORT_MESSAGE,
  WF_TEMPLATE_KEY,
  firstKey,
} from './content'
import { keysRepeat } from '../bucket-list/content'
import { WF_FIXTURE, WF_FIXTURE_ALL } from './fixture'
import { weeksOfFirstsTemplate } from './generate'
import { weeksOfFirstsPrefetch } from './prefetch'

const generateMock = vi.mocked(generateWeeksOfFirsts)
const signal = () => new AbortController().signal
const config = (overrides: Record<string, unknown> = {}) => ({
  ...buildDefaultConfig(weeksOfFirstsTemplate),
  seed: 42,
  ...overrides,
})
const request = (i: number): WeeksOfFirstsRequest => generateMock.mock.calls[i]![0]
const book = (labels: string[]): StudioPrefetchContext => ({ bookContentLabels: () => labels })
const ideasOf = (res: WeeksOfFirstsResponse) => res.areas.flatMap((a) => a.items.map((i) => i.idea))

/** The fixture with every area cut to `keep` ideas. */
const trimmed = (keep: number, from = 0): WeeksOfFirstsResponse => ({
  areas: WF_FIXTURE.areas.map((a) => ({ ...a, items: a.items.slice(from, from + keep) })),
})

describe('weeksOfFirstsPrefetch', () => {
  beforeEach(() => {
    generateMock.mockReset()
    clearStudioRecentContent()
  })

  it('asks for the whole year once, at the budget the page plans for', async () => {
    generateMock.mockResolvedValue(WF_FIXTURE)
    const res = await weeksOfFirstsPrefetch(config(), signal())
    expect(generateMock).toHaveBeenCalledTimes(1)
    const req = request(0)
    expect(req.focus).toBe('balanced')
    expect(req.areas).toBeUndefined()
    expect(req.maxIdeaChars).toBe(MAX_IDEA_CHARS)
    // Spares come back with the year, for the page to spend.
    expect(ideasOf(res)).toHaveLength(WF_FIXTURE_ALL.length)
  })

  it('sends the chosen mix', async () => {
    generateMock.mockResolvedValue(WF_FIXTURE)
    await weeksOfFirstsPrefetch(config({ focus: 'social' }), signal())
    expect(request(0).focus).toBe('social')
  })

  it('does not spend a second call when spares already cover a short area', async () => {
    const oneShort = {
      areas: WF_FIXTURE.areas.map((a) => (a.key === 'music' ? { ...a, items: a.items.slice(0, 1) } : a)),
    }
    generateMock.mockResolvedValue(oneShort)
    await weeksOfFirstsPrefetch(config(), signal())
    expect(generateMock).toHaveBeenCalledTimes(1)
  })

  it('tops up only the areas left short, telling the service what it already has', async () => {
    generateMock.mockResolvedValueOnce(trimmed(1)).mockResolvedValueOnce(trimmed(3, 1))
    const res = await weeksOfFirstsPrefetch(config(), signal())
    expect(generateMock).toHaveBeenCalledTimes(2)
    const topUp = request(1)
    expect(topUp.areas).toEqual(WF_FIXTURE.areas.map((a) => ({ key: a.key, count: a.target - 1 })))
    expect(topUp.avoid).toContain(WF_FIXTURE.areas[0]!.items[0]!.idea)
    expect(topUp.seed).not.toBe(request(0).seed)
    expect(ideasOf(res)).toHaveLength(WF_FIXTURE_ALL.length)
  })

  it('never returns an idea the book already prints', async () => {
    generateMock.mockResolvedValue(WF_FIXTURE)
    const printed = ['Cook a green Thai curry at home', 'Grow a pot of basil on a windowsill']
    const res = await weeksOfFirstsPrefetch(config(), signal(), book(printed))
    const keys = printed.map((p) => firstKey(p))
    for (const idea of ideasOf(res)) {
      expect(keys.some((k) => keysRepeat(firstKey(idea), k)), idea).toBe(false)
    }
    expect(request(0).avoid).toEqual(expect.arrayContaining(printed))
  })

  it('remembers the printed year, so the next one asks for something else', async () => {
    generateMock.mockResolvedValue(WF_FIXTURE)
    await weeksOfFirstsPrefetch(config(), signal())
    const remembered = studioAvoidList(studioVarietyKey(WF_TEMPLATE_KEY, 'balanced'), 100)
    expect(remembered).toHaveLength(52)
    await weeksOfFirstsPrefetch(config({ seed: 43 }), signal()).catch(() => undefined)
    expect(request(1).avoid!.length).toBeGreaterThan(0)
  })

  it('says so when the ideas cannot make a whole year', async () => {
    generateMock.mockResolvedValue(trimmed(1))
    await expect(weeksOfFirstsPrefetch(config(), signal())).rejects.toThrow(WF_SHORT_MESSAGE)
    expect(generateMock).toHaveBeenCalledTimes(3)
  })

  it('passes on the service’s own reason when nothing came back', async () => {
    generateMock.mockRejectedValue(new Error('The studio is busy right now.'))
    await expect(weeksOfFirstsPrefetch(config(), signal())).rejects.toThrow('The studio is busy right now.')
  })

  it('never retries a rate limit', async () => {
    generateMock.mockRejectedValue(new Error('Too many requests — please wait a minute.'))
    await expect(weeksOfFirstsPrefetch(config(), signal())).rejects.toThrow(/too many/i)
    expect(generateMock).toHaveBeenCalledTimes(1)
  })

  it('reports an empty reply plainly', async () => {
    generateMock.mockResolvedValue({ areas: [] })
    await expect(weeksOfFirstsPrefetch(config(), signal())).rejects.toThrow(WF_AI_EMPTY_MESSAGE)
  })

  it('stops at once when the form is closed', async () => {
    const controller = new AbortController()
    generateMock.mockImplementation(async () => {
      controller.abort()
      throw new DOMException('Aborted', 'AbortError')
    })
    await expect(weeksOfFirstsPrefetch(config(), controller.signal)).rejects.toThrow()
    expect(generateMock).toHaveBeenCalledTimes(1)
  })
})
