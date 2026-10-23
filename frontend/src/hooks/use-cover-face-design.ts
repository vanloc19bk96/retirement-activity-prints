import { useCallback, useEffect, useRef, useState } from 'react'

import {
  DEFAULT_COVER_FACE_DESIGNS,
  type CoverFace,
  type CoverFaceDesign,
} from '@/types/book-cover-face.types'
import {
  dispatchApplyCoverFaceDesign,
  dispatchRemoveCoverFaceDesign,
  dispatchRequestCoverFaceState,
  onCoverFaceState,
} from '@/utils/book-cover-face-events'
import { readableTextColor } from '@/utils/book-cover-spine-palette'

/** Typing settles this long before the cover re-renders. */
const APPLY_DEBOUNCE_MS = 180
/** The cover canvas mounts a moment after cover mode opens; ask again until it answers. */
const COVER_RETRY_MS = 400
const COVER_MAX_RETRIES = 10

/** Shared across hook instances so one panel never takes another's reply. */
let lastRequestId = 0

export interface UseCoverFaceDesignResult {
  design: CoverFaceDesign
  palette: string[]
  isCoverReady: boolean
  /** True once the panel has read the face from the cover canvas. */
  isLoaded: boolean
  /** Some text was dragged on the canvas, away from its automatic spot. */
  hasManualPositions: boolean
  updateDesign: (patch: Partial<CoverFaceDesign>) => void
  /** Explicit text color pick; stops automatic contrast matching. */
  setTextColor: (color: string) => void
  /** Snap dragged text back to the automatic layout. */
  resetPositions: () => void
  refreshPalette: () => void
  removeDesign: () => void
}

/** Front / Back cover panel state, kept in sync with that face's objects on the cover canvas. */
export function useCoverFaceDesign(face: CoverFace, isOpen: boolean): UseCoverFaceDesignResult {
  const [design, setDesign] = useState<CoverFaceDesign>(DEFAULT_COVER_FACE_DESIGNS[face])
  const [palette, setPalette] = useState<string[]>([])
  const [isCoverReady, setIsCoverReady] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)
  const [hasManualPositions, setHasManualPositions] = useState(false)

  const designRef = useRef(design)
  designRef.current = design
  const isTextColorTouchedRef = useRef(false)
  const resetPositionsRef = useRef(false)
  const applyTimerRef = useRef<number | null>(null)
  const requestIdsRef = useRef(new Set<number>())
  /** Which request should replace the form (vs. only refresh the palette). */
  const loadRequestIdRef = useRef<number | null>(null)

  const requestState = useCallback(
    (loadDesign: boolean): void => {
      lastRequestId += 1
      requestIdsRef.current.add(lastRequestId)
      if (loadDesign) loadRequestIdRef.current = lastRequestId
      dispatchRequestCoverFaceState({ requestId: lastRequestId, face })
    },
    [face],
  )

  useEffect(() => {
    return onCoverFaceState((detail) => {
      if (!requestIdsRef.current.delete(detail.requestId)) return
      setIsCoverReady(detail.isCoverReady)
      if (!detail.isCoverReady) return
      setPalette(detail.palette)
      setHasManualPositions(detail.hasManualPositions)
      if (loadRequestIdRef.current !== detail.requestId) return
      loadRequestIdRef.current = null
      // A saved design already has the colors the user chose.
      isTextColorTouchedRef.current = detail.design != null
      setDesign(detail.design ?? DEFAULT_COVER_FACE_DESIGNS[face])
      setIsLoaded(true)
    })
  }, [face])

  // Re-read the face each time the panel opens: canvas edits, undo and page
  // count changes may have moved it since.
  useEffect(() => {
    if (!isOpen) return
    let attempts = 0
    let timer: number | null = null
    const ask = (): void => {
      requestState(true)
      attempts += 1
      timer = window.setTimeout(() => {
        if (loadRequestIdRef.current != null && attempts < COVER_MAX_RETRIES) ask()
      }, COVER_RETRY_MS)
    }
    ask()
    return () => {
      if (timer != null) window.clearTimeout(timer)
    }
  }, [isOpen, requestState])

  useEffect(() => {
    return () => {
      if (applyTimerRef.current != null) window.clearTimeout(applyTimerRef.current)
    }
  }, [])

  const scheduleApply = useCallback((): void => {
    if (applyTimerRef.current != null) window.clearTimeout(applyTimerRef.current)
    applyTimerRef.current = window.setTimeout(() => {
      applyTimerRef.current = null
      const resetPositions = resetPositionsRef.current
      resetPositionsRef.current = false
      dispatchApplyCoverFaceDesign({ face, design: designRef.current, resetPositions })
    }, APPLY_DEBOUNCE_MS)
  }, [face])

  const updateDesign = useCallback(
    (patch: Partial<CoverFaceDesign>): void => {
      const next = { ...designRef.current, ...patch }
      const backgroundChanged =
        patch.backgroundColor !== undefined || patch.backgroundMode !== undefined
      if (backgroundChanged && patch.textColor === undefined && !isTextColorTouchedRef.current) {
        if (next.backgroundMode === 'color') {
          next.textColor = readableTextColor(next.backgroundColor)
        } else if (next.backgroundMode === 'image') {
          // White with a soft shadow reads on most photos.
          next.textColor = '#ffffff'
          next.textShadow = true
        } else {
          next.textColor = '#111111'
        }
      }
      designRef.current = next
      setDesign(next)
      scheduleApply()
    },
    [scheduleApply],
  )

  const setTextColor = useCallback(
    (color: string): void => {
      isTextColorTouchedRef.current = true
      updateDesign({ textColor: color })
    },
    [updateDesign],
  )

  const resetPositions = useCallback((): void => {
    resetPositionsRef.current = true
    setHasManualPositions(false)
    scheduleApply()
  }, [scheduleApply])

  const refreshPalette = useCallback((): void => requestState(false), [requestState])

  const removeDesign = useCallback((): void => {
    if (applyTimerRef.current != null) window.clearTimeout(applyTimerRef.current)
    applyTimerRef.current = null
    isTextColorTouchedRef.current = false
    resetPositionsRef.current = false
    designRef.current = DEFAULT_COVER_FACE_DESIGNS[face]
    setDesign(designRef.current)
    setHasManualPositions(false)
    dispatchRemoveCoverFaceDesign(face)
  }, [face])

  return {
    design,
    palette,
    isCoverReady,
    isLoaded,
    hasManualPositions,
    updateDesign,
    setTextColor,
    resetPositions,
    refreshPalette,
    removeDesign,
  }
}
