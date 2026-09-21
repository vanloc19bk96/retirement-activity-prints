/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'

import { computeVectorExportInlineSize } from '@/utils/fabric-images-for-vector-export'

describe('computeVectorExportInlineSize', () => {
  it('downscales large natural PNGs to print-scaled display size', () => {
    // Study-grid cell ~100px display, natural outline often 600–1200px.
    const size = computeVectorExportInlineSize({
      naturalWidth: 1200,
      naturalHeight: 1200,
      displayWidth: 100,
      displayHeight: 100,
    })
    // 100 * (300/96) ≈ 313
    expect(size.width).toBe(313)
    expect(size.height).toBe(313)
  })

  it('never upscales past natural size', () => {
    const size = computeVectorExportInlineSize({
      naturalWidth: 80,
      naturalHeight: 60,
      displayWidth: 200,
      displayHeight: 150,
    })
    expect(size.width).toBe(80)
    expect(size.height).toBe(60)
  })

  it('caps edge length so one dense recall grid cannot blow peak RAM', () => {
    const size = computeVectorExportInlineSize({
      naturalWidth: 4000,
      naturalHeight: 4000,
      displayWidth: 800,
      displayHeight: 800,
    })
    expect(size.width).toBe(1024)
    expect(size.height).toBe(1024)
  })

  it('preserves crop aspect when source window is not square', () => {
    // Cropped 1024×867 source shown ~637×539 — must not collapse to 1024×1024.
    const size = computeVectorExportInlineSize({
      naturalWidth: 1024,
      naturalHeight: 867,
      displayWidth: 637.2352,
      displayHeight: 539.45544128,
    })
    expect(size.width).toBe(1024)
    expect(size.height).toBe(867)
    expect(size.width / size.height).toBeCloseTo(1024 / 867, 2)
  })
})
