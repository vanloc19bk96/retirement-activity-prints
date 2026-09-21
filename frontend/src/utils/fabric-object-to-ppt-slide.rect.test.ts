/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest'
import { Group, Rect, StaticCanvas } from 'fabric'
import type PptxGenJS from 'pptxgenjs'

import { addFabricObjectToPptSlide } from '@/utils/fabric-object-to-ppt-slide'
import { addStaticCanvasObjectsToPptSlide } from '@/utils/fabric-canvas-to-ppt'
import { DPI } from '@/types/canvas-settings.types'

function createSlideRecorder() {
  const shapes: Array<Record<string, unknown>> = []
  const slide = {
    addShape: vi.fn((type: string, props: Record<string, unknown>) => {
      shapes.push({ type, ...props })
    }),
    addText: vi.fn(),
    addImage: vi.fn(),
  } as unknown as PptxGenJS.Slide
  return { slide, shapes }
}

describe('rotated rounded rect → PPT', () => {
  it('emits an elongated roundRect, not an AABB diamond', async () => {
    const capsule = new Rect({
      left: 200,
      top: 200,
      originX: 'center',
      originY: 'center',
      width: 200,
      height: 40,
      rx: 20,
      ry: 20,
      angle: 45,
      fill: 'transparent',
      stroke: '#111111',
      strokeWidth: 2,
    })
    capsule.setCoords()

    const { slide, shapes } = createSlideRecorder()
    await addFabricObjectToPptSlide(slide, capsule)

    expect(shapes).toHaveLength(1)
    expect(shapes[0]?.type).toBe('roundRect')
    expect(shapes[0]?.rotate).toBe(45)
    expect(Number(shapes[0]?.w)).toBeCloseTo(200 / DPI, 5)
    expect(Number(shapes[0]?.h)).toBeCloseTo(40 / DPI, 5)
    expect(Number(shapes[0]?.rectRadius)).toBeCloseTo(20 / DPI, 5)
    // AABB of a 45° 200×40 rect is nearly square; that was the diamond bug.
    const aabb = capsule.getBoundingRect()
    expect(Math.abs(aabb.width - aabb.height)).toBeLessThan(8)
    expect(Number(shapes[0]?.w)).toBeGreaterThan(Number(shapes[0]?.h) * 3)
    capsule.dispose()
  })

  it('does not outline fill-only hairline bars', async () => {
    const bar = new Rect({
      left: 40,
      top: 80,
      width: 24,
      height: 1,
      fill: '#000000',
      stroke: '#111827',
      strokeWidth: 0,
    })
    const { slide, shapes } = createSlideRecorder()
    await addFabricObjectToPptSlide(slide, bar)

    expect(shapes).toHaveLength(1)
    expect(shapes[0]?.type).toBe('rect')
    expect(shapes[0]?.line).toEqual({ type: 'none' })
    expect(Number(shapes[0]?.h)).toBeCloseTo(1 / DPI, 5)
    bar.dispose()
  })

  it('keeps sharp unrotated rects as native rect', async () => {
    const box = new Rect({
      left: 40,
      top: 40,
      width: 80,
      height: 50,
      fill: '#ffffff',
      stroke: '#111111',
    })
    const { slide, shapes } = createSlideRecorder()
    await addFabricObjectToPptSlide(slide, box)

    expect(shapes[0]?.type).toBe('rect')
    expect(shapes[0]?.rectRadius).toBeUndefined()
    box.dispose()
  })
})

describe('grouped word-search capsule → PPT', () => {
  it('keeps an elongated roundRect after group flatten', async () => {
    const capsule = new Rect({
      left: 0,
      top: 0,
      originX: 'center',
      originY: 'center',
      width: 180,
      height: 36,
      rx: 18,
      ry: 18,
      angle: 45,
      fill: 'transparent',
      stroke: '#111111',
      strokeWidth: 2,
    })
    const group = new Group([capsule], { left: 80, top: 120 })

    const element = document.createElement('canvas')
    const canvas = new StaticCanvas(element, {
      width: 400,
      height: 400,
      backgroundColor: '#ffffff',
      renderOnAddRemove: false,
    })
    canvas.add(group)
    canvas.requestRenderAll()

    const { slide, shapes } = createSlideRecorder()
    await addStaticCanvasObjectsToPptSlide(slide, canvas)

    const roundRects = shapes.filter((s) => s.type === 'roundRect')
    expect(roundRects).toHaveLength(1)
    expect(Number(roundRects[0]?.rotate)).toBeCloseTo(45, 1)
    expect(Number(roundRects[0]?.w)).toBeCloseTo(180 / DPI, 4)
    expect(Number(roundRects[0]?.h)).toBeCloseTo(36 / DPI, 4)
    expect(Number(roundRects[0]?.w)).toBeGreaterThan(Number(roundRects[0]?.h) * 3)

    canvas.dispose()
  })
})
