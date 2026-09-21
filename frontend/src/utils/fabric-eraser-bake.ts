import type { Canvas, FabricObject, Path } from 'fabric'
import { util } from 'fabric'

import type {
  EraserBakedImage,
  EraserSourceCrop,
  EraserStrokeRecord,
  LegacyEraserPathObject,
} from '@/types/eraser-types'

type Matrix6 = [number, number, number, number, number, number]

const MIN_BUFFER_DIMENSION = 1
const DATA_URL_PREFIX = 'data:'

function getImagePixelDimensions(image: EraserBakedImage): { width: number; height: number } {
  return {
    width: Math.max(MIN_BUFFER_DIMENSION, Math.ceil(image.width ?? 0)),
    height: Math.max(MIN_BUFFER_DIMENSION, Math.ceil(image.height ?? 0)),
  }
}

function getOriginalImageElement(image: EraserBakedImage): CanvasImageSource | null {
  const anyImage = image as unknown as {
    _originalElement?: CanvasImageSource
    _element?: CanvasImageSource
    getElement?: () => CanvasImageSource | undefined
  }
  if (image._eraserSourceElement) return image._eraserSourceElement
  if (anyImage._originalElement) return anyImage._originalElement
  if (anyImage.getElement) return anyImage.getElement() ?? null
  return anyImage._element ?? null
}

function isPersistentImageUrl(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && !value.startsWith(DATA_URL_PREFIX)
}

function getImageSourceUrl(image: EraserBakedImage): string | null {
  if (isPersistentImageUrl(image.originalImageUrl)) return image.originalImageUrl
  const imageWithSource = image as unknown as {
    getSrc?: () => string
    src?: string
  }
  const src = typeof imageWithSource.getSrc === 'function' ? imageWithSource.getSrc() : imageWithSource.src
  return isPersistentImageUrl(src) ? src : null
}

function ensureEraserSourceMetadata(image: EraserBakedImage): EraserSourceCrop {
  const existing = image.eraserSourceCrop
  if (existing) return existing

  const sourceCrop = {
    cropX: image.cropX ?? 0,
    cropY: image.cropY ?? 0,
    width: image.width ?? MIN_BUFFER_DIMENSION,
    height: image.height ?? MIN_BUFFER_DIMENSION,
  }
  image.eraserSourceCrop = sourceCrop

  const sourceUrl = getImageSourceUrl(image)
  if (sourceUrl) image.originalImageUrl = sourceUrl

  return sourceCrop
}

function createEraserBuffer(image: EraserBakedImage): HTMLCanvasElement {
  const { width, height } = getImagePixelDimensions(image)
  const buffer = document.createElement('canvas')
  buffer.width = width
  buffer.height = height
  return buffer
}

function paintOriginalIntoBuffer(image: EraserBakedImage, buffer: HTMLCanvasElement): void {
  const ctx = buffer.getContext('2d')
  if (!ctx) return
  // A runtime source element only exists while the image lives in memory (in-session).
  // After a reload it is undefined, which tells us the source element is the
  // previously-baked buffer restored from `src`, not the pristine original.
  const hasRuntimeSource = !!image._eraserSourceElement
  const source = getOriginalImageElement(image)
  ctx.clearRect(0, 0, buffer.width, buffer.height)
  if (!source) return
  image._eraserSourceElement = source
  const sourceCrop = ensureEraserSourceMetadata(image)
  // In-session: source is the original image and the live crop was zeroed by a prior
  // bake, so the remembered `eraserSourceCrop` is the region to copy. After reload:
  // source is the baked buffer and the live crop describes the region relative to it,
  // so copy the current crop window 1:1 (buffer is already sized to image width/height).
  const rect = hasRuntimeSource
    ? sourceCrop
    : {
        cropX: image.cropX ?? 0,
        cropY: image.cropY ?? 0,
        width: image.width ?? sourceCrop.width,
        height: image.height ?? sourceCrop.height,
      }
  try {
    ctx.drawImage(
      source as CanvasImageSource,
      rect.cropX,
      rect.cropY,
      rect.width,
      rect.height,
      0,
      0,
      buffer.width,
      buffer.height,
    )
  } catch {
    // CanvasImageSource may be a non-loaded element; nothing to bake yet.
  }
}

function applyStrokeOnContext(
  ctx: CanvasRenderingContext2D,
  record: EraserStrokeRecord,
  imageWidth: number,
  imageHeight: number,
): void {
  ctx.save()
  ctx.translate(imageWidth / 2, imageHeight / 2)
  const m = record.matrix
  ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5])
  ctx.translate(-record.pathOffsetX, -record.pathOffsetY)

  ctx.globalCompositeOperation = 'destination-out'
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = record.lineWidth
  ctx.strokeStyle = '#000'
  ctx.stroke(new Path2D(record.d))
  ctx.restore()
}

function computeStrokeSignature(records: ReadonlyArray<EraserStrokeRecord>): string {
  if (records.length === 0) return '0'
  const last = records[records.length - 1]
  return `${records.length}|${last.d.length}|${last.lineWidth}|${last.matrix.join(',')}`
}

