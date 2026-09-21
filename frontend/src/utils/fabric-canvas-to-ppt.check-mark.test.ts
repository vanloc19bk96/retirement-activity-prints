/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest'
import { StaticCanvas } from 'fabric'
import type PptxGenJS from 'pptxgenjs'

import { addStaticCanvasObjectsToPptSlide } from '@/utils/fabric-canvas-to-ppt'
import { buildCheckMark } from '@/utils/studio/studio-check-mark'
import { resetObjectCounter, type StudioTag } from '@/utils/studio/studio-fabric-builders'

const TAG: StudioTag = {
  templateKey: 'list-recall',
  instanceId: 'check-ppt',
  pageRole: 'answers',
}

describe('studio checkmark → PPT', () => {
  it('exports the checkmark as one raster image, not two native line shapes', async () => {
    resetObjectCounter()
    const mark = buildCheckMark({ left: 40, top: 60, size: 28 }, TAG, 'answer')
    // Answer-key reveal makes the group visible before export.
    mark.visible = true

    const element = document.createElement('canvas')
    const canvas = new StaticCanvas(element, {
      width: 400,
      height: 400,
      backgroundColor: '#ffffff',
      renderOnAddRemove: false,
    })
    await canvas.loadFromJSON({ version: '6.0.0', objects: [mark] })
    canvas.requestRenderAll()

    const shapes: Array<{ type: string; props: Record<string, unknown> }> = []
    const images: Array<Record<string, unknown>> = []
    const slide = {
      addShape: vi.fn((type: string, props: Record<string, unknown>) => {
        shapes.push({ type, props })
      }),
      addText: vi.fn(),
      addImage: vi.fn((props: Record<string, unknown>) => {
        images.push(props)
      }),
    } as unknown as PptxGenJS.Slide

    await addStaticCanvasObjectsToPptSlide(slide, canvas)

    const lineShapes = shapes.filter((s) => s.type === 'line')
    expect(lineShapes).toHaveLength(0)
    expect(images).toHaveLength(1)
    expect(typeof images[0]!.data).toBe('string')

    canvas.dispose()
  })

  it('skips hidden puzzle-page checkmarks (group visibility, not leaf lines)', async () => {
    resetObjectCounter()
    const mark = buildCheckMark({ left: 40, top: 60, size: 28 }, TAG, 'answer')
    expect(mark.visible).toBe(false)

    const element = document.createElement('canvas')
    const canvas = new StaticCanvas(element, {
      width: 400,
      height: 400,
      backgroundColor: '#ffffff',
      renderOnAddRemove: false,
    })
    await canvas.loadFromJSON({ version: '6.0.0', objects: [mark] })
    canvas.requestRenderAll()

    const slide = {
      addShape: vi.fn(),
      addText: vi.fn(),
      addImage: vi.fn(),
    } as unknown as PptxGenJS.Slide

    await addStaticCanvasObjectsToPptSlide(slide, canvas)

    expect(slide.addShape).not.toHaveBeenCalled()
    expect(slide.addImage).not.toHaveBeenCalled()

    canvas.dispose()
  })
})
