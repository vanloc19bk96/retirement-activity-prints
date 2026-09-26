import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { OfficeAwardsRequest, OfficeAwardsResponse } from '@/types/studio-office-awards.types'
import type { StudioPrefetchContext } from '@/types/studio-template.types'

vi.mock('@/api/studio-office-awards.api', () => ({
  generateOfficeAwards: vi.fn(),
}))

import { generateOfficeAwards } from '@/api/studio-office-awards.api'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { clearStudioRecentContent, studioAvoidList, studioVarietyKey } from '../studio-variety'
import {
  MAX_AWARD_CHARS,
  OA_AI_EMPTY_MESSAGE,
  OA_DEFAULT_COUNT,
  OA_SHORT_MESSAGE,
  OA_TEMPLATE_KEY,
  awardsRepeat,
} from './content'
import { OA_FIXTURE, OA_FIXTURE_AWARDS, OA_FIXTURE_ITEMS } from './fixture'
import { officeAwardsTemplate } from './generate'
import { officeAwardsPrefetch } from './prefetch'

const generateMock = vi.mocked(generateOfficeAwards)
const signal = () => new AbortController().signal
const config = (overrides: Record<string, unknown> = {}) => ({
  ...buildDefaultConfig(officeAwardsTemplate),
  seed: 42,
  ...overrides,
})
const request = (i: number): OfficeAwardsRequest => generateMock.mock.calls[i]![0]
const book = (labels: string[]): StudioPrefetchContext => ({ bookContentLabels: () => labels })
const reply = (items = OA_FIXTURE_ITEMS): OfficeAwardsResponse => ({ awards: [...items] })

describe('officeAwardsPrefetch', () => {
  beforeEach(() => {
    generateMock.mockReset()
    clearStudioRecentContent()
  })

  it('asks for the whole set once, at the budget the page plans for', async () => {
    generateMock.mockResolvedValue(OA_FIXTURE)
    const res = await officeAwardsPrefetch(config(), signal())
    expect(generateMock).toHaveBeenCalledTimes(1)
    const req = request(0)
    expect(req.workplace).toBe('any')
    expect(req.awards).toBe(OA_DEFAULT_COUNT)
    expect(req.themes).toBeUndefined()
    expect(req.maxAwardChars).toBe(MAX_AWARD_CHARS)
    // Spares come back with the set, for the page to spend.
    expect(res.awards.map((a) => a.award)).toEqual(OA_FIXTURE_AWARDS)
  })

  it('never sends the retiree’s name', async () => {
    generateMock.mockResolvedValue(OA_FIXTURE)
    await officeAwardsPrefetch(config({ retireeName: 'Linda', workplace: 'school', awards: 16 }), signal())
    const req = request(0)
    expect(req.workplace).toBe('school')
    expect(req.awards).toBe(16)
    expect(JSON.stringify(req)).not.toContain('Linda')
  })

  it('remembers what it printed, so the next set is asked for something else', async () => {
    generateMock.mockResolvedValue(OA_FIXTURE)
    await officeAwardsPrefetch(config(), signal())
    const remembered = studioAvoidList(studioVarietyKey(OA_TEMPLATE_KEY, 'any'))
    expect(remembered).toHaveLength(OA_DEFAULT_COUNT)
    await officeAwardsPrefetch(config({ seed: 43 }), signal())
    expect(request(1).avoid).toEqual(expect.arrayContaining(remembered))
  })

  it('never repeats an award the book already prints, even when the service does', async () => {
    generateMock.mockResolvedValue(OA_FIXTURE)
    const res = await officeAwardsPrefetch(config(), signal(), book(['Biggest Snack Drawer Keeper']))
    expect(request(0).avoid).toContain('Biggest Snack Drawer Keeper')
    for (const a of res.awards) expect(awardsRepeat(a.award, 'Biggest Snack Drawer Keeper')).toBe(false)
  })

  it('tops up with fresh themes and the tone the set is short of', async () => {
    const playful = OA_FIXTURE_ITEMS.filter((a) => a.tone === 'playful')
    generateMock.mockResolvedValueOnce(reply(playful)).mockResolvedValueOnce(reply(OA_FIXTURE_ITEMS.filter((a) => a.tone === 'warm')))
    const res = await officeAwardsPrefetch(config(), signal())
    expect(generateMock).toHaveBeenCalledTimes(2)
    const topUp = request(1)
    expect(topUp.tone).toBe('warm')
    expect(topUp.themes!.length).toBeGreaterThan(0)
    expect(topUp.count).toBeGreaterThan(0)
    // What the set already holds is named, so the top-up writes something else.
    expect(topUp.avoid).toEqual(expect.arrayContaining(playful.slice(0, 3).map((a) => a.award)))
    expect(res.awards.length).toBeGreaterThan(playful.length)
  })

  it('fails plainly when the service keeps coming back short', async () => {
    generateMock.mockResolvedValue(reply(OA_FIXTURE_ITEMS.slice(0, 4)))
    await expect(officeAwardsPrefetch(config(), signal())).rejects.toThrow(OA_SHORT_MESSAGE)
    expect(generateMock).toHaveBeenCalledTimes(3)
  })

  it('fails plainly when nothing printable came back', async () => {
    generateMock.mockResolvedValue({ awards: [{ award: 'Worst Timekeeper', theme: 'timekeeping', tone: 'playful', shape: 'superlative' }] })
    await expect(officeAwardsPrefetch(config(), signal())).rejects.toThrow(OA_AI_EMPTY_MESSAGE)
  })

  it('stops at a rate limit instead of deepening it', async () => {
    generateMock.mockRejectedValue(new Error('Too many requests, slow down.'))
    await expect(officeAwardsPrefetch(config(), signal())).rejects.toThrow(/too many/i)
    expect(generateMock).toHaveBeenCalledTimes(1)
  })
})
