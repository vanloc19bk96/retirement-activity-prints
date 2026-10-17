/**
 * @vitest-environment jsdom
 */
import { ActiveSelection, Canvas, Group, Rect, Textbox } from 'fabric'
import { describe, expect, it } from 'vitest'

import { readActiveTextTargets } from '@/hooks/canvas-editor/canvas-editor-queries'
import {
  effectiveFontSizeToRawFontSize,
  getCanvasSelectionSnapshot,
} from '@/utils/fabric-selection'

const letter = (text: string, left: number) =>
  new Textbox(text, { left, top: 0, width: 20, fontSize: 14, fontFamily: 'PT Serif' })

describe('text toolbar on a group of letters', () => {
  it('styles a word search grid as one selection', () => {
    const canvas = new Canvas(document.createElement('canvas'))
    const a = letter('A', 0)
    const b = letter('B', 30)
    const capsule = new Rect({ left: 0, top: 0, width: 60, height: 20, fill: 'transparent' })
    const grid = new Group([capsule, a, b], { scaleX: 2, scaleY: 2 })
    canvas.add(grid)
    canvas.setActiveObject(grid)

    const info = getCanvasSelectionSnapshot(canvas).selectionInfo
    expect(info.isText).toBe(true)
    expect(info.fontFamily).toBe('PT Serif')
    // Printed size counts the grid's own scale.
    expect(info.fontSize).toBe(28)

    expect(readActiveTextTargets(canvas)).toEqual([a, b])
    expect(effectiveFontSizeToRawFontSize(28, a)).toBe(14)

    canvas.dispose()
  })

  it('reaches letters inside a multi-selection', () => {
    const canvas = new Canvas(document.createElement('canvas'))
    const a = letter('A', 0)
    const b = letter('B', 30)
    canvas.add(a, b)
    canvas.setActiveObject(new ActiveSelection([a, b], { canvas }))

    expect(getCanvasSelectionSnapshot(canvas).selectionInfo.isText).toBe(true)
    expect(readActiveTextTargets(canvas)).toEqual([a, b])

    canvas.dispose()
  })
})
