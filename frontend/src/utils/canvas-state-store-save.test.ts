/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'
import { Rect, StaticCanvas, type Canvas } from 'fabric'

import { CanvasStateStore, exportLiveFabricCanvasJson, prepareCanvasJsonForPersistence } from './canvas-state-store'

const SIZE = { width: 600, height: 900 }

function pageWithRectAt(left: number): object {
  const canvas = new StaticCanvas(document.createElement('canvas'), {
    ...SIZE,
    renderOnAddRemove: false,
  }) as unknown as Canvas
  canvas.add(new Rect({ left, top: 10, width: 50, height: 40, fill: '#123456' }))
  return exportLiveFabricCanvasJson(canvas)
}

function isStoredPageDirty(store: CanvasStateStore, index: number): boolean {
  return store.isDirty(index, prepareCanvasJsonForPersistence(store.getSerialized(index)!))
}

describe('canvas state store saving', () => {
  it('keeps a stored page edited while its save was in flight unsaved', () => {
    const store = new CanvasStateStore()
    store.preload(0, pageWithRectAt(20), SIZE)

    store.setSerialized(0, pageWithRectAt(30))
    const sent = prepareCanvasJsonForPersistence(store.getSerialized(0)!)
    store.setSerialized(0, pageWithRectAt(40))

    store.markSavedIfUnchanged(0, sent, prepareCanvasJsonForPersistence(store.getSerialized(0)!))
    expect(isStoredPageDirty(store, 0)).toBe(true)
    expect((store.getSerialized(0) as { objects: { left: number }[] }).objects[0].left).toBe(40)

    const resent = prepareCanvasJsonForPersistence(store.getSerialized(0)!)
    store.markSavedIfUnchanged(0, resent, resent)
    expect(isStoredPageDirty(store, 0)).toBe(false)
  })

  it('keeps a live page edited while its save was in flight unsaved', () => {
    const store = new CanvasStateStore()
    store.preload(0, pageWithRectAt(20), SIZE)
    store.markFabricLiveTrusted(0)

    const sent = pageWithRectAt(30)
    const editedMeanwhile = pageWithRectAt(40)

    store.markSavedIfUnchanged(0, sent, editedMeanwhile)
    expect(store.isDirty(0, editedMeanwhile)).toBe(true)
    expect(store.isDirty(0, sent)).toBe(false)

    store.markSavedIfUnchanged(0, editedMeanwhile, editedMeanwhile)
    expect(store.isDirty(0, editedMeanwhile)).toBe(false)
  })

  it('moves the baseline of a page whose canvas has no JSON to compare yet', () => {
    const store = new CanvasStateStore()
    const sent = pageWithRectAt(30)

    store.markSavedIfUnchanged(3, sent, null)
    expect(store.isDirty(3, sent)).toBe(false)
    expect(store.isDirty(3, pageWithRectAt(40))).toBe(true)
  })

  it('saves both pages of a move', () => {
    const store = new CanvasStateStore()
    store.preload(0, pageWithRectAt(20), SIZE)
    store.preload(1, pageWithRectAt(80), SIZE)

    store.reorderPagesSerialized([1, 0])
    expect(isStoredPageDirty(store, 0)).toBe(true)
    expect(isStoredPageDirty(store, 1)).toBe(true)
  })
})
