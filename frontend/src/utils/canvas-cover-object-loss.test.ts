/**
 * @vitest-environment jsdom
 *
 * Can adding an image or auto-saving lose what is already on the cover?
 * Plain `it`: paths checked and safe. `it.fails`: a real gap, written as the behaviour we want, so
 * the test turns red (and should become a plain `it`) on the day the gap is closed.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Canvas, FabricImage, Rect, StaticCanvas, Textbox } from 'fabric'

import { addImageToFabricCanvasAtClientPoint } from '@/utils/canvas-image'
import { CanvasStateStore, exportLiveFabricCanvasJson } from '@/utils/canvas-state-store'
import { resolveBookCoverImagePlacementZone } from '@/utils/book-cover-image-placement'
import { getPasteboardCanvasDimensions, installCanvasPasteboard } from '@/utils/fabric-canvas-pasteboard'
import type { BookCoverDimensions, BookCoverZones } from '@/types/book-cover.types'

const COVER = { width: 3827, height: 2775 }

function mountCover(): Canvas {
  const canvas = new Canvas(document.createElement('canvas'), getPasteboardCanvasDimensions(COVER.width, COVER.height, 1, 0))
  installCanvasPasteboard(canvas, null, COVER, 0)
  return canvas
}

function savedCoverWithTitle(): object {
  const source = new StaticCanvas(document.createElement('canvas'), { ...COVER, renderOnAddRemove: false })
  source.add(new Textbox('My Book', { left: 2500, top: 200, width: 600, fontSize: 80 }))
  source.add(new Rect({ left: 2500, top: 900, width: 200, height: 200, fill: '#123456' }))
  return exportLiveFabricCanvasJson(source as unknown as Canvas)
}

function objectCount(json: object | null): number {
  return ((json as { objects?: unknown[] } | null)?.objects ?? []).length
}

async function loadedCover(store: CanvasStateStore): Promise<Canvas> {
  store.preload(-1, savedCoverWithTitle())
  const canvas = mountCover()
  expect(await store.restore(-1, canvas)).toBe('restored')
  store.markFabricLiveTrusted(-1)
  return canvas
}

function addRect(canvas: Canvas): void {
  canvas.add(new Rect({ left: 100, top: 100, width: 50, height: 50 }))
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('paths that keep the cover intact', () => {
  it('auto-save sends the old objects together with the new one', async () => {
    const store = new CanvasStateStore()
    const canvas = await loadedCover(store)

    addRect(canvas)

    const payload = exportLiveFabricCanvasJson(canvas)
    expect(store.isDirty(-1, payload)).toBe(true)
    expect(objectCount(payload)).toBe(3)
    canvas.dispose()
  })

  it('an edit made while a save is in flight stays unsaved, and goes with the next save', async () => {
    const store = new CanvasStateStore()
    const canvas = await loadedCover(store)
    addRect(canvas)
    const inFlight = exportLiveFabricCanvasJson(canvas)

    addRect(canvas)
    store.markSavedIfUnchanged(-1, inFlight, exportLiveFabricCanvasJson(canvas))

    const next = exportLiveFabricCanvasJson(canvas)
    expect(store.isDirty(-1, next)).toBe(true)
    expect(objectCount(next)).toBe(4)
    canvas.dispose()
  })

  it('an empty canvas that never finished loading cannot replace the saved cover', () => {
    const store = new CanvasStateStore()
    store.preload(-1, savedCoverWithTitle())
    const emptyCanvas = mountCover()

    // What leaving the cover does while its load is failing or unfinished.
    store.save(-1, emptyCanvas)

    expect(objectCount(store.getSerialized(-1))).toBe(2)
    expect(store.isFabricLiveTrusted(-1)).toBe(false)
    emptyCanvas.dispose()
  })

  it('leaving the cover and coming back keeps an unsaved image', async () => {
    const store = new CanvasStateStore()
    const canvas = await loadedCover(store)
    addRect(canvas)

    store.save(-1, canvas)
    store.markFabricLiveUntrusted(-1)
    canvas.dispose()

    const remounted = mountCover()
    expect(await store.restore(-1, remounted)).toBe('restored')
    expect(remounted.getObjects()).toHaveLength(3)
    store.markFabricLiveTrusted(-1)
    expect(store.isDirty(-1, exportLiveFabricCanvasJson(remounted))).toBe(true)
    remounted.dispose()
  })
})

describe('known gaps', () => {
  // Drops still work over the "Loading canvas…" overlay (FabricCanvasItemActive attaches them unless the
  // restore failed), and nothing checks the store. The Place buttons refuse this case; dragging does not.
  it.fails('keeps an image dropped while the cover is still restoring', async () => {
    const store = new CanvasStateStore()
    store.preload(-1, savedCoverWithTitle())
    const canvas = mountCover()

    const restoring = store.restore(-1, canvas)
    addRect(canvas)
    await restoring

    try {
      expect(canvas.getObjects()).toHaveLength(3)
    } finally {
      canvas.dispose()
    }
  })

  // settleCanvasBaselines in MainContent runs after 600 ms without a canvas:live event, and
  // checkHasUnsavedChanges answers "no changes" until then, so no dot shows and no auto-save starts.
  it.fails('still counts an edit made before the load settled as unsaved', async () => {
    const store = new CanvasStateStore()
    const canvas = await loadedCover(store)
    addRect(canvas)

    store.markHydrated(-1, exportLiveFabricCanvasJson(canvas))

    try {
      expect(store.isDirty(-1, exportLiveFabricCanvasJson(canvas))).toBe(true)
    } finally {
      canvas.dispose()
    }
  })

  // The drop path brings the image to the very front, so a full-panel image hides the title. Nothing is
  // deleted (Layers still has it), but it reads as lost. The Place buttons keep text above the image.
  it.fails('keeps the title visible when an image is dropped on the same panel', async () => {
    const element = document.createElement('canvas')
    element.width = 2588
    element.height = 3375
    vi.spyOn(FabricImage, 'fromURL').mockResolvedValue(new FabricImage(element))
    const zones = {
      spine: { x: 1850, width: 127 },
      frontCover: { x: 1977, width: 1813 },
    } as unknown as BookCoverZones
    const dimensions = { fullHeightPixels: COVER.height, bleedPixels: 37 } as unknown as BookCoverDimensions
    const canvas = mountCover()
    const title = new Textbox('My Book', { left: 2500, top: 200, width: 600, fontSize: 80 })
    canvas.add(title)

    await addImageToFabricCanvasAtClientPoint({
      canvas,
      src: 'https://s/cover.png',
      clientX: 2500,
      clientY: 500,
      fitMode: 'cover',
      placementZone: resolveBookCoverImagePlacementZone(zones, dimensions, 2500),
    })

    try {
      expect(canvas.getObjects().at(-1)).toBe(title)
    } finally {
      canvas.dispose()
    }
  })
})
