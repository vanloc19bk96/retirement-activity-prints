import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { RollADayRequest, RollADayResponse } from '@/types/studio-roll-a-day.types'
import type { StudioPrefetchContext } from '@/types/studio-template.types'

vi.mock('@/api/studio-roll-a-day.api', () => ({
  generateRollADay: vi.fn(),
}))

import { generateRollADay } from '@/api/studio-roll-a-day.api'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { clearStudioRecentContent } from '../studio-variety'
import { MAX_ACTIVITY_CHARS, RD_AI_EMPTY_MESSAGE, RD_SHORT_MESSAGE } from './content'
import { RD_FIXTURE, RD_FIXTURE_AFTERNOON, RD_FIXTURE_MORNING } from './fixture'
import { rollADayTemplate } from './generate'
import { RD_REQUEST_PER_SIDE, RD_TOPUP_PER_SIDE, rollADayPrefetch } from './prefetch'

const generateMock = vi.mocked(generateRollADay)
const signal = () => new AbortController().signal
const config = (overrides: Record<string, unknown> = {}) => ({
  ...buildDefaultConfig(rollADayTemplate),
  seed: 42,
  ...overrides,
})
const lastRequest = (): RollADayRequest => generateMock.mock.calls.at(-1)![0]
const book = (labels: string[]): StudioPrefetchContext => ({ bookContentLabels: () => labels })
const activitiesOf = (reply: RollADayResponse) => [...reply.morning, ...reply.afternoon].map((i) => i.activity)
const sorted = (items: readonly string[]) => [...items].sort()

/** A second, unrelated table — what a real next call would write. */
const FRESH: RollADayResponse = {
  morning: [
    { activity: 'Feed the birds on a windowsill', concept: 'bird feeding', kind: 'rest' },
    { activity: 'Dance round the kitchen to music', concept: 'kitchen dance', kind: 'move' },
    { activity: 'Knit a few rows of a scarf', concept: 'scarf knitting', kind: 'make' },
    { activity: 'Send a thank-you note to a helper', concept: 'thank-you note', kind: 'people' },
    { activity: 'Tidy one cluttered drawer', concept: 'drawer tidy', kind: 'home' },
    { activity: 'Hunt for shapes in the clouds', concept: 'cloud shapes', kind: 'play' },
  ],
  afternoon: [
    { activity: 'Tour a small local gallery', concept: 'gallery tour', kind: 'outing' },
    { activity: 'Listen to a radio play', concept: 'radio play', kind: 'rest' },
    { activity: 'Press leaves in a heavy atlas', concept: 'leaf pressing', kind: 'make' },
    { activity: 'Swap recipes with a neighbour', concept: 'recipe swap', kind: 'people' },
    { activity: 'Master a simple card trick', concept: 'card trick', kind: 'learn' },
    { activity: 'Stroll to the post box and back', concept: 'post box stroll', kind: 'move' },
  ],
}

