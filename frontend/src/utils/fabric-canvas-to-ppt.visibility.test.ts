/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest'
import { StaticCanvas } from 'fabric'
import type PptxGenJS from 'pptxgenjs'

import { addStaticCanvasObjectsToPptSlide } from '@/utils/fabric-canvas-to-ppt'
import { STUDIO_CHECK_MARK_SOURCE, buildCheckMark } from '@/utils/studio/studio-check-mark'
import { buildGroup, buildRect, resetObjectCounter, type StudioTag } from '@/utils/studio/studio-fabric-builders'

const TAG: StudioTag = {
  templateKey: 'sudoku',
  instanceId: 'ppt-vis',
  pageRole: 'single',
}

describe('PPT export visibility', () => {
  it('does not flatten visible children out of a hidden answer group', async () => {
    resetObjectCounter()
    // Answer groups stay hidden on the puzzle page while their children stay
    // visible:true. Flattening without checking the group would leak ink onto
    // the exported slide.
    const inner = buildRect(
      { left: 40, top: 40, width: 80, height: 80, fill: '#000000' },
      TAG,
      'decoration',
    )
    const hidden = buildGroup(
      [inner],
      { left: 40, top: 40, width: 80, height: 80 },
      TAG,
      'answer',
    )
    expect(hidden.visible).toBe(false)
    expect(hidden.objects?.every((o) => o.visible !== false)).toBe(true)

    const grid = buildGroup(
      [
        buildRect({ left: 20, top: 20, width: 120, height: 120 }, TAG, 'structure'),
        hidden,
      ],
      { left: 20, top: 20, width: 120, height: 120 },
      TAG,
    )

    const element = document.createElement('canvas')
    const canvas = new StaticCanvas(element, {
      width: 400,
      height: 400,
      backgroundColor: '#ffffff',
      renderOnAddRemove: false,
    })
    await canvas.loadFromJSON({ version: '6.0.0', objects: [grid] })
    canvas.requestRenderAll()

    const slide = {
      addShape: vi.fn(),
      addText: vi.fn(),
      addImage: vi.fn(),
    } as unknown as PptxGenJS.Slide

    await addStaticCanvasObjectsToPptSlide(slide, canvas)

    // Only the visible grid frame — not symbol leaves from the hidden answer group.
    expect(slide.addShape).toHaveBeenCalled()
    expect(slide.addImage).not.toHaveBeenCalled()
    const shapeTypes = (slide.addShape as ReturnType<typeof vi.fn>).mock.calls.map(
      (call) => call[0],
    )
    expect(shapeTypes.every((t) => t === 'rect' || t === 'line')).toBe(true)
    // Symbol geometry is polygons/lines/paths; a lone structure rect is enough.
    expect(shapeTypes.filter((t) => t === 'rect')).toHaveLength(1)

    canvas.dispose()
  })

  it('rasterizes checkmarks as one image (not flattened native strokes)', async () => {
    resetObjectCounter()
    const mark = buildCheckMark({ left: 40, top: 40, size: 24 }, TAG, 'decoration')
    expect(mark.data?.source).toBe(STUDIO_CHECK_MARK_SOURCE)
    expect(mark.type).toBe('group')

    const element = document.createElement('canvas')
    const canvas = new StaticCanvas(element, {
      width: 200,
      height: 200,
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

    // Intact group → raster. Flattened leaf strokes would emit native addShape calls.
    expect(slide.addImage).toHaveBeenCalledTimes(1)
    expect(slide.addShape).not.toHaveBeenCalled()

    canvas.dispose()
  })
})
