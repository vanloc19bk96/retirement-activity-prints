/**
 * @vitest-environment jsdom
 */
import { Canvas, Circle, Rect, Textbox } from 'fabric'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  getLayerName,
  moveLayer,
  planLayerMoveIndex,
  readCanvasLayers,
  renameLayer,
  resolveLayerSelection,
  selectLayers,
  setLayerLocked,
  setLayerVisible,
  stepLayer,
} from '@/utils/canvas-layers'
import { exportLiveFabricCanvasJson } from '@/utils/canvas-state-store'

const canvases: Canvas[] = []

function makeCanvas(): Canvas {
  const canvas = new Canvas(document.createElement('canvas'))
  canvases.push(canvas)
  return canvas
}

afterEach(() => {
  for (const canvas of canvases.splice(0)) canvas.dispose()
})

describe('planLayerMoveIndex', () => {
  const stack = ['a', 'b', 'c', 'd']

  it('puts the moving item directly above or below the anchor', () => {
    expect(planLayerMoveIndex(stack, 'a', 'c', 'above')).toBe(2)
    expect(planLayerMoveIndex(stack, 'a', 'c', 'below')).toBe(1)
    expect(planLayerMoveIndex(stack, 'd', 'a', 'below')).toBe(0)
    expect(planLayerMoveIndex(stack, 'd', 'b', 'above')).toBe(2)
  })

  it('returns null when nothing would move', () => {
    expect(planLayerMoveIndex(stack, 'b', 'a', 'above')).toBeNull()
    expect(planLayerMoveIndex(stack, 'b', 'c', 'below')).toBeNull()
    expect(planLayerMoveIndex(stack, 'b', 'b', 'above')).toBeNull()
    expect(planLayerMoveIndex(stack, 'x', 'b', 'above')).toBeNull()
  })
})

describe('resolveLayerSelection', () => {
  const orderedIds = ['a', 'b', 'c', 'd', 'e']

  it('replaces, toggles and selects ranges from the anchor', () => {
    expect(resolveLayerSelection({ orderedIds, selectedIds: ['a'], anchorId: 'a', clickedId: 'c', mode: 'replace' })).toEqual(['c'])
    expect(resolveLayerSelection({ orderedIds, selectedIds: ['a'], anchorId: 'a', clickedId: 'c', mode: 'toggle' })).toEqual(['a', 'c'])
    expect(resolveLayerSelection({ orderedIds, selectedIds: ['a', 'c'], anchorId: 'a', clickedId: 'c', mode: 'toggle' })).toEqual(['a'])
    expect(resolveLayerSelection({ orderedIds, selectedIds: ['d'], anchorId: 'd', clickedId: 'b', mode: 'range' })).toEqual(['b', 'c', 'd'])
    expect(resolveLayerSelection({ orderedIds, selectedIds: [], anchorId: null, clickedId: 'b', mode: 'range' })).toEqual(['b'])
  })
})

describe('readCanvasLayers', () => {
  it('lists layers frontmost first and skips transient helpers', () => {
    const canvas = makeCanvas()
    const background = new Rect({ width: 10, height: 10 })
    const title = new Textbox('  The   Locked\nRoom  ')
    const draft = new Rect({ width: 5, height: 5, selectable: false, evented: false })
    canvas.add(background, title, draft)

    const { layers } = readCanvasLayers(canvas)
    expect(layers.map((layer) => layer.name)).toEqual(['The Locked Room', 'Rectangle'])
    expect(layers.map((layer) => layer.kind)).toEqual(['text', 'shape'])
  })

  it('keeps a row id stable for the same object', () => {
    const canvas = makeCanvas()
    canvas.add(new Circle({ radius: 4 }))
    expect(readCanvasLayers(canvas).layers[0].id).toBe(readCanvasLayers(canvas).layers[0].id)
  })
})

describe('layer edits', () => {
  it('reorders, steps past hidden helpers and reports the change', () => {
    const canvas = makeCanvas()
    const a = new Rect()
    const helper = new Rect({ selectable: false, evented: false })
    const b = new Rect()
    const c = new Rect()
    canvas.add(a, helper, b, c)
    const onModified = vi.fn()
    canvas.on('object:modified', onModified)

    expect(moveLayer(canvas, a, c, 'above')).toBe(true)
    expect(canvas.getObjects()).toEqual([helper, b, c, a])
    expect(onModified).toHaveBeenCalledTimes(1)

    expect(stepLayer(canvas, b, 'down')).toBe(false)
    expect(stepLayer(canvas, b, 'up')).toBe(true)
    expect(canvas.getObjects()).toEqual([helper, c, b, a])
  })

  it('deselects an object when it is hidden and keeps it out of new selections', () => {
    const canvas = makeCanvas()
    const a = new Rect()
    const b = new Rect()
    canvas.add(a, b)
    canvas.setActiveObject(a)

    setLayerVisible(canvas, a, false)
    expect(a.visible).toBe(false)
    expect(canvas.getActiveObject()).toBeUndefined()

    selectLayers(canvas, [a, b])
    expect(canvas.getActiveObjects()).toEqual([b])
  })

  it('locks and renames, falling back to the automatic name', () => {
    const canvas = makeCanvas()
    const text = new Textbox('Chapter one')
    canvas.add(text)

    setLayerLocked(canvas, text, true)
    expect(readCanvasLayers(canvas).layers[0].isLocked).toBe(true)

    renameLayer(canvas, text, '  Heading  ')
    expect(getLayerName(text)).toBe('Heading')
    // The name is saved with the page.
    expect(exportLiveFabricCanvasJson(canvas)).toMatchObject({ objects: [{ layerName: 'Heading' }] })

    renameLayer(canvas, text, '   ')
    expect(getLayerName(text)).toBe('Chapter one')
  })
})
