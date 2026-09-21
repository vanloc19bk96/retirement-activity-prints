/**
 * @vitest-environment jsdom
 */
import { Canvas, Circle, Group, Rect } from 'fabric'
import { describe, expect, it } from 'vitest'

import { getCanvasSelectionSnapshot } from '@/utils/fabric-selection'
import { STUDIO_SHAPE_GROUP_SOURCE } from '@/utils/studio-shape-group'

describe('getCanvasSelectionSnapshot studio shape groups', () => {
  it('treats a tagged studio shape group as an editable shape', () => {
    const el = document.createElement('canvas')
    const canvas = new Canvas(el)
    const group = new Group(
      [
        new Circle({
          radius: 20,
          fill: 'transparent',
          stroke: '#4a4a4a',
          strokeWidth: 2,
        }),
      ],
      { selectable: true },
    )
    ;(group as unknown as { set: (key: string, value: unknown) => void }).set('data', {
      source: STUDIO_SHAPE_GROUP_SOURCE,
    })
    canvas.add(group)
    canvas.setActiveObject(group)

    const snapshot = getCanvasSelectionSnapshot(canvas)
    expect(snapshot.selectionInfo.isShape).toBe(true)
    expect(snapshot.selectionInfo.strokeColor).toBe('#4a4a4a')
    expect(snapshot.selectionInfo.strokeWidth).toBe(2)

    canvas.dispose()
    group.dispose()
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
