import { describe, expect, it } from 'vitest'
import type { CanvasStateStore } from '@/utils/canvas-state-store'
import {
  invertPageOrder,
  resolveStudioSolutionPageOrder,
  shiftStudioPageJsonX,
} from './studio-solution-placement'

type Role = 'single' | 'study' | 'recall' | 'answers'

/** `[instanceId, role]` per page; null = blank / non-studio page. */
function makeStore(pages: Array<[string, Role] | null>): CanvasStateStore {
  return {
    getSerialized: (index: number) => {
      const page = pages[index]
      if (page === undefined) return null
      if (page === null) return { objects: [] }
      const [instanceId, pageRole] = page
      return {
        objects: [
          { type: 'rect', studioInstanceId: instanceId, studioPageRole: pageRole, studioTemplateKey: 't' },
        ],
      }
    },
  } as unknown as CanvasStateStore
}

describe('resolveStudioSolutionPageOrder — end', () => {
  it('moves every solution after the games, in game order', () => {
    // G1 S1 G2 S2 G3
    const store = makeStore([
      ['a', 'single'],
      ['a', 'answers'],
      ['b', 'single'],
      ['b', 'answers'],
      ['c', 'single'],
    ])
    expect(resolveStudioSolutionPageOrder(store, 5, 'end')).toEqual([0, 2, 4, 1, 3])
  })

  it('pulls a newly appended game in front of the solution block', () => {
    // G1 G2 S1 S2 | G3 S3 (just generated)
    const store = makeStore([
      ['a', 'single'],
      ['b', 'single'],
      ['a', 'answers'],
      ['b', 'answers'],
      ['c', 'single'],
      ['c', 'answers'],
    ])
    expect(resolveStudioSolutionPageOrder(store, 6, 'end')).toEqual([0, 1, 4, 2, 3, 5])
  })

  it('sorts solutions by game position, not by their current slot', () => {
    // G1 G2 S2 S1
    const store = makeStore([
      ['a', 'single'],
      ['b', 'single'],
      ['b', 'answers'],
      ['a', 'answers'],
    ])
    expect(resolveStudioSolutionPageOrder(store, 4, 'end')).toEqual([0, 1, 3, 2])
  })

  it('keeps study + recall together and moves only the key', () => {
    const store = makeStore([
      ['a', 'study'],
      ['a', 'recall'],
      ['a', 'answers'],
      ['b', 'single'],
    ])
    expect(resolveStudioSolutionPageOrder(store, 4, 'end')).toEqual([0, 1, 3, 2])
  })

  it('returns null when solutions already close the book', () => {
    const store = makeStore([
      ['a', 'single'],
      null,
      ['b', 'single'],
      ['a', 'answers'],
      ['b', 'answers'],
    ])
    expect(resolveStudioSolutionPageOrder(store, 5, 'end')).toBeNull()
  })
})

describe('resolveStudioSolutionPageOrder — after-game', () => {
  it('puts each detached solution back after its game', () => {
    // G1 G2 S1 S2 → G1 S1 G2 S2
    const store = makeStore([
      ['a', 'single'],
      ['b', 'single'],
      ['a', 'answers'],
      ['b', 'answers'],
    ])
    expect(resolveStudioSolutionPageOrder(store, 4, 'after-game')).toEqual([0, 2, 1, 3])
  })

  it('places the key after the last page of a 2-page game', () => {
    const store = makeStore([
      ['a', 'study'],
      ['a', 'recall'],
      ['b', 'single'],
      ['a', 'answers'],
    ])
    expect(resolveStudioSolutionPageOrder(store, 4, 'after-game')).toEqual([0, 1, 3, 2])
  })

  it('leaves contiguous games and orphan solutions alone', () => {
    const store = makeStore([
      ['a', 'single'],
      ['a', 'answers'],
      ['gone', 'answers'],
      null,
    ])
    expect(resolveStudioSolutionPageOrder(store, 4, 'after-game')).toBeNull()
  })
})

describe('invertPageOrder', () => {
  it('maps old indices to new ones', () => {
    expect(invertPageOrder([0, 2, 4, 1, 3])).toEqual([0, 3, 1, 4, 2])
  })
})

describe('shiftStudioPageJsonX', () => {
  it('shifts studio objects and line endpoints, not user objects', () => {
    const json = {
      version: '6.0.0',
      objects: [
        { type: 'line', left: 10, x1: 10, x2: 50, studioInstanceId: 'a' },
        { type: 'image', left: 0 },
      ],
    }
    expect(shiftStudioPageJsonX(json, 12)).toEqual({
      version: '6.0.0',
      objects: [
        { type: 'line', left: 22, x1: 22, x2: 62, studioInstanceId: 'a' },
        { type: 'image', left: 0 },
      ],
    })
  })

  it('returns the same object when there is nothing to shift', () => {
    const json = { objects: [{ type: 'image', left: 0 }] }
    expect(shiftStudioPageJsonX(json, 12)).toBe(json)
    expect(shiftStudioPageJsonX(json, 0)).toBe(json)
  })
})
