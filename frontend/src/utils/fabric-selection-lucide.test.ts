/**
 * @vitest-environment jsdom
 */
import { Canvas } from 'fabric'
import { describe, expect, it } from 'vitest'

import { getCanvasSelectionSnapshot } from '@/utils/fabric-selection'
import { createFabricIconGroupFromLucideNode } from '@/utils/lucide-fabric'

describe('getCanvasSelectionSnapshot lucide icons', () => {
  it('reads stroke from the glyph, not the invisible viewBox frame', () => {
    const el = document.createElement('canvas')
    const canvas = new Canvas(el)
    const icon = createFabricIconGroupFromLucideNode([['path', { d: 'M4 4h16v16H4z' }]], {
      targetWidth: 48,
    })
    for (const child of icon.getObjects().slice(1)) {
      child.set({ strokeWidth: 3.5, stroke: '#123456', strokeDashArray: [8, 4] })
    }
    canvas.add(icon)
    canvas.setActiveObject(icon)

    const { selectionInfo } = getCanvasSelectionSnapshot(canvas)
    expect(selectionInfo.isShape).toBe(true)
    expect(selectionInfo.strokeWidth).toBe(3.5)
    expect(selectionInfo.strokeColor).toBe('#123456')
    expect(selectionInfo.borderStyle).toBe('dash')

    canvas.dispose()
    icon.dispose()
  })
})
