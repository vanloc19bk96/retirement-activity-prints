import { describe, expect, it } from 'vitest'

import {
  averageColor,
  dominantColors,
  mergeSwatches,
  readableTextColor,
} from './book-cover-spine-palette'

function pixels(...colors: Array<[number, number, number, number]>): Uint8ClampedArray {
  return new Uint8ClampedArray(colors.flat())
}

describe('book-cover-spine-palette', () => {
  it('averages only opaque pixels', () => {
    expect(averageColor(pixels([255, 0, 0, 255], [0, 0, 255, 255], [0, 255, 0, 0]))).toBe('#800080')
    expect(averageColor(pixels([10, 10, 10, 0]))).toBeNull()
  })

  it('ranks the most common colors first and drops near-duplicates', () => {
    const data = pixels(
      [20, 40, 200, 255],
      [22, 41, 201, 255],
      [21, 40, 199, 255],
      [250, 220, 30, 255],
      [250, 220, 30, 255],
      [255, 255, 255, 255],
    )
    const colors = dominantColors(data, 8)
    expect(colors).toHaveLength(3)
    expect(colors[0]).toBe('#1528c8')
    expect(colors[1]).toBe('#fadc1e')
  })

  it('merges swatches and caps the count', () => {
    expect(mergeSwatches(['#000000', '#050505', null, '#ffffff', '#ff0000'], 2)).toEqual([
      '#000000',
      '#ffffff',
    ])
  })

  it('picks readable text on light and dark backgrounds', () => {
    expect(readableTextColor('#1e3a5f')).toBe('#ffffff')
    expect(readableTextColor('#f5e6c8')).toBe('#111111')
    expect(readableTextColor('not a color')).toBe('#111111')
  })
})
