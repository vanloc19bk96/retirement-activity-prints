import { describe, it, expect } from 'vitest'
import { resetObjectCounter, type StudioTag } from '../studio-fabric-builders'
import { STUDIO_INK, STUDIO_STROKE_BOLD, STUDIO_STROKE_HAIRLINE } from '@/constants/studio.constants'
import {
  centeredBarOrigin,
  drawLineFigure,
  hairlineCenter,
  lineInkThickness,
} from './draw-lines'
import type { Segment } from './types'

const TAG: StudioTag = {
  templateKey: 'mirror-draw',
  instanceId: 'line-ink',
  pageRole: 'single',
}

const CELL = 40
const SIZE = 8
const BOUNDS = { left: 100, top: 100, width: CELL * SIZE, height: CELL * SIZE }

const GRID = {
  cell: CELL,
  bounds: BOUNDS,
}

function centerX(c: number): number {
  return hairlineCenter(c, SIZE, BOUNDS.left, BOUNDS.width, CELL)
}

function centerY(r: number): number {
  return hairlineCenter(r, SIZE, BOUNDS.top, BOUNDS.height, CELL)
}

describe('mirror-draw line ink', () => {
  it('keeps stroke thinner than a fifth of the cell', () => {
    expect(lineInkThickness(CELL)).toBe(Math.max(STUDIO_STROKE_BOLD, Math.round(CELL * 0.1)))
    expect(lineInkThickness(CELL)).toBeLessThan(CELL * 0.15)
  })

  it('centers a horizontal bar on the grid hairline', () => {
    resetObjectCounter()
    const segs: Segment[] = [{ r1: 3, c1: 1, r2: 3, c2: 3 }]
    const parts = drawLineFigure(GRID, segs, SIZE, 'vertical', TAG)
    const thickness = lineInkThickness(CELL)
    const bar = parts.find(
      (o) =>
        o.type === 'rect' &&
        o.studioRole === 'prompt' &&
        (o.width ?? 0) > thickness &&
        o.height === thickness,
    )
    expect(bar).toBeDefined()
    const midY = (bar!.top ?? 0) + (bar!.height ?? 0) / 2
    expect(Math.abs(midY - centerY(3))).toBeLessThanOrEqual(1)
    expect(bar!.fill).toBe(STUDIO_INK)
  })

  it('centers a vertical bar on the grid hairline', () => {
    resetObjectCounter()
    const segs: Segment[] = [{ r1: 1, c1: 2, r2: 4, c2: 2 }]
    const parts = drawLineFigure(GRID, segs, SIZE, 'vertical', TAG)
    const thickness = lineInkThickness(CELL)
    const bar = parts.find(
      (o) =>
        o.type === 'rect' &&
        o.studioRole === 'prompt' &&
        (o.height ?? 0) > thickness &&
        o.width === thickness,
    )
    expect(bar).toBeDefined()
    expect(bar!.left).toBe(centeredBarOrigin(centerX(2), thickness))
    const midX = (bar!.left ?? 0) + (bar!.width ?? 0) / 2
    expect(Math.abs(midX - centerX(2))).toBeLessThanOrEqual(0.5)
  })

  it('mid-axis vertical ink uses the same center as the dash axis', () => {
    resetObjectCounter()
    const mid = SIZE / 2
    const segs: Segment[] = [{ r1: 1, c1: mid, r2: 4, c2: mid }]
    const parts = drawLineFigure(GRID, segs, SIZE, 'vertical', TAG)
    const thickness = lineInkThickness(CELL)
    const bar = parts.find(
      (o) =>
        o.type === 'rect' &&
        o.width === thickness &&
        (o.height ?? 0) > thickness,
    )
    expect(bar).toBeDefined()
    const axisCenter = centerX(mid)
    expect(bar!.left).toBe(centeredBarOrigin(axisCenter, thickness))
    // Same formula the symmetry dashes use (draw.ts drawAxisDashBars).
    expect(bar!.left).toBe(Math.round(axisCenter - thickness / 2))
  })

  it('U bottom stays flush — vertical does not stub past the horizontal', () => {
    resetObjectCounter()
    // U: left vertical, bottom horizontal, right vertical.
    const segs: Segment[] = [
      { r1: 1, c1: 1, r2: 3, c2: 1 },
      { r1: 3, c1: 1, r2: 3, c2: 3 },
      { r1: 1, c1: 3, r2: 3, c2: 3 },
    ]
    const parts = drawLineFigure(GRID, segs, SIZE, 'vertical', TAG)
    const cy = centerY(3)
    const thickness = lineInkThickness(CELL)
    const outerBottom = centeredBarOrigin(cy, thickness) + thickness

    const verticals = parts.filter(
      (o) => o.type === 'rect' && o.width === thickness && (o.height ?? 0) > thickness,
    )
    expect(verticals.length).toBe(2)
    for (const v of verticals) {
      expect((v.top ?? 0) + (v.height ?? 0)).toBeLessThanOrEqual(outerBottom)
    }
  })

  it('does not emit Fabric lines', () => {
    resetObjectCounter()
    const segs: Segment[] = [
      { r1: 1, c1: 1, r2: 1, c2: 3 },
      { r1: 1, c1: 3, r2: 3, c2: 3 },
    ]
    const parts = drawLineFigure(GRID, segs, SIZE, 'vertical', TAG)
    expect(parts.every((o) => o.type === 'rect')).toBe(true)
    expect(parts.length).toBeGreaterThan(2)
  })

  it('hairline centers sit on the visible grid rule', () => {
    const internal = hairlineCenter(4, SIZE, BOUNDS.left, BOUNDS.width, CELL)
    expect(internal).toBeCloseTo(BOUNDS.left + 4 * CELL + STUDIO_STROKE_HAIRLINE / 2, 5)
  })
})
