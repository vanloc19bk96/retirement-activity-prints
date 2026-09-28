import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CryptogramRequest } from '@/types/studio-cryptogram.types'

vi.mock('@/api/studio-cryptogram.api', () => ({
  generateCryptogram: vi.fn(),
}))

import { generateCryptogram } from '@/api/studio-cryptogram.api'
import { buildDefaultConfig } from '@/constants/studio-templates'
import type { StudioFabricObject } from '@/types/studio-template.types'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import { STUDIO_TEST_CTX } from '../studio-generator-test'
import { clearStudioRecentContent } from '../studio-variety'
import { cryptogramTemplate } from './generate'
import { cryptogramPrefetch } from './prefetch'

const generateMock = vi.mocked(generateCryptogram)
const signal = () => new AbortController().signal
const config = { ...buildDefaultConfig(cryptogramTemplate), seed: 42, level: 'classic' }
const bookContext = (labels: string[]) => ({ bookContentLabels: () => labels })
const lastRequest = (): CryptogramRequest => generateMock.mock.calls.at(-1)![0]

const SAYINGS = [
  'FREE TIME IS BEST SPENT DOING WHAT YOU LOVE',
  'A QUIET GARDEN IS A FINE PLACE TO SIT AND DREAM',
  'SLOW MORNINGS AT HOME NOW FEEL LIKE A GIFT',
  'GOOD NEIGHBOURS TURN A STREET INTO A HOME',
  'EVERY SUNDAY CAN BE A SUNDAY NOW MY FRIEND',
  'PACK A FLASK AND WALK THE LONG WAY ROUND',
]

describe('cryptogramPrefetch', () => {
  beforeEach(() => {
    generateMock.mockReset()
    clearStudioRecentContent()
  })

  it('never hands the page a saying this book already prints', async () => {
    generateMock.mockResolvedValue({ items: SAYINGS })
    const printed = [SAYINGS[0]!, SAYINGS[2]!]
    const remote = await cryptogramPrefetch(config, signal(), bookContext(printed))
    expect(remote.items).not.toContain(SAYINGS[0])
    expect(remote.items).not.toContain(SAYINGS[2])
    expect(remote.items.length).toBeGreaterThanOrEqual(3)
    expect(lastRequest().avoid).toEqual(expect.arrayContaining(printed))
  })

  it('tops a short reply up from the next one instead of discarding it', async () => {
    generateMock
      .mockResolvedValueOnce({ items: SAYINGS.slice(0, 2) })
      .mockResolvedValueOnce({ items: SAYINGS.slice(2, 3) })
    const remote = await cryptogramPrefetch(config, signal())
    expect(generateMock).toHaveBeenCalledTimes(2)
    expect(remote.items).toEqual(SAYINGS.slice(0, 3))
    // The second call is told what the first already supplied.
    expect(lastRequest().avoid).toEqual(expect.arrayContaining(SAYINGS.slice(0, 2)))
  })

  it('stamps each printed saying where the next prefetch can read it back', () => {
    const pages = cryptogramTemplate.generate(config, {
      ...STUDIO_TEST_CTX,
      remoteData: { items: SAYINGS },
    })
    const labels = pages[0]!.objects
      .map((obj: StudioFabricObject) => obj.data?.[STUDIO_CONTENT_LABEL_KEY])
      .filter((label): label is string => typeof label === 'string')
    expect(labels.length).toBeGreaterThan(0)
    for (const label of labels) expect(SAYINGS).toContain(label)
  })
})
