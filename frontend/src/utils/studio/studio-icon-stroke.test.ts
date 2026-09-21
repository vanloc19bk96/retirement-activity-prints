import { describe, expect, it } from 'vitest'
import { LUCIDE_VIEWBOX_SIZE } from '@/utils/lucide-fabric'
import { buildIconPath } from './studio-icon'

const TAG = {
  templateKey: 'sudoku',
  instanceId: 'test',
  pageRole: 'single' as const,
}

type NestedStroke = {
  stroke?: unknown
  strokeWidth?: number
  objects?: NestedStroke[]
}

function collectStrokeWidths(node: NestedStroke): number[] {
  const widths: number[] = []
  if (typeof node.strokeWidth === 'number' && node.strokeWidth > 0) {
    widths.push(node.strokeWidth)
  }
  for (const child of node.objects ?? []) {
    widths.push(...collectStrokeWidths(child))
  }
  return widths
}

describe('buildIconPath stroke uniformity', () => {
  it('keeps icon visual size near the requested size (no giant square)', () => {
    const size = 16
    for (const name of ['star', 'wine', 'flag', 'heart', 'birdhouse'] as const) {
      const icon = buildIconPath(
        name,
        { left: 0, top: 0, size, strokeWidth: 1.5 },
        TAG,
      )
      const visualW = Number(icon.width) * Number(icon.scaleX ?? 1)
      const visualH = Number(icon.height) * Number(icon.scaleY ?? 1)
      // ViewBox frame pins bounds near 24×24; never explode to multi-cell size.
      expect(visualW).toBeLessThanOrEqual(size * 1.15)
      expect(visualH).toBeLessThanOrEqual(size * 1.15)
      expect(visualW).toBeGreaterThan(size * 0.85)
      // Group container must not paint its own stroke box (giant empty square).
      expect(Number(icon.strokeWidth ?? 0)).toBe(0)
    }
  })

  it('keeps the same visual stroke for narrow and wide Lucide icons', () => {
    const size = 16
    const visualStroke = 1.5
    const scale = size / LUCIDE_VIEWBOX_SIZE

    const narrow = buildIconPath(
      'wine',
      { left: 0, top: 0, size, strokeWidth: visualStroke },
      TAG,
    )
    const wide = buildIconPath(
      'birdhouse',
      { left: 0, top: 0, size, strokeWidth: visualStroke },
      TAG,
    )

    const narrowScale = Number(narrow.scaleX)
    const wideScale = Number(wide.scaleX)
    expect(narrowScale).toBeCloseTo(scale, 3)
    expect(wideScale).toBeCloseTo(narrowScale, 5)

    const narrowStrokes = collectStrokeWidths(narrow as NestedStroke)
    const wideStrokes = collectStrokeWidths(wide as NestedStroke)
    expect(narrowStrokes.length).toBeGreaterThan(0)
    expect(wideStrokes.length).toBeGreaterThan(0)

    // strokeUniform → absolute weight; must match across glyph shapes.
    for (const stroke of [...narrowStrokes, ...wideStrokes]) {
      expect(stroke).toBeCloseTo(visualStroke, 3)
    }
  })

  it('keeps the same absolute stroke at medium and dense icon sizes', () => {
    const visualStroke = 1
    const medium = buildIconPath(
      'star',
      { left: 0, top: 0, size: 24, strokeWidth: visualStroke },
      TAG,
    )
    const dense = buildIconPath(
      'star',
      { left: 0, top: 0, size: 12, strokeWidth: visualStroke },
      TAG,
    )

    const mediumStrokes = collectStrokeWidths(medium as NestedStroke)
    const denseStrokes = collectStrokeWidths(dense as NestedStroke)
    expect(mediumStrokes.length).toBeGreaterThan(0)
    expect(denseStrokes.length).toBeGreaterThan(0)

    for (const stroke of [...mediumStrokes, ...denseStrokes]) {
      expect(stroke).toBeCloseTo(visualStroke, 3)
    }
  })
})
