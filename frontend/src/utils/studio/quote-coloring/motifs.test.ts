import { describe, it, expect } from 'vitest'
import { rasterCheck } from '../stained-glass/raster'
import { createRng } from '../studio-rng'
import { QC_INK, motifMinRadius } from './compose'
import { QC_DETAILS } from './content'
import { QC_FILLERS, QC_MOTIFS, drawingRadius, placeMotif, type QcMotif } from './motifs'

const ALL: QcMotif[] = [...QC_MOTIFS, ...Object.values(QC_FILLERS).flat()]
const VARIANTS = [1, 2, 3, 4, 5, 6]

function measure(motif: QcMotif, seed: number, r: number, deg = 0) {
  const lines = placeMotif(motif.build(createRng(seed)), 300, 300, r, deg)
  const report = rasterCheck(
    lines.map((pts) => ({ pts, width: QC_INK.motif })),
    { minX: 300 - r - 8, minY: 300 - r - 8, maxX: 300 + r + 8, maxY: 300 + r + 8 },
  )
  return { lines, regions: report.regions.filter((region) => region.area > 24) }
}

describe('quote coloring motifs', () => {
  it('has distinct ids and all three sets', () => {
    expect(new Set(ALL.map((m) => m.id)).size).toBe(ALL.length)
    for (const set of ['floral', 'geometric', 'travel'] as const) {
      expect(QC_MOTIFS.filter((m) => m.set === set).length).toBeGreaterThanOrEqual(7)
      expect(QC_FILLERS[set].length).toBeGreaterThanOrEqual(2)
    }
  })

  // The claim `motifs.ts` makes about `minR`: at that radius, scaled for each
  // level's floor, every version and turn of every motif prints only regions
  // a pencil can fill — and the same regions as at a large size, so nothing
  // has closed up into a blot.
  it.each(ALL.map((m) => [m.id, m] as const))('%s clears every level’s floor at its smallest size', (_id, motif) => {
    for (const detail of QC_DETAILS) {
      const r = motifMinRadius(motif, detail)
      for (const seed of VARIANTS) {
        for (const deg of motif.upright ? [0, 10] : [0, 45]) {
          // A thin neck may pinch one space into two at the smallest size,
          // each still colorable; a space that vanishes has closed into a blot.
          const large = measure(motif, seed, 160, deg).regions.length
          const { regions } = measure(motif, seed, r, deg)
          expect(regions.length, `${motif.id} v${seed} ${detail.value}`).toBeGreaterThanOrEqual(large)
          for (const region of regions) {
            expect(region.width, `${motif.id} v${seed} ${detail.value}`).toBeGreaterThanOrEqual(detail.floor.minWidth)
            expect(region.area, `${motif.id} v${seed} ${detail.value}`).toBeGreaterThanOrEqual(detail.floor.minArea)
          }
        }
      }
    }
  }, 60000)

  it('keeps every motif inside its circle, whatever its version', () => {
    for (const motif of ALL) {
      for (const seed of VARIANTS) {
        const { lines } = measure(motif, seed, 50, 30)
        for (const p of lines.flat()) expect(Math.hypot(p.x - 300, p.y - 300), motif.id).toBeLessThanOrEqual(50.01)
        expect(drawingRadius(motif.build(createRng(seed)))).toBeGreaterThan(0.5)
      }
    }
  })

  it('draws closed shapes — every motif encloses at least one space to color', () => {
    for (const motif of ALL) expect(measure(motif, 1, 120).regions.length, motif.id).toBeGreaterThan(0)
  })
})
