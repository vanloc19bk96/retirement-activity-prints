import { describe, it, expect } from 'vitest'
import { FabricText, Textbox } from 'fabric'
import {
  FABRIC_TEXT_FONT_SIZE_FRACTION,
  FABRIC_TEXT_FONT_SIZE_MULT,
  FABRIC_TEXT_LINE_HEIGHT,
  applyFabricTightTextVerticalMetrics,
  centeredFontSizeFraction,
  inkCenteredFontSizeFraction,
  measureTextInkExtent,
  syncFabricTextInkCenteredFraction,
  type CenteredFractionInput,
} from './fabric-text-vertical-metrics'

/**
 * Where Fabric paints the ink for a given `_fontSizeFraction`: line `i` sits on a
 * baseline at `i x pitch + M(1 - f)` inside a box `(n - 1) x pitch + M` tall.
 */
function inkGaps(input: CenteredFractionInput, fraction: number) {
  const box = FABRIC_TEXT_FONT_SIZE_MULT
  const pitch = box * input.lineHeight
  const height = (input.lineCount - 1) * pitch + box
  const baseline = (line: number) => line * pitch + box * (1 - fraction)
  return {
    top: baseline(input.firstInkLine) - input.ascentEm,
    bottom: height - (baseline(input.lastInkLine) + input.descentEm),
  }
}

describe('applyFabricTightTextVerticalMetrics', () => {
  it('patches FabricText defaults for a tight line box with descender room', () => {
    applyFabricTightTextVerticalMetrics()

    expect(FabricText.ownDefaults._fontSizeMult).toBe(FABRIC_TEXT_FONT_SIZE_MULT)
    expect(FabricText.ownDefaults._fontSizeFraction).toBe(FABRIC_TEXT_FONT_SIZE_FRACTION)
    expect(FabricText.ownDefaults.lineHeight).toBe(FABRIC_TEXT_LINE_HEIGHT)
    // The fallback split must still clear g/p/y tails when ink is unmeasurable.
    expect(FABRIC_TEXT_FONT_SIZE_MULT * FABRIC_TEXT_FONT_SIZE_FRACTION).toBeGreaterThanOrEqual(0.22)
    // No extra Fabric air above the em square.
    expect(FABRIC_TEXT_FONT_SIZE_MULT).toBeLessThanOrEqual(1)
  })

  it('re-centres text on every re-measure, Textbox included', () => {
    applyFabricTightTextVerticalMetrics()

    // Textbox overrides initDimensions without calling super, so it needs its own
    // patch — losing it is what leaves typed text stuck on a stale baseline.
    for (const klass of [FabricText, Textbox]) {
      const initDimensions = Object.getOwnPropertyDescriptor(klass.prototype, 'initDimensions')?.value
      expect(initDimensions?.name).toBe('patchedInitDimensions')
    }
  })
})

describe('centeredFontSizeFraction', () => {
  it('gives a caps-only line equal air above and below', () => {
    // A serif cap is ~0.66em tall and has no descender: the stock constant
    // fraction would park all 0.24em of slack under it.
    const input: CenteredFractionInput = {
      ascentEm: 0.662,
      descentEm: 0,
      lineCount: 1,
      firstInkLine: 0,
      lastInkLine: 0,
      lineHeight: 1,
    }
    const fraction = centeredFontSizeFraction(input)
    const { top, bottom } = inkGaps(input, fraction)

    expect(fraction).toBeCloseTo(0.169, 6)
    expect(top).toBeCloseTo(bottom, 10)
    expect(top).toBeGreaterThan(0)
  })

  it('centres a line that has a descender', () => {
    const input: CenteredFractionInput = {
      ascentEm: 0.662,
      descentEm: 0.21,
      lineCount: 1,
      firstInkLine: 0,
      lastInkLine: 0,
      lineHeight: 1,
    }
    const { top, bottom } = inkGaps(input, centeredFontSizeFraction(input))

    expect(top).toBeCloseTo(bottom, 10)
  })

  it('centres a multi-line block against its first and last inked lines', () => {
    const input: CenteredFractionInput = {
      ascentEm: 0.7,
      descentEm: 0.2,
      lineCount: 3,
      firstInkLine: 0,
      lastInkLine: 2,
      lineHeight: 1.2,
    }
    const { top, bottom } = inkGaps(input, centeredFontSizeFraction(input))

    expect(top).toBeCloseTo(bottom, 10)
  })

  it('pays for a blank leading line out of the space below the ink', () => {
    const input: CenteredFractionInput = {
      ascentEm: 0.662,
      descentEm: 0,
      lineCount: 2,
      firstInkLine: 1,
      lastInkLine: 1,
      lineHeight: 1,
    }
    const { top, bottom } = inkGaps(input, centeredFontSizeFraction(input))

    expect(top).toBeCloseTo(bottom, 10)
  })

  it('keeps the baseline inside the line box when metrics are nonsense', () => {
    const fraction = centeredFontSizeFraction({
      ascentEm: 40,
      descentEm: -12,
      lineCount: 1,
      firstInkLine: 0,
      lastInkLine: 0,
      lineHeight: 1,
    })

    expect(fraction).toBeGreaterThanOrEqual(0)
    expect(fraction).toBeLessThanOrEqual(1)
  })
})

describe('inkCenteredFontSizeFraction', () => {
  it('falls back to the constant split when ink cannot be measured', () => {
    // jsdom has no real text metrics, which is also the SSR/export-worker case.
    expect(inkCenteredFontSizeFraction({ text: 'A' })).toBe(FABRIC_TEXT_FONT_SIZE_FRACTION)
    expect(inkCenteredFontSizeFraction({ text: '' })).toBe(FABRIC_TEXT_FONT_SIZE_FRACTION)
  })

  it('ignores blank lines when picking the ink to centre on', () => {
    // Whitespace has no ink, so it must never become the line the gaps balance
    // against — that is what keeps a trailing newline from shoving text upward.
    expect(measureTextInkExtent('   ', '400px "Stub"')).toBeNull()
    expect(measureTextInkExtent('', '400px "Stub"')).toBeNull()
  })

  it('marks an object dirty only when its baseline actually moves', () => {
    const target: { _fontSizeFraction?: number; dirty?: boolean; text?: string } = {
      text: 'A',
      _fontSizeFraction: 0.9,
      dirty: false,
    }
    syncFabricTextInkCenteredFraction(target)
    expect(target._fontSizeFraction).toBe(FABRIC_TEXT_FONT_SIZE_FRACTION)
    expect(target.dirty).toBe(true)

    target.dirty = false
    syncFabricTextInkCenteredFraction(target)
    expect(target.dirty).toBe(false)
  })
})
