import { useEffect, type MutableRefObject } from 'react'
import type { Canvas } from 'fabric'

import type { BookCoverDimensions, BookCoverZones } from '@/types/book-cover.types'
import type { SpineDesign } from '@/types/book-cover-spine.types'
import {
  applySpineDesignToCanvas,
  isSpineObject,
  readSpineDesignFromCanvas,
  removeSpineDesignFromCanvas,
  type SpineGeometry,
} from '@/utils/book-cover-spine'
import {
  APPLY_SPINE_DESIGN_EVENT,
  REMOVE_SPINE_DESIGN_EVENT,
  REQUEST_SPINE_STATE_EVENT,
  dispatchSpineState,
  type ApplySpineDesignEventDetail,
  type RequestSpineStateEventDetail,
} from '@/utils/book-cover-spine-events'
import { sampleBookCoverPalette } from '@/utils/book-cover-spine-palette'
import { getFabricCanvasHistoryManager } from '@/utils/fabric-canvas-history'

/** Book cover canvas index (interior pages are 0..n-1). */
const COVER_CANVAS_INDEX = -1
/** Typing in the Spine panel becomes one undo step once it pauses this long. */
const SPINE_HISTORY_DEBOUNCE_MS = 500

type UseBookCoverSpineEventsArgs = {
  canvasByIndexRef: MutableRefObject<Record<number, Canvas>>
  geometryRef: MutableRefObject<{ zones?: BookCoverZones; dimensions?: BookCoverDimensions }>
}

/** Spine panel events → cover canvas. Applies run one at a time; only the latest queued design is applied. */
export function useBookCoverSpineEvents({
  canvasByIndexRef,
  geometryRef,
}: UseBookCoverSpineEventsArgs): void {
  useEffect(() => {
    let pendingDesign: SpineDesign | null = null
    let isApplying = false

    const getCoverCanvas = (): Canvas | null => canvasByIndexRef.current[COVER_CANVAS_INDEX] ?? null
    const getGeometry = (): SpineGeometry | null => {
      const { zones, dimensions } = geometryRef.current
      return zones && dimensions ? { zones, dimensions } : null
    }

    const drainPendingDesigns = async (): Promise<void> => {
      if (isApplying) return
      isApplying = true
      try {
        while (pendingDesign) {
          const design = pendingDesign
          pendingDesign = null
          const canvas = getCoverCanvas()
          const geometry = getGeometry()
          if (!canvas || !geometry) continue

          const history = getFabricCanvasHistoryManager(canvas)
          history?.suspend()
          try {
            await applySpineDesignToCanvas(canvas, design, geometry)
          } catch {
            // Keep the editor usable if a font or image fails to load.
          } finally {
            history?.resume()
            history?.recordSnapshot({ debounceMs: SPINE_HISTORY_DEBOUNCE_MS })
          }
        }
      } finally {
        isApplying = false
      }
    }

    const handleApply = (event: Event): void => {
      const design = (event as CustomEvent<ApplySpineDesignEventDetail>).detail?.design
      if (!design) return
      pendingDesign = design
      void drainPendingDesigns()
    }

    const handleRemove = (): void => {
      pendingDesign = null
      const canvas = getCoverCanvas()
      if (!canvas) return
      const history = getFabricCanvasHistoryManager(canvas)
      history?.suspend()
      removeSpineDesignFromCanvas(canvas)
      history?.resume()
      history?.recordSnapshot()
    }

    const handleRequestState = (event: Event): void => {
      const requestId = (event as CustomEvent<RequestSpineStateEventDetail>).detail?.requestId ?? null
      const canvas = getCoverCanvas()
      const geometry = getGeometry()
      if (!canvas || !geometry) {
        dispatchSpineState({ requestId, isCoverReady: false, design: null, palette: [] })
        return
      }
      dispatchSpineState({
        requestId,
        isCoverReady: true,
        design: readSpineDesignFromCanvas(canvas),
        palette: sampleBookCoverPalette(canvas, geometry.zones, geometry.dimensions, isSpineObject),
      })
    }

    window.addEventListener(APPLY_SPINE_DESIGN_EVENT, handleApply)
    window.addEventListener(REMOVE_SPINE_DESIGN_EVENT, handleRemove)
    window.addEventListener(REQUEST_SPINE_STATE_EVENT, handleRequestState)
    return () => {
      window.removeEventListener(APPLY_SPINE_DESIGN_EVENT, handleApply)
      window.removeEventListener(REMOVE_SPINE_DESIGN_EVENT, handleRemove)
      window.removeEventListener(REQUEST_SPINE_STATE_EVENT, handleRequestState)
    }
  }, [canvasByIndexRef, geometryRef])
}
