import { useCallback, useEffect, useRef, useState } from 'react'

import { DEFAULT_SPINE_DESIGN, type SpineDesign } from '@/types/book-cover-spine.types'
import {
  dispatchApplySpineDesign,
  dispatchRemoveSpineDesign,
  dispatchRequestSpineState,
  onSpineState,
} from '@/utils/book-cover-spine-events'
import { readableTextColor } from '@/utils/book-cover-spine-palette'

/** Typing settles this long before the cover re-renders the spine. */
const APPLY_DEBOUNCE_MS = 180
/** The cover canvas mounts a moment after cover mode opens; ask again until it answers. */
const COVER_RETRY_MS = 400
const COVER_MAX_RETRIES = 10

export interface UseSpineDesignResult {
  design: SpineDesign
  palette: string[]
  isCoverReady: boolean
  /** True once the panel has read the spine from the cover canvas. */
  isLoaded: boolean
  updateDesign: (patch: Partial<SpineDesign>) => void
  /** Explicit text color pick; stops automatic contrast matching. */
  setTextColor: (color: string) => void
  refreshPalette: () => void
  removeDesign: () => void
}

/** Spine panel state, kept in sync with the spine objects on the cover canvas. */
export function useSpineDesign(isOpen: boolean): UseSpineDesignResult {
  const [design, setDesign] = useState<SpineDesign>(DEFAULT_SPINE_DESIGN)
  const [palette, setPalette] = useState<string[]>([])
  const [isCoverReady, setIsCoverReady] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)

  const designRef = useRef(design)
  designRef.current = design
  const isTextColorTouchedRef = useRef(false)
  const applyTimerRef = useRef<number | null>(null)
  const requestIdRef = useRef(0)
  /** Which request should replace the form (vs. only refresh the palette). */
  const loadRequestIdRef = useRef<number | null>(null)

  const requestState = useCallback((loadDesign: boolean): void => {
    requestIdRef.current += 1
    if (loadDesign) loadRequestIdRef.current = requestIdRef.current
    dispatchRequestSpineState(requestIdRef.current)
  }, [])

  useEffect(() => {
    return onSpineState((detail) => {
      if (detail.requestId == null || detail.requestId !== requestIdRef.current) return
      setIsCoverReady(detail.isCoverReady)
      if (!detail.isCoverReady) return
      setPalette(detail.palette)
      if (loadRequestIdRef.current !== detail.requestId) return
      loadRequestIdRef.current = null
      // A saved design already has the colors the user chose.
      isTextColorTouchedRef.current = detail.design != null
      setDesign(detail.design ?? DEFAULT_SPINE_DESIGN)
      setIsLoaded(true)
    })
  }, [])

  // Re-read the spine each time the panel opens: canvas edits, undo and page
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
      dispatchApplySpineDesign(designRef.current)
    }, APPLY_DEBOUNCE_MS)
  }, [])

  const updateDesign = useCallback(
    (patch: Partial<SpineDesign>): void => {
      const next = { ...designRef.current, ...patch }
      const backgroundChanged =
        patch.backgroundColor !== undefined || patch.backgroundMode !== undefined
      if (backgroundChanged && !isTextColorTouchedRef.current) {
        next.textColor =
          next.backgroundMode === 'color' ? readableTextColor(next.backgroundColor) : '#111111'
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

  const refreshPalette = useCallback((): void => requestState(false), [requestState])

  const removeDesign = useCallback((): void => {
    if (applyTimerRef.current != null) window.clearTimeout(applyTimerRef.current)
    applyTimerRef.current = null
    isTextColorTouchedRef.current = false
    designRef.current = DEFAULT_SPINE_DESIGN
    setDesign(DEFAULT_SPINE_DESIGN)
    dispatchRemoveSpineDesign()
  }, [])

  return {
    design,
    palette,
    isCoverReady,
    isLoaded,
    updateDesign,
    setTextColor,
    refreshPalette,
    removeDesign,
  }
}
