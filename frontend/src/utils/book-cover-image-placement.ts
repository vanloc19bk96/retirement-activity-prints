import { Rect } from 'fabric'

import type { BookCoverDimensions, BookCoverZones } from '@/types/book-cover.types'
import type { CoverFittableImage, CoverPlacementKind } from '@/types/fabric-canvas-item.types'

export type BookCoverImagePlacementZone = {
  x: number
  y: number
  width: number
  height: number
  clipToZone: true
  placementKind: CoverPlacementKind
}

export type CoverPlacementRect = {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Pick back / spine / front placement + clip rect from drop X (canvas scene coords).
 * Back zone includes left bleed; front zone includes right bleed (KDP template).
 */
export function resolveBookCoverImagePlacementZone(
  zones: BookCoverZones,
  dimensions: BookCoverDimensions,
  pointerSceneX: number,
): BookCoverImagePlacementZone {
  const { spine, frontCover } = zones
  const fullHeight = dimensions.fullHeightPixels
  const bleed = dimensions.bleedPixels

  if (pointerSceneX < spine.x) {
    return {
      x: 0,
      y: 0,
      width: spine.x,
      height: fullHeight,
      clipToZone: true,
      placementKind: 'back',
    }
  }
  if (pointerSceneX < spine.x + spine.width) {
    return {
      x: spine.x,
      y: 0,
      width: spine.width,
      height: fullHeight,
      clipToZone: true,
      placementKind: 'spine',
    }
  }
  return {
    x: frontCover.x,
    y: 0,
    width: frontCover.width + bleed,
    height: fullHeight,
    clipToZone: true,
    placementKind: 'front',
  }
}

export function resolveCoverPlacementZoneForKind(
  kind: CoverPlacementKind,
  zones: BookCoverZones,
  dimensions: BookCoverDimensions,
): CoverPlacementRect {
  const fullHeight = dimensions.fullHeightPixels
  if (kind === 'back') {
    return { x: 0, y: 0, width: zones.spine.x, height: fullHeight }
  }
  if (kind === 'spine') {
    return { x: zones.spine.x, y: 0, width: zones.spine.width, height: fullHeight }
  }
  return {
    x: zones.frontCover.x,
    y: 0,
    width: zones.frontCover.width + dimensions.bleedPixels,
    height: fullHeight,
  }
}

/** Infer back / spine / front from a legacy clip rect when placement kind was not persisted. */
export function inferCoverPlacementKind(
  zone: CoverPlacementRect,
  canvasWidth: number,
): CoverPlacementKind {
  if (zone.x < 1) return 'back'
  const zoneRight = zone.x + zone.width
  if (Math.abs(zoneRight - canvasWidth) <= 2) return 'front'
  return 'spine'
}

/** Pin cover-fit position so overflow extends away from spine, not into it. */
export function resolveCoverFitImageCenter(
  zone: CoverPlacementRect,
  placementKind: CoverPlacementKind,
  scaledWidth: number,
  scaledHeight: number,
): { left: number; top: number } {
  const halfW = scaledWidth / 2
  const halfH = scaledHeight / 2

  let left: number
  if (halfW >= zone.width / 2) {
    if (placementKind === 'front') {
      left = zone.x + halfW
    } else if (placementKind === 'back') {
      left = zone.x + zone.width - halfW
    } else {
      left = zone.x + zone.width / 2
    }
  } else {
    left = zone.x + zone.width / 2
  }

  const top = halfH >= zone.height / 2 ? zone.y + halfH : zone.y + zone.height / 2

  return { left, top }
}

type CroppableCoverImage = CoverFittableImage & {
  cropX?: number
  cropY?: number
  getOriginalSize?: () => { width: number; height: number }
}

type PixelSize = { width: number; height: number }

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** Natural pixel size of a raster image; null for SVG groups, which cannot be cropped. */
function resolveCroppableSourceSize(image: CroppableCoverImage): PixelSize | null {
  if (image.type !== 'image' || typeof image.getOriginalSize !== 'function') return null
  const size = image.getOriginalSize()
  return size.width > 0 && size.height > 0 ? size : null
}

/** Where the visible crop is centred, as a 0–1 fraction of the source; 0.5 when uncropped. */
function resolveCropCenterFraction(start: number, visible: number, source: number): number {
  if (visible <= 0 || visible >= source) return 0.5
  return (start + visible / 2) / source
}

/**
 * Crop the image to the zone's aspect ratio and scale it to the zone, so the object
 * (and its selection box) covers exactly the zone instead of spilling past it.
 * Keeps the part of the picture the user had panned to.
 */
function cropImageToPlacementZone(
  image: CroppableCoverImage,
  zone: CoverPlacementRect,
  source: PixelSize,
): void {
  const zoneAspect = zone.width / zone.height
  const cropWidth = Math.min(source.width, source.height * zoneAspect)
  const cropHeight = Math.min(source.height, source.width / zoneAspect)
  const centerX = resolveCropCenterFraction(image.cropX ?? 0, image.width ?? 0, source.width)
  const centerY = resolveCropCenterFraction(image.cropY ?? 0, image.height ?? 0, source.height)
  const scale = zone.width / cropWidth

  image.set({
    cropX: clampNumber(centerX * source.width - cropWidth / 2, 0, source.width - cropWidth),
    cropY: clampNumber(centerY * source.height - cropHeight / 2, 0, source.height - cropHeight),
    width: cropWidth,
    height: cropHeight,
    originX: 'center',
    originY: 'center',
    left: zone.x + zone.width / 2,
    top: zone.y + zone.height / 2,
    scaleX: scale,
    scaleY: scale,
  })
}

/** Center and scale an image to cover a placement zone (fit-full-front/back). */
export function fitCoverImageToPlacementZone(
  image: CoverFittableImage,
  zone: CoverPlacementRect,
  placementKind: CoverPlacementKind,
  options?: { lockUniScaling?: boolean },
): void {
  if (zone.width <= 0 || zone.height <= 0) return

  const source = resolveCroppableSourceSize(image)
  if (source) {
    cropImageToPlacementZone(image, zone, source)
  } else {
    const naturalWidth = image.width ?? 0
    const naturalHeight = image.height ?? 0
    if (naturalWidth <= 0 || naturalHeight <= 0) return

    const coverScale = Math.max(zone.width / naturalWidth, zone.height / naturalHeight)
    if (!Number.isFinite(coverScale) || coverScale <= 0) return

    const scaledWidth = naturalWidth * coverScale
    const scaledHeight = naturalHeight * coverScale
    const { left, top } = resolveCoverFitImageCenter(zone, placementKind, scaledWidth, scaledHeight)

    image.set({
      originX: 'center',
      originY: 'center',
      left,
      top,
      scaleX: coverScale,
      scaleY: coverScale,
    })
  }
  applyCoverZoneToImage(image, zone, placementKind, {
    lockUniScaling: options?.lockUniScaling ?? true,
  })
  image.setCoords()
}

export function applyCoverZoneToImage(
  image: CoverFittableImage,
  zone: CoverPlacementRect,
  placementKind: CoverPlacementKind,
  options?: { lockUniScaling?: boolean },
): void {
  image.set({
    ...(options?.lockUniScaling ? { lockUniScaling: true } : {}),
    _coverZone: { x: zone.x, y: zone.y, width: zone.width, height: zone.height },
    _coverPlacementKind: placementKind,
    clipPath: new Rect({
      left: zone.x,
      top: zone.y,
      width: zone.width,
      height: zone.height,
      originX: 'left',
      originY: 'top',
      absolutePositioned: true,
    }),
  })
}

type CoverImageWithClip = CoverFittableImage & {
  clipPath?: { left?: number; top?: number; width?: number; height?: number }
}

/** Use persisted zone metadata, or reconstruct from absolute clipPath after JSON restore. */
export function resolveCoverZoneFromImage(image: CoverImageWithClip): CoverPlacementRect | null {
  if (image._coverZone) return image._coverZone
  const clip = image.clipPath
  if (
    clip &&
    typeof clip.left === 'number' &&
    typeof clip.width === 'number' &&
    typeof clip.height === 'number'
  ) {
    return {
      x: clip.left,
      y: typeof clip.top === 'number' ? clip.top : 0,
      width: clip.width,
      height: clip.height,
    }
  }
  return null
}

/** The part of Fabric's in-progress transform that panning needs. */
export type CoverCropPanTransform = {
  original: { left?: number; top?: number }
  coverCropStart?: { cropX: number; cropY: number }
}

type PannableCoverImage = CroppableCoverImage & {
  top?: number
  scaleX?: number
  scaleY?: number
  angle?: number
  flipX?: boolean
  flipY?: boolean
}

const ZONE_MATCH_TOLERANCE_PX = 1

/**
 * Dragging an image that exactly fills its cover zone slides the picture inside the
 * zone (by moving the crop) instead of moving the frame out of the zone.
 * Returns false, leaving the image untouched, when the image does not fill the zone.
 */
export function panCoverImageCrop(
  target: unknown,
  transform: CoverCropPanTransform | null | undefined,
): boolean {
  if (!target || !transform) return false
  const image = target as PannableCoverImage
  const source = resolveCroppableSourceSize(image)
  const zone = resolveCoverZoneFromImage(image)
  if (!source || !zone || image.angle) return false

  const width = image.width ?? 0
  const height = image.height ?? 0
  const scaleX = image.scaleX ?? 1
  const scaleY = image.scaleY ?? 1
  const fillsZone =
    Math.abs(width * scaleX - zone.width) <= ZONE_MATCH_TOLERANCE_PX &&
    Math.abs(height * scaleY - zone.height) <= ZONE_MATCH_TOLERANCE_PX
  const startLeft = transform.original.left
  const startTop = transform.original.top
  if (!fillsZone || startLeft === undefined || startTop === undefined) return false

  // Fabric sets left/top from the drag start each move, so the offset is the whole drag.
  transform.coverCropStart ??= { cropX: image.cropX ?? 0, cropY: image.cropY ?? 0 }
  const dragX = ((image.left ?? startLeft) - startLeft) / scaleX
  const dragY = ((image.top ?? startTop) - startTop) / scaleY
  image.set({
    left: startLeft,
    top: startTop,
    cropX: clampNumber(
      transform.coverCropStart.cropX + (image.flipX ? dragX : -dragX),
      0,
      source.width - width,
    ),
    cropY: clampNumber(
      transform.coverCropStart.cropY + (image.flipY ? dragY : -dragY),
      0,
      source.height - height,
    ),
  })
  return true
}
