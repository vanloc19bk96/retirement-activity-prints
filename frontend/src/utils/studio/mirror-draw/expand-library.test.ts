import { describe, it, expect } from 'vitest'
import { createRng } from '../studio-rng'
import {
  buildExpandedLibrary,
  defaultPatternsPath,
  libraryCoverageSummary,
  writeExpandedLibrary,
} from './expand-library'
import { drawThemedHalf, passesHalfQuality, SHAPE_CATALOG, shapesForTheme } from './shapes'
import { MIRROR_GRID_SIZES, MIRROR_THEMES } from './types'

describe('mirror-draw production scale', () => {
  it('shape catalog covers every theme with multiple families', () => {
    for (const theme of MIRROR_THEMES) {
      expect(shapesForTheme(theme).length, theme).toBeGreaterThanOrEqual(6)
    }
    expect(SHAPE_CATALOG.length).toBeGreaterThanOrEqual(24)
  })

  it('themed procedural half succeeds per size and theme', () => {
    for (const size of MIRROR_GRID_SIZES) {
      for (const theme of MIRROR_THEMES) {
        let found = false
        for (let seed = 1; seed <= 40; seed++) {
          const { half } = drawThemedHalf(size, theme, createRng(seed))
          if (passesHalfQuality(half, size)) {
            found = true
            expect(half.length).toBe(size)
            expect(half[0]!.length).toBe(size / 2)
            break
          }
        }
        expect(found, `no themed half for ${theme}@${size}`).toBe(true)
      }
    }
  })

  it('expanded builder produces a large deduped library', () => {
    const lib = buildExpandedLibrary()
    const pixel = lib.filter((p) => p.style === 'pixel')
    expect(pixel.length).toBeGreaterThanOrEqual(200)
    const keys = new Set(pixel.map((p) => `${p.rows}|${p.half.join('')}`))
    expect(keys.size).toBe(pixel.length)
  })

  it('writes expanded patterns.json when EXPAND_MIRROR_DRAW=1', () => {
    if (process.env.EXPAND_MIRROR_DRAW !== '1') return
    const result = writeExpandedLibrary(defaultPatternsPath())
    expect(result.total).toBeGreaterThan(200)
    const summary = libraryCoverageSummary()
    // eslint-disable-next-line no-console
    console.log(
      `Wrote ${result.total} patterns (+${result.added}, pixel=${result.pixel}) → ${defaultPatternsPath()}`,
      summary.bySizeTheme,
    )
  })
})
