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

/** Center and scale an image to cover a placement zone (fit-full-front/back). */
export function fitCoverImageToPlacementZone(
  image: CoverFittableImage,
  zone: CoverPlacementRect,
  placementKind: CoverPlacementKind,
  options?: { lockUniScaling?: boolean },
): void {
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
