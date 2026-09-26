import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { BucketListRequest, BucketListResponse } from '@/types/studio-bucket-list.types'
import type { StudioPrefetchContext } from '@/types/studio-template.types'

vi.mock('@/api/studio-bucket-list.api', () => ({
  generateBucketList: vi.fn(),
}))

import { generateBucketList } from '@/api/studio-bucket-list.api'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { clearStudioRecentContent } from '../studio-variety'
import { BL_AI_EMPTY_MESSAGE, BL_SHORT_MESSAGE, MAX_IDEA_CHARS, keysRepeat, ideaKey } from './content'
import { BL_FIXTURE, BL_FIXTURE_IDEAS } from './fixture'
import { bucketListTemplate } from './generate'
import { bucketListPrefetch } from './prefetch'

const generateMock = vi.mocked(generateBucketList)
const signal = () => new AbortController().signal
const config = (overrides: Record<string, unknown> = {}) => ({
  ...buildDefaultConfig(bucketListTemplate),
  seed: 42,
  ...overrides,
})
const request = (i: number): BucketListRequest => generateMock.mock.calls[i]![0]
const book = (labels: string[]): StudioPrefetchContext => ({ bookContentLabels: () => labels })
const ideasOf = (res: BucketListResponse) => res.sections.flatMap((s) => s.items.map((i) => i.idea))

/** The fixture with every heading cut to `keep` ideas. */
const trimmed = (keep: number): BucketListResponse => ({
  sections: BL_FIXTURE.sections.map((s) => ({ ...s, items: s.items.slice(0, keep) })),
})

describe('bucketListPrefetch', () => {
  beforeEach(() => {
    generateMock.mockReset()
    clearStudioRecentContent()
  })

  it('asks for the whole list once, at the budget the page plans for', async () => {
    generateMock.mockResolvedValue(BL_FIXTURE)
    const res = await bucketListPrefetch(config(), signal())
    expect(generateMock).toHaveBeenCalledTimes(1)
    const req = request(0)
    expect(req.count).toBe(100)
    expect(req.focus).toBe('balanced')
    expect(req.sections).toBeUndefined()
    expect(req.maxIdeaChars).toBe(MAX_IDEA_CHARS)
    // Spares come back with the list, for the page to spend.
    expect(ideasOf(res)).toHaveLength(BL_FIXTURE_IDEAS.length)
  })

  it('sends the chosen length and mix', async () => {
    generateMock.mockResolvedValue(BL_FIXTURE)
    await bucketListPrefetch(config({ ideaCount: 50, focus: 'close-to-home' }), signal())
    expect(request(0).count).toBe(50)
    expect(request(0).focus).toBe('close-to-home')
  })

  it('tops up only the headings left short, telling the service what it already has', async () => {
    generateMock.mockResolvedValueOnce(trimmed(5)).mockResolvedValueOnce({
      sections: BL_FIXTURE.sections.map((s) => ({ ...s, items: s.items.slice(5) })),
    })
    const res = await bucketListPrefetch(config(), signal())
    expect(generateMock).toHaveBeenCalledTimes(2)
    const topUp = request(1)
    expect(topUp.sections).toEqual(BL_FIXTURE.sections.map((s) => ({ key: s.key, count: s.target - 5 })))
    expect(topUp.avoid).toContain(BL_FIXTURE.sections[0]!.items[0]!.idea)
    expect(topUp.seed).not.toBe(request(0).seed)
    expect(ideasOf(res)).toHaveLength(BL_FIXTURE_IDEAS.length)
  })

  it('never returns an idea the book already prints', async () => {
    generateMock.mockResolvedValue(BL_FIXTURE)
    const printed = ['Take a painting class', 'Stay overnight in an old lighthouse']
    const res = await bucketListPrefetch(config(), signal(), book(printed))
    const keys = printed.map((p) => ideaKey(p))
    for (const idea of ideasOf(res)) {
      expect(keys.some((k) => keysRepeat(ideaKey(idea), k)), idea).toBe(false)
    }
    expect(ideasOf(res)).not.toContain('Stay a night in a lighthouse')
    expect(ideasOf(res).length).toBeGreaterThanOrEqual(100)
    expect(request(0).avoid).toEqual(expect.arrayContaining(printed))
  })

  it('remembers what it printed, so the next list for the same mix is told to avoid it', async () => {
    generateMock.mockResolvedValue(BL_FIXTURE)
    await bucketListPrefetch(config(), signal())
    await bucketListPrefetch(config({ seed: 7 }), signal()).catch(() => undefined)
    expect(request(1).avoid!.length).toBeGreaterThan(0)
    expect(BL_FIXTURE_IDEAS).toEqual(expect.arrayContaining(request(1).avoid!.slice(0, 5)))
  })

  it('drops invalid ideas before anything reaches the page', async () => {
    const tainted: BucketListResponse = {
      sections: BL_FIXTURE.sections.map((s, i) =>
        i === 0 ? { ...s, items: [{ idea: 'Take your grandchildren to the zoo' }, ...s.items] } : s,
      ),
    }
    generateMock.mockResolvedValue(tainted)
    const res = await bucketListPrefetch(config(), signal())
    expect(ideasOf(res)).not.toContain('Take your grandchildren to the zoo')
  })

  it('says the list is short when top-ups cannot fill it', async () => {
    generateMock.mockResolvedValue(trimmed(2))
    await expect(bucketListPrefetch(config(), signal())).rejects.toThrow(BL_SHORT_MESSAGE)
    expect(generateMock).toHaveBeenCalledTimes(3)
  })

  it('passes the service’s own error on, and stops at a rate limit', async () => {
    generateMock.mockRejectedValue(new Error('Too many Bucket List requests. Please wait a minute and try again.'))
    await expect(bucketListPrefetch(config(), signal())).rejects.toThrow(/Too many/)
    expect(generateMock).toHaveBeenCalledTimes(1)

    generateMock.mockReset()
    generateMock.mockResolvedValue({ sections: [] })
    await expect(bucketListPrefetch(config(), signal())).rejects.toThrow(BL_AI_EMPTY_MESSAGE)
  })

  it('retries the whole list after a failed first call', async () => {
    generateMock.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(BL_FIXTURE)
    const res = await bucketListPrefetch(config(), signal())
    expect(request(1).sections).toBeUndefined()
    expect(ideasOf(res).length).toBeGreaterThanOrEqual(100)
  })
})
