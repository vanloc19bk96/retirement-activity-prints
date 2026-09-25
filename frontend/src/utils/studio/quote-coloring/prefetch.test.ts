import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { QuoteColoringRequest } from '@/types/studio-quote-coloring.types'

vi.mock('@/api/studio-quote-coloring.api', () => ({
  generateQuoteColoring: vi.fn(),
}))

vi.mock('./fonts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./fonts')>()
  return { ...actual, loadQcFonts: vi.fn() }
})

import { generateQuoteColoring } from '@/api/studio-quote-coloring.api'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { clearStudioRecentContent, rememberStudioContent } from '../studio-variety'
import { QC_AI_EMPTY_MESSAGE, QC_FONTS_MISSING_MESSAGE, QC_SAYING_LIMITS, compactQcLabel, qcPageLabel } from './content'
import { QC_FIXTURE_ITEMS, qcTestFonts } from './fixture'
import { loadQcFonts } from './fonts'
import { quoteColoringTemplate } from './generate'
import { QC_REQUEST_COUNT, qcVarietyKey, quoteColoringPrefetch } from './prefetch'

const generateMock = vi.mocked(generateQuoteColoring)
const fontsMock = vi.mocked(loadQcFonts)
const signal = () => new AbortController().signal
const config = (overrides: Record<string, unknown> = {}) => ({
  ...buildDefaultConfig(quoteColoringTemplate),
  seed: 42,
  ...overrides,
})
const lastRequest = (): QuoteColoringRequest => generateMock.mock.calls.at(-1)![0]
const bookContext = (labels: string[]) => ({ bookContentLabels: () => labels })
const label = (saying: string) =>
  qcPageLabel({ saying, style: 'classic', layout: 'band', cartouche: 'oval', frame: 'single', fill: 'pack', set: 'floral' })

describe('quoteColoringPrefetch', () => {
  beforeEach(() => {
    generateMock.mockReset()
    fontsMock.mockReset()
    fontsMock.mockResolvedValue(qcTestFonts())
    clearStudioRecentContent()
  })

  it('asks for a pool of sayings within the lettering budget, in the chosen mood', async () => {
    generateMock.mockResolvedValue({ items: [...QC_FIXTURE_ITEMS] })
    await quoteColoringPrefetch(config({ tone: 'playful' }), signal())
    expect(lastRequest()).toMatchObject({
      count: QC_REQUEST_COUNT,
      maxChars: QC_SAYING_LIMITS.maxChars,
      tone: 'playful',
      mixedTopics: true,
    })
  })

  it('sends the theme the seller typed', async () => {
    generateMock.mockResolvedValue({ items: [...QC_FIXTURE_ITEMS] })
    await quoteColoringPrefetch(config({ theme: 'custom', customTheme: 'life by the sea' }), signal())
    expect(lastRequest()).toMatchObject({ mixedTopics: false, theme: 'life by the sea' })
  })

  it('returns only checked, well-formed sayings, with the lettering faces', async () => {
    generateMock.mockResolvedValue({
      items: [
        QC_FIXTURE_ITEMS[0]!,
        { ...QC_FIXTURE_ITEMS[1]!, verified: false },
        { text: 'THE PORCH IS MINE NOW', verified: true },
        { text: 'Tea at 4 on the porch', verified: true },
        QC_FIXTURE_ITEMS[3]!,
      ],
    })
    const remote = await quoteColoringPrefetch(config(), signal())
    expect(remote.items.map((item) => item.text)).toEqual([QC_FIXTURE_ITEMS[0]!.text, QC_FIXTURE_ITEMS[3]!.text])
    expect(remote.items.every((item) => item.verified)).toBe(true)
    expect(Object.keys(remote.fonts).length).toBeGreaterThan(0)
  })

  it('reads the book back: its sayings are sent as hints and never returned again', async () => {
    const printed = QC_FIXTURE_ITEMS[0]!.text
    generateMock.mockResolvedValue({ items: [...QC_FIXTURE_ITEMS] })
    const remote = await quoteColoringPrefetch(config(), signal(), bookContext([label(printed)]))
    expect(lastRequest().avoid).toContain(compactQcLabel(printed))
    expect(remote.items.map((item) => item.text)).not.toContain(printed)
    expect(remote.bookLabels).toEqual([label(printed)])
  })

  it('sends what this seller printed lately for the theme', async () => {
    rememberStudioContent(qcVarietyKey(config()), ['porch corner office'])
    generateMock.mockResolvedValue({ items: [...QC_FIXTURE_ITEMS] })
    await quoteColoringPrefetch(config(), signal())
    expect(lastRequest().avoid).toContain('porch corner office')
  })

  it('tries again when a reply holds nothing usable, then fails plainly', async () => {
    generateMock.mockResolvedValue({ items: [{ text: 'nope', verified: true }] })
    await expect(quoteColoringPrefetch(config(), signal())).rejects.toThrow(QC_AI_EMPTY_MESSAGE)
    expect(generateMock).toHaveBeenCalledTimes(2)
  })

  it('does not retry into a rate limit', async () => {
    generateMock.mockRejectedValue(new Error('Too many Quote Coloring requests. Please wait a minute and try again.'))
    await expect(quoteColoringPrefetch(config(), signal())).rejects.toThrow(/too many/i)
    expect(generateMock).toHaveBeenCalledTimes(1)
  })

  it('says so when the lettering cannot load', async () => {
    fontsMock.mockResolvedValue({})
    generateMock.mockResolvedValue({ items: [...QC_FIXTURE_ITEMS] })
    await expect(quoteColoringPrefetch(config(), signal())).rejects.toThrow(QC_FONTS_MISSING_MESSAGE)
  })
})
