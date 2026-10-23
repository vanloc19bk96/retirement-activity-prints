import { describe, expect, it } from 'vitest'

import {
  computeCoverFaceTextLayout,
  coverFaceAnchorX,
  type CoverFaceTextMeasure,
} from './book-cover-face-layout'

const AREA = { x: 100, y: 200, width: 1000, height: 1500 }
const FRONT_ITEMS: CoverFaceTextMeasure[] = [
  { role: 'title', height: 240 },
  { role: 'subtitle', height: 80 },
  { role: 'author', height: 60 },
]
const LEAD = 100

function topOf(result: ReturnType<typeof computeCoverFaceTextLayout>, role: string): number {
  return result.placements.find((p) => p.role === role)!.top
}

describe('computeCoverFaceTextLayout', () => {
  it('classic: title block at the top, author pinned to the bottom', () => {
    const result = computeCoverFaceTextLayout({
      face: 'front',
      area: AREA,
      items: FRONT_ITEMS,
      arrangement: 'classic',
      leadFontSize: LEAD,
    })
    expect(topOf(result, 'title')).toBe(AREA.y)
    // Subtitle follows the title after a 0.35em gap.
    expect(topOf(result, 'subtitle')).toBe(AREA.y + 240 + 35)
    expect(topOf(result, 'author') + 60).toBe(AREA.y + AREA.height)
    expect(result.requiredHeight).toBe(240 + 35 + 80 + 80 + 60)
  })

  it('center and bottom stack every line together', () => {
    const total = 240 + 35 + 80 + 60 + 60
    const center = computeCoverFaceTextLayout({
      face: 'front',
      area: AREA,
      items: FRONT_ITEMS,
      arrangement: 'center',
      leadFontSize: LEAD,
    })
    expect(topOf(center, 'title')).toBe(AREA.y + (AREA.height - total) / 2)
    expect(center.requiredHeight).toBe(total)

    const bottom = computeCoverFaceTextLayout({
      face: 'front',
      area: AREA,
      items: FRONT_ITEMS,
      arrangement: 'bottom',
      leadFontSize: LEAD,
    })
    expect(topOf(bottom, 'author') + 60).toBe(AREA.y + AREA.height)
    expect(topOf(bottom, 'title')).toBe(AREA.y + AREA.height - total)
  })

  it('reports overflow so the caller can shrink the text', () => {
    const result = computeCoverFaceTextLayout({
      face: 'back',
      area: { ...AREA, height: 300 },
      items: [
        { role: 'headline', height: 120 },
        { role: 'description', height: 900 },
      ],
      arrangement: 'top',
      leadFontSize: LEAD,
    })
    expect(result.requiredHeight).toBeGreaterThan(300)
  })

  it('treats classic as top on the back cover', () => {
    const result = computeCoverFaceTextLayout({
      face: 'back',
      area: AREA,
      items: [
        { role: 'headline', height: 120 },
        { role: 'description', height: 400 },
      ],
      arrangement: 'classic',
      leadFontSize: LEAD,
    })
    expect(topOf(result, 'headline')).toBe(AREA.y)
    expect(topOf(result, 'description')).toBe(AREA.y + 120 + 60)
  })

  it('anchors text at the edge or middle matching the alignment', () => {
    expect(coverFaceAnchorX(AREA, 'left')).toBe(100)
    expect(coverFaceAnchorX(AREA, 'center')).toBe(600)
    expect(coverFaceAnchorX(AREA, 'right')).toBe(1100)
  })
})
