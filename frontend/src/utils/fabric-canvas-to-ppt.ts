import { Group, Point, StaticCanvas, Textbox, util, iMatrix, type FabricObject, type TMat2D } from 'fabric'
import type PptxGenJS from 'pptxgenjs'

import type { CanvasExportItem } from '@/context/CanvasExportContext'
import { addFabricObjectToPptSlide } from '@/utils/fabric-object-to-ppt-slide'
import {
  refreshFabricEditableTextMetricsAfterFontsReady,
  remeasureAllFabricEditableTextOnCanvas,
} from '@/utils/canvas-text'
import { collectReferencedFontFamiliesFromFabricCanvasJson } from '@/utils/canvas-state-store'
import {
  applyAnonymousCrossOriginToFabricImageObjects,
  omitFabricCanvasJsonSurfaceFields,
} from '@/utils/canvas-template'
import { ensureFontFamilyLoaded } from '@/utils/font-loader'
import { FOLLOW_THE_ROUTE_ARROW_SOURCE } from '@/utils/studio/follow-the-route/render'
import { STUDIO_CHECK_MARK_SOURCE } from '@/utils/studio/studio-check-mark'

/** Groups that must rasterize as one unit — leaf Lines lose round caps in PPT. */
const PPT_INTACT_GROUP_SOURCES = new Set<string>([
  STUDIO_CHECK_MARK_SOURCE,
  FOLLOW_THE_ROUTE_ARROW_SOURCE,
])

const EDITABLE_TEXT_OBJECT_TYPES = new Set(['textbox', 'i-text', 'text'])

type PptSlide = PptxGenJS.Slide

function setCoordsDeep(object: FabricObject): void {
  if (object.type === 'group') {
    for (const child of (object as Group).getObjects()) {
      setCoordsDeep(child)
    }
  }
  object.setCoords()
}

/** Checkmarks / stroke arrows must stay one unit — leaf Lines get butt caps in PPT. */
function shouldKeepFabricGroupIntactForPpt(object: FabricObject): boolean {
  const data = (object as FabricObject & { data?: { source?: unknown } }).data
  return typeof data?.source === 'string' && PPT_INTACT_GROUP_SOURCES.has(data.source)
}

function walkFabricLeafObjects(
  objects: readonly FabricObject[],
  parentMatrix: TMat2D,
  visit: (object: FabricObject, absoluteMatrix: TMat2D) => void,
): void {
  for (const object of objects) {
    // Skip hidden answer groups entirely — flattening would otherwise emit their
    // visible decoration children (Study & Recall Grid recall page looked like a
    // duplicate of the study page in PPT).
    if (object.visible === false) continue

    const absoluteMatrix = util.multiplyTransformMatrices(parentMatrix, object.calcOwnMatrix())

    if (object.type === 'group') {
      if (shouldKeepFabricGroupIntactForPpt(object)) {
        visit(object, absoluteMatrix)
        continue
      }
      walkFabricLeafObjects((object as Group).getObjects(), absoluteMatrix, visit)
      continue
    }

    visit(object, absoluteMatrix)
  }
}

function applyCanvasMatrixToObject(object: FabricObject, matrix: TMat2D): void {
  const { translateX, translateY, scaleX, scaleY, ...rest } = util.qrDecompose(matrix)

  object.flipX = false
  object.flipY = false
  Object.assign(object, rest)
  object.set({
    scaleX: Math.abs(scaleX),
    scaleY: Math.abs(scaleY),
  })

  if (scaleX < 0) {
    object.flipX = true
  }
  if (scaleY < 0) {
    object.flipY = true
  }

  object.setPositionByOrigin(new Point(translateX, translateY), 'center', 'center')
  object.setCoords()
}

async function createCanvasPlaneObjectClone(
  object: FabricObject,
  absoluteMatrix: TMat2D,
): Promise<FabricObject> {
  const clone = await object.clone()
  applyCanvasMatrixToObject(clone, absoluteMatrix)
  return clone
}

async function prepareFabricCanvasForPptExport(canvas: StaticCanvas): Promise<void> {
  remeasureAllFabricEditableTextOnCanvas(canvas)

  const textObjects: FabricObject[] = []
  walkFabricLeafObjects(canvas.getObjects(), iMatrix, (object) => {
    if (EDITABLE_TEXT_OBJECT_TYPES.has(object.type ?? '')) {
      textObjects.push(object)
    }
  })

  await Promise.all(
    textObjects.map((object) =>
      refreshFabricEditableTextMetricsAfterFontsReady(object as Textbox),
    ),
  )
  canvas.requestRenderAll()
  canvas.forEachObject((object) => setCoordsDeep(object))
}

export async function addStaticCanvasObjectsToPptSlide(
  slide: PptSlide,
  canvas: StaticCanvas,
): Promise<void> {
  await prepareFabricCanvasForPptExport(canvas)

  const flattenedObjects: Array<{ object: FabricObject; matrix: TMat2D }> = []
  walkFabricLeafObjects(canvas.getObjects(), iMatrix, (object, matrix) => {
    flattenedObjects.push({ object, matrix })
  })

  for (const { object, matrix } of flattenedObjects) {
    const canvasPlaneObject = await createCanvasPlaneObjectClone(object, matrix)
    await addFabricObjectToPptSlide(slide, canvasPlaneObject)
  }
}

export async function loadStaticCanvasFromExportJson({
  canvasJson,
  baseWidthPixels,
  baseHeightPixels,
  backgroundColor,
}: {
  canvasJson: Record<string, unknown>
  baseWidthPixels: number
  baseHeightPixels: number
  backgroundColor: string
}): Promise<StaticCanvas> {
  const element = document.createElement('canvas')
  const canvas = new StaticCanvas(element, {
    width: baseWidthPixels,
    height: baseHeightPixels,
    backgroundColor,
    renderOnAddRemove: false,
    preserveObjectStacking: true,
  })

  const corsSafeJson = applyAnonymousCrossOriginToFabricImageObjects(canvasJson)
  const loadJson = omitFabricCanvasJsonSurfaceFields(corsSafeJson as Record<string, unknown>)
  // Same as image export: webfonts must be ready before loadFromJSON / toDataURL
  // so rasterized PPT text paints the authored face, not a system fallback.
  const referencedFontFamilies = collectReferencedFontFamiliesFromFabricCanvasJson(loadJson)
  await Promise.all(referencedFontFamilies.map((fontFamily) => ensureFontFamilyLoaded(fontFamily)))
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    await document.fonts.ready
  }
  await canvas.loadFromJSON(loadJson)
  canvas.setDimensions({ width: baseWidthPixels, height: baseHeightPixels })
  canvas.backgroundColor = backgroundColor
  canvas.setViewportTransform([1, 0, 0, 1, 0, 0])
  canvas.forEachObject((object) => {
    ;(object as FabricObject & { objectCaching?: boolean }).objectCaching = false
  })

  return canvas
}

export async function renderCanvasExportItemToPptSlide({
  slide,
  item,
  pageWidthPixels,
  pageHeightPixels,
  backgroundColor,
}: {
  slide: PptSlide
  item: CanvasExportItem
  pageWidthPixels: number
  pageHeightPixels: number
  backgroundColor: string
}): Promise<void> {
  const canvas = await loadStaticCanvasFromExportJson({
    canvasJson: item.canvas_data,
    baseWidthPixels: pageWidthPixels,
    baseHeightPixels: pageHeightPixels,
    backgroundColor,
  })

  try {
    await addStaticCanvasObjectsToPptSlide(slide, canvas)
  } finally {
    canvas.dispose()
  }
}
