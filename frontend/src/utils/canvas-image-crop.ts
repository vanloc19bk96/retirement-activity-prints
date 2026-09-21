import { FabricImage, util } from 'fabric'
import type { Transform, TransformActionHandler } from 'fabric'

const MIN_CROP_PIXELS = 20

type CropInitialState = {
  cropX: number
  cropY: number
  width: number
  height: number
}

const cropStateMap = new WeakMap<object, CropInitialState>()

function ensureCropState(transform: Transform): CropInitialState {
  let state = cropStateMap.get(transform)
  if (!state) {
    const img = transform.target as FabricImage
    state = {
      cropX: img.cropX ?? 0,
      cropY: img.cropY ?? 0,
      width: img.width,
      height: img.height,
    }
    cropStateMap.set(transform, state)
  }
  return state
}

function isImage(target: unknown): target is FabricImage {
  return (target as FabricImage)?.type === 'image'
}

function getOriginalImageSize(img: FabricImage): { width: number; height: number } {
  const el = img.getElement() as HTMLImageElement | undefined
  return {
    width: el?.naturalWidth ?? img.width,
    height: el?.naturalHeight ?? img.height,
  }
}

function projectToLocalAxes(
  dx: number,
  dy: number,
  angleRad: number,
): { localDx: number; localDy: number } {
  const cos = Math.cos(angleRad)
  const sin = Math.sin(angleRad)
  return {
    localDx: dx * cos + dy * sin,
    localDy: -dx * sin + dy * cos,
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export const cropFromLeft: TransformActionHandler = (
  _eventData,
  transform,
  x,
  y,
): boolean => {
  if (!isImage(transform.target)) return false

  const { original } = transform
  const initial = ensureCropState(transform)
  const angleRad = util.degreesToRadians(original.angle)
  const { localDx } = projectToLocalAxes(x - transform.ex, y - transform.ey, angleRad)

  const dSource = localDx / original.scaleX
  const maxCropX = initial.cropX + initial.width - MIN_CROP_PIXELS
  const newCropX = clamp(initial.cropX + dSource, 0, maxCropX)
  const newWidth = initial.cropX + initial.width - newCropX

  const cropDelta = newCropX - initial.cropX
  const posOffset = (cropDelta * original.scaleX) / 2

  transform.target.set({
    cropX: newCropX,
    width: newWidth,
    left: original.left + posOffset * Math.cos(angleRad),
    top: original.top + posOffset * Math.sin(angleRad),
  })
  transform.target.setCoords()
  return true
}

export const cropFromRight: TransformActionHandler = (
  _eventData,
  transform,
  x,
  y,
): boolean => {
  if (!isImage(transform.target)) return false

  const { original } = transform
  const initial = ensureCropState(transform)
  const origSize = getOriginalImageSize(transform.target as FabricImage)
  const angleRad = util.degreesToRadians(original.angle)
  const { localDx } = projectToLocalAxes(x - transform.ex, y - transform.ey, angleRad)

  const dSource = localDx / original.scaleX
  const maxWidth = origSize.width - initial.cropX
  const newWidth = clamp(initial.width + dSource, MIN_CROP_PIXELS, maxWidth)

  const widthDelta = newWidth - initial.width
  const posOffset = (widthDelta * original.scaleX) / 2

  transform.target.set({
    width: newWidth,
    left: original.left + posOffset * Math.cos(angleRad),
    top: original.top + posOffset * Math.sin(angleRad),
  })
  transform.target.setCoords()
  return true
}

export const cropFromTop: TransformActionHandler = (
  _eventData,
  transform,
  x,
  y,
): boolean => {
  if (!isImage(transform.target)) return false

  const { original } = transform
  const initial = ensureCropState(transform)
  const angleRad = util.degreesToRadians(original.angle)
  const { localDy } = projectToLocalAxes(x - transform.ex, y - transform.ey, angleRad)

  const dSource = localDy / original.scaleY
  const maxCropY = initial.cropY + initial.height - MIN_CROP_PIXELS
  const newCropY = clamp(initial.cropY + dSource, 0, maxCropY)
  const newHeight = initial.cropY + initial.height - newCropY

  const cropDelta = newCropY - initial.cropY
  const posOffset = (cropDelta * original.scaleY) / 2

  transform.target.set({
    cropY: newCropY,
    height: newHeight,
    left: original.left - posOffset * Math.sin(angleRad),
    top: original.top + posOffset * Math.cos(angleRad),
  })
  transform.target.setCoords()
  return true
}

export const cropFromBottom: TransformActionHandler = (
  _eventData,
  transform,
  x,
  y,
): boolean => {
  if (!isImage(transform.target)) return false

  const { original } = transform
  const initial = ensureCropState(transform)
  const origSize = getOriginalImageSize(transform.target as FabricImage)
  const angleRad = util.degreesToRadians(original.angle)
  const { localDy } = projectToLocalAxes(x - transform.ex, y - transform.ey, angleRad)

  const dSource = localDy / original.scaleY
  const maxHeight = origSize.height - initial.cropY
  const newHeight = clamp(initial.height + dSource, MIN_CROP_PIXELS, maxHeight)

  const heightDelta = newHeight - initial.height
  const posOffset = (heightDelta * original.scaleY) / 2

  transform.target.set({
    height: newHeight,
    left: original.left - posOffset * Math.sin(angleRad),
    top: original.top + posOffset * Math.cos(angleRad),
  })
  transform.target.setCoords()
  return true
}
