import { describe, expect, it } from 'vitest'

import {
  fitCoverImageToPlacementZone,
  panCoverImageCrop,
  type CoverPlacementRect,
} from '@/utils/book-cover-image-placement'

type FakeImage = {
  type: string
  width: number
  height: number
  left: number
  top: number
  scaleX: number
  scaleY: number
  cropX: number
  cropY: number
  angle: number
  flipX: boolean
  flipY: boolean
  getOriginalSize: () => { width: number; height: number }
  set: (options: Record<string, unknown>) => void
  setCoords: () => void
}

function fakeImage(width: number, height: number): FakeImage {
  const image = {
    type: 'image',
    width,
    height,
    left: 0,
    top: 0,
    scaleX: 1,
    scaleY: 1,
    cropX: 0,
    cropY: 0,
    angle: 0,
    flipX: false,
    flipY: false,
    getOriginalSize: () => ({ width, height }),
    set(options: Record<string, unknown>) {
      Object.assign(image, options)
    },
    setCoords() {},
  }
  return image
}

// Front cover of an 8.5 x 11 in book: trim + bleed at 300 DPI.
const FRONT: CoverPlacementRect = { x: 2604, y: 0, width: 2588, height: 3375 }

function boundingBox(image: FakeImage): { left: number; right: number; top: number; bottom: number } {
  const halfW = (image.width * image.scaleX) / 2
  const halfH = (image.height * image.scaleY) / 2
  return {
    left: image.left - halfW,
    right: image.left + halfW,
    top: image.top - halfH,
    bottom: image.top + halfH,
  }
}

describe('fitCoverImageToPlacementZone', () => {
  it('crops a square image so its box matches the front cover exactly', () => {
    const image = fakeImage(1024, 1024)
    fitCoverImageToPlacementZone(image, FRONT, 'front')

    const box = boundingBox(image)
    expect(box.left).toBeCloseTo(FRONT.x)
    expect(box.right).toBeCloseTo(FRONT.x + FRONT.width)
    expect(box.top).toBeCloseTo(0)
    expect(box.bottom).toBeCloseTo(FRONT.height)
    expect(image.height).toBe(1024)
    expect(image.cropY).toBe(0)
    // Centred horizontally on the source.
    expect(image.cropX).toBeCloseTo((1024 - image.width) / 2)
  })

  it('keeps the panned part of the picture when refitted', () => {
    const image = fakeImage(1024, 1024)
    fitCoverImageToPlacementZone(image, FRONT, 'front')
    image.set({ cropX: 0 })

    fitCoverImageToPlacementZone(image, { ...FRONT, x: 3000 }, 'front')
    expect(image.cropX).toBe(0)
    expect(boundingBox(image).left).toBeCloseTo(3000)
  })
})

describe('panCoverImageCrop', () => {
  it('moves the crop and keeps the frame in place while dragging', () => {
    const image = fakeImage(1024, 1024)
    fitCoverImageToPlacementZone(image, FRONT, 'front')
    const startLeft = image.left
    const startCropX = image.cropX
    const transform = { original: { left: image.left, top: image.top } }

    // Drag right by 50 source px: the picture follows, so the crop moves left.
    image.set({ left: startLeft + 50 * image.scaleX })
    expect(panCoverImageCrop(image, transform)).toBe(true)
    expect(image.left).toBe(startLeft)
    expect(image.cropX).toBeCloseTo(startCropX - 50)

    // A long drag stops at the image edge.
    image.set({ left: startLeft + 5000 * image.scaleX })
    panCoverImageCrop(image, transform)
    expect(image.cropX).toBe(0)
  })

  it('leaves images that do not fill their zone to move freely', () => {
    const image = fakeImage(1024, 1024)
    fitCoverImageToPlacementZone(image, FRONT, 'front')
    image.set({ scaleX: image.scaleX / 2, scaleY: image.scaleY / 2, left: 4000 })

    expect(panCoverImageCrop(image, { original: { left: 3500, top: 1000 } })).toBe(false)
    expect(image.left).toBe(4000)
  })
})
