import { describe, it, expect } from 'vitest'
import { isSvgImageSrc } from './canvas-svg'

describe('isSvgImageSrc', () => {
  it('detects SVG data URIs and .svg paths', () => {
    expect(isSvgImageSrc('data:image/svg+xml;base64,abc')).toBe(true)
    expect(isSvgImageSrc('data:image/svg+xml;charset=utf-8,<svg/>')).toBe(true)
    expect(isSvgImageSrc('https://cdn.example.com/icons/star.svg')).toBe(true)
    expect(isSvgImageSrc('https://cdn.example.com/icons/star.svg?v=2')).toBe(true)
  })

  it('rejects raster image sources', () => {
    expect(isSvgImageSrc('https://cdn.example.com/photo.png')).toBe(false)
    expect(isSvgImageSrc('data:image/png;base64,abc')).toBe(false)
  })
})
