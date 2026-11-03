/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest'
import { Canvas, FabricImage, Rect, Textbox, type FabricObject } from 'fabric'

import type { BookCoverDimensions, BookCoverZones } from '@/types/book-cover.types'
import { collectPlacedImageUrls } from '@/utils/ai-image-history'
import { CanvasStateStore, exportLiveFabricCanvasJson } from '@/utils/canvas-state-store'
import { createFabricCanvasHistoryManager } from '@/utils/fabric-canvas-history'
import { getPasteboardCanvasDimensions, installCanvasPasteboard } from '@/utils/fabric-canvas-pasteboard'
import {
  onPlaceGeneratedImage,
  placeGeneratedImage,
} from '@/utils/generated-image-placement-events'
import { placeGeneratedImageOnEditor, type PlaceGeneratedImageDeps } from './use-place-generated-image'

const COVER = { width: 3827, height: 2775 }
const PAGE = { width: 800, height: 1000 }
const SPINE_X = 1850
const SPINE_WIDTH = 127
const IMAGE_URL = 'https://s/storage/v1/object/public/b/images/u/upload/cover.png'

const zones = {
  spine: { x: SPINE_X, width: SPINE_WIDTH },
  frontCover: { x: SPINE_X + SPINE_WIDTH, width: 1813 },
} as unknown as BookCoverZones
const dimensions = { fullHeightPixels: COVER.height, bleedPixels: 37 } as unknown as BookCoverDimensions

function mountCanvas(size: { width: number; height: number }): Canvas {
  const canvas = new Canvas(document.createElement('canvas'), getPasteboardCanvasDimensions(size.width, size.height, 1, 0))
  installCanvasPasteboard(canvas, null, size, 0)
  return canvas
}

function loadedImage(): FabricObject {
  const element = document.createElement('canvas')
  element.width = 2588
  element.height = 3375
  return new FabricImage(element) as unknown as FabricObject
}

function deps(canvas: Canvas | null, overrides: Partial<PlaceGeneratedImageDeps> = {}): PlaceGeneratedImageDeps {
  return {
    getCanvas: () => canvas,
    isCanvasEditable: () => true,
    isInteriorMode: () => false,
    getActivePageIndex: () => 2,
    getCoverGeometry: () => ({ zones, dimensions }),
    loadImage: async () => loadedImage(),
    onPlaced: vi.fn(),
    ...overrides,
  }
}

function coverWithArtAndTitle(): { canvas: Canvas; art: Rect; title: Textbox } {
  const canvas = mountCanvas(COVER)
  const art = new Rect({ left: 2500, top: 100, width: 400, height: 400, fill: '#123456' })
  const title = new Textbox('My Book', { left: 2500, top: 200, width: 600, fontSize: 80 })
  canvas.add(art, title)
  return { canvas, art, title }
}

