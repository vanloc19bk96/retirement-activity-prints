import { describe, it, expect } from 'vitest'
import { studyRecallGridTemplate } from './generate'
import { buildCellContent } from './draw'
import {
  STUDY_RECALL_SHAPE_IDS,
  buildStudyRecallShape,
  studyRecallSymbolStroke,
} from './shapes'
import { shapePartsFor } from './shape-parts'
import { fitStrokeSegments, shortenSegment } from './shape-stroke'
import { STUDIO_SHAPE_GROUP_SOURCE } from '@/utils/studio-shape-group'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { STUDIO_CONTENT_SAFE_INSET_X } from '@/constants/studio.constants'
import { resetObjectCounter } from '../studio-fabric-builders'
import { runGeneratorContractTests } from '../studio-generator-test'
import type { StudioGenerateContext } from '@/types/studio-template.types'

const CTX = (): StudioGenerateContext => ({
  pageWidth: 2550,
  pageHeight: 3300,
  margin: { top: 150, right: 150, bottom: 150, left: 225 },
  seed: 42,
  instanceId: 'test-run',
})

const base = {
  ...buildDefaultConfig(studyRecallGridTemplate),
  seed: 42,
  fontFamily: 'Inter',
}

runGeneratorContractTests(studyRecallGridTemplate, { expectAnswers: false })

