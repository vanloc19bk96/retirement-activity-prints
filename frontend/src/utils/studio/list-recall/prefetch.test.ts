import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ListRecallRequest, ListRecallResponse } from '@/types/studio-list.types'
import type { StudioConfig } from '@/types/studio-template.types'

const { generateList } = vi.hoisted(() => ({ generateList: vi.fn() }))
vi.mock('@/api/studio-list.api', () => ({ generateList }))

const { listRecallPrefetch } = await import('./prefetch')
const { clearStudioRecentContent } = await import('../studio-variety')

const TARGETS = [
  'Picnic blanket',
  'Lemonade',
  'Cheese sandwiches',
  'Strawberries',
  'Paper cups',
  'Grapes',
  'Napkins',
  'Apple juice',
]

function response(): ListRecallResponse {
  return {
    targets: TARGETS,
    options: [
      ...TARGETS.map((label) => ({ label, isTarget: true })),
      { label: 'Umbrella', isTarget: false, tier: 'plain' as const },
    ],
  }
}

function config(): StudioConfig {
  return {
    seed: 1,
    listLength: 8,
    distractorCount: 10,
    distractorDifficulty: 'standard',
    customTheme: true,
    customThemeText: 'picnic at the park',
  }
}

function requestAt(call: number): ListRecallRequest {
  return generateList.mock.calls[call][0] as ListRecallRequest
}

describe('listRecallPrefetch freshness', () => {
  beforeEach(() => {
    clearStudioRecentContent()
    generateList.mockReset()
    generateList.mockResolvedValue(response())
  })

  it('sends nothing to avoid on the first list for a theme', async () => {
    await listRecallPrefetch(config(), new AbortController().signal)
    expect(requestAt(0).avoid).toEqual([])
  })

  it('asks the next list to skip what the first one printed', async () => {
    const signal = new AbortController().signal
    await listRecallPrefetch(config(), signal)
    await listRecallPrefetch({ ...config(), seed: 2 }, signal)

    const avoid = requestAt(1).avoid ?? []
    expect(avoid).toEqual(expect.arrayContaining(TARGETS))
  })

  it('keeps a different theme free of the first theme’s items', async () => {
    const signal = new AbortController().signal
    await listRecallPrefetch(config(), signal)
    await listRecallPrefetch(
      { ...config(), customThemeText: 'camping trip', seed: 2 },
      signal,
    )

    expect(requestAt(1).avoid).toEqual([])
  })
})
