import { describe, expect, it } from 'vitest'
import { STUDIO_SAFE_AREA_PADDING_Y } from '@/constants/studio.constants'
import { DPI, calculateMarginGuide } from '@/types/canvas-settings.types'
import { resolveStudioMarginForPage, studioMarginGuideForPageCount } from './studio-margin'

const inches = (value: number) => Math.round(value * DPI)
const PAGE = { pageWidth: inches(8.5), pageHeight: inches(11) }

describe('studioMarginGuideForPageCount', () => {
  it.each([
    [24, 0.375],
    [150, 0.375],
    [151, 0.5],
    [300, 0.5],
    [301, 0.625],
    [500, 0.625],
    [501, 0.75],
    [700, 0.75],
    [701, 0.875],
    [828, 0.875],
  ])('sizes the gutter of a %i-page book at %fin', (pageCount, gutter) => {
    const guide = studioMarginGuideForPageCount(calculateMarginGuide(24, false), pageCount)
    expect(guide.insidePixels).toBe(inches(gutter))
  })

  it('never narrows a guide already sized for a bigger book', () => {
    const big = calculateMarginGuide(400, true)
    expect(studioMarginGuideForPageCount(big, 30)).toBe(big)
  })

  it('leaves outside, top, bottom and bleed alone', () => {
    const base = calculateMarginGuide(24, true)
    const grown = studioMarginGuideForPageCount(base, 320)
    expect({ ...grown, insidePixels: base.insidePixels }).toEqual(base)
  })
})

describe('resolveStudioMarginForPage', () => {
  it.each([false, true])('keeps KDP minimums on both sides of the spread (bleed %s)', (bleed) => {
    const guide = calculateMarginGuide(200, bleed)
    const width = PAGE.pageWidth + (bleed ? inches(0.125) : 0)
    const height = PAGE.pageHeight + (bleed ? inches(0.25) : 0)
    const bleedEdge = bleed ? inches(0.125) : 0
    const outside = inches(bleed ? 0.375 : 0.25) + bleedEdge
    const recto = resolveStudioMarginForPage({
      pageIndex: 0,
      pageWidth: width,
      pageHeight: height,
      marginGuide: guide,
    })
    const verso = resolveStudioMarginForPage({
      pageIndex: 1,
      pageWidth: width,
      pageHeight: height,
      marginGuide: guide,
    })
    // Recto: gutter on the left. Verso: gutter on the right. No bleed at the spine.
    expect(recto.left).toBe(inches(0.5))
    expect(recto.right).toBe(outside)
    expect(verso.left).toBe(outside)
    expect(verso.right).toBe(inches(0.5))
    // Head and foot keep a little air inside the guide.
    expect(recto.top).toBe(outside + STUDIO_SAFE_AREA_PADDING_Y)
    expect(recto.bottom).toBe(outside + STUDIO_SAFE_AREA_PADDING_Y)
    // Same column either side, so a sheet laid out once can be shifted across.
    expect(width - recto.left - recto.right).toBe(width - verso.left - verso.right)
  })
})
