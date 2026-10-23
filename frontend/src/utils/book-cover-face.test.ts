/**
 * @vitest-environment jsdom
 */
import { Canvas, Rect, type FabricObject } from 'fabric'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { calculateBookCoverDimensions, calculateBookCoverZones } from '@/types/book-cover.types'
import { DEFAULT_COVER_FACE_DESIGNS, type CoverFaceDesign } from '@/types/book-cover-face.types'
import {
  applyCoverFaceDesignToCanvas,
  captureCoverFaceManualPositions,
  getCoverFaceTag,
  hasManualCoverFacePositions,
  layoutCoverFaceObjects,
  readCoverFaceDesignFromCanvas,
  removeCoverFaceDesignFromCanvas,
  resolveCoverFaceTextArea,
} from './book-cover-face'

// jsdom has no FontFace API; metrics fall back to the default font.
vi.mock('@/utils/canvas-text', () => ({
  prepareFabricTextMetricsForFontFamily: vi.fn().mockResolvedValue(undefined),
}))

const TRIM = { widthInches: 8.5, heightInches: 11 }

function geometryFor(pageCount: number) {
  const dimensions = calculateBookCoverDimensions(TRIM as never, pageCount)
  return { dimensions, zones: calculateBookCoverZones(dimensions) }
}

const FRONT: CoverFaceDesign = {
  ...DEFAULT_COVER_FACE_DESIGNS.front,
  backgroundMode: 'color',
  backgroundColor: '#1e3a5f',
  title: 'Large Print Word Search',
  subtitle: '100 Puzzles for Seniors',
  author: 'Audrey Larkvale',
  textColor: '#ffffff',
}

const BACK: CoverFaceDesign = {
  ...DEFAULT_COVER_FACE_DESIGNS.back,
  headline: 'Keep your mind sharp',
  description: 'Big, clear puzzles on every page.\n\nSolutions in the back.',
}

let canvas: Canvas | null = null
afterEach(() => {
  canvas?.dispose()
  canvas = null
})

function setup(pageCount = 200) {
  const geometry = geometryFor(pageCount)
  canvas = new Canvas(document.createElement('canvas'), {
    width: geometry.dimensions.fullWidthPixels,
    height: geometry.dimensions.fullHeightPixels,
  })
  return { canvas, geometry }
}

function byRole(target: Canvas, face: string, role: string): FabricObject | undefined {
  return target.getObjects().find((object) => {
    const tag = getCoverFaceTag(object)
    return tag?.face === face && tag.role === role
  })
}

function expectInside(object: FabricObject, area: { x: number; y: number; width: number; height: number }) {
  const box = object.getBoundingRect()
  expect(box.left).toBeGreaterThanOrEqual(area.x - 1)
  expect(box.left + box.width).toBeLessThanOrEqual(area.x + area.width + 1)
  expect(box.top).toBeGreaterThanOrEqual(area.y - 1)
  expect(box.top + box.height).toBeLessThanOrEqual(area.y + area.height + 1)
}

