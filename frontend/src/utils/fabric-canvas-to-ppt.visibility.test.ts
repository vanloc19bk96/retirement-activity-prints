/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest'
import { StaticCanvas } from 'fabric'
import type PptxGenJS from 'pptxgenjs'

import { addStaticCanvasObjectsToPptSlide } from '@/utils/fabric-canvas-to-ppt'
import {
  FOLLOW_THE_ROUTE_ARROW_SOURCE,
  buildArrowGlyph,
} from '@/utils/studio/follow-the-route/render'
import { buildGroup, buildRect, resetObjectCounter, type StudioTag } from '@/utils/studio/studio-fabric-builders'

const TAG: StudioTag = {
  templateKey: 'symbol-hunt',
  instanceId: 'ppt-vis',
  pageRole: 'single',
}

const ROUTE_TAG: StudioTag = {
  templateKey: 'follow-the-route',
  instanceId: 'ppt-arrow',
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

  it('rasterizes Follow the Route arrows as one image (not three native lines)', async () => {
    resetObjectCounter()
    const arrow = buildArrowGlyph({
      center: { x: 80, y: 80 },
      size: 24,
      dir: 'R',
      tag: ROUTE_TAG,
    })
    expect(arrow.data?.source).toBe(FOLLOW_THE_ROUTE_ARROW_SOURCE)
    expect(arrow.type).toBe('group')
    expect(arrow.objects).toHaveLength(3)

    const element = document.createElement('canvas')
    const canvas = new StaticCanvas(element, {
      width: 200,
      height: 200,
      backgroundColor: '#ffffff',
      renderOnAddRemove: false,
    })
    await canvas.loadFromJSON({ version: '6.0.0', objects: [arrow] })
    canvas.requestRenderAll()

    const slide = {
      addShape: vi.fn(),
      addText: vi.fn(),
      addImage: vi.fn(),
    } as unknown as PptxGenJS.Slide

    await addStaticCanvasObjectsToPptSlide(slide, canvas)

    // Intact group → raster. Flattened leaf Lines would emit three addShape('line').
    expect(slide.addImage).toHaveBeenCalledTimes(1)
    expect(slide.addShape).not.toHaveBeenCalled()

    canvas.dispose()
  })
})
