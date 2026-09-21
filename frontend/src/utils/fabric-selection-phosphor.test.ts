/**
 * @vitest-environment jsdom
 */
import { Canvas, Group, Rect } from 'fabric'
import { describe, expect, it } from 'vitest'

import { getCanvasSelectionSnapshot } from '@/utils/fabric-selection'
import { createFabricIconGroupFromPhosphorSvg } from '@/utils/phosphor-fabric'

describe('getCanvasSelectionSnapshot phosphor icons', () => {
  it('treats a selected phosphor icon group as an editable shape', () => {
    const el = document.createElement('canvas')
    const canvas = new Canvas(el)
    const icon = createFabricIconGroupFromPhosphorSvg(
      '<svg><path d="M10 10h20v20H10z" opacity="0.2"/><path d="M12 12h16v16H12z"/></svg>',
      { targetWidth: 48 },
    )
    canvas.add(icon)
    canvas.setActiveObject(icon)

    const snapshot = getCanvasSelectionSnapshot(canvas)
    expect(snapshot.selectionInfo.isShape).toBe(true)
    expect(snapshot.selectionInfo.strokeColor).toBe('#4B4B4B')
    expect(snapshot.selectionInfo.fillColor).toBe('#D6D6D6')
    expect(snapshot.selectionInfo.strokeWidth).toBe(0)

    canvas.dispose()
    icon.dispose()
  })

  it('does not treat a plain group as an editable shape', () => {
    const el = document.createElement('canvas')
    const canvas = new Canvas(el)
    const group = new Group([new Rect({ width: 20, height: 20, fill: '#000' })], {
      selectable: true,
    })
    canvas.add(group)
    canvas.setActiveObject(group)

    const snapshot = getCanvasSelectionSnapshot(canvas)
    expect(snapshot.selectionInfo.isShape).toBe(false)

    canvas.dispose()
    group.dispose()
  })
})
