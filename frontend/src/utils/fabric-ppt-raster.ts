import type { FabricObject } from 'fabric'
import type PptxGenJS from 'pptxgenjs'

import { fabricOpacityToTransparency, pixelsToInches } from '@/utils/fabric-ppt-units'

export type FabricObjectBox = {
  x: number
  y: number
  w: number
  h: number
  rotate: number
  flipH: boolean
  flipV: boolean
}

export function getFabricObjectBox(object: FabricObject): FabricObjectBox {
  const bounds = object.getBoundingRect()
  return {
    x: pixelsToInches(bounds.left),
    y: pixelsToInches(bounds.top),
    w: pixelsToInches(bounds.width),
    h: pixelsToInches(bounds.height),
    rotate: object.angle ?? 0,
    flipH: Boolean(object.flipX),
    flipV: Boolean(object.flipY),
  }
}

/**
 * Unrotated fill box + Fabric angle. PPT rotates around this box’s center.
 *
 * Do not use `getBoundingRect()` here: that AABB already includes rotation, so
 * passing `rotate` as well turns a 45° capsule into a diamond.
 */
export function getFabricNativeShapeBox(object: FabricObject): FabricObjectBox {
  const center = object.getCenterPoint()
  const scaleX = Math.abs(object.scaleX ?? 1)
  const scaleY = Math.abs(object.scaleY ?? 1)
  const width = Math.max(0, (object.width ?? 0) * scaleX)
  const height = Math.max(0, (object.height ?? 0) * scaleY)
  return {
    x: pixelsToInches(center.x - width / 2),
    y: pixelsToInches(center.y - height / 2),
    w: pixelsToInches(width),
    h: pixelsToInches(height),
    rotate: object.angle ?? 0,
    flipH: Boolean(object.flipX),
    flipV: Boolean(object.flipY),
  }
}

/** pptxgenjs `rectRadius` is inches (OOXML adj = inches × 1e5 / shorter side). */
export function resolveFabricRectRadiusInches(object: {
  rx?: number
  ry?: number
  width?: number
  height?: number
  scaleX?: number
  scaleY?: number
}): number | undefined {
  const scaleX = Math.abs(object.scaleX ?? 1)
  const scaleY = Math.abs(object.scaleY ?? 1)
  const radiusPx = Math.max((object.rx ?? 0) * scaleX, (object.ry ?? 0) * scaleY)
  if (radiusPx < 1) return undefined

  const widthPx = Math.abs((object.width ?? 0) * scaleX)
  const heightPx = Math.abs((object.height ?? 0) * scaleY)
  const maxRadiusPx = Math.min(widthPx, heightPx) / 2
  if (maxRadiusPx <= 0) return undefined

  return pixelsToInches(Math.min(radiusPx, maxRadiusPx))
}

/**
 * Paths/images/webfont text have no faithful native PPT primitive — raster at 2x.
 *
 * Fabric `toDataURL` already paints angle/flip into an AABB-sized bitmap
 * (`toCanvasElement` keeps object transforms). Do not pass rotate/flip to
 * pptxgenjs or layered icons (e.g. Phosphor duotone) double-spin and ghost.
 */
export async function addFabricRasterToSlide(
  slide: PptxGenJS.Slide,
  object: FabricObject,
): Promise<void> {
  const box = getFabricObjectBox(object)
  const dataUrl = object.toDataURL({ format: 'png', multiplier: 2 })

  slide.addImage({
    data: dataUrl,
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    transparency: fabricOpacityToTransparency(object.opacity),
  })
}
