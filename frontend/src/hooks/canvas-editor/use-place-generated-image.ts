import { useEffect, useRef } from 'react'
import type { Canvas, FabricObject } from 'fabric'

import type { BookCoverDimensions, BookCoverZones } from '@/types/book-cover.types'
import { resolveCoverPlacementZoneForKind } from '@/utils/book-cover-image-placement'
import { loadImageOrSvgObject, placeLoadedImageOnCanvas } from '@/utils/canvas-image'
import type { CanvasStateStore } from '@/utils/canvas-state-store'
import { getFabricCanvasHistoryManager } from '@/utils/fabric-canvas-history'
import { exitActiveFabricTextEditing } from '@/utils/fabric-interaction-guards'
import {
  onPlaceGeneratedImage,
  type GeneratedImagePlacementResult,
  type GeneratedImagePlacementTarget,
} from '@/utils/generated-image-placement-events'

const COVER_CANVAS_INDEX = -1

const COVER_TARGET_LABELS = {
  front: 'the front cover',
  back: 'the back cover',
  spine: 'the spine',
} as const

export type PlaceGeneratedImageDeps = {
  getCanvas: (canvasIndex: number) => Canvas | null
  /** False while the canvas holds part of its page: restoring from the store, or an undo landing. */
  isCanvasEditable: (canvasIndex: number, canvas: Canvas) => boolean
  isInteriorMode: () => boolean
  getActivePageIndex: () => number
  getCoverGeometry: () => { zones?: BookCoverZones; dimensions?: BookCoverDimensions }
  loadImage?: (src: string) => Promise<FabricObject | null>
  onPlaced: (canvasIndex: number) => void
}

const LOAD_ERROR = 'The image could not be loaded. Check your connection and press the button again.'
const NOT_OPEN_ERROR = 'That part of your book is not open right now. Open it, then press the button again.'
const NOT_READY_ERROR = 'The canvas is still loading. Wait until it has finished, then press the button again.'

/**
 * Loading a print-size image can take long on a slow connection, and the canvas may be replaced
 * meanwhile (a settings change, leaving the cover). So the target is looked up after the image
 * has loaded, and a canvas that is not fully loaded is refused: its restore would wipe the image.
 */
export async function placeGeneratedImageOnEditor(
  imageUrl: string,
  target: GeneratedImagePlacementTarget,
  deps: PlaceGeneratedImageDeps,
): Promise<GeneratedImagePlacementResult> {
  const isOnPage = target === 'page'
  if (isOnPage !== deps.isInteriorMode()) return { error: NOT_OPEN_ERROR }
  const canvasIndex = isOnPage ? deps.getActivePageIndex() : COVER_CANVAS_INDEX

  let image: FabricObject | null
  try {
    image = await (deps.loadImage ?? loadImageOrSvgObject)(imageUrl)
  } catch {
    return { error: LOAD_ERROR }
  }
  if (!image) return { error: LOAD_ERROR }

  const canvas = deps.getCanvas(canvasIndex)
  if (!canvas) return { error: NOT_OPEN_ERROR }
  if (!deps.isCanvasEditable(canvasIndex, canvas)) return { error: NOT_READY_ERROR }

  let zone
  if (target !== 'page') {
    const { zones, dimensions } = deps.getCoverGeometry()
    if (!zones || !dimensions) return { error: NOT_READY_ERROR }
    const rect = resolveCoverPlacementZoneForKind(target, zones, dimensions)
    if (rect.width <= 0 || rect.height <= 0) return { error: NOT_OPEN_ERROR }
    zone = { ...rect, clipToZone: true, placementKind: target }
  }

  exitActiveFabricTextEditing(canvas)
  if (!placeLoadedImageOnCanvas(canvas, image, imageUrl, zone)) return { error: LOAD_ERROR }
  deps.onPlaced(canvasIndex)
  return { placedOn: target === 'page' ? `page ${canvasIndex + 1}` : COVER_TARGET_LABELS[target] }
}

type UsePlaceGeneratedImageArgs = {
  canvasStateStore: CanvasStateStore
  getCanvas: (canvasIndex: number) => Canvas | null
  isInteriorMode: boolean
  activePageIndex: number
  bookCoverZones?: BookCoverZones
  bookCoverDimensions?: BookCoverDimensions
  onPlaced: (canvasIndex: number) => void
}

/** Image panel Place buttons → the canvas the editor has open. */
export function usePlaceGeneratedImage(args: UsePlaceGeneratedImageArgs): void {
  const argsRef = useRef(args)
  argsRef.current = args

  useEffect(() => {
    return onPlaceGeneratedImage(({ imageUrl, target, resolve }) => {
      const deps: PlaceGeneratedImageDeps = {
        getCanvas: (canvasIndex) => argsRef.current.getCanvas(canvasIndex),
        isCanvasEditable: (canvasIndex, canvas) =>
          argsRef.current.canvasStateStore.isFabricLiveTrusted(canvasIndex) &&
          !getFabricCanvasHistoryManager(canvas)?.isApplyingSnapshot(),
        isInteriorMode: () => argsRef.current.isInteriorMode,
        getActivePageIndex: () => argsRef.current.activePageIndex,
        getCoverGeometry: () => ({
          zones: argsRef.current.bookCoverZones,
          dimensions: argsRef.current.bookCoverDimensions,
        }),
        onPlaced: (canvasIndex) => argsRef.current.onPlaced(canvasIndex),
      }
      void placeGeneratedImageOnEditor(imageUrl, target, deps).then(resolve)
    })
  }, [])
}
