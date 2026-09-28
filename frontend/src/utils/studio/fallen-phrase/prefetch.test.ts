import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { FallenPhraseRequest } from '@/types/studio-fallen-phrase.types'

vi.mock('@/api/studio-fallen-phrase.api', () => ({
  generateFallenPhrase: vi.fn(),
}))

import { generateFallenPhrase } from '@/api/studio-fallen-phrase.api'
import { buildDefaultConfig } from '@/constants/studio-templates'
import type { StudioFabricObject } from '@/types/studio-template.types'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import { STUDIO_TEST_CTX } from '../studio-generator-test'
import { clearStudioRecentContent } from '../studio-variety'
import { isValidPhrase } from './content'
import { FALLEN_PHRASE_FIXTURE_ITEMS } from './fixture'
import { fallenPhraseTemplate } from './generate'
import { fallenPhrasePrefetch } from './prefetch'

const generateMock = vi.mocked(generateFallenPhrase)
const signal = () => new AbortController().signal
const config = { ...buildDefaultConfig(fallenPhraseTemplate), seed: 42, level: 'classic' }
const bookContext = (labels: string[]) => ({ bookContentLabels: () => labels })
const lastRequest = (): FallenPhraseRequest => generateMock.mock.calls.at(-1)![0]
const MEDIUM = FALLEN_PHRASE_FIXTURE_ITEMS.filter((phrase) => isValidPhrase(phrase, 'medium'))

describe('fallenPhrasePrefetch', () => {
  beforeEach(() => {
    generateMock.mockReset()
    clearStudioRecentContent()
  })

  it('never hands the page a saying this book already prints', async () => {
    generateMock.mockResolvedValue({ items: MEDIUM })
    const printed = MEDIUM.slice(0, 2)
    const remote = await fallenPhrasePrefetch(config, signal(), bookContext(printed))
    expect(remote.items.length).toBeGreaterThan(0)
    for (const phrase of printed) expect(remote.items).not.toContain(phrase)
    expect(lastRequest().avoid).toEqual(expect.arrayContaining(printed))
  })

  it('asks again when every saying in the reply is already in the book', async () => {
    generateMock
      .mockResolvedValueOnce({ items: MEDIUM.slice(0, 1) })
      .mockResolvedValueOnce({ items: MEDIUM.slice(1) })
    const remote = await fallenPhrasePrefetch(config, signal(), bookContext(MEDIUM.slice(0, 1)))
    expect(generateMock).toHaveBeenCalledTimes(2)
    expect(remote.items).not.toContain(MEDIUM[0])
  })

  it('stamps the printed saying where the next prefetch can read it back', () => {
    const pages = fallenPhraseTemplate.generate(config, {
      ...STUDIO_TEST_CTX,
      remoteData: { items: MEDIUM },
    })
    const labels = pages[0]!.objects
      .map((obj: StudioFabricObject) => obj.data?.[STUDIO_CONTENT_LABEL_KEY])
      .filter((label): label is string => typeof label === 'string')
    expect(labels).toHaveLength(1)
    expect(MEDIUM).toContain(labels[0])
  })
})
