import { describe, it, expect } from 'vitest'
import {
  trailMakingTemplate,
  buildSequence,
  scatterNodes,
  clampNodeCount,
  buildNodes,
  centerNodesInBox,
  rimToRimSegment,
  countTrailCircleHits,
  distToSegment,
  orderForClearTrail,
} from './generate'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { resetObjectCounter } from '../studio-fabric-builders'
import { createRng } from '../studio-rng'
import { runGeneratorContractTests } from '../studio-generator-test'
import type {
  StudioConfig,
  StudioFabricObject,
  StudioGenerateContext,
} from '@/types/studio-template.types'

function flattenObjects(objects: StudioFabricObject[]): StudioFabricObject[] {
  const out: StudioFabricObject[] = []
  for (const o of objects) {
    out.push(o)
    if (o.type === 'group' && o.objects) {
      out.push(...flattenObjects(o.objects))
    }
  }
  return out
}

const CTX = (): StudioGenerateContext => ({
  pageWidth: 2550,
  pageHeight: 3300,
  margin: { top: 150, right: 150, bottom: 150, left: 225 },
  seed: 42,
  instanceId: 'test-run',
})

const base: StudioConfig = {
  ...buildDefaultConfig(trailMakingTemplate),
  seed: 42,
  fontFamily: 'Inter',
}

runGeneratorContractTests(trailMakingTemplate)

