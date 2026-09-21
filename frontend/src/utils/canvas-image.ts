import type { Canvas, FabricObject } from 'fabric'
import { FabricImage } from 'fabric'

import type { CoverPlacementKind } from '@/types/fabric-canvas-item.types'
import { applyCoverZoneToImage } from '@/utils/book-cover-image-placement'
import { isSvgImageSrc, loadSvgAsFabricObject } from '@/utils/canvas-svg'

type ImageFitMode = 'default' | 'contain' | 'cover'

type ImagePlacementZone = {
  x: number
  y: number
  width: number
  height: number
  clipToZone?: boolean
  placementKind?: CoverPlacementKind
}

type AddImageToCanvasOptions = {
  canvas: Canvas
  src: string
  clientX: number
  clientY: number
  fitMode?: ImageFitMode
  placementZone?: ImagePlacementZone
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function getPlacedSize({
  targetWidth,
  targetHeight,
  imageWidth,
  imageHeight,
  fitMode,
}: {
  targetWidth: number
  targetHeight: number
  imageWidth: number
  imageHeight: number
  fitMode: ImageFitMode
}): { width: number; height: number } {
  if (targetWidth <= 0 || targetHeight <= 0 || imageWidth <= 0 || imageHeight <= 0) {
    return { width: 0, height: 0 }
  }

  const maxWidth = fitMode === 'default' ? targetWidth * 0.5 : targetWidth
  const maxHeight = fitMode === 'default' ? targetHeight * 0.5 : targetHeight
  const scaleByContain = Math.min(maxWidth / imageWidth, maxHeight / imageHeight)
  const scaleByCover = Math.max(maxWidth / imageWidth, maxHeight / imageHeight)
  const scale = fitMode === 'cover' ? scaleByCover : fitMode === 'contain' ? scaleByContain : Math.min(1, scaleByContain)
  const width = Math.round(imageWidth * scale)
  const height = Math.round(imageHeight * scale)
  return { width, height }
}

type CoverConstrainedObject = {
  scaleX: number
  scaleY: number
  left: number
  top: number
  width: number
  height: number
  _maxSafeScale?: number
  _coverZone?: { x: number; y: number; width: number; height: number }
  _coverPlacementKind?: CoverPlacementKind
}

export function clampImageMaxScale(target: unknown): void {
  if (!target) return
  const obj = target as CoverConstrainedObject
  if (typeof obj._maxSafeScale !== 'number') return
  if (obj.scaleX <= obj._maxSafeScale) return
  obj.scaleX = obj._maxSafeScale
  obj.scaleY = obj._maxSafeScale
}

export function clampCoverImagePosition(target: unknown): void {
  if (!target) return
  const obj = target as CoverConstrainedObject
  if (!obj._coverZone) return
  const zone = obj._coverZone
  const halfW = (obj.width * obj.scaleX) / 2
  const halfH = (obj.height * obj.scaleY) / 2

  const maxLeft = zone.x + halfW
  const minLeft = zone.x + zone.width - halfW
  const maxTop = zone.y + halfH
  const minTop = zone.y + zone.height - halfH

  if (minLeft <= maxLeft) obj.left = clamp(obj.left, minLeft, maxLeft)
  if (minTop <= maxTop) obj.top = clamp(obj.top, minTop, maxTop)
}

async function loadImageOrSvgObject(src: string): Promise<FabricObject | null> {
  if (isSvgImageSrc(src)) {
    return loadSvgAsFabricObject(src)
  }
  return FabricImage.fromURL(src, { crossOrigin: 'anonymous' })
}

function nextImageObjectId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `img-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export async function addImageToFabricCanvasAtClientPoint(
  options: AddImageToCanvasOptions,
): Promise<void> {
  const { canvas, src, clientX, clientY } = options

  const pointer = canvas.getScenePoint({ clientX, clientY } as MouseEvent)
  const img = await loadImageOrSvgObject(src)
  if (!img) return

  const zoom = canvas.getZoom()
  const baseWidth = canvas.getWidth() / zoom
  const baseHeight = canvas.getHeight() / zoom
  const fitMode = options.fitMode ?? 'default'
  const zone = options.placementZone
  const targetWidth = zone?.width ?? baseWidth
  const targetHeight = zone?.height ?? baseHeight

  const size = getPlacedSize({
    targetWidth,
    targetHeight,
    imageWidth: img.width ?? 0,
    imageHeight: img.height ?? 0,
    fitMode,
  })
  if (size.width <= 0 || size.height <= 0) return

  img.set({
    originX: 'center',
    originY: 'center',
    selectable: true,
    evented: true,
    hasControls: true,
    hasBorders: true,
    originalImageUrl: src,
    objectId: nextImageObjectId(),
  })

  img.scaleToWidth(size.width)

  const scaledHalfW = ((img.width ?? 0) * (img.scaleX ?? 1)) / 2
  const scaledHalfH = ((img.height ?? 0) * (img.scaleY ?? 1)) / 2

  let left: number
  let top: number
  if (zone) {
    const minCx = zone.x + scaledHalfW
    const maxCx = zone.x + zone.width - scaledHalfW
    const minCy = zone.y + scaledHalfH
    const maxCy = zone.y + zone.height - scaledHalfH
    left = minCx <= maxCx ? clamp(pointer.x, minCx, maxCx) : zone.x + zone.width / 2
    top = minCy <= maxCy ? clamp(pointer.y, minCy, maxCy) : zone.y + zone.height / 2
  } else {
    left = clamp(pointer.x, 0, baseWidth)
    top = clamp(pointer.y, 0, baseHeight)
  }

  img.set({ left, top })

  if (zone?.clipToZone) {
    const placementKind = zone.placementKind ?? 'front'
    applyCoverZoneToImage(img, zone, placementKind, { lockUniScaling: fitMode === 'cover' })
  } else if (fitMode === 'cover' && zone) {
    img.set({
      lockUniScaling: true,
      // Keep zone metadata to maintain in-zone movement when image is larger than zone.
      // Do not set min/max scale clamp here: "fit on drop" should still allow manual resizing.
      _coverZone: { x: zone.x, y: zone.y, width: zone.width, height: zone.height },
      ...(zone.placementKind ? { _coverPlacementKind: zone.placementKind } : {}),
    })
  }

  img.setCoords()
  canvas.add(img)
  canvas.bringObjectToFront(img)
  canvas.setActiveObject(img)
  canvas.requestRenderAll()
}

