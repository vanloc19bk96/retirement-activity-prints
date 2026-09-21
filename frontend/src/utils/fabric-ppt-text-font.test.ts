import { describe, expect, it } from 'vitest'

import {
  collectFabricTextFontFaces,
  mustRasterizePptFontFace,
  resolvePptNativeFontFace,
  shouldRasterizeFabricTextForPpt,
} from '@/utils/fabric-ppt-text-font'

describe('fabric-ppt-text-font', () => {
  it('keeps catalog webfonts editable (toolbar / studio faces)', () => {
    expect(mustRasterizePptFontFace('Lora')).toBe(false)
    expect(mustRasterizePptFontFace('DotGothic16')).toBe(false)
    expect(mustRasterizePptFontFace('Oi')).toBe(false)
    expect(mustRasterizePptFontFace('Open Sans')).toBe(false)
    expect(
      shouldRasterizeFabricTextForPpt({
        fontFamily: '"Lora", Georgia, serif',
      }),
    ).toBe(false)
  })

  it('keeps Inter, PT Serif, and Office system faces as editable PPT text', () => {
    expect(mustRasterizePptFontFace('Inter')).toBe(false)
    expect(mustRasterizePptFontFace('PT Serif')).toBe(false)
    expect(mustRasterizePptFontFace('Arial')).toBe(false)
    expect(mustRasterizePptFontFace('Segoe UI')).toBe(false)
    expect(shouldRasterizeFabricTextForPpt({ fontFamily: 'Inter' })).toBe(false)
    expect(
      shouldRasterizeFabricTextForPpt({
        fontFamily: '"PT Serif", Georgia, serif',
      }),
    ).toBe(false)
    expect(
      shouldRasterizeFabricTextForPpt({
        fontFamily: '"Inter", "Segoe UI", system-ui, sans-serif',
      }),
    ).toBe(false)
  })

  it('does not rasterize when per-character styles use a catalog webfont', () => {
    expect(
      shouldRasterizeFabricTextForPpt({
        fontFamily: 'Inter',
        styles: { 0: { 0: { fontFamily: 'DotGothic16' } } },
      }),
    ).toBe(false)
  })

  it('rasterizes unknown custom faces', () => {
    expect(mustRasterizePptFontFace('TotallyCustomDisplayFont')).toBe(true)
  })

  it('emits catalog primary names so font changes stay distinct in PPT', () => {
    expect(resolvePptNativeFontFace('Inter')).toBe('Inter')
    expect(resolvePptNativeFontFace('"Inter", "Segoe UI", system-ui, sans-serif')).toBe('Inter')
    expect(resolvePptNativeFontFace('PT Serif')).toBe('PT Serif')
    expect(resolvePptNativeFontFace('"PT Serif", Georgia, serif')).toBe('PT Serif')
    expect(resolvePptNativeFontFace('Lora')).toBe('Lora')
    expect(resolvePptNativeFontFace('"Lora", Georgia, serif')).toBe('Lora')
    expect(resolvePptNativeFontFace('"Open Sans", "Segoe UI", system-ui, sans-serif')).toBe(
      'Open Sans',
    )
    expect(resolvePptNativeFontFace('Roboto Mono')).toBe('Roboto Mono')
    expect(resolvePptNativeFontFace('DotGothic16')).toBe('DotGothic16')
    expect(resolvePptNativeFontFace('Arial')).toBe('Arial')
    expect(resolvePptNativeFontFace('serif')).toBe('Georgia')
  })

  it('collects object and style faces', () => {
    expect(
      collectFabricTextFontFaces({
        fontFamily: 'Inter',
        styles: { 0: { 0: { fontFamily: 'Lora' }, 1: { fontFamily: 'Lora' } } },
      }).toSorted(),
    ).toEqual(['Inter', 'Lora'])
  })
})
