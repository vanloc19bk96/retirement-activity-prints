import type { MutableRefObject, RefObject } from 'react'
import { useCallback, useState } from 'react'
import type { Canvas } from 'fabric'

import type {
  CoverFittableImage,
  CoverPlacementKind,
} from '@/types/fabric-canvas-item.types'
import type { BookCoverDimensions, BookCoverZones } from '@/types/book-cover.types'
import type { CanvasSelectionSnapshot } from '@/utils/fabric-selection'
import type { useFabricSelectionContextMenu } from '@/hooks/use-fabric-selection-context-menu'
import {
  fitCoverImageToPlacementZone,
  resolveCoverPlacementZoneForKind,
  type CoverPlacementRect,
} from '@/utils/book-cover-image-placement'

type UseFabricCanvasCoverFitOptions = {
  fabricCanvasRef: RefObject<Canvas | null>
  selectionContextMenuRef: MutableRefObject<ReturnType<typeof useFabricSelectionContextMenu>>
  isBookCover: boolean
  bookCoverZones: BookCoverZones
  bookCoverDimensions: BookCoverDimensions
}

type CoverFitCapabilities = {
  canFront: boolean
  canBack: boolean
}

export type FabricCanvasCoverFitApi = {
  canFitFullFront: boolean
  canFitFullBack: boolean
  handleFitFullFront: () => void
  handleFitFullBack: () => void
  /** Returns which cover-fit actions apply for the given image based on where it sits. */
  resolveCoverFitCapabilities: (activeObject: CoverFittableImage) => CoverFitCapabilities
  /** Compute capabilities from the active selection snapshot and store them for the context menu. */
  updateCapabilitiesFromSnapshot: (snapshot: CanvasSelectionSnapshot) => void
  /** Reset both capabilities to false (e.g. when selection is cleared). */
  resetCapabilities: () => void
}

export function useFabricCanvasCoverFit({
  fabricCanvasRef,
  selectionContextMenuRef,
  isBookCover,
  bookCoverZones,
  bookCoverDimensions,
}: UseFabricCanvasCoverFitOptions): FabricCanvasCoverFitApi {
  const [canFitFullFront, setCanFitFullFront] = useState(false)
  const [canFitFullBack, setCanFitFullBack] = useState(false)

  const resolveCoverFitCapabilities = useCallback(
    (activeObject: CoverFittableImage): CoverFitCapabilities => {
      const frontStartX = bookCoverZones.frontCover.x
      const spineStartX = bookCoverZones.spine.x
      const coverZoneCenterX =
        activeObject._coverZone != null
          ? activeObject._coverZone.x + activeObject._coverZone.width / 2
          : null
      const activeCenterX = typeof activeObject.left === 'number' ? activeObject.left : null
      const referenceX = coverZoneCenterX ?? activeCenterX

      if (referenceX == null || !Number.isFinite(referenceX)) {
        return { canFront: true, canBack: true }
      }
      if (referenceX >= frontStartX) {
        return { canFront: true, canBack: false }
      }
      if (referenceX < spineStartX) {
        return { canFront: false, canBack: true }
      }
      return { canFront: true, canBack: true }
    },
    [bookCoverZones.frontCover.x, bookCoverZones.spine.x],
  )

  const resetCapabilities = useCallback((): void => {
    setCanFitFullFront(false)
    setCanFitFullBack(false)
  }, [])

  const updateCapabilitiesFromSnapshot = useCallback(
    (snapshot: CanvasSelectionSnapshot): void => {
      const canvas = fabricCanvasRef.current
      if (!canvas) {
        resetCapabilities()
        return
      }

      const canUseCoverFitActions = isBookCover && snapshot.selectionInfo.isImage
      if (!canUseCoverFitActions) {
        resetCapabilities()
        return
      }

      const activeObject = canvas.getActiveObject() as CoverFittableImage | null
      if (activeObject?.type !== 'image') {
        resetCapabilities()
        return
      }

      const capability = resolveCoverFitCapabilities(activeObject)
      setCanFitFullFront(capability.canFront)
      setCanFitFullBack(capability.canBack)
    },
    [fabricCanvasRef, isBookCover, resetCapabilities, resolveCoverFitCapabilities],
  )

  const fitSelectedImageToCoverZone = useCallback(
    (zone: CoverPlacementRect, placementKind: CoverPlacementKind): void => {
      const canvas = fabricCanvasRef.current
      if (!canvas) return
      const activeObject = canvas.getActiveObject() as CoverFittableImage | null
      if (!activeObject || activeObject.type !== 'image') return

      fitCoverImageToPlacementZone(activeObject, zone, placementKind)
      canvas.setActiveObject(activeObject as never)
      canvas.requestRenderAll()
    },
    [fabricCanvasRef],
  )

  const handleFitFullFront = useCallback((): void => {
    if (!isBookCover) return
    fitSelectedImageToCoverZone(
      resolveCoverPlacementZoneForKind('front', bookCoverZones, bookCoverDimensions),
      'front',
    )
    selectionContextMenuRef.current.close()
  }, [
    bookCoverDimensions,
    bookCoverZones,
    fitSelectedImageToCoverZone,
    isBookCover,
    selectionContextMenuRef,
  ])

  const handleFitFullBack = useCallback((): void => {
    if (!isBookCover) return
    fitSelectedImageToCoverZone(
      resolveCoverPlacementZoneForKind('back', bookCoverZones, bookCoverDimensions),
      'back',
    )
    selectionContextMenuRef.current.close()
  }, [
    bookCoverDimensions,
    bookCoverZones,
    fitSelectedImageToCoverZone,
    isBookCover,
    selectionContextMenuRef,
  ])

  return {
    canFitFullFront,
    canFitFullBack,
    handleFitFullFront,
    handleFitFullBack,
    resolveCoverFitCapabilities,
    updateCapabilitiesFromSnapshot,
    resetCapabilities,
  }
}
