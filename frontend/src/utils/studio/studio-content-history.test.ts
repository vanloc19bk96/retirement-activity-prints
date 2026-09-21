import { describe, expect, it } from 'vitest'
import type { CanvasStateStore } from '@/utils/canvas-state-store'
import type { StudioFabricObject } from '@/types/studio-template.types'
import {
  collectStudioContentHashes,
  withStudioContentHash,
} from './studio-content-history'

function makeStore(pages: Record<number, object[]>): CanvasStateStore {
  return {
    getSerialized: (index: number) => {
      const objects = pages[index]
      return objects ? { objects } : null
    },
  } as unknown as CanvasStateStore
}

describe('withStudioContentHash', () => {
  it('stamps every object without mutating the source', () => {
    const objects: StudioFabricObject[] = [
      { type: 'textbox', left: 0, top: 0, text: 'A' },
      { type: 'rect', left: 4, top: 8 },
    ]
    const stamped = withStudioContentHash(objects, 'abc123')

    expect(stamped.map((o) => o.studioContentHash)).toEqual(['abc123', 'abc123'])
    expect(objects[0]!.studioContentHash).toBeUndefined()
  })

  it('leaves objects alone when there is no hash to stamp', () => {
    const objects: StudioFabricObject[] = [{ type: 'rect', left: 0, top: 0 }]
    expect(withStudioContentHash(objects, '')).toBe(objects)
  })
})

describe('collectStudioContentHashes', () => {
  it('reads back what earlier runs printed', () => {
    const store = makeStore({
      0: [{ type: 'rect', studioContentHash: 'puzzle-one' }],
      1: [{ type: 'rect', studioContentHash: 'puzzle-one' }],
      2: [{ type: 'rect', studioContentHash: 'puzzle-two' }],
    })
    expect(collectStudioContentHashes(store, 3)).toEqual(
      new Set(['puzzle-one', 'puzzle-two']),
    )
  })

  it('ignores pages the seller drew by hand and pages past the interior', () => {
    const store = makeStore({
      0: [{ type: 'textbox', text: 'hand lettered' }],
      1: [{ type: 'rect', studioContentHash: 'inside' }],
      2: [{ type: 'rect', studioContentHash: 'past-the-end' }],
    })
    expect(collectStudioContentHashes(store, 2)).toEqual(new Set(['inside']))
  })

  it('survives an empty book', () => {
    expect(collectStudioContentHashes(makeStore({}), 4).size).toBe(0)
  })
})
