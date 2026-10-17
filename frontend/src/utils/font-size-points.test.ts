import { describe, expect, it } from 'vitest'

import { fontSizePixelsToPoints, fontSizePointsToPixels } from '@/utils/font-size-points'

describe('font size points', () => {
  it('shows canvas px as the point size PowerPoint reports', () => {
    expect(fontSizePixelsToPoints(20)).toBe(15)
    expect(fontSizePixelsToPoints(32)).toBe(24)
    expect(fontSizePixelsToPoints(21)).toBe(16)
  })

  it('round-trips a typed point size', () => {
    expect(fontSizePointsToPixels(16)).toBeCloseTo(21.333, 3)
    expect(fontSizePixelsToPoints(fontSizePointsToPixels(16))).toBe(16)
    expect(fontSizePixelsToPoints(fontSizePointsToPixels(15.5))).toBe(15.5)
  })
})
