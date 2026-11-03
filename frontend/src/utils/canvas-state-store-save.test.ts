/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'
import { Canvas as FabricCanvas, Rect, StaticCanvas, Textbox, type Canvas } from 'fabric'

import { CanvasStateStore, exportLiveFabricCanvasJson, prepareCanvasJsonForPersistence } from './canvas-state-store'
import {
  CANVAS_PASTEBOARD_PADDING_PX,
  getPasteboardCanvasDimensions,
  getPasteboardViewportTransform,
  installCanvasPasteboard,
} from './fabric-canvas-pasteboard'

const SIZE = { width: 600, height: 900 }
const COVER_SIZE = { width: 3827, height: 2775 }

function mountCover(zoom: number): Canvas {
  const canvas = new FabricCanvas(
    document.createElement('canvas'),
    getPasteboardCanvasDimensions(COVER_SIZE.width, COVER_SIZE.height, zoom),
  )
  canvas.setViewportTransform(getPasteboardViewportTransform(zoom))
  installCanvasPasteboard(canvas, null, COVER_SIZE)
  return canvas
}

/** What the zoom control does to a mounted canvas. */
function zoomTo(canvas: Canvas, zoom: number): void {
  canvas.setDimensions(getPasteboardCanvasDimensions(COVER_SIZE.width, COVER_SIZE.height, zoom))
  canvas.setViewportTransform(getPasteboardViewportTransform(zoom, CANVAS_PASTEBOARD_PADDING_PX))
}

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

  it('keeps a loaded cover clean when only the zoom changes', async () => {
    const source = new StaticCanvas(document.createElement('canvas'), {
      ...COVER_SIZE,
      renderOnAddRemove: false,
    }) as unknown as Canvas
    source.add(new Rect({ left: 20, top: 10, width: 50, height: 40, fill: '#123456' }))
    source.add(new Textbox('Title', { left: 40, top: 80, width: 300, fontSize: 40 }))

    const store = new CanvasStateStore()
    store.preload(-1, exportLiveFabricCanvasJson(source))
    store.markHydrated(-1, prepareCanvasJsonForPersistence(store.getSerialized(-1)!))

    const cover = mountCover(0.37)
    expect(await store.restore(-1, cover)).toBe('restored')
    store.markFabricLiveTrusted(-1)
    store.reconcileFabricBaselineIfPending(-1, cover)
    expect(store.isDirty(-1, exportLiveFabricCanvasJson(cover))).toBe(false)

    for (const zoom of [0.41, 0.53, 0.77, 1.13]) {
      zoomTo(cover, zoom)
      expect(store.isDirty(-1, exportLiveFabricCanvasJson(cover))).toBe(false)
    }
    cover.dispose()
  })

  it('still counts a real edit on a cover after zooming', async () => {
    const store = new CanvasStateStore()
    store.preload(-1, pageWithRectAt(20))
    store.markHydrated(-1, prepareCanvasJsonForPersistence(store.getSerialized(-1)!))

    const cover = mountCover(0.37)
    await store.restore(-1, cover)
    store.markFabricLiveTrusted(-1)
    store.reconcileFabricBaselineIfPending(-1, cover)

    zoomTo(cover, 0.53)
    cover.add(new Rect({ left: 70, top: 10, width: 50, height: 40 }))
    expect(store.isDirty(-1, exportLiveFabricCanvasJson(cover))).toBe(true)
    cover.dispose()
  })
})
