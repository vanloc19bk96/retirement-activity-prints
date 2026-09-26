import { describe, it, expect, vi, beforeEach } from 'vitest'
import type {
  WhoKnowsBestRequest,
  WhoKnowsBestResponse,
} from '@/types/studio-who-knows-best.types'
import type { StudioPrefetchContext } from '@/types/studio-template.types'

vi.mock('@/api/studio-who-knows-best.api', () => ({
  generateWhoKnowsBest: vi.fn(),
}))

import { generateWhoKnowsBest } from '@/api/studio-who-knows-best.api'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { clearStudioRecentContent, studioAvoidList, studioVarietyKey } from '../studio-variety'
import {
  MAX_QUESTION_CHARS,
  WKB_AI_EMPTY_MESSAGE,
  WKB_SHORT_MESSAGE,
  WKB_TEMPLATE_KEY,
  groupOf,
  questionsRepeat,
} from './content'
import { WKB_FIXTURE, WKB_FIXTURE_ITEMS, WKB_FIXTURE_QUESTIONS } from './fixture'
import { whoKnowsBestTemplate } from './generate'
import { whoKnowsBestPrefetch } from './prefetch'

const generateMock = vi.mocked(generateWhoKnowsBest)
const signal = () => new AbortController().signal
const config = (overrides: Record<string, unknown> = {}) => ({
  ...buildDefaultConfig(whoKnowsBestTemplate),
  seed: 42,
  ...overrides,
})
const request = (i: number): WhoKnowsBestRequest => generateMock.mock.calls[i]![0]
const book = (labels: string[]): StudioPrefetchContext => ({ bookContentLabels: () => labels })
const reply = (items = WKB_FIXTURE_ITEMS): WhoKnowsBestResponse => ({ questions: [...items] })

describe('whoKnowsBestPrefetch', () => {
  beforeEach(() => {
    generateMock.mockReset()
    clearStudioRecentContent()
  })

  it('asks for the whole set once, at the budget the page plans for', async () => {
    generateMock.mockResolvedValue(WKB_FIXTURE)
    const res = await whoKnowsBestPrefetch(config(), signal())
    expect(generateMock).toHaveBeenCalledTimes(1)
    const req = request(0)
    expect(req.audience).toBe('mixed')
    expect(req.topics).toBeUndefined()
    expect(req.maxQuestionChars).toBe(MAX_QUESTION_CHARS)
    // Spares come back with the set, for the page to spend.
    expect(res.questions.map((q) => q.question)).toEqual(WKB_FIXTURE_QUESTIONS)
  })

  it('never sends the retiree’s name', async () => {
    generateMock.mockResolvedValue(WKB_FIXTURE)
    await whoKnowsBestPrefetch(config({ retireeName: 'Linda', audience: 'work' }), signal())
    const req = request(0)
    expect(req.audience).toBe('work')
    expect(JSON.stringify(req)).not.toContain('Linda')
  })

  it('sends what the book already prints and drops any reply that repeats it', async () => {
    generateMock.mockResolvedValue(WKB_FIXTURE)
    const printed = 'Where did they first work for pay?'
    const res = await whoKnowsBestPrefetch(config(), signal(), book([printed]))
    expect(request(0).avoid).toContain(printed)
    for (const q of res.questions) expect(questionsRepeat(q.question, printed)).toBe(false)
  })

  it('cuts long avoid labels on a word, within the service’s limit', async () => {
    generateMock.mockResolvedValue(WKB_FIXTURE)
    const long = 'If they could spend one whole afternoon anywhere at all in their town, where would it be?'
    await whoKnowsBestPrefetch(config(), signal(), book([long]))
    const label = request(0).avoid!.find((a) => long.startsWith(a))!
    expect(label.length).toBeLessThanOrEqual(60)
    expect(long.charAt(label.length)).toBe(' ')
  })

  it('tops up with topics the set does not use yet when the reply is short', async () => {
    generateMock
      .mockResolvedValueOnce(reply(WKB_FIXTURE_ITEMS.slice(0, 9)))
      .mockResolvedValueOnce(reply(WKB_FIXTURE_ITEMS.slice(9)))
    const res = await whoKnowsBestPrefetch(config(), signal())
    expect(generateMock).toHaveBeenCalledTimes(2)
    const topUp = request(1)
    const used = WKB_FIXTURE_ITEMS.slice(0, 9).map((q) => q.topic)
    expect(topUp.topics!.length).toBeGreaterThan(0)
    for (const topic of topUp.topics!) expect(used).not.toContain(topic)
    expect(topUp.count).toBeGreaterThanOrEqual(3)
    // The top-up is told what the set already asks (clipped on a word), so it cannot ask it again.
    for (const question of WKB_FIXTURE_QUESTIONS.slice(0, 9)) {
      expect(topUp.avoid!.some((label) => question.startsWith(label)), question).toBe(true)
    }
    expect(res.questions).toHaveLength(WKB_FIXTURE_ITEMS.length)
  })

  it('keeps office topics out of a family top-up', async () => {
    const family = WKB_FIXTURE_ITEMS.filter((q) => groupOf(q.topic) !== 'office')
    generateMock.mockResolvedValueOnce(reply(family.slice(0, 8))).mockResolvedValueOnce(reply(family.slice(8)))
    await whoKnowsBestPrefetch(config({ audience: 'family' }), signal()).catch(() => undefined)
    expect(request(1).topics!.map(groupOf)).not.toContain('office')
  })

  it('remembers the printed set for this audience only', async () => {
    generateMock.mockResolvedValue(WKB_FIXTURE)
    await whoKnowsBestPrefetch(config(), signal())
    expect(studioAvoidList(studioVarietyKey(WKB_TEMPLATE_KEY, 'mixed'))).toHaveLength(12)
    expect(studioAvoidList(studioVarietyKey(WKB_TEMPLATE_KEY, 'work'))).toHaveLength(0)
  })

  it('gives up with a clear message when the questions cannot make a set', async () => {
    generateMock.mockResolvedValue(reply(WKB_FIXTURE_ITEMS.slice(0, 5)))
    await expect(whoKnowsBestPrefetch(config(), signal())).rejects.toThrow(WKB_SHORT_MESSAGE)
    expect(generateMock).toHaveBeenCalledTimes(3)
  })

  it('reports an empty service, and stops at once on a rate limit', async () => {
    generateMock.mockResolvedValue({ questions: [] })
    await expect(whoKnowsBestPrefetch(config(), signal())).rejects.toThrow(WKB_AI_EMPTY_MESSAGE)

    generateMock.mockReset()
    generateMock.mockRejectedValue(new Error('Too many requests. Please wait a moment.'))
    await expect(whoKnowsBestPrefetch(config(), signal())).rejects.toThrow(/too many/i)
    expect(generateMock).toHaveBeenCalledTimes(1)
  })

  it('rethrows a cancel without retrying', async () => {
    const controller = new AbortController()
    generateMock.mockImplementation(async () => {
      controller.abort()
      throw new DOMException('Aborted', 'AbortError')
    })
    await expect(whoKnowsBestPrefetch(config(), controller.signal)).rejects.toThrow(/abort/i)
    expect(generateMock).toHaveBeenCalledTimes(1)
  })
})