describe('rollADayPrefetch', () => {
  beforeEach(() => {
    generateMock.mockReset()
    clearStudioRecentContent()
  })

  it('asks for both sides with spares, at the budget the page plans for', async () => {
    generateMock.mockResolvedValue(RD_FIXTURE)
    await rollADayPrefetch(config({ focus: 'social' }), signal())
    const req = lastRequest()
    expect(req.morningCount).toBe(RD_REQUEST_PER_SIDE)
    expect(req.afternoonCount).toBe(RD_REQUEST_PER_SIDE)
    expect(req.morningCount).toBeGreaterThan(6)
    expect(req.maxActivityChars).toBe(MAX_ACTIVITY_CHARS)
    expect(req.focus).toBe('social')
    expect(generateMock).toHaveBeenCalledTimes(1)
  })

  it('falls back to a balanced mix for an unknown one', async () => {
    generateMock.mockResolvedValue(RD_FIXTURE)
    await rollADayPrefetch(config({ focus: 'golf' }), signal())
    expect(lastRequest().focus).toBe('balanced')
  })

  it('returns only validated activities, with kinds, shuffled by seed', async () => {
    generateMock.mockResolvedValue({
      morning: [...RD_FIXTURE_MORNING, { activity: 'Meet a friend for lunch', concept: 'lunch', kind: 'people' }],
      afternoon: [...RD_FIXTURE_AFTERNOON, { activity: 'Go for a long run', concept: 'run', kind: 'move' }],
    })
    const a = await rollADayPrefetch(config(), signal())
    expect(sorted(a.morning.map((i) => i.activity))).toEqual(sorted(RD_FIXTURE_MORNING.map((i) => i.activity)))
    expect(sorted(a.afternoon.map((i) => i.activity))).toEqual(sorted(RD_FIXTURE_AFTERNOON.map((i) => i.activity)))
    expect([...a.morning, ...a.afternoon].every((i) => i.kind && i.concept)).toBe(true)

    clearStudioRecentContent()
    expect(await rollADayPrefetch(config(), signal())).toEqual(a)

    clearStudioRecentContent()
    const other = await rollADayPrefetch(config({ seed: 7 }), signal())
    expect(other.morning).not.toEqual(a.morning)
  })

  it('drops what the book already prints, and sends it as hints', async () => {
    generateMock.mockResolvedValue(RD_FIXTURE)
    const result = await rollADayPrefetch(config(), signal(), book(['Bake a small tray of scones']))
    expect(activitiesOf(result)).not.toContain('Bake a small batch of scones')
    expect(lastRequest().avoid).toEqual(expect.arrayContaining(['Bake a small tray of scones']))
  })

  it('tops up only the side its checks left short', async () => {
    generateMock
      .mockResolvedValueOnce({ morning: [...RD_FIXTURE_MORNING], afternoon: RD_FIXTURE_AFTERNOON.slice(0, 3) })
      .mockResolvedValueOnce({ morning: [], afternoon: RD_FIXTURE_AFTERNOON.slice(3) })
    const result = await rollADayPrefetch(config(), signal())
    expect(generateMock).toHaveBeenCalledTimes(2)
    const topUp = lastRequest()
    expect(topUp.morningCount).toBe(0)
    expect(topUp.afternoonCount).toBe(RD_TOPUP_PER_SIDE)
    // The top-up is told what the first call kept.
    expect(topUp.avoid).toEqual(expect.arrayContaining(['Bake a small batch of scones']))
    expect(result.afternoon).toHaveLength(RD_FIXTURE_AFTERNOON.length)
  })

  it('throws a friendly error rather than returning a partial table', async () => {
    generateMock.mockResolvedValue({ morning: [...RD_FIXTURE_MORNING], afternoon: RD_FIXTURE_AFTERNOON.slice(0, 3) })
    await expect(rollADayPrefetch(config(), signal())).rejects.toThrow(RD_SHORT_MESSAGE)
    expect(generateMock).toHaveBeenCalledTimes(2)

    generateMock.mockReset()
    generateMock.mockResolvedValue({ morning: [], afternoon: [] })
    clearStudioRecentContent()
    await expect(rollADayPrefetch(config(), signal())).rejects.toThrow(RD_AI_EMPTY_MESSAGE)
  })

  it('stops on a rate limit and passes the message on', async () => {
    generateMock.mockRejectedValue(new Error('Too many Roll-a-Day requests. Please wait a minute.'))
    await expect(rollADayPrefetch(config(), signal())).rejects.toThrow(/too many/i)
    expect(generateMock).toHaveBeenCalledTimes(1)
  })

  it('rethrows an abort without retrying', async () => {
    const controller = new AbortController()
    generateMock.mockImplementation(async () => {
      controller.abort()
      throw new DOMException('Aborted', 'AbortError')
    })
    await expect(rollADayPrefetch(config(), controller.signal)).rejects.toThrow(/abort/i)
    expect(generateMock).toHaveBeenCalledTimes(1)
  })

  it('remembers what it printed, so the next table is made of other activities', async () => {
    generateMock.mockResolvedValueOnce(RD_FIXTURE).mockResolvedValueOnce({
      morning: [...RD_FIXTURE_MORNING.slice(0, 2), ...FRESH.morning],
      afternoon: [...RD_FIXTURE_AFTERNOON.slice(0, 2), ...FRESH.afternoon],
    })
    const first = await rollADayPrefetch(config(), signal())
    const second = await rollADayPrefetch(config({ seed: 43 }), signal())
    const avoid = lastRequest().avoid ?? []
    expect(avoid.length).toBeGreaterThanOrEqual(12)
    expect(avoid.length).toBeLessThanOrEqual(60)
    // Nothing the first table printed comes back, even when the service sends
    // it; a spare the first page never printed may.
    const printed = new Set(avoid)
    for (const activity of activitiesOf(second)) expect(printed.has(activity)).toBe(false)
    expect(activitiesOf(second)).toEqual(expect.arrayContaining(activitiesOf(FRESH)))
    expect(activitiesOf(first)).toHaveLength(20)
  })

  it('does not reprint a table this browser printed recently', async () => {
    generateMock.mockResolvedValue(RD_FIXTURE)
    await rollADayPrefetch(config(), signal())
    // Same reply again: the recent activities are refused, leaving too few.
    await expect(rollADayPrefetch(config({ seed: 43 }), signal())).rejects.toThrow(RD_SHORT_MESSAGE)
  })
})