describe('trail-making', () => {
  it('is deterministic', () => {
    resetObjectCounter()
    const a = trailMakingTemplate.generate(base, CTX())
    resetObjectCounter()
    const b = trailMakingTemplate.generate(base, CTX())
    expect(a).toEqual(b)
  })

  it('different seeds give different layouts', () => {
    resetObjectCounter()
    const a = JSON.stringify(trailMakingTemplate.generate(base, CTX()))
    resetObjectCounter()
    const b = JSON.stringify(
      trailMakingTemplate.generate({ ...base, seed: 7 }, { ...CTX(), seed: 7 }),
    )
    expect(a).not.toEqual(b)
  })

  it('draws nodeCount circles', () => {
    resetObjectCounter()
    const [page] = trailMakingTemplate.generate(base, CTX())
    const flat = flattenObjects(page!.objects)
    const circles = flat.filter(
      (o) => o.type === 'circle' && o.studioRole === 'structure',
    )
    expect(circles.length).toBeLessThanOrEqual(Number(base.nodeCount))
    expect(circles.length).toBeGreaterThan(0)
  })

  it('does not produce a solution page or hidden answer path', () => {
    expect(trailMakingTemplate.producesAnswerKey).toBe(false)
    resetObjectCounter()
    const [page] = trailMakingTemplate.generate(base, CTX())
    const flat = flattenObjects(page!.objects)
    const answers = flat.filter((o) => o.studioRole === 'answer')
    expect(answers).toHaveLength(0)
  })

  it('order banner uses ASCII arrows and stays on one line (NBSP)', () => {
    resetObjectCounter()
    const [page] = trailMakingTemplate.generate(base, CTX())
    const flat = flattenObjects(page!.objects)
    const banner = flat.find(
      (o) => o.type === 'textbox' && String(o.text ?? '').includes('Order:'),
    )
    expect(banner).toBeDefined()
    const text = String(banner!.text)
    expect(text).toContain('->')
    expect(text).not.toContain('\u2192')
    expect(text).not.toContain('\u2026')
    expect(text).toContain('\u00a0')
    expect(text).not.toMatch(/ \.\.\.$/)
  })

  it('groups each node and wraps the field in one outer group', () => {
    resetObjectCounter()
    const [page] = trailMakingTemplate.generate(base, CTX())
    const fieldGroup = page!.objects.find((o) => o.type === 'group')
    expect(fieldGroup).toBeDefined()
    const nodeGroups = (fieldGroup!.objects ?? []).filter((o) => o.type === 'group')
    expect(nodeGroups.length).toBeGreaterThan(0)
    for (const node of nodeGroups) {
      const kids = node.objects ?? []
      expect(kids.some((c) => c.type === 'circle')).toBe(true)
      expect(kids.some((c) => c.type === 'textbox')).toBe(true)
    }
  })

  it('part B alternates number/letter labels in order', () => {
    const seq = buildSequence('B', 25)
    expect(seq.map((s) => s.label)).toEqual([
      '1', 'A', '2', 'B', '3', 'C', '4', 'D', '5', 'E',
      '6', 'F', '7', 'G', '8', 'H', '9', 'I', '10', 'J',
      '11', 'K', '12', 'L', '13',
    ])
    expect(seq.filter((s) => /^\d+$/.test(s.label))).toHaveLength(13)
    expect(seq.filter((s) => /^[A-Z]$/.test(s.label))).toHaveLength(12)
    for (let i = 0; i < seq.length; i++) {
      expect(seq[i]!.order).toBe(i)
    }

    resetObjectCounter()
    expect(() =>
      trailMakingTemplate.generate({ ...base, part: 'B' }, CTX()),
    ).not.toThrow()
  })

  it('scatterNodes keeps centers apart and inside the box', () => {
    const box = { left: 100, top: 100, width: 800, height: 1000 }
    const radius = 22
    const minDist = radius * 2.6
    const pad = radius + 6
    const pts = scatterNodes(box, 20, radius, createRng(42))
    expect(pts).toHaveLength(20)
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(box.left + pad - 0.5)
      expect(p.x).toBeLessThanOrEqual(box.left + box.width - pad + 0.5)
      expect(p.y).toBeGreaterThanOrEqual(box.top + pad - 0.5)
      expect(p.y).toBeLessThanOrEqual(box.top + box.height - pad + 0.5)
    }
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const d = Math.hypot(pts[i]!.x - pts[j]!.x, pts[i]!.y - pts[j]!.y)
        // Allow slight float slack; relaxed fallback may go below minDist if dense.
        expect(d).toBeGreaterThan(minDist * 0.5)
      }
    }
  })

  it('clampNodeCount never exceeds packing capacity', () => {
    const tiny = { left: 0, top: 0, width: 200, height: 200 }
    const clamped = clampNodeCount(25, tiny, 26)
    expect(clamped).toBeLessThan(25)
    expect(clamped).toBeGreaterThanOrEqual(2)
  })

  it('rimToRimSegment stops at circle edges', () => {
    const seg = rimToRimSegment({ x: 0, y: 0 }, { x: 100, y: 0 }, 20)
    expect(seg).not.toBeNull()
    expect(seg!.x1).toBeCloseTo(20)
    expect(seg!.y1).toBeCloseTo(0)
    expect(seg!.x2).toBeCloseTo(80)
    expect(seg!.y2).toBeCloseTo(0)
  })

  it('distToSegment measures clearance to a path edge', () => {
    expect(distToSegment({ x: 50, y: 10 }, { x: 0, y: 0 }, { x: 100, y: 0 })).toBeCloseTo(10)
    expect(distToSegment({ x: -10, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 })).toBeCloseTo(10)
  })

  it('orderForClearTrail avoids routing through other circles', () => {
    // Three collinear points: random order 0→2 cuts through the middle.
    const positions = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 80, y: 0 },
    ]
    const radius = 18
    const shuffledHits = countTrailCircleHits(
      [positions[0]!, positions[2]!, positions[1]!],
      radius,
    )
    expect(shuffledHits).toBeGreaterThan(0)

    const ordered = orderForClearTrail(positions, radius, createRng(1))
    expect(countTrailCircleHits(ordered, radius)).toBe(0)
  })

  it('buildNodes keeps answer path clear of other circles', () => {
    const box = { left: 100, top: 100, width: 900, height: 1100 }
    const radius = 22
    for (const seed of [1, 7, 42, 99, 1234]) {
      const nodes = buildNodes('A', 25, box, radius, createRng(seed))
      const ordered = [...nodes].sort((a, b) => a.order - b.order)
      expect(countTrailCircleHits(ordered, radius)).toBe(0)
    }
  })

  it('centerNodesInBox centers the cluster in the target box', () => {
    const box = { left: 100, top: 200, width: 800, height: 1000 }
    const nodes = [
      { id: 0, label: '1', order: 0, x: 120, y: 220 },
      { id: 1, label: '2', order: 1, x: 200, y: 300 },
    ]
    const centered = centerNodesInBox(nodes, box, 20, 26)
    const xs = centered.map((n) => n.x)
    const ys = centered.map((n) => n.y)
    const midX = (Math.min(...xs) + Math.max(...xs)) / 2
    const midY = (Math.min(...ys) + Math.max(...ys)) / 2
    expect(midX).toBeCloseTo(box.left + box.width / 2, 5)
    // Center accounts for equal marker pads on every side.
    expect(midY).toBeCloseTo(box.top + box.height / 2, 0)
  })

  it('field group is centered in the body below the banner', () => {
    resetObjectCounter()
    const [page] = trailMakingTemplate.generate(base, CTX())
    const fieldGroup = page!.objects.find((o) => o.type === 'group')
    expect(fieldGroup).toBeDefined()
    const pageCenterX = CTX().margin.left +
      (CTX().pageWidth - CTX().margin.left - CTX().margin.right) / 2
    const groupCenterX = fieldGroup!.left + (fieldGroup!.width ?? 0) / 2
    expect(Math.abs(groupCenterX - pageCenterX)).toBeLessThan(40)
  })

  it('start/end markers never overlap any circle', () => {
    function walkAbs(
      objects: StudioFabricObject[],
      parentCenterX = 0,
      parentCenterY = 0,
      depth = 0,
    ): Array<Record<string, unknown>> {
      const out: Array<Record<string, unknown>> = []
      for (const o of objects) {
        const left = o.left ?? 0
        const top = o.top ?? 0
        if (o.type === 'group') {
          const absLeft = depth === 0 ? left : parentCenterX + left
          const absTop = depth === 0 ? top : parentCenterY + top
          const centerX = absLeft + (o.width ?? 0) / 2
          const centerY = absTop + (o.height ?? 0) / 2
          out.push(...walkAbs(o.objects ?? [], centerX, centerY, depth + 1))
        } else {
          out.push({
            type: o.type,
            text: o.text,
            left: depth === 0 ? left : parentCenterX + left,
            top: depth === 0 ? top : parentCenterY + top,
            radius: o.radius,
            originX: o.originX,
            originY: o.originY,
            width: o.width,
            fontSize: o.fontSize,
            strokeWidth: o.strokeWidth,
          })
        }
      }
      return out
    }

    const seeds = [1, 2, 3, 7, 10, 20, 42, 99, 555, 1234]
    const sizes = ['small', 'medium', 'large'] as const
    for (const circleSize of sizes) {
      for (const seed of seeds) {
        resetObjectCounter()
        const [page] = trailMakingTemplate.generate(
          { ...base, seed, part: 'B', circleSize, fontFamily: 'PT Serif' },
          { ...CTX(), seed },
        )
        const abs = walkAbs(page!.objects)
        const circles = abs.filter((o) => o.type === 'circle')
        const markers = abs.filter((o) => o.text === 'start' || o.text === 'end')
        expect(markers.length).toBe(2)
        for (const m of markers) {
          const mw = Number(m.width ?? 0)
          const mh = Number(m.fontSize ?? 14)
          const mLeft =
            m.originX === 'center' ? Number(m.left) - mw / 2 : Number(m.left)
          const mTop =
            m.originY === 'center' ? Number(m.top) - mh / 2 : Number(m.top)
          const mRight = mLeft + mw
          const mBottom = mTop + mh
          let worst = Infinity
          for (const c of circles) {
            const cx = Number(c.left)
            const cy = Number(c.top)
            const r = Number(c.radius) + Number(c.strokeWidth ?? 0) / 2
            const qx = Math.max(mLeft, Math.min(cx, mRight))
            const qy = Math.max(mTop, Math.min(cy, mBottom))
            worst = Math.min(worst, Math.hypot(cx - qx, cy - qy) - r)
          }
          expect(
            worst,
            `${circleSize} seed ${seed} ${String(m.text)}`,
          ).toBeGreaterThanOrEqual(8)
        }
      }
    }
  })
})
