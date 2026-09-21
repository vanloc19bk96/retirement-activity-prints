import type { Canvas, FabricObject, Path } from 'fabric'

import type { EraserBakedImage, LegacyEraserPathObject } from '@/types/eraser-types'
import {
  buildEraserStrokeRecord,
  rebuildEraserBufferForImage,
} from '@/utils/fabric-eraser-bake'

function ensureObjectIdForFabricObject(target: FabricObject): string {
  const objectWithId = target as FabricObject & { objectId?: string }
  if (typeof objectWithId.objectId === 'string' && objectWithId.objectId.length > 0) {
    return objectWithId.objectId
  }
  const nextId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `obj-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  objectWithId.objectId = nextId
  return nextId
}

function ensureImagesHaveStableIds(canvas: Canvas): void {
  for (const obj of canvas.getObjects()) {
    if (obj.type === 'image') ensureObjectIdForFabricObject(obj)
  }
}

function migrateLegacyEraserPaths(canvas: Canvas): void {
  const legacyPaths = canvas
    .getObjects()
    .filter((obj) => (obj as LegacyEraserPathObject).isEraserPath === true) as Path[]
  if (legacyPaths.length === 0) return

  for (const legacy of legacyPaths) {
    const linkedImageId = (legacy as unknown as LegacyEraserPathObject).linkedImageId
    if (!linkedImageId) {
      canvas.remove(legacy)
      continue
    }
    const image = canvas
      .getObjects()
      .find(
        (obj) => obj.type === 'image' && (obj as EraserBakedImage).objectId === linkedImageId,
      ) as EraserBakedImage | undefined
    if (!image) {
      canvas.remove(legacy)
      continue
    }
    const record = buildEraserStrokeRecord(image, legacy)
    image.eraserStrokes = [...(image.eraserStrokes ?? []), record]
    canvas.remove(legacy)
  }
}

function rebuildEraserBuffersForImagesWithStrokes(canvas: Canvas): void {
  for (const object of canvas.getObjects()) {
    if (object.type !== 'image') continue
    const image = object as EraserBakedImage
    if (!image.eraserStrokes || image.eraserStrokes.length === 0) continue
    rebuildEraserBufferForImage(image)
  }
}

/** Restore runtime eraser state after a canvas load (JSON restore, template drop, etc.). */
export function rehydrateEraserMetadata(canvas: Canvas): void {
  ensureImagesHaveStableIds(canvas)
  migrateLegacyEraserPaths(canvas)
  rebuildEraserBuffersForImagesWithStrokes(canvas)
  canvas.requestRenderAll()
}
