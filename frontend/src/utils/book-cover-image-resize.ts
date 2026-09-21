import type { Canvas } from 'fabric'

import type { BookCoverDimensions, BookCoverZones } from '@/types/book-cover.types'
import type { CanvasLogicalSize, CoverFittableImage } from '@/types/fabric-canvas-item.types'
import { clampCoverImagePosition } from '@/utils/canvas-image'
import {
  applyCoverZoneToImage,
  fitCoverImageToPlacementZone,
  inferCoverPlacementKind,
  resolveCoverPlacementZoneForKind,
  resolveCoverZoneFromImage,
  type CoverPlacementRect,
} from '@/utils/book-cover-image-placement'

type CoverImageWithLock = CoverFittableImage & {
  lockUniScaling?: boolean
  scaleX?: number
}

const COVER_FIT_SCALE_TOLERANCE = 0.05

function resolveUniformResizeRatio(
  previousSize: CanvasLogicalSize,
  nextSize: CanvasLogicalSize,
): number {
  if (previousSize.width <= 0 || previousSize.height <= 0) return 1
  if (nextSize.width <= 0 || nextSize.height <= 0) return 1
  return Math.min(nextSize.width / previousSize.width, nextSize.height / previousSize.height)
}

/** Detect fit-full-front/back images even when lockUniScaling was not persisted. */
function wasCoverFittedToPlacementZone(
  image: CoverImageWithLock,
  sourceZone: CoverPlacementRect,
  uniformRatio: number,
): boolean {
  if (image.lockUniScaling) return true
  const naturalWidth = image.width ?? 0
  const naturalHeight = image.height ?? 0
  if (naturalWidth <= 0 || naturalHeight <= 0) return false
  if (!Number.isFinite(uniformRatio) || uniformRatio <= 0) return false

  const coverScaleForSource = Math.max(
    sourceZone.width / naturalWidth,
    sourceZone.height / naturalHeight,
  )
  if (!Number.isFinite(coverScaleForSource) || coverScaleForSource <= 0) return false

  const currentScale = image.scaleX ?? 1
  const estimatedPreResizeScale = currentScale / uniformRatio
  return (
    Math.abs(estimatedPreResizeScale - coverScaleForSource) / coverScaleForSource <
    COVER_FIT_SCALE_TOLERANCE
  )
}

/**
 * After a book-cover canvas resize, recompute clip rects from current KDP zones.
 * Cover-fitted images are repositioned and rescaled to their new placement zone.
 */
export function remapBookCoverImageClipsOnCanvasResize(
  canvas: Canvas,
  zones: BookCoverZones,
  dimensions: BookCoverDimensions,
  previousCanvasSize: CanvasLogicalSize,
  nextCanvasSize: CanvasLogicalSize,
): void {
  const uniformRatio = resolveUniformResizeRatio(previousCanvasSize, nextCanvasSize)

  for (const object of canvas.getObjects()) {
    if (object.type !== 'image') continue
    const image = object as unknown as CoverImageWithLock
    const sourceZone = resolveCoverZoneFromImage(image)
    if (!sourceZone) continue

    const placementKind =
      image._coverPlacementKind ?? inferCoverPlacementKind(sourceZone, previousCanvasSize.width)
    const nextZone = resolveCoverPlacementZoneForKind(placementKind, zones, dimensions)
    const shouldRefit = wasCoverFittedToPlacementZone(image, sourceZone, uniformRatio)
    if (shouldRefit) {
      fitCoverImageToPlacementZone(image, nextZone, placementKind)
    } else {
      applyCoverZoneToImage(image, nextZone, placementKind)
      clampCoverImagePosition(image)
      image.setCoords()
    }
  }
  canvas.requestRenderAll()
}
