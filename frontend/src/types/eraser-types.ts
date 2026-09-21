import type { FabricObject, FabricImage } from 'fabric'

/**
 * One eraser stroke baked onto an image's pixel buffer.
 *
 * Coordinates are pre-converted to image-local space at record time so the
 * stroke stays anchored to the image's pixel content even if the image is
 * later moved, scaled, or rotated on the canvas.
 */
export type EraserStrokeRecord = {
  d: string
  lineWidth: number
  matrix: [number, number, number, number, number, number]
  pathOffsetX: number
  pathOffsetY: number
}

export type EraserSourceCrop = {
  cropX: number
  cropY: number
  width: number
  height: number
}

/**
 * A FabricImage that owns its eraser strokes as records (NEW format).
 * Runtime fields (prefixed `_`) are not serialized; `eraserStrokes` is.
 */
export type EraserBakedImage = FabricImage & {
  objectId?: string
  originalImageUrl?: string
  eraserSourceCrop?: EraserSourceCrop
  eraserStrokes?: EraserStrokeRecord[]
  _eraserBuffer?: HTMLCanvasElement
  _eraserSourceElement?: CanvasImageSource
  /** Hash of stroke records last baked into `_eraserBuffer`; used to skip redundant bakes. */
  _eraserBakedSignature?: string
}

/**
 * Legacy types — kept ONLY so old saved JSON (where eraser strokes were stored
 * as separate `Path` objects with `isEraserPath: true` linked via `linkedImageId`)
 * can be migrated to the new record-based format on load.
 */
export type LegacyEraserPathObject = FabricObject & {
  isEraserPath?: boolean
  linkedImageId?: string
  eraserBrushWidth?: number
}
