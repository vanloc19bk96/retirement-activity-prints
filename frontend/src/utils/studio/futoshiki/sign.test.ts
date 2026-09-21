import { describe, it, expect } from 'vitest'
import { buildInequalitySign } from './sign'
import { resetObjectCounter, type StudioTag } from '../studio-fabric-builders'
import type { FutoshikiSign } from './types'

const TAG: StudioTag = {
  templateKey: 'futoshiki',
  instanceId: 'sign-test',
  pageRole: 'single',
}

describe('buildInequalitySign', () => {
  it('emits a stroked polyline (export-safe, not Unicode text)', () => {
    resetObjectCounter()
    const sign: FutoshikiSign = {
      a: { r: 0, c: 0 },
      b: { r: 0, c: 1 },
      relation: '>',
    }
    const obj = buildInequalitySign(sign, 100, 100, 20, TAG)
    expect(obj.type).toBe('polyline')
    expect(obj.points).toHaveLength(3)
    expect(obj.stroke).toBeTruthy()
    expect(obj.text).toBeUndefined()
  })

  it('horizontal < opens to the right', () => {
    resetObjectCounter()
    const obj = buildInequalitySign(
      { a: { r: 0, c: 0 }, b: { r: 0, c: 1 }, relation: '<' },
      0,
      0,
      20,
      TAG,
    )
    const points = obj.points as { x: number; y: number }[]
    // Tip is the middle vertex and should be left of the arms.
    expect(points[1]!.x).toBeLessThan(points[0]!.x)
    expect(points[1]!.x).toBeLessThan(points[2]!.x)
  })

  it('vertical top-larger opens upward (∨)', () => {
    resetObjectCounter()
    const obj = buildInequalitySign(
      { a: { r: 0, c: 0 }, b: { r: 1, c: 0 }, relation: '>' },
      0,
      0,
      20,
      TAG,
    )
    const points = obj.points as { x: number; y: number }[]
    // Tip below the arms.
    expect(points[1]!.y).toBeGreaterThan(points[0]!.y)
    expect(points[1]!.y).toBeGreaterThan(points[2]!.y)
  })
})
