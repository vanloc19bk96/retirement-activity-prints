import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WorkLingoRequest } from '@/types/studio-work-lingo.types'

vi.mock('@/api/studio-work-lingo.api', () => ({
  generateWorkLingo: vi.fn(),
}))

import { generateWorkLingo } from '@/api/studio-work-lingo.api'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { clearStudioRecentContent } from '../studio-variety'
import { MAX_MEANING_CHARS, MAX_PHRASE_CHARS, WL_AI_EMPTY_MESSAGE, wlLevelSpec, wlPhraseLabel } from './content'
import { WL_FIXTURE, WL_FIXTURE_PAIRS } from './fixture'
import { workLingoTemplate } from './generate'
import { wlRequestCount, workLingoPrefetch } from './prefetch'

const generateMock = vi.mocked(generateWorkLingo)
const signal = () => new AbortController().signal
const config = (overrides: Record<string, unknown> = {}) => ({
  ...buildDefaultConfig(workLingoTemplate),
  seed: 42,
  ...overrides,
})
const lastRequest = (): WorkLingoRequest => generateMock.mock.calls.at(-1)![0]
const bookContext = (labels: string[]) => ({ bookContentLabels: () => labels })

describe('workLingoPrefetch', () => {
  beforeEach(() => {
    generateMock.mockReset()
    clearStudioRecentContent()
  })

  it('asks for the budgets the page plans for and the level, with spares', async () => {
    generateMock.mockResolvedValue(WL_FIXTURE)
    await workLingoPrefetch(config({ level: 'gentle' }), signal())
    const req = lastRequest()
    expect(req).toMatchObject({ level: 'gentle', maxPhraseChars: MAX_PHRASE_CHARS, maxMeaningChars: MAX_MEANING_CHARS })
    expect(req.count).toBe(wlRequestCount(wlLevelSpec('gentle').maxPairs))
  })

  it('returns only checked, well-formed pairs, never a repaired one', async () => {
    generateMock.mockResolvedValue({
      pairs: [
        ...WL_FIXTURE_PAIRS.slice(0, 6),
        { ...WL_FIXTURE_PAIRS[6]!, verified: false },
        { ...WL_FIXTURE_PAIRS[7]!, meaning: '' },
        { phrase: 'Drink the Kool-Aid', meaning: 'Accept an idea without question', verified: true },
      ],
    })
    const remote = await workLingoPrefetch(config(), signal())
    expect(remote.pairs.map((pair) => pair.phrase)).toEqual(WL_FIXTURE_PAIRS.slice(0, 6).map((pair) => pair.phrase))
    expect(remote.pairs.every((pair) => pair.verified)).toBe(true)
  })

  it('never returns a phrase the book already prints, and tells the service what to avoid', async () => {
    generateMock.mockResolvedValue(WL_FIXTURE)
    const printed = ['Circle back', 'Touching base']
    const remote = await workLingoPrefetch(config(), signal(), bookContext(printed))
    const phrases = remote.pairs.map((pair) => pair.phrase)
    expect(phrases).not.toContain('Circle back')
    expect(phrases).not.toContain('Touch base')
    expect(lastRequest().avoid).toContain(wlPhraseLabel('Circle back'))
  })

  it('remembers printed phrases and never returns them again', async () => {
    generateMock.mockResolvedValue(WL_FIXTURE)
    const first = await workLingoPrefetch(config(), signal())
    expect(first.pairs.length).toBeGreaterThan(0)
    // The model ignores the avoid list and repeats itself: nothing new survives.
    await expect(workLingoPrefetch(config({ seed: 43 }), signal())).rejects.toThrow(WL_AI_EMPTY_MESSAGE)
    expect(lastRequest().avoid).toEqual(expect.arrayContaining([wlPhraseLabel(first.pairs[0]!.phrase)]))
  })

  it('never mixes two responses: a short first reply is replaced whole by a fuller second', async () => {
    const second = [
      { phrase: 'Bottom line', meaning: 'The final result that matters most', verified: true },
      { phrase: 'Win-win', meaning: 'An outcome good for everybody involved', verified: true },
      { phrase: 'Up in the air', meaning: 'Still undecided and uncertain', verified: true },
      { phrase: 'Game plan', meaning: 'The strategy for reaching a goal', verified: true },
      { phrase: 'Rubber-stamp', meaning: 'Approve without really checking', verified: true },
      { phrase: 'Rock the boat', meaning: 'Cause trouble by upsetting things', verified: true },
    ]
    generateMock
      .mockResolvedValueOnce({ pairs: WL_FIXTURE_PAIRS.slice(0, 3) })
      .mockResolvedValueOnce({ pairs: second })
    const remote = await workLingoPrefetch(config(), signal())
    expect(generateMock).toHaveBeenCalledTimes(2)
    expect(remote.pairs.map((pair) => pair.phrase)).toEqual(second.map((pair) => pair.phrase))
    // The second call was told what the first offered.
    expect(lastRequest().avoid).toEqual(expect.arrayContaining([wlPhraseLabel('Circle back')]))
  })

  it('fails clearly when no response holds enough pairs for a puzzle', async () => {
    generateMock.mockResolvedValue({ pairs: WL_FIXTURE_PAIRS.slice(0, 3) })
    await expect(workLingoPrefetch(config(), signal())).rejects.toThrow(WL_AI_EMPTY_MESSAGE)
    expect(generateMock).toHaveBeenCalledTimes(2)
  })

  it('recovers when the first call fails', async () => {
    generateMock
      .mockRejectedValueOnce(new Error('Work Lingo Match failed (502)'))
      .mockResolvedValueOnce(WL_FIXTURE)
    const remote = await workLingoPrefetch(config(), signal())
    expect(remote.pairs.length).toBeGreaterThan(0)
    expect(generateMock).toHaveBeenCalledTimes(2)
  })

  it('does not retry a rate limit', async () => {
    generateMock.mockRejectedValue(new Error('Too many Work Lingo Match requests. Please wait a minute and try again.'))
    await expect(workLingoPrefetch(config(), signal())).rejects.toThrow(/Too many/)
    expect(generateMock).toHaveBeenCalledTimes(1)
  })

  it('stops at once when the run is cancelled', async () => {
    const controller = new AbortController()
    generateMock.mockImplementation(async () => {
      controller.abort()
      throw new DOMException('Aborted', 'AbortError')
    })
    await expect(workLingoPrefetch(config(), controller.signal)).rejects.toThrow()
    expect(generateMock).toHaveBeenCalledTimes(1)
  })
})