describe('book-cover-face', () => {
  it('fills the front out to the bleed under the art, with text inside the safe area', async () => {
    const { canvas, geometry } = setup()
    const art = new Rect({ left: 0, top: 0, width: 50, height: 50 })
    canvas.add(art)

    await applyCoverFaceDesignToCanvas(canvas, 'front', FRONT, geometry)

    const background = byRole(canvas, 'front', 'background')!
    expect(background.left).toBe(geometry.zones.frontCover.x)
    expect(background.left! + background.width!).toBe(geometry.dimensions.fullWidthPixels)
    expect(background.height).toBe(geometry.dimensions.fullHeightPixels)
    const stack = canvas.getObjects()
    expect(stack.indexOf(background)).toBe(0)
    expect(stack.indexOf(art)).toBeGreaterThan(0)

    const area = resolveCoverFaceTextArea('front', geometry)
    for (const role of ['title', 'subtitle', 'author']) {
      const text = byRole(canvas, 'front', role)!
      expect(stack.indexOf(text)).toBeGreaterThan(stack.indexOf(art))
      expectInside(text, area)
    }
    // Classic: title above subtitle, author at the bottom.
    expect(byRole(canvas, 'front', 'title')!.top).toBeLessThan(byRole(canvas, 'front', 'subtitle')!.top!)
    expect(byRole(canvas, 'front', 'author')!.top).toBeGreaterThan(area.y + area.height / 2)
  })

  it('keeps back cover text above the barcode and shrinks long text to fit', async () => {
    const { canvas, geometry } = setup()
    const long = { ...BACK, description: 'Puzzles for every day of the year. '.repeat(80), textScale: 1.4 }
    await applyCoverFaceDesignToCanvas(canvas, 'back', long, geometry)

    const description = byRole(canvas, 'back', 'description')!
    const box = description.getBoundingRect()
    expect(box.top + box.height).toBeLessThanOrEqual(geometry.zones.barcodeArea.y)
    expectInside(description, resolveCoverFaceTextArea('back', geometry))
  })

  it('reads the design back, including edits made on the canvas', async () => {
    const { canvas, geometry } = setup()
    await applyCoverFaceDesignToCanvas(canvas, 'front', FRONT, geometry)
    byRole(canvas, 'front', 'title')!.set({ text: 'Edited', fill: '#ffcc00' } as never)

    const design = readCoverFaceDesignFromCanvas(canvas, 'front')!
    expect(design.backgroundColor).toBe('#1e3a5f')
    expect(design.title).toBe('Edited')
    expect(design.author).toBe('Audrey Larkvale')
    expect(design.textColor).toBe('#ffcc00')
    expect(readCoverFaceDesignFromCanvas(canvas, 'back')).toBeNull()
  })

  it('keeps text the user dragged, follows the front when the spine grows, and can reset', async () => {
    const { canvas, geometry } = setup(200)
    await applyCoverFaceDesignToCanvas(canvas, 'front', FRONT, geometry)
    const title = byRole(canvas, 'front', 'title')!
    title.set({ top: title.top! + 300 })
    const draggedCenter = title.getCenterPoint()

    // A new setting keeps the dragged spot.
    await applyCoverFaceDesignToCanvas(canvas, 'front', { ...FRONT, textColor: '#000000' }, geometry)
    expect(title.getCenterPoint().y).toBeCloseTo(draggedCenter.y, 0)
    expect(hasManualCoverFacePositions(canvas, 'front')).toBe(true)

    // Wider spine: the front cover shifts right and the dragged title moves with it.
    const wider = geometryFor(400)
    captureCoverFaceManualPositions(canvas)
    layoutCoverFaceObjects(canvas, wider, { detectManualMoves: false })
    const shift = wider.zones.frontCover.x - geometry.zones.frontCover.x
    expect(title.getCenterPoint().x).toBeCloseTo(draggedCenter.x + shift, 0)
    expect(byRole(canvas, 'front', 'background')!.left).toBe(wider.zones.frontCover.x)

    await applyCoverFaceDesignToCanvas(canvas, 'front', FRONT, wider, { resetPositions: true })
    expect(title.top).toBe(resolveCoverFaceTextArea('front', wider).y)
    expect(hasManualCoverFacePositions(canvas, 'front')).toBe(false)
  })

  it('only clears its own face and drops removed text', async () => {
    const { canvas, geometry } = setup()
    await applyCoverFaceDesignToCanvas(canvas, 'front', FRONT, geometry)
    await applyCoverFaceDesignToCanvas(canvas, 'back', BACK, geometry)

    await applyCoverFaceDesignToCanvas(canvas, 'front', { ...FRONT, subtitle: '' }, geometry)
    expect(byRole(canvas, 'front', 'subtitle')).toBeUndefined()

    removeCoverFaceDesignFromCanvas(canvas, 'front')
    expect(readCoverFaceDesignFromCanvas(canvas, 'front')).toBeNull()
    expect(byRole(canvas, 'back', 'headline')).toBeDefined()
  })
})
