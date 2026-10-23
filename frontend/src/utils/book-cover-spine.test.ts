/**
 * @vitest-environment jsdom
 */
import { Canvas, Rect, type FabricObject } from 'fabric'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { calculateBookCoverDimensions, calculateBookCoverZones } from '@/types/book-cover.types'
import { DEFAULT_SPINE_DESIGN, type SpineDesign } from '@/types/book-cover-spine.types'
import {
  applySpineDesignToCanvas,
  getSpineRole,
  layoutSpineObjects,
  readSpineDesignFromCanvas,
  removeSpineDesignFromCanvas,
} from './book-cover-spine'

// jsdom has no FontFace API; metrics fall back to the default font.
vi.mock('@/utils/canvas-text', () => ({
  prepareFabricTextMetricsForFontFamily: vi.fn().mockResolvedValue(undefined),
}))

const TRIM = { widthInches: 8.5, heightInches: 11 }

function geometryFor(pageCount: number) {
  const dimensions = calculateBookCoverDimensions(TRIM as never, pageCount)
  return { dimensions, zones: calculateBookCoverZones(dimensions) }
}

const DESIGN: SpineDesign = {
  ...DEFAULT_SPINE_DESIGN,
  backgroundMode: 'color',
  backgroundColor: '#1e3a5f',
  title: 'Retirement Activity Book',
  author: 'Audrey Larkvale',
  textColor: '#ffffff',
}

let canvas: Canvas | null = null
afterEach(() => {
  canvas?.dispose()
  canvas = null
})

function setup(pageCount = 200): { canvas: Canvas; geometry: ReturnType<typeof geometryFor> } {
  const geometry = geometryFor(pageCount)
  canvas = new Canvas(document.createElement('canvas'), {
    width: geometry.dimensions.fullWidthPixels,
    height: geometry.dimensions.fullHeightPixels,
  })
  return { canvas, geometry }
}

function byRole(target: Canvas, role: string): FabricObject | undefined {
  return target.getObjects().find((object) => getSpineRole(object) === role)
}

describe('book-cover-spine', () => {
  it('builds a spine background and rotated text inside the spine text area', async () => {
    const { canvas, geometry } = setup()
    const coverArt = new Rect({ left: 0, top: 0, width: 50, height: 50 })
    canvas.add(coverArt)

    await applySpineDesignToCanvas(canvas, DESIGN, geometry)

    const background = byRole(canvas, 'background')!
    expect(background.left).toBe(geometry.zones.spine.x)
    expect(background.width).toBe(geometry.zones.spine.width)
    expect(background.height).toBe(geometry.dimensions.fullHeightPixels)
    expect(background.lockMovementX && background.lockMovementY).toBe(true)
    // Background sits above cover art, text above the background.
    const stack = canvas.getObjects()
    expect(stack.indexOf(background)).toBeGreaterThan(stack.indexOf(coverArt))

    const safe = geometry.zones.spineSafeArea
    for (const role of ['title', 'author'] as const) {
      const text = byRole(canvas, role)!
      expect(text.angle).toBe(90)
      expect(stack.indexOf(text)).toBeGreaterThan(stack.indexOf(background))
      const box = text.getBoundingRect()
      expect(box.left).toBeGreaterThanOrEqual(safe.x - 0.5)
      expect(box.left + box.width).toBeLessThanOrEqual(safe.x + safe.width + 0.5)
      expect(box.top).toBeGreaterThanOrEqual(safe.y - 0.5)
      expect(box.top + box.height).toBeLessThanOrEqual(safe.y + safe.height + 0.5)
    }
  })

  it('reads the design back, including edits made on the canvas', async () => {
    const { canvas, geometry } = setup()
    await applySpineDesignToCanvas(canvas, DESIGN, geometry)
    byRole(canvas, 'title')!.set({ text: 'Edited Title', fill: '#ffcc00' } as never)

    const design = readSpineDesignFromCanvas(canvas)!
    expect(design.backgroundMode).toBe('color')
    expect(design.backgroundColor).toBe('#1e3a5f')
    expect(design.title).toBe('Edited Title')
    expect(design.author).toBe('Audrey Larkvale')
    expect(design.textColor).toBe('#ffcc00')
  })

  it('updates in place and removes cleared parts', async () => {
    const { canvas, geometry } = setup()
    await applySpineDesignToCanvas(canvas, DESIGN, geometry)
    const title = byRole(canvas, 'title')

    await applySpineDesignToCanvas(
      canvas,
      { ...DESIGN, backgroundMode: 'none', author: '', direction: 'bottom-to-top' },
      geometry,
    )

    expect(byRole(canvas, 'title')).toBe(title)
    expect(title!.angle).toBe(-90)
    expect(byRole(canvas, 'author')).toBeUndefined()
    expect(byRole(canvas, 'background')).toBeUndefined()
  })

  it('re-centers on a wider spine after the page count changes', async () => {
    const { canvas, geometry } = setup(200)
    await applySpineDesignToCanvas(canvas, DESIGN, geometry)

    const wider = geometryFor(400)
    layoutSpineObjects(canvas, wider)

    const spine = wider.zones.spine
    expect(byRole(canvas, 'background')!.width).toBe(spine.width)
    expect(byRole(canvas, 'title')!.left).toBeCloseTo(spine.x + spine.width / 2)
  })

  it('untags duplicated spine objects and clears the spine', async () => {
    const { canvas, geometry } = setup()
    await applySpineDesignToCanvas(canvas, DESIGN, geometry)
    const copy = await byRole(canvas, 'title')!.clone(['spineRole', 'spineDesign'])
    canvas.add(copy)

    await applySpineDesignToCanvas(canvas, DESIGN, geometry)
    expect(getSpineRole(copy)).toBeNull()

    removeSpineDesignFromCanvas(canvas)
    expect(canvas.getObjects()).toEqual([copy])
    expect(readSpineDesignFromCanvas(canvas)).toBeNull()
  })
})
