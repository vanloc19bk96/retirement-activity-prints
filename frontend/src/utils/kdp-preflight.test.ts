/**
 * @vitest-environment jsdom
 */
import { Canvas, FabricImage, Rect as FabricRect, Textbox } from 'fabric'
import { describe, expect, it } from 'vitest'

import { calculateBookCoverDimensions, calculateBookCoverZones } from '@/types/book-cover.types'
import { calculateMarginGuide, parsePageSizeLabel } from '@/types/canvas-settings.types'
import {
  buildCoverPreflightSurface,
  buildInteriorPreflightSurface,
  collectPreflightItems,
  evaluatePreflight,
  type PreflightItem,
} from '@/utils/kdp-preflight'

// 6 × 9 in page at 96 px/in, no bleed: 576 × 864, inside margin 36 px, outside/top/bottom 24 px.
const interior = buildInteriorPreflightSurface({
  width: 576,
  height: 864,
  marginGuide: calculateMarginGuide(100, false),
  isLeftPage: false,
  hasBleed: false,
})

function item(patch: Partial<PreflightItem>): PreflightItem {
  return {
    layerId: 'layer',
    layerName: 'Layer',
    kind: 'shape',
    isVisible: true,
    bounds: { left: 100, top: 100, right: 200, bottom: 200 },
    isText: false,
    isEmptyText: false,
    imageDpi: null,
    ...patch,
  }
}

const ruleIds = (items: PreflightItem[], surface = interior): string[] =>
  evaluatePreflight(items, surface).map((issue) => issue.ruleId)

describe('evaluatePreflight on an interior page', () => {
  it('passes content inside the margins', () => {
    expect(ruleIds([item({}), item({ isText: true, kind: 'text' })])).toEqual([])
  })

  it('flags text past the margin but not a shape in the same place', () => {
    const bounds = { left: 10, top: 100, right: 200, bottom: 200 }
    expect(ruleIds([item({ isText: true, kind: 'text', bounds })])).toEqual(['text-outside-safe-area'])
    expect(ruleIds([item({ bounds })])).toEqual([])
  })

  it('flags art cut at the trim when the book has no bleed', () => {
    expect(ruleIds([item({ bounds: { left: -20, top: 100, right: 200, bottom: 200 } })])).toEqual(['cut-at-edge'])
  })

  it('flags art that crosses into the bleed without reaching the page edge', () => {
    const withBleed = buildInteriorPreflightSurface({
      width: 588,
      height: 888,
      marginGuide: calculateMarginGuide(100, true),
      isLeftPage: false,
      hasBleed: true,
    })
    // Right page: outside (bleed) edge is the right one, trim at 576.
    expect(ruleIds([item({ bounds: { left: 300, top: 100, right: 582, bottom: 200 } })], withBleed)).toEqual(['bleed-gap'])
    expect(ruleIds([item({ bounds: { left: 300, top: 100, right: 588, bottom: 200 } })], withBleed)).toEqual([])
    // A full-bleed background behind it fills the gap, so no strip can show.
    expect(
      ruleIds(
        [
          item({ layerId: 'texture', bounds: { left: 300, top: 100, right: 582, bottom: 200 } }),
          item({ layerId: 'background', bounds: withBleed.page }),
        ],
        withBleed,
      ),
    ).toEqual([])
    // The inside edge never has bleed.
    expect(ruleIds([item({ bounds: { left: -10, top: 100, right: 200, bottom: 200 } })], withBleed)).toEqual(['cut-at-edge'])
  })

  it('grades image resolution and orders errors first', () => {
    const issues = evaluatePreflight(
      [item({ layerId: 'a', imageDpi: 240 }), item({ layerId: 'b', imageDpi: 120 }), item({ layerId: 'c', imageDpi: 300 })],
      interior,
    )
    expect(issues.map((issue) => [issue.layerId, issue.severity])).toEqual([
      ['b', 'error'],
      ['a', 'warning'],
    ])
  })

  it('reports hidden, off-page and empty layers once each', () => {
    expect(
      ruleIds([
        item({ isVisible: false, bounds: { left: -500, top: 0, right: -400, bottom: 10 } }),
        item({ bounds: { left: 700, top: 0, right: 800, bottom: 10 } }),
        item({ isText: true, kind: 'text', isEmptyText: true, bounds: { left: -5, top: 0, right: 10, bottom: 10 } }),
      ]),
    ).toEqual(['off-page', 'hidden-layer', 'empty-text'])
  })
})

describe('evaluatePreflight on the cover', () => {
  const dims = calculateBookCoverDimensions(parsePageSizeLabel('6 x 9 in'), 200)
  const zones = calculateBookCoverZones(dims)
  const cover = buildCoverPreflightSurface(zones)

  it('accepts text on the front and spine safe areas', () => {
    const front = zones.frontSafeArea
    const spine = zones.spineSafeArea
    expect(
      ruleIds(
        [
          item({ isText: true, kind: 'text', bounds: { left: front.x + 10, top: front.y + 10, right: front.x + 100, bottom: front.y + 40 } }),
          item({ isText: true, kind: 'text', bounds: { left: spine.x, top: spine.y + 10, right: spine.x + spine.width, bottom: spine.y + 200 } }),
        ],
        cover,
      ),
    ).toEqual([])
  })

  it('explains spine text that is wider than the spine', () => {
    const spine = zones.spine
    const bounds = { left: spine.x - 20, top: spine.y + 10, right: spine.x + spine.width + 20, bottom: spine.y + 100 }
    expect(ruleIds([item({ isText: true, kind: 'text', bounds })], cover)).toEqual(['spine-text'])
  })

  it('flags small things over the barcode but not the back-cover background', () => {
    const barcode = zones.barcodeArea
    const sticker = { left: barcode.x + 5, top: barcode.y + 5, right: barcode.x + 50, bottom: barcode.y + 50 }
    expect(ruleIds([item({ bounds: sticker })], cover)).toEqual(['barcode-area'])
    expect(ruleIds([item({ bounds: cover.page })], cover)).toEqual([])
  })
})

describe('collectPreflightItems', () => {
  it('reads bounds, text and image resolution from the canvas', () => {
    const canvas = new Canvas(document.createElement('canvas'))
    const element = document.createElement('canvas')
    element.width = 400
    element.height = 300
    // 400 px shown 2 in wide = 200 DPI.
    const image = new FabricImage(element, { left: 0, top: 0, scaleX: 192 / 400, scaleY: 192 / 400 })
    const empty = new Textbox('   ', { left: 10, top: 10, width: 100 })
    canvas.add(new FabricRect({ left: 0, top: 0, width: 50, height: 50 }), image, empty)

    const items = collectPreflightItems(canvas)
    expect(items.map((entry) => entry.kind)).toEqual(['text', 'image', 'shape'])
    expect(items[0].isEmptyText).toBe(true)
    expect(Math.round(items[1].imageDpi ?? 0)).toBe(200)
    expect(items[2].imageDpi).toBeNull()
    canvas.dispose()
  })
})
