import { describe, expect, it } from 'vitest'

import {
  expandPptTextBoxForFabricText,
  isFabricTextSingleVisualLine,
  pixelsToInches,
} from '@/utils/fabric-ppt-units'

describe('isFabricTextSingleVisualLine', () => {
  it('treats a one-line Game title as single-line', () => {
    expect(
      isFabricTextSingleVisualLine({
        text: 'Game\u00a01',
        _textLines: [['G', 'a', 'm', 'e', '\u00a0', '1']],
      }),
    ).toBe(true)
  })

  it('rejects hard line breaks', () => {
    expect(
      isFabricTextSingleVisualLine({
        text: 'Game\n1',
        _textLines: [['Game'], ['1']],
      }),
    ).toBe(false)
  })

  it('rejects soft-wrapped paragraphs', () => {
    expect(
      isFabricTextSingleVisualLine({
        text: 'Memorize each sequence, then write one character per box',
        _textLines: [['Memorize each sequence,'], ['then write one character per box']],
      }),
    ).toBe(false)
  })
})

describe('expandPptTextBoxForFabricText', () => {
  it('widens a tight centered Game title past Fabric bounds', () => {
    const pixelBounds = { width: 120, height: 42 }
    const box = {
      x: pixelsToInches(400),
      y: pixelsToInches(40),
      w: pixelsToInches(pixelBounds.width),
      h: pixelsToInches(pixelBounds.height),
    }

    const expanded = expandPptTextBoxForFabricText({
      box,
      object: {
        text: 'Game\u00a01',
        fontSize: 42,
        originX: 'center',
        textAlign: 'center',
        width: 120,
      },
      pixelBounds,
    })

    expect(expanded.w).toBeGreaterThan(box.w)
    // Stay centered on the original box midpoint.
    expect(expanded.x + expanded.w / 2).toBeCloseTo(box.x + box.w / 2, 5)
  })

  it('keeps textAlign center anchored when originX is left', () => {
    const pixelBounds = { width: 40, height: 22 }
    const box = {
      x: pixelsToInches(100),
      y: pixelsToInches(80),
      w: pixelsToInches(pixelBounds.width),
      h: pixelsToInches(pixelBounds.height),
    }

    const expanded = expandPptTextBoxForFabricText({
      box,
      object: {
        text: '8',
        fontSize: 20,
        originX: 'left',
        originY: 'top',
        textAlign: 'center',
        width: 40,
      },
      pixelBounds,
    })

    expect(expanded.w).toBeGreaterThan(box.w)
    expect(expanded.x + expanded.w / 2).toBeCloseTo(box.x + box.w / 2, 5)
    expect(expanded.y + expanded.h / 2).toBeCloseTo(box.y + box.h / 2, 5)
  })
})
