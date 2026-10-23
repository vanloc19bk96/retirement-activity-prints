/**
 * @vitest-environment jsdom
 */
import { ActiveSelection, Canvas, Rect, Textbox } from 'fabric'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { setLayerLocked } from '@/utils/canvas-layers'
import {
  readSelectionProperties,
  setSelectionAngle,
  setSelectionOpacity,
  setSelectionPosition,
  setSelectionSize,
  setSelectionTextProperties,
} from '@/utils/canvas-selection-properties'

const canvases: Canvas[] = []

function makeCanvas(): Canvas {
  const canvas = new Canvas(document.createElement('canvas'), { width: 800, height: 800 })
  canvases.push(canvas)
  return canvas
}

afterEach(() => {
  for (const canvas of canvases.splice(0)) canvas.dispose()
})

describe('readSelectionProperties', () => {
  it('is null without a selection and describes a single object', () => {
    const canvas = makeCanvas()
    expect(readSelectionProperties(canvas)).toBeNull()
    const rect = new Rect({ left: 10, top: 20, width: 100, height: 50, strokeWidth: 0, originX: 'left', originY: 'top' })
    canvas.add(rect)
    canvas.setActiveObject(rect)
    expect(readSelectionProperties(canvas)).toMatchObject({
      count: 1,
      kind: 'shape',
      name: 'Rectangle',
      x: 10,
      y: 20,
      width: 100,
      height: 50,
      angle: 0,
      opacity: 1,
      text: null,
    })
  })

  it('reports mixed opacity and no angle for several objects', () => {
    const canvas = makeCanvas()
    const a = new Rect({ width: 10, height: 10, opacity: 0.5 })
    const b = new Rect({ left: 50, width: 10, height: 10 })
    canvas.add(a, b)
    canvas.setActiveObject(new ActiveSelection([a, b], { canvas }))
    expect(readSelectionProperties(canvas)).toMatchObject({ count: 2, kind: null, name: '2 objects', angle: null, opacity: null })
  })
})

describe('selection edits', () => {
  it('moves and resizes from the top-left corner, keeping the ratio when asked', () => {
    const canvas = makeCanvas()
    const rect = new Rect({ left: 10, top: 20, width: 100, height: 50, strokeWidth: 0, originX: 'left', originY: 'top' })
    canvas.add(rect)
    canvas.setActiveObject(rect)
    const onModified = vi.fn()
    canvas.on('object:modified', onModified)

    setSelectionPosition(canvas, 'x', 40)
    setSelectionSize(canvas, 'width', 200, true)
    expect(readSelectionProperties(canvas)).toMatchObject({ x: 40, y: 20, width: 200, height: 100 })

    setSelectionSize(canvas, 'height', 50, false)
    expect(readSelectionProperties(canvas)).toMatchObject({ x: 40, y: 20, width: 200, height: 50 })
    expect(onModified).toHaveBeenCalledTimes(3)
  })

  it('rotates about the centre and previews opacity until it is final', () => {
    const canvas = makeCanvas()
    const rect = new Rect({ left: 100, top: 100, width: 100, height: 100, strokeWidth: 0 })
    canvas.add(rect)
    canvas.setActiveObject(rect)
    const centerBefore = rect.getCenterPoint()
    setSelectionAngle(canvas, 450)
    expect(rect.angle).toBe(90)
    expect(rect.getCenterPoint().x).toBeCloseTo(centerBefore.x)

    const onModified = vi.fn()
    canvas.on('object:modified', onModified)
    setSelectionOpacity(canvas, 0.4, false)
    expect(rect.opacity).toBe(0.4)
    expect(onModified).not.toHaveBeenCalled()
    setSelectionOpacity(canvas, 0.4, true)
    expect(onModified).toHaveBeenCalledTimes(1)
  })

  it('sets text spacing and leaves a locked object alone', () => {
    const canvas = makeCanvas()
    const text = new Textbox('Murder at the manor', { width: 300 })
    canvas.add(text)
    canvas.setActiveObject(text)

    setSelectionTextProperties(canvas, { lineHeight: 1.5, letterSpacingPercent: 5 })
    expect(text.lineHeight).toBe(1.5)
    expect(text.charSpacing).toBe(50)
    expect(readSelectionProperties(canvas)?.text).toMatchObject({ lineHeight: 1.5, letterSpacingPercent: 5 })

    setLayerLocked(canvas, text, true)
    setSelectionPosition(canvas, 'x', 300)
    expect(text.left).not.toBe(300)
    expect(readSelectionProperties(canvas)?.isLocked).toBe(true)
  })
})
