import { describe, expect, it } from 'vitest'

import {
  computeSpineTextLayout,
  type SpineTextLayoutInput,
  type SpineTextMeasure,
} from './book-cover-spine-layout'

// 0.5" wide spine, 11" tall, at 96 DPI.
const SAFE_AREA = { x: 1000, y: 24, width: 36, height: 1032 }

const TITLE: SpineTextMeasure = { role: 'title', widthAt100: 1500, heightAt100: 100 }
const AUTHOR: SpineTextMeasure = { role: 'author', widthAt100: 900, heightAt100: 100 }
const PUBLISHER: SpineTextMeasure = { role: 'publisher', widthAt100: 400, heightAt100: 100 }

function layout(overrides: Partial<SpineTextLayoutInput> = {}) {
  return computeSpineTextLayout({
    safeArea: SAFE_AREA,
    endMarginPx: 24,
    items: [TITLE, AUTHOR],
    layout: 'split',
    direction: 'top-to-bottom',
    textScale: 1,
    ...overrides,
  })
}

function extentOnAxis(placement: { top: number; fontSize: number }, measure: SpineTextMeasure) {
  const length = (measure.widthAt100 / 100) * placement.fontSize
  return { start: placement.top - length / 2, end: placement.top + length / 2 }
}

describe('computeSpineTextLayout', () => {
  it('sizes the title to fill the spine width and keeps every line box inside it', () => {
    const result = layout()
    const title = result.find((p) => p.role === 'title')!
    expect(title.fontSize).toBeCloseTo(36 * 0.9)
    for (const placement of result) {
      expect(placement.fontSize).toBeLessThanOrEqual(SAFE_AREA.width)
      expect(placement.left).toBe(SAFE_AREA.x + SAFE_AREA.width / 2)
    }
  })

  it('shrinks long text so the whole run fits along the spine', () => {
    const longTitle = { ...TITLE, widthAt100: 9000 }
    const result = layout({ items: [longTitle, AUTHOR] })
    const [title, author] = result
    const titleSpan = extentOnAxis(title, longTitle)
    const authorSpan = extentOnAxis(author, AUTHOR)
    expect(titleSpan.start).toBeGreaterThanOrEqual(SAFE_AREA.y + 24 - 0.001)
    expect(authorSpan.end).toBeLessThanOrEqual(SAFE_AREA.y + SAFE_AREA.height - 24 + 0.001)
    expect(titleSpan.end).toBeLessThan(authorSpan.start)
  })

  it('pins the author to the reading end in the split layout', () => {
    const down = layout()
    const up = layout({ direction: 'bottom-to-top' })
    const authorDown = down.find((p) => p.role === 'author')!
    const authorUp = up.find((p) => p.role === 'author')!
    const authorLength = (AUTHOR.widthAt100 / 100) * authorDown.fontSize

    expect(authorDown.angle).toBe(90)
    expect(authorUp.angle).toBe(-90)
    expect(authorDown.top + authorLength / 2).toBeCloseTo(SAFE_AREA.y + SAFE_AREA.height - 24)
    expect(authorUp.top - authorLength / 2).toBeCloseTo(SAFE_AREA.y + 24)
  })

  it('centers title and author together in the centered layout', () => {
    const result = layout({ layout: 'centered' })
    const [title, author] = result
    const titleLength = (TITLE.widthAt100 / 100) * title.fontSize
    const authorLength = (AUTHOR.widthAt100 / 100) * author.fontSize
    const runStart = title.top - titleLength / 2
    const runEnd = author.top + authorLength / 2
    expect((runStart + runEnd) / 2).toBeCloseTo(SAFE_AREA.y + SAFE_AREA.height / 2)
  })

  it('keeps the publisher at the end, after the author', () => {
    const result = layout({ items: [PUBLISHER, AUTHOR, TITLE] })
    expect(result.map((p) => p.role)).toEqual(['title', 'author', 'publisher'])
    const [title, author, publisher] = result
    expect(title.top).toBeLessThan(author.top)
    expect(author.top).toBeLessThan(publisher.top)
  })

  it('applies the text scale', () => {
    const full = layout()[0]
    const half = layout({ textScale: 0.5 })[0]
    expect(half.fontSize).toBeCloseTo(full.fontSize / 2)
  })

  it('returns nothing when the spine has no room or there is no text', () => {
    expect(layout({ items: [] })).toEqual([])
    expect(layout({ safeArea: { ...SAFE_AREA, width: 0 } })).toEqual([])
    expect(layout({ items: [{ ...TITLE, widthAt100: 0 }] })).toEqual([])
  })
})