describe('study-recall-grid', () => {
  it('keeps a pool of 300 simple redrawable shapes', () => {
    expect(STUDY_RECALL_SHAPE_IDS).toHaveLength(300)
    expect(new Set(STUDY_RECALL_SHAPE_IDS).size).toBe(300)
    // Thick multi-notch outlines / jagged arcs — too hard to redraw from memory.
    const hard = [
      'plus',
      'cross',
      'arrowUp',
      'chevronUp',
      'star4',
      'star',
      'semicircle',
      'ovalH',
      'teardrop',
      'hourglass',
      'bowtie',
      'arrowDoubleH',
      'nestedSquare',
      'hash',
      'window',
      'flagN',
      'flagS',
      'flagE',
      'flagW',
    ] as const
    for (const id of hard) {
      expect(STUDY_RECALL_SHAPE_IDS).not.toContain(id)
    }
  })

  it('keeps every shape within a 3-part redraw budget', () => {
    // Facing brackets are two 3-segment glyphs (2 pen strokes), stored as 6 lines.
    const allowOver = new Set(['portalH', 'portalV'])
    for (const id of STUDY_RECALL_SHAPE_IDS) {
      const parts = shapePartsFor(id, 40)
      const count =
        (parts.circles?.length ?? 0) +
        (parts.polygons?.length ?? 0) +
        (parts.lines?.length ?? 0)
      if (allowOver.has(id)) {
        expect(count).toBeLessThanOrEqual(6)
        continue
      }
      expect(count, id).toBeLessThanOrEqual(3)
    }
  })

  it('builds every shape without empty geometry', () => {
    const tag = {
      templateKey: 'study-recall-grid',
      instanceId: 't',
      pageRole: 'study' as const,
    }
    for (const id of STUDY_RECALL_SHAPE_IDS) {
      const objs = buildStudyRecallShape(id, { left: 100, top: 100 }, 80, tag, 'prompt')
      expect(objs.length).toBeGreaterThan(0)
      expect(objs.every((o) => o.strokeWidth === studyRecallSymbolStroke(80))).toBe(true)
      const joints = objs.filter((o) => o.type === 'line' || o.type === 'polygon')
      expect(joints.every((o) => o.strokeLineCap === 'butt')).toBe(true)
    }
  })

  it('keeps a light single-stroke weight across page sizes', () => {
    // 6×9 vs 8.5×11 — readable drawn line, not bold bars.
    const small = studyRecallSymbolStroke(165)
    const large = studyRecallSymbolStroke(255)
    expect(small).toBe(2)
    expect(large).toBeLessThanOrEqual(3)
    expect(large / 255).toBeCloseTo(small / 165, 2)
  })

  it('fits internal chords inside outlines and overlaps open joints', () => {
    const shortened = shortenSegment({ x: -10, y: 0 }, { x: 10, y: 0 }, 2)
    expect(shortened).toEqual([
      { x: -8, y: 0 },
      { x: 8, y: 0 },
    ])

    const outlineFit = fitStrokeSegments(
      [
        [
          { x: -10, y: 0 },
          { x: 10, y: 0 },
        ],
      ],
      4,
      true,
    )
    expect(outlineFit[0]).toEqual([
      { x: -8, y: 0 },
      { x: 8, y: 0 },
    ])

    const openJoint = fitStrokeSegments(
      [
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
        [
          { x: 0, y: 0 },
          { x: 0, y: 10 },
        ],
      ],
      4,
      false,
    )
    expect(openJoint[0]![0]).toEqual({ x: -2, y: 0 })
    expect(openJoint[1]![0]).toEqual({ x: 0, y: -2 })
  })

  it('centers the study grid in the content column', () => {
    resetObjectCounter()
    const ctx = CTX()
    const [study] = studyRecallGridTemplate.generate(base, ctx)
    const grid = study!.objects.find((o) => o.type === 'group')!
    const contentLeft = ctx.margin.left + STUDIO_CONTENT_SAFE_INSET_X
    const contentRight = ctx.pageWidth - ctx.margin.right - STUDIO_CONTENT_SAFE_INSET_X
    const contentCenterX = (contentLeft + contentRight) / 2
    const gridCenterX = grid.left! + grid.width! / 2
    expect(Math.abs(gridCenterX - contentCenterX)).toBeLessThanOrEqual(2)
  })

  it('puts a page-turn label on the study page only', () => {
    resetObjectCounter()
    const [study, recall] = studyRecallGridTemplate.generate(base, CTX())
    const studyTexts = study!.objects.map((o) => o.text ?? '')
    const recallTexts = recall!.objects.map((o) => o.text ?? '')
    expect(studyTexts).toContain('Turn the page to continue')
    expect(recallTexts).not.toContain('Turn the page to continue')
  })

  it('keeps tall 3×2 recall grid clear of the safe-area bottom', () => {
    resetObjectCounter()
    const ctx = CTX()
    const [, recall] = studyRecallGridTemplate.generate(
      { ...base, gridRows: 3, gridCols: 2 },
      ctx,
    )
    const grid = recall!.objects.find((o) => o.type === 'group')!
    const gridBottom = grid.top! + grid.height!
    expect(gridBottom).toBeLessThanOrEqual(ctx.pageHeight - ctx.margin.bottom - 8)
  })

  it('fits max grid size without throwing', () => {
    resetObjectCounter()
    expect(() =>
      studyRecallGridTemplate.generate({ ...base, gridRows: 5, gridCols: 5 }, CTX()),
    ).not.toThrow()
  })

  it('fills every max-grid cell with one symbol group of equal stroke width', () => {
    resetObjectCounter()
    const [study] = studyRecallGridTemplate.generate(
      { ...base, gridRows: 5, gridCols: 5 },
      CTX(),
    )
    const grid = study!.objects.find((o) => o.type === 'group')!
    const symbols = (grid.objects ?? []).filter(
      (o) => o.studioRole === 'prompt' && o.type === 'group',
    )

    expect(symbols).toHaveLength(25)
    expect(symbols.every((s) => s.data?.source === STUDIO_SHAPE_GROUP_SOURCE)).toBe(true)

    const strokes = symbols.flatMap((sym) =>
      (sym.objects ?? []).map((o) => o.strokeWidth),
    )
    expect(new Set(strokes).size).toBe(1)
    expect(strokes[0]).toBeGreaterThanOrEqual(studyRecallSymbolStroke(18))

    // Symbol groups hug ink — not the full grid cell (oversized selection bug).
    const cell = Math.max(...symbols.map((s) => Math.max(s.width ?? 0, s.height ?? 0)))
    expect(symbols.every((s) => (s.width ?? 0) <= cell && (s.height ?? 0) <= cell)).toBe(
      true,
    )
    expect(Math.max(...symbols.map((s) => s.width ?? 0))).toBeLessThan(
      (grid.width ?? 0) / 5,
    )
  })

  it('keeps inner chords concentric with their outline in the group', () => {
    resetObjectCounter()
    const cell = { left: 100, top: 200, width: 120, height: 120 }
    const tag = {
      templateKey: 'study-recall-grid',
      instanceId: 't',
      pageRole: 'study' as const,
    }
    const [symbol] = buildCellContent({
      item: { kind: 'shape', id: 'diamondH' },
      cell,
      cellSize: 120,
      tag,
      role: 'prompt',
    })
    const poly = symbol?.objects?.find((o) => o.type === 'polygon')
    const line = symbol?.objects?.find((o) => o.type === 'line')
    expect(poly?.left).toBeCloseTo(0, 5)
    expect(poly?.top).toBeCloseTo(0, 5)
    expect(line?.originX).toBe('center')
    expect(line?.left).toBeCloseTo(0, 5)
    expect(line?.top).toBeCloseTo(0, 5)
    expect(Math.abs(line?.x1 ?? 0)).toBeCloseTo(Math.abs(line?.x2 ?? 0), 5)
  })

  it('keeps tip and dumbbell stems outside circle hollows', () => {
    for (const id of ['tipW', 'dumbbellV'] as const) {
      const radius = 40
      const parts = shapePartsFor(id, radius)
      const circles = parts.circles ?? []
      expect(circles.length).toBeGreaterThan(0)
      const fitted = fitStrokeSegments(
        parts.lines ?? [],
        studyRecallSymbolStroke(radius * 2),
        true,
      )
      const [a, b] = fitted[0]!
      for (const circle of circles) {
        const cx = circle.x ?? 0
        const cy = circle.y ?? 0
        const distA = Math.hypot(a.x - cx, a.y - cy)
        const distB = Math.hypot(b.x - cx, b.y - cy)
        expect(Math.min(distA, distB)).toBeGreaterThanOrEqual(circle.r - 0.01)
      }
    }
  })

  it('keeps triangle chords at the geometric center (not AABB center)', () => {
    resetObjectCounter()
    const cell = { left: 100, top: 200, width: 120, height: 120 }
    const tag = {
      templateKey: 'study-recall-grid',
      instanceId: 't',
      pageRole: 'study' as const,
    }
    const [symbol] = buildCellContent({
      item: { kind: 'shape', id: 'triangleDownSlash' },
      cell,
      cellSize: 120,
      tag,
      role: 'prompt',
    })
    const poly = symbol?.objects?.find((o) => o.type === 'polygon')
    const line = symbol?.objects?.find((o) => o.type === 'line')
    const points = poly?.points ?? []
    const minY = Math.min(...points.map((p) => p.y))
    const maxY = Math.max(...points.map((p) => p.y))
    const pathOffsetY = (minY + maxY) / 2
    // Fabric anchors the polygon on pathOffset; chord sits on geometric origin.
    expect(line?.left).toBeCloseTo(poly?.left ?? 0, 5)
    expect(line?.top).toBeCloseTo((poly?.top ?? 0) - pathOffsetY, 5)
    expect(Math.abs(pathOffsetY)).toBeGreaterThan(1)
  })

  it('centers asymmetric symbols (e.g. brackets) in the cell', () => {
    resetObjectCounter()
    const cell = { left: 100, top: 200, width: 120, height: 120 }
    const tag = {
      templateKey: 'study-recall-grid',
      instanceId: 't',
      pageRole: 'study' as const,
    }
    const [symbol] = buildCellContent({
      item: { kind: 'shape', id: 'bracketL' },
      cell,
      cellSize: 120,
      tag,
      role: 'prompt',
    })
    const cx = cell.left + cell.width / 2
    const cy = cell.top + cell.height / 2
    const symCx = (symbol?.left ?? 0) + (symbol?.width ?? 0) / 2
    const symCy = (symbol?.top ?? 0) + (symbol?.height ?? 0) / 2
    expect(Math.abs(symCx - cx)).toBeLessThanOrEqual(1)
    expect(Math.abs(symCy - cy)).toBeLessThanOrEqual(1)
  })

  it('draws a centered two-line instruction', () => {
    resetObjectCounter()
    const [study] = studyRecallGridTemplate.generate(base, CTX())
    const instruction = study!.objects.find(
      (o) => typeof o.text === 'string' && o.text.includes('Study the grid'),
    )

    expect(instruction?.text?.split('\n')).toHaveLength(2)
    expect(instruction?.textAlign).toBe('center')
    expect(instruction?.originX).toBe('center')
  })
})
