/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest'
import { Line, StaticCanvas, Textbox } from 'fabric'
import type PptxGenJS from 'pptxgenjs'

import { addFabricObjectToPptSlide } from '@/utils/fabric-object-to-ppt-slide'
import { addStaticCanvasObjectsToPptSlide } from '@/utils/fabric-canvas-to-ppt'
import { DPI } from '@/types/canvas-settings.types'

describe('writing lines → PPT', () => {
  it('exports horizontal writing lines as native PPT strokes', async () => {
    const line = new Line([48, 120, 400, 120], {
      stroke: '#D1D5DB',
      strokeWidth: 1.5,
    })

    const element = document.createElement('canvas')
    const canvas = new StaticCanvas(element, {
      width: Math.round(8.5 * DPI),
      height: Math.round(11 * DPI),
      backgroundColor: '#ffffff',
      renderOnAddRemove: false,
    })
    canvas.add(line)
    canvas.requestRenderAll()

    const shapes: Array<Record<string, unknown>> = []
    const slide = {
      addShape: vi.fn((type: string, props: Record<string, unknown>) => {
        shapes.push({ type, ...props })
      }),
      addText: vi.fn(),
      addImage: vi.fn(),
    } as unknown as PptxGenJS.Slide

    await addStaticCanvasObjectsToPptSlide(slide, canvas)

    const writingLines = shapes.filter(
      (s) => s.type === 'line' && Number(s.h) === 0 && Number(s.w) > 0.5,
    )
    expect(writingLines.length).toBeGreaterThan(0)
    for (const line of writingLines) {
      const stroke = line.line as { color?: string; width?: number }
      expect(stroke.color).toBe('D1D5DB')
      expect(Number(stroke.width)).toBeGreaterThan(0)
    }
    canvas.dispose()
  }, 30_000)

  it('maps Fabric underline to PPT underline', async () => {
    const text = new Textbox('Hello', {
      left: 40,
      top: 40,
      fontSize: 18,
      underline: true,
      fill: '#111111',
    })
    const texts: Array<Record<string, unknown>> = []
    const slide = {
      addShape: vi.fn(),
      addText: vi.fn((value: string, props: Record<string, unknown>) => {
        texts.push({ text: value, ...props })
      }),
      addImage: vi.fn(),
    } as unknown as PptxGenJS.Slide

    await addFabricObjectToPptSlide(slide, text)
    expect(texts[0]?.underline).toEqual({ style: 'sng', color: '111111' })
  })

  it('maps Fabric strokeDashArray to PPT dashType on lines', async () => {
    const dashed = new Line([20, 40, 200, 40], {
      stroke: '#9CA3AF',
      strokeWidth: 2,
      strokeDashArray: [8, 8],
    })
    const shapes: Array<Record<string, unknown>> = []
    const slide = {
      addShape: vi.fn((type: string, props: Record<string, unknown>) => {
        shapes.push({ type, ...props })
      }),
      addText: vi.fn(),
      addImage: vi.fn(),
    } as unknown as PptxGenJS.Slide

    await addFabricObjectToPptSlide(slide, dashed)
    expect(shapes).toHaveLength(1)
    expect(shapes[0]?.type).toBe('line')
    expect(shapes[0]?.line).toMatchObject({ dashType: 'dash' })
  })

  it('flips PPT diagonal when Fabric line is top-right → bottom-left', async () => {
    const downRight = new Line([40, 40, 160, 120], {
      stroke: '#9CA3AF',
      strokeWidth: 2,
    })
    const downLeft = new Line([160, 40, 40, 120], {
      stroke: '#9CA3AF',
      strokeWidth: 2,
    })
    const shapes: Array<Record<string, unknown>> = []
    const slide = {
      addShape: vi.fn((type: string, props: Record<string, unknown>) => {
        shapes.push({ type, ...props })
      }),
      addText: vi.fn(),
      addImage: vi.fn(),
    } as unknown as PptxGenJS.Slide

    await addFabricObjectToPptSlide(slide, downRight)
    await addFabricObjectToPptSlide(slide, downLeft)

    expect(shapes[0]?.flipH).toBeUndefined()
    expect(shapes[1]?.flipH).toBe(true)
    expect(Number(shapes[0]?.w)).toBeCloseTo(Number(shapes[1]?.w), 5)
    expect(Number(shapes[0]?.h)).toBeCloseTo(Number(shapes[1]?.h), 5)
  })
})
