/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest'
import { Path, StaticCanvas } from 'fabric'
import type PptxGenJS from 'pptxgenjs'

import { addFabricRasterToSlide } from '@/utils/fabric-ppt-raster'
import { addStaticCanvasObjectsToPptSlide } from '@/utils/fabric-canvas-to-ppt'
import { createFabricIconGroupFromPhosphorSvg } from '@/utils/phosphor-fabric'

const DUOTONE_SVG =
  '<svg><path d="M10 10h20v20H10z" opacity="0.2"/><path d="M12 12h16v16H12z"/></svg>'

describe('addFabricRasterToSlide', () => {
  it('does not re-apply Fabric angle after toDataURL (avoids double rotation)', async () => {
    const path = new Path('M0 0h40v20H0z', {
      left: 100,
      top: 80,
      originX: 'center',
      originY: 'center',
      fill: '#4B4B4B',
      angle: 90,
    })
    path.setCoords()

    const images: Array<Record<string, unknown>> = []
    const slide = {
      addImage: vi.fn((props: Record<string, unknown>) => {
        images.push(props)
      }),
    } as unknown as PptxGenJS.Slide

    await addFabricRasterToSlide(slide, path)

    expect(images).toHaveLength(1)
    expect(images[0]!.rotate).toBeUndefined()
    expect(images[0]!.flipH).toBeUndefined()
    expect(images[0]!.flipV).toBeUndefined()
    expect(typeof images[0]!.data).toBe('string')
    path.dispose()
  })
})

describe('rotated Phosphor icon → PPT', () => {
  it('keeps duotone layers without PPT rotate (editor angle baked in raster)', async () => {
    const group = createFabricIconGroupFromPhosphorSvg(DUOTONE_SVG, {
      targetWidth: 48,
    })
    group.set({
      left: 200,
      top: 200,
      originX: 'center',
      originY: 'center',
      angle: 90,
    })
    group.setCoords()

    const element = document.createElement('canvas')
    const canvas = new StaticCanvas(element, {
      width: 400,
      height: 400,
      backgroundColor: '#ffffff',
      renderOnAddRemove: false,
    })
    canvas.add(group)
    canvas.requestRenderAll()

    const images: Array<Record<string, unknown>> = []
    const slide = {
      addShape: vi.fn(),
      addText: vi.fn(),
      addImage: vi.fn((props: Record<string, unknown>) => {
        images.push(props)
      }),
    } as unknown as PptxGenJS.Slide

    await addStaticCanvasObjectsToPptSlide(slide, canvas)

    // Frame rect may emit as shape; glyph paths rasterize to images.
    expect(images.length).toBeGreaterThanOrEqual(2)
    for (const image of images) {
      expect(image.rotate).toBeUndefined()
    }

    canvas.dispose()
  })
})