describe('placing a generated image', () => {
  it('fills the front cover, keeps the objects already there, and leaves the title readable', async () => {
    const { canvas, art, title } = coverWithArtAndTitle()

    const result = await placeGeneratedImageOnEditor(IMAGE_URL, 'front', deps(canvas))

    expect(result).toEqual({ placedOn: 'the front cover' })
    const objects = canvas.getObjects()
    expect(objects).toHaveLength(3)
    expect(objects[0]).toBe(art)
    expect(objects[1]).toBeInstanceOf(FabricImage)
    expect(objects[2]).toBe(title)

    const placed = objects[1]!
    const box = placed.getBoundingRect()
    expect(box.left).toBeCloseTo(SPINE_X + SPINE_WIDTH, 0)
    expect(box.width).toBeCloseTo(1813 + 37, 0)
    expect(box.height).toBeCloseTo(COVER.height, 0)
    canvas.dispose()
  })

  it('shows the new image over an image placed earlier, which stays on the canvas', async () => {
    const canvas = mountCanvas(COVER)
    await placeGeneratedImageOnEditor('https://s/first.png', 'front', deps(canvas))
    await placeGeneratedImageOnEditor('https://s/second.png', 'front', deps(canvas))

    const urls = canvas.getObjects().map((object) => (object as FabricObject & { originalImageUrl?: string }).originalImageUrl)
    expect(urls).toEqual(['https://s/first.png', 'https://s/second.png'])
    canvas.dispose()
  })

  it.each([
    ['back', 'the back cover', 0, SPINE_X],
    ['spine', 'the spine', SPINE_X, SPINE_WIDTH],
  ] as const)('fits the %s zone', async (target, label, left, width) => {
    const canvas = mountCanvas(COVER)

    expect(await placeGeneratedImageOnEditor(IMAGE_URL, target, deps(canvas))).toEqual({ placedOn: label })

    const box = canvas.getObjects()[0]!.getBoundingRect()
    expect(box.left).toBeCloseTo(left, 0)
    expect(box.width).toBeCloseTo(width, 0)
    canvas.dispose()
  })

  it('leaves text on another part of the cover out of the stacking decision', async () => {
    const canvas = mountCanvas(COVER)
    const backArt = new Rect({ left: 10, top: 10, width: 100, height: 100 })
    const frontTitle = new Textbox('Title', { left: 2500, top: 200, width: 600 })
    canvas.add(frontTitle, backArt)

    await placeGeneratedImageOnEditor(IMAGE_URL, 'front', deps(canvas))

    expect(canvas.getObjects()[0]).toBeInstanceOf(FabricImage)
    expect(canvas.getObjects().slice(1)).toEqual([frontTitle, backArt])
    canvas.dispose()
  })

  it('puts the image in the middle of the current page, at half the page at most', async () => {
    const canvas = mountCanvas(PAGE)
    const existing = new Rect({ left: 0, top: 0, width: 10, height: 10 })
    canvas.add(existing)
    const getCanvas = vi.fn(() => canvas)
    const onPlaced = vi.fn()

    const result = await placeGeneratedImageOnEditor(
      IMAGE_URL,
      'page',
      deps(canvas, { getCanvas, onPlaced, isInteriorMode: () => true }),
    )

    expect(result).toEqual({ placedOn: 'page 3' })
    expect(getCanvas).toHaveBeenCalledWith(2)
    expect(onPlaced).toHaveBeenCalledWith(2)
    expect(canvas.getObjects()[0]).toBe(existing)
    const center = canvas.getObjects()[1]!.getCenterPoint()
    expect(center.x).toBeCloseTo(PAGE.width / 2, 0)
    expect(center.y).toBeCloseTo(PAGE.height / 2, 0)
    expect(canvas.getObjects()[1]!.getScaledHeight()).toBeLessThanOrEqual(PAGE.height / 2 + 1)
    canvas.dispose()
  })

  it('marks the page unsaved and records the print file, not a preview, for the save', async () => {
    const canvas = mountCanvas(COVER)
    const store = new CanvasStateStore()
    store.preload(-1, exportLiveFabricCanvasJson(canvas))
    store.markFabricLiveTrusted(-1)
    expect(store.isDirty(-1, exportLiveFabricCanvasJson(canvas))).toBe(false)

    await placeGeneratedImageOnEditor(IMAGE_URL, 'front', deps(canvas))

    const saved = exportLiveFabricCanvasJson(canvas)
    expect(store.isDirty(-1, saved)).toBe(true)
    expect(collectPlacedImageUrls(saved).has(IMAGE_URL)).toBe(true)
    canvas.dispose()
  })

  it('can be undone, bringing back exactly what was on the cover', async () => {
    const { canvas } = coverWithArtAndTitle()
    const history = createFabricCanvasHistoryManager(canvas)
    history.start()

    await placeGeneratedImageOnEditor(IMAGE_URL, 'front', deps(canvas))
    await Promise.resolve()
    expect(history.canUndo()).toBe(true)
    await history.undo()

    expect(canvas.getObjects().map((object) => object.type)).toEqual(['rect', 'textbox'])
    history.dispose()
    canvas.dispose()
  })
})

