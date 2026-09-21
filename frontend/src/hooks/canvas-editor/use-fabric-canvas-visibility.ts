import type { MutableRefObject, RefObject } from 'react'
import { useEffect, useRef, useState } from 'react'
import type { Canvas } from 'fabric'

import { useEditorScrollRootRef } from '@/context/EditorScrollContext'

/** Pre-warm restore ~2 page rows before they enter the editor scroll port. */
const VERTICAL_ACTIVATION_MARGIN_PX = 2000
/**
 * Dispose only once a page is several rows outside the scroll port. Must exceed
 * activation so short scroll hops (e.g. page 1 → 2 → 1) never thrash init/dispose.
 */
const VERTICAL_DEACTIVATION_MARGIN_PX = 8000

const ACTIVATION_ROOT_MARGIN = `${VERTICAL_ACTIVATION_MARGIN_PX}px 0px ${VERTICAL_ACTIVATION_MARGIN_PX}px 0px`
const DEACTIVATION_ROOT_MARGIN = `${VERTICAL_DEACTIVATION_MARGIN_PX}px 0px ${VERTICAL_DEACTIVATION_MARGIN_PX}px 0px`

type UseFabricCanvasVisibilityOptions = {
  containerRef: RefObject<HTMLDivElement | null>
  fabricCanvasRef: RefObject<Canvas | null>
  isBookCover: boolean
  /** Called after the container becomes visible to resync Fabric dimensions/zoom. */
  onVisibleSyncDimensions: () => void
}

export type FabricCanvasVisibility = {
  isActive: boolean
  /** Tracks the near-viewport IntersectionObserver result; used to skip work when offscreen. */
  isIntersectingRef: MutableRefObject<boolean>
}

function isIntersectingExpandedVerticalRoot(
  target: Element,
  root: Element | null,
  verticalMarginPx: number,
): boolean {
  const rootRect =
    root?.getBoundingClientRect() ??
    ({
      top: 0,
      bottom: window.innerHeight,
    } as Pick<DOMRectReadOnly, 'top' | 'bottom'>)

  const targetRect = target.getBoundingClientRect()
  const expandedTop = rootRect.top - verticalMarginPx
  const expandedBottom = rootRect.bottom + verticalMarginPx
  return targetRect.bottom > expandedTop && targetRect.top < expandedBottom
}

export function useFabricCanvasVisibility({
  containerRef,
  fabricCanvasRef,
  isBookCover,
  onVisibleSyncDimensions,
}: UseFabricCanvasVisibilityOptions): FabricCanvasVisibility {
  const scrollRootRef = useEditorScrollRootRef()
  const [isActive, setIsActive] = useState(isBookCover)
  const isIntersectingRef = useRef(isBookCover)
  const onVisibleSyncDimensionsRef = useRef(onVisibleSyncDimensions)
  onVisibleSyncDimensionsRef.current = onVisibleSyncDimensions

  useEffect(() => {
    // Book cover is a single canvas and always stays mounted.
    if (isBookCover) {
      isIntersectingRef.current = true
      return
    }

    const el = containerRef.current
    if (!el) return

    const scrollRoot = scrollRootRef?.current ?? null

    const syncActiveStateFromGeometry = (): void => {
      const isNearScrollPort = isIntersectingExpandedVerticalRoot(
        el,
        scrollRoot,
        VERTICAL_ACTIVATION_MARGIN_PX,
      )
      const isWithinKeepAliveBand = isIntersectingExpandedVerticalRoot(
        el,
        scrollRoot,
        VERTICAL_DEACTIVATION_MARGIN_PX,
      )

      isIntersectingRef.current = isNearScrollPort

      if (isNearScrollPort) {
        setIsActive(true)
        return
      }

      if (!isWithinKeepAliveBand) {
        setIsActive(false)
      }
    }

    syncActiveStateFromGeometry()

    const observerRoot = scrollRoot

    const activateObserver = new IntersectionObserver(
      ([entry]) => {
        isIntersectingRef.current = entry.isIntersecting
        if (entry.isIntersecting) {
          setIsActive(true)
          requestAnimationFrame(() => {
            onVisibleSyncDimensionsRef.current()
          })
        }
      },
      { root: observerRoot, rootMargin: ACTIVATION_ROOT_MARGIN },
    )
    activateObserver.observe(el)

    const deactivateObserver = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          setIsActive(false)
        }
      },
      { root: observerRoot, rootMargin: DEACTIVATION_ROOT_MARGIN },
    )
    deactivateObserver.observe(el)

    return () => {
      activateObserver.disconnect()
      deactivateObserver.disconnect()
    }
  }, [containerRef, isBookCover, scrollRootRef])

  useEffect(() => {
    if (!isBookCover) return
    const el = containerRef.current
    if (!el) return

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        fabricCanvasRef.current?.requestRenderAll()
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [containerRef, fabricCanvasRef, isBookCover])

  return {
    isActive,
    isIntersectingRef,
  }
}
