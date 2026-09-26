import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CareerNumbersRequest, CareerNumbersResponse } from '@/types/studio-career-numbers.types'
import type { StudioPrefetchContext } from '@/types/studio-template.types'

vi.mock('@/api/studio-career-numbers.api', () => ({
  generateCareerNumbers: vi.fn(),
}))

import { generateCareerNumbers } from '@/api/studio-career-numbers.api'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { clearStudioRecentContent, studioAvoidList, studioVarietyKey } from '../studio-variety'
import {
  CBN_AI_EMPTY_MESSAGE,
  CBN_DEFAULT_COUNT,
  CBN_SHORT_MESSAGE,
  CBN_TEMPLATE_KEY,
  MAX_QUESTION_CHARS,
  MAX_UNIT_CHARS,
  questionsRepeat,
} from './content'
import { CBN_FIXTURE, CBN_FIXTURE_ITEMS, CBN_FIXTURE_QUESTIONS } from './fixture'
import { careerNumbersTemplate } from './generate'
import { careerNumbersPrefetch } from './prefetch'

const generateMock = vi.mocked(generateCareerNumbers)
const signal = () => new AbortController().signal
const config = (overrides: Record<string, unknown> = {}) => ({
  ...buildDefaultConfig(careerNumbersTemplate),
  seed: 42,
  ...overrides,
})
const request = (i: number): CareerNumbersRequest => generateMock.mock.calls[i]![0]
const book = (labels: string[]): StudioPrefetchContext => ({ bookContentLabels: () => labels })
const reply = (items = CBN_FIXTURE_ITEMS): CareerNumbersResponse => ({ questions: [...items] })

describe('careerNumbersPrefetch', () => {
  beforeEach(() => {
    generateMock.mockReset()
    clearStudioRecentContent()
  })

  it('asks for the whole set once, at the budgets the page plans for', async () => {
    generateMock.mockResolvedValue(CBN_FIXTURE)
    const res = await careerNumbersPrefetch(config(), signal())
    expect(generateMock).toHaveBeenCalledTimes(1)
    const req = request(0)
    expect(req.workplace).toBe('any')
    expect(req.distance).toBe('miles')
    expect(req.questions).toBe(CBN_DEFAULT_COUNT)
    expect(req.themes).toBeUndefined()
    expect(req.maxQuestionChars).toBe(MAX_QUESTION_CHARS)
    expect(req.maxUnitChars).toBe(MAX_UNIT_CHARS)
    // Spares come back with the set, for the page to spend.
    expect(res.questions.map((q) => q.question)).toEqual(CBN_FIXTURE_QUESTIONS)
  })

  it('never sends the retiree’s name', async () => {
    generateMock.mockResolvedValue(CBN_FIXTURE)
    await careerNumbersPrefetch(config({ retireeName: 'Linda', workplace: 'school', questions: 15, distance: 'km' }), signal())
    const req = request(0)
    expect(req.workplace).toBe('school')
    expect(req.questions).toBe(15)
    expect(req.distance).toBe('km')
    expect(JSON.stringify(req)).not.toContain('Linda')
  })

  it('remembers what it printed, so the next set is asked for something else', async () => {
    generateMock.mockResolvedValue(CBN_FIXTURE)
    await careerNumbersPrefetch(config(), signal())
    const remembered = studioAvoidList(studioVarietyKey(CBN_TEMPLATE_KEY, 'any'))
    expect(remembered).toHaveLength(CBN_DEFAULT_COUNT)
    for (const label of remembered) expect(label.length).toBeLessThanOrEqual(60)
    await careerNumbersPrefetch(config({ seed: 43 }), signal())
    expect(request(1).avoid).toEqual(expect.arrayContaining(remembered))
  })

  it('never repeats a question the book already prints, even when the service does', async () => {
    generateMock.mockResolvedValue(CBN_FIXTURE)
    const printed = 'How many meetings did you sit through over the years?'
    const res = await careerNumbersPrefetch(config(), signal(), book([printed]))
    expect(request(0).avoid).toContain(printed)
    for (const q of res.questions) expect(questionsRepeat(q.question, printed)).toBe(false)
  })

  it('tops up with fresh themes and the tone the set is short of', async () => {
    const playful = CBN_FIXTURE_ITEMS.filter((q) => q.tone === 'playful')
    generateMock
      .mockResolvedValueOnce(reply(playful))
      .mockResolvedValueOnce(reply(CBN_FIXTURE_ITEMS.filter((q) => q.tone === 'nostalgic')))
    const res = await careerNumbersPrefetch(config(), signal())
    expect(generateMock).toHaveBeenCalledTimes(2)
    const topUp = request(1)
    expect(topUp.tone).toBe('nostalgic')
    expect(topUp.themes!.length).toBeGreaterThan(0)
    expect(topUp.count).toBeGreaterThan(0)
    // What the set already holds is named, so the top-up writes something else.
    expect(topUp.avoid!.length).toBeGreaterThan(0)
    expect(res.questions.length).toBeGreaterThan(playful.length)
  })

  it('fails plainly when the service keeps coming back short', async () => {
    generateMock.mockResolvedValue(reply(CBN_FIXTURE_ITEMS.slice(0, 4)))
    await expect(careerNumbersPrefetch(config(), signal())).rejects.toThrow(CBN_SHORT_MESSAGE)
    expect(generateMock).toHaveBeenCalledTimes(3)
  })

  it('fails plainly when nothing printable came back', async () => {
    generateMock.mockResolvedValue({
      questions: [{ question: 'How much money did you earn?', unit: 'dollars', theme: 'shifts', tone: 'playful', shape: 'tally' }],
    })
    await expect(careerNumbersPrefetch(config(), signal())).rejects.toThrow(CBN_AI_EMPTY_MESSAGE)
  })

  it('stops at a rate limit instead of deepening it', async () => {
    generateMock.mockRejectedValue(new Error('Too many requests, slow down.'))
    await expect(careerNumbersPrefetch(config(), signal())).rejects.toThrow(/too many/i)
    expect(generateMock).toHaveBeenCalledTimes(1)
  })
})
