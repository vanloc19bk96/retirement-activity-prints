import { describe, it, expect } from 'vitest'
import { STUDIO_INK, STUDIO_STROKE_NORMAL } from '@/constants/studio.constants'
import { resetObjectCounter, type StudioTag } from '../studio-fabric-builders'
import { buildOperatorSign } from './operator-sign'

const TAG: StudioTag = {
  templateKey: 'card-sums',
  instanceId: 'operator-sign-test',
  pageRole: 'single',
}

describe('buildOperatorSign', () => {
  it('draws plus as two stroked lines (not filled bars or text)', () => {
    resetObjectCounter()
    const parts = buildOperatorSign(1, 100, 80, 20, TAG)
    expect(parts).toHaveLength(2)
    expect(parts.every((o) => o.type === 'line')).toBe(true)
    expect(parts.every((o) => o.stroke === STUDIO_INK)).toBe(true)
    expect(parts.every((o) => o.strokeWidth === STUDIO_STROKE_NORMAL)).toBe(true)
    expect(parts.every((o) => o.text === undefined)).toBe(true)
  })

  it('draws minus as a single horizontal stroke', () => {
    resetObjectCounter()
    const [bar] = buildOperatorSign(-1, 50, 40, 16, TAG)
    expect(bar.type).toBe('line')
    expect(bar.y1).toBe(bar.y2)
    expect(Math.abs((bar.x2 as number) - (bar.x1 as number))).toBeGreaterThan(0)
    expect(bar.stroke).toBe(STUDIO_INK)
  })
})
