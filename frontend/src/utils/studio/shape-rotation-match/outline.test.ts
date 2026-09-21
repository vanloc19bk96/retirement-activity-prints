import { describe, it, expect } from 'vitest'
import { createRng } from '../studio-rng'
import { interiorSegments, outlineLoops, type GridPoint } from './outline'
import { generateFigure } from './figure'
import type { Cell } from './types'

/** Boundary edges = 4 per cell, minus 2 for every shared edge. */
function expectedPerimeter(cells: readonly Cell[]): number {
  const filled = new Set(cells.map(({ r, c }) => `${r},${c}`))
  let shared = 0
  for (const { r, c } of cells) {
    if (filled.has(`${r},${c + 1}`)) shared++
    if (filled.has(`${r + 1},${c}`)) shared++
  }
  return cells.length * 4 - shared * 2
}

function loopPerimeter(loop: readonly GridPoint[]): number {
  let total = 0
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i]!
    const b = loop[(i + 1) % loop.length]!
    total += Math.abs(b.x - a.x) + Math.abs(b.y - a.y)
  }
  return total
}

function isClosedAxisAligned(loop: readonly GridPoint[]): boolean {
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i]!
    const b = loop[(i + 1) % loop.length]!
    const straight = (a.x === b.x) !== (a.y === b.y)
    if (!straight) return false
  }
  return true
}

describe('silhouette outline', () => {
  it('traces a single square as one four-corner loop', () => {
    const loops = outlineLoops([{ r: 0, c: 0 }])
    expect(loops.length).toBe(1)
    expect(loops[0]!.length).toBe(4)
    expect(loopPerimeter(loops[0]!)).toBe(4)
  })

  it('collapses a straight run into one polygon edge', () => {
    // 1×3 bar: six corners, not the ten points the raw unit edges would give.
    const loops = outlineLoops([
      { r: 0, c: 0 },
      { r: 0, c: 1 },
      { r: 0, c: 2 },
    ])
    expect(loops.length).toBe(1)
    expect(loops[0]!.length).toBe(4)
    expect(loopPerimeter(loops[0]!)).toBe(8)
  })

  it('traces an L block to its true corner count', () => {
    const loops = outlineLoops([
      { r: 0, c: 0 },
      { r: 1, c: 0 },
      { r: 2, c: 0 },
      { r: 2, c: 1 },
    ])
    expect(loops.length).toBe(1)
    expect(loops[0]!.length).toBe(6)
    expect(loopPerimeter(loops[0]!)).toBe(10)
  })

  it('emits the hole of a ring as its own loop', () => {
    const ring: Cell[] = []
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        if (r === 1 && c === 1) continue
        ring.push({ r, c })
      }
    }
    const loops = outlineLoops(ring)
    expect(loops.length).toBe(2)
    const perimeters = loops.map(loopPerimeter).sort((a, b) => a - b)
    expect(perimeters).toEqual([4, 12])
  })

  it('merges interior edges into the fewest straight runs', () => {
    // 2×3 block: two full-length grid lines, not seven unit stubs.
    const block: Cell[] = []
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) block.push({ r, c })
    const segments = interiorSegments(block)
    expect(segments.length).toBe(3)
    const horizontal = segments.filter(([a, b]) => a.y === b.y)
    expect(horizontal.length).toBe(1)
    expect(loopPerimeter(horizontal[0]!)).toBe(6) // there and back on a 3-unit run
  })

  it('every catalogued figure traces to closed loops of the right perimeter', () => {
    for (let seed = 1; seed <= 250; seed++) {
      const n = 5 + (seed % 6)
      const fig = generateFigure(n, createRng(seed))
      const loops = outlineLoops(fig.cells)
      expect(loops.length).toBe(1)
      for (const loop of loops) {
        expect(loop.length).toBeGreaterThanOrEqual(4)
        expect(isClosedAxisAligned(loop)).toBe(true)
      }
      const traced = loops.reduce((sum, loop) => sum + loopPerimeter(loop), 0)
      expect(traced).toBe(expectedPerimeter(fig.cells))
    }
  })

  it('interior runs cover every shared edge exactly once', () => {
    for (let seed = 1; seed <= 250; seed++) {
      const fig = generateFigure(5 + (seed % 6), createRng(seed))
      const covered = interiorSegments(fig.cells).reduce(
        (sum, [a, b]) => sum + Math.abs(b.x - a.x) + Math.abs(b.y - a.y),
        0,
      )
      const shared = (fig.cells.length * 4 - expectedPerimeter(fig.cells)) / 2
      expect(covered).toBe(shared)
    }
  })
})
