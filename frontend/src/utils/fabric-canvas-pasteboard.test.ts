/**
 * @vitest-environment jsdom
 */
import { Canvas, Rect } from 'fabric'
import { describe, expect, it } from 'vitest'

import {
  getCanvasPageLogicalSize,
  getPasteboardCanvasDimensions,
  getPasteboardViewportTransform,
  installCanvasPasteboard,
} from '@/utils/fabric-canvas-pasteboard'

const PADDING = 40

function createPasteboardCanvas(pageElement: HTMLElement): { canvas: Canvas; detach: () => void } {
  const zoom = 0.5
  const size = getPasteboardCanvasDimensions(400, 600, zoom, PADDING)
  const canvas = new Canvas(document.createElement('canvas'), size)
  canvas.setViewportTransform(getPasteboardViewportTransform(zoom, PADDING))
  const detach = installCanvasPasteboard(canvas, pageElement, PADDING)
  return { canvas, detach }
}

describe('fabric canvas pasteboard', () => {
  it('reports the page size without the pasteboard margin', () => {
    const { canvas, detach } = createPasteboardCanvas(document.createElement('div'))

    expect(getCanvasPageLogicalSize(canvas)).toEqual({ width: 400, height: 600 })

    detach()
    canvas.dispose()
  })

  it('clips the surface to the page until a selection spills outside it', () => {
    const pageElement = document.createElement('div')
    const { canvas, detach } = createPasteboardCanvas(pageElement)
    const wrapper = canvas.wrapperEl

    expect(wrapper.style.clipPath).toBe('inset(40px 40px 40px 40px)')

    const rect = new Rect({ left: -60, top: 300, width: 100, height: 50 })
    canvas.add(rect)
    canvas.setActiveObject(rect)
    canvas.renderAll()

    expect(wrapper.style.clipPath).toBe('inset(40px 40px 40px 0px)')
    expect(pageElement.style.zIndex).toBe('120')

    canvas.discardActiveObject()
    canvas.renderAll()

    expect(wrapper.style.clipPath).toBe('inset(40px 40px 40px 40px)')
    expect(pageElement.style.zIndex).toBe('')

    detach()
    canvas.dispose()
  })
})