describe('when the image cannot be placed', () => {
  it('reports a failed download and changes nothing', async () => {
    const { canvas } = coverWithArtAndTitle()

    const result = await placeGeneratedImageOnEditor(
      IMAGE_URL,
      'front',
      deps(canvas, { loadImage: () => Promise.reject(new Error('network')) }),
    )

    expect(result).toEqual({ error: expect.stringContaining('could not be loaded') })
    expect(canvas.getObjects()).toHaveLength(2)
    canvas.dispose()
  })

  it('refuses a canvas still loading its page, whose restore would wipe the image', async () => {
    const { canvas } = coverWithArtAndTitle()
    const onPlaced = vi.fn()

    const result = await placeGeneratedImageOnEditor(
      IMAGE_URL,
      'front',
      deps(canvas, { isCanvasEditable: () => false, onPlaced }),
    )

    expect(result).toEqual({ error: expect.stringContaining('still loading') })
    expect(canvas.getObjects()).toHaveLength(2)
    expect(onPlaced).not.toHaveBeenCalled()
    canvas.dispose()
  })

  it('uses the canvas that is mounted once the slow download ends, not the one disposed meanwhile', async () => {
    const replaced = mountCanvas(COVER)
    const current = mountCanvas(COVER)
    let mounted = replaced
    const loadImage = async (): Promise<FabricObject> => {
      mounted = current
      return loadedImage()
    }

    await placeGeneratedImageOnEditor(IMAGE_URL, 'front', deps(null, { getCanvas: () => mounted, loadImage }))

    expect(replaced.getObjects()).toHaveLength(0)
    expect(current.getObjects()).toHaveLength(1)
    replaced.dispose()
    current.dispose()
  })

  it('says so when the canvas has gone by the time the image arrives', async () => {
    expect(await placeGeneratedImageOnEditor(IMAGE_URL, 'front', deps(null))).toEqual({
      error: expect.stringContaining('not open'),
    })
  })

  it('refuses a cover target while on interior pages, and a page target while on the cover', async () => {
    const loadImage = vi.fn(async () => loadedImage())
    const canvas = mountCanvas(COVER)

    for (const [target, isInterior] of [['front', true], ['page', false]] as const) {
      const result = await placeGeneratedImageOnEditor(
        IMAGE_URL,
        target,
        deps(canvas, { isInteriorMode: () => isInterior, loadImage }),
      )
      expect(result).toEqual({ error: expect.stringContaining('not open') })
    }
    expect(loadImage).not.toHaveBeenCalled()
    canvas.dispose()
  })

  it('refuses a cover too thin to have the zone', async () => {
    const canvas = mountCanvas(COVER)
    const thin = { ...zones, spine: { x: SPINE_X, width: 0 } } as unknown as BookCoverZones

    const result = await placeGeneratedImageOnEditor(
      IMAGE_URL,
      'spine',
      deps(canvas, { getCoverGeometry: () => ({ zones: thin, dimensions }) }),
    )

    expect('error' in result).toBe(true)
    expect(canvas.getObjects()).toHaveLength(0)
    canvas.dispose()
  })
})

describe('the placement event', () => {
  it('answers the panel through the listener', async () => {
    const detach = onPlaceGeneratedImage(({ imageUrl, target, resolve }) => {
      resolve({ placedOn: `${target}:${imageUrl}` })
    })

    await expect(placeGeneratedImage('u', 'back')).resolves.toEqual({ placedOn: 'back:u' })
    detach()
  })

  it('does not leave the panel waiting when no editor is mounted', async () => {
    await expect(placeGeneratedImage('u', 'back')).resolves.toEqual({
      error: expect.stringContaining('not ready'),
    })
  })
})
