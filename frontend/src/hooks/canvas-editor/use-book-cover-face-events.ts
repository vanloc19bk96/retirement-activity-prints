import { useEffect, type MutableRefObject } from 'react'
import type { Canvas } from 'fabric'

import type { BookCoverDimensions, BookCoverZones } from '@/types/book-cover.types'
import type { CoverFace } from '@/types/book-cover-face.types'
import {
  applyCoverFaceDesignToCanvas,
  hasManualCoverFacePositions,
  isCoverFaceObject,
  readCoverFaceDesignFromCanvas,
  removeCoverFaceDesignFromCanvas,
  type CoverFaceGeometry,
} from '@/utils/book-cover-face'
import {
  APPLY_COVER_FACE_DESIGN_EVENT,
  REMOVE_COVER_FACE_DESIGN_EVENT,
  REQUEST_COVER_FACE_STATE_EVENT,
  dispatchCoverFaceState,
  type ApplyCoverFaceDesignEventDetail,
  type RemoveCoverFaceDesignEventDetail,
  type RequestCoverFaceStateEventDetail,
} from '@/utils/book-cover-face-events'
import { sampleCoverAreaPalette } from '@/utils/book-cover-spine-palette'
import { getFabricCanvasHistoryManager } from '@/utils/fabric-canvas-history'

/** Book cover canvas index (interior pages are 0..n-1). */
const COVER_CANVAS_INDEX = -1
/** Typing in a cover panel becomes one undo step once it pauses this long. */
const FACE_HISTORY_DEBOUNCE_MS = 500

type UseBookCoverFaceEventsArgs = {
  canvasByIndexRef: MutableRefObject<Record<number, Canvas>>
  geometryRef: MutableRefObject<{ zones?: BookCoverZones; dimensions?: BookCoverDimensions }>
}

/**
 * Front / Back cover panel events → cover canvas. Applies run one at a time;
 * only the latest queued design per face is applied.
 */
export function useBookCoverFaceEvents({ canvasByIndexRef, geometryRef }: UseBookCoverFaceEventsArgs): void {
  useEffect(() => {
    const pending = new Map<CoverFace, ApplyCoverFaceDesignEventDetail>()
    let isApplying = false

    const getCoverCanvas = (): Canvas | null => canvasByIndexRef.current[COVER_CANVAS_INDEX] ?? null
    const getGeometry = (): CoverFaceGeometry | null => {
      const { zones, dimensions } = geometryRef.current
      return zones && dimensions ? { zones, dimensions } : null
    }

    const drainPending = async (): Promise<void> => {
      if (isApplying) return
      isApplying = true
      try {
        while (pending.size > 0) {
          const [face, detail] = pending.entries().next().value as [CoverFace, ApplyCoverFaceDesignEventDetail]
          pending.delete(face)
          const canvas = getCoverCanvas()
          const geometry = getGeometry()
          if (!canvas || !geometry) continue

          const history = getFabricCanvasHistoryManager(canvas)
          history?.suspend()
          try {
            await applyCoverFaceDesignToCanvas(canvas, face, detail.design, geometry, {
              resetPositions: detail.resetPositions,
            })
          } catch {
            // Keep the editor usable if a font or image fails to load.
          } finally {
            history?.resume()
            history?.recordSnapshot({ debounceMs: FACE_HISTORY_DEBOUNCE_MS })
          }
        }
      } finally {
        isApplying = false
      }
    }

    const handleApply = (event: Event): void => {
      const detail = (event as CustomEvent<ApplyCoverFaceDesignEventDetail>).detail
      if (!detail?.design) return
      // A queued reset survives a newer design arriving before it runs.
      const resetPositions = detail.resetPositions || pending.get(detail.face)?.resetPositions
      pending.set(detail.face, { ...detail, resetPositions })
      void drainPending()
    }

    const handleRemove = (event: Event): void => {
      const face = (event as CustomEvent<RemoveCoverFaceDesignEventDetail>).detail?.face
      if (!face) return
      pending.delete(face)
      const canvas = getCoverCanvas()
      if (!canvas) return
      const history = getFabricCanvasHistoryManager(canvas)
      history?.suspend()
      removeCoverFaceDesignFromCanvas(canvas, face)
      history?.resume()
      history?.recordSnapshot()
    }

    const handleRequestState = (event: Event): void => {
      const detail = (event as CustomEvent<RequestCoverFaceStateEventDetail>).detail
      if (!detail) return
      const { requestId, face } = detail
      const canvas = getCoverCanvas()
      const geometry = getGeometry()
      if (!canvas || !geometry) {
        dispatchCoverFaceState({
          requestId,
          face,
          isCoverReady: false,
          design: null,
          palette: [],
          hasManualPositions: false,
        })
        return
      }
      dispatchCoverFaceState({
        requestId,
        face,
        isCoverReady: true,
        design: readCoverFaceDesignFromCanvas(canvas, face),
        // The rest of the cover (other face, spine, art) suggests matching colors.
        palette: sampleCoverAreaPalette(canvas, geometry.zones.bleed, (object) =>
          isCoverFaceObject(object, face),
        ),
        hasManualPositions: hasManualCoverFacePositions(canvas, face),
      })
    }

    window.addEventListener(APPLY_COVER_FACE_DESIGN_EVENT, handleApply)
    window.addEventListener(REMOVE_COVER_FACE_DESIGN_EVENT, handleRemove)
    window.addEventListener(REQUEST_COVER_FACE_STATE_EVENT, handleRequestState)
    return () => {
      window.removeEventListener(APPLY_COVER_FACE_DESIGN_EVENT, handleApply)
      window.removeEventListener(REMOVE_COVER_FACE_DESIGN_EVENT, handleRemove)
      window.removeEventListener(REQUEST_COVER_FACE_STATE_EVENT, handleRequestState)
    }
  }, [canvasByIndexRef, geometryRef])
}