function attachBufferToImage(image: EraserBakedImage, buffer: HTMLCanvasElement): void {
  const anyImage = image as unknown as {
    setElement: (el: CanvasImageSource) => void
    dirty?: boolean
  }
  anyImage.setElement(buffer)
  // The buffer already contains exactly the cropped region, so clear crop offsets to
  // prevent Fabric from cropping the buffer a second time (which shifted the image).
  image.cropX = 0
  image.cropY = 0
  image.width = buffer.width
  image.height = buffer.height
  anyImage.dirty = true
  image._eraserBuffer = buffer
}

export function appendEraserStrokeToImage(
  image: EraserBakedImage,
  record: EraserStrokeRecord,
): void {
  ensureEraserSourceMetadata(image)
  let buffer = image._eraserBuffer
  if (!buffer) {
    buffer = createEraserBuffer(image)
    paintOriginalIntoBuffer(image, buffer)
    attachBufferToImage(image, buffer)
  }
  const ctx = buffer.getContext('2d')
  if (!ctx) return
  applyStrokeOnContext(ctx, record, buffer.width, buffer.height)
  const records = image.eraserStrokes ?? []
  image._eraserBakedSignature = computeStrokeSignature(records)
  ;(image as unknown as { dirty?: boolean }).dirty = true
}

export function rebuildEraserBufferForImage(image: EraserBakedImage): void {
  const records = image.eraserStrokes ?? []
  const signature = computeStrokeSignature(records)
  if (image._eraserBuffer && image._eraserBakedSignature === signature) return
  if (records.length === 0) {
    image._eraserBuffer = undefined
    image._eraserBakedSignature = signature
    return
  }
  const buffer = createEraserBuffer(image)
  paintOriginalIntoBuffer(image, buffer)
  const ctx = buffer.getContext('2d')
  if (ctx) {
    for (const record of records) {
      applyStrokeOnContext(ctx, record, buffer.width, buffer.height)
    }
  }
  attachBufferToImage(image, buffer)
  image._eraserBakedSignature = signature
}

export function buildEraserStrokeRecord(image: EraserBakedImage, path: Path): EraserStrokeRecord {
  const pathToCanvas = path.calcTransformMatrix()
  const canvasToImageCenter = util.invertTransform(image.calcTransformMatrix())
  const matrix = util.multiplyTransformMatrices(canvasToImageCenter, pathToCanvas) as Matrix6

  const segments = path.path as unknown as Parameters<typeof util.joinPath>[0]
  return {
    d: util.joinPath(segments),
    lineWidth: path.strokeWidth ?? 1,
    matrix: [matrix[0], matrix[1], matrix[2], matrix[3], matrix[4], matrix[5]],
    pathOffsetX: path.pathOffset?.x ?? 0,
    pathOffsetY: path.pathOffset?.y ?? 0,
  }
}

export function pickTopImageUnderEraserPath(
  canvas: Canvas,
  path: FabricObject,
): EraserBakedImage | null {
  const objects = canvas.getObjects()
  for (let i = objects.length - 1; i >= 0; i -= 1) {
    const obj = objects[i]
    if (obj.type !== 'image') continue
    try {
      if (path.intersectsWithObject(obj) || obj.isContainedWithinObject(path)) {
        return obj as EraserBakedImage
      }
    } catch {
      continue
    }
  }
  return null
}

function migrateLegacyEraserPath(canvas: Canvas, legacyPath: LegacyEraserPathObject): void {
  const linkedId = legacyPath.linkedImageId
  if (!linkedId) {
    canvas.remove(legacyPath as unknown as FabricObject)
    return
  }
  const image = canvas
    .getObjects()
    .find(
      (obj) => obj.type === 'image' && (obj as EraserBakedImage).objectId === linkedId,
    ) as EraserBakedImage | undefined
  canvas.remove(legacyPath as unknown as FabricObject)
  if (!image) return

  const path = legacyPath as unknown as Path
  const record = buildEraserStrokeRecord(image, path)
  const previous = image.eraserStrokes ?? []
  image.eraserStrokes = [...previous, record]
  rebuildEraserBufferForImage(image)
}

export function attachEraserAutoBakeListener(canvas: Canvas): () => void {
  const onObjectAdded = (event: { target?: FabricObject }): void => {
    const target = event.target
    if (!target) return

    const legacy = target as LegacyEraserPathObject
    if (legacy.isEraserPath === true) {
      queueMicrotask(() => migrateLegacyEraserPath(canvas, legacy))
      return
    }

    if (target.type === 'image') {
      const image = target as EraserBakedImage
      if (image.eraserStrokes && image.eraserStrokes.length > 0) {
        rebuildEraserBufferForImage(image)
        canvas.requestRenderAll()
      }
    }
  }

  canvas.on('object:added', onObjectAdded)
  return () => {
    canvas.off('object:added', onObjectAdded)
  }
}
