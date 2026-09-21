import type { MutableRefObject } from 'react'
import { useEffect, useRef } from 'react'
import type { Canvas } from 'fabric'

import type { CanvasSelectionInfo } from '@/utils/fabric-selection'

type FabricCanvasCallbacks = {
  onHasSelectionChange: ((hasSelection: boolean) => void) | undefined
  onSelectionInfoChange: ((info: CanvasSelectionInfo) => void) | undefined
  onCanvasReady: ((canvasIndex: number, canvas: Canvas | null) => void) | undefined
  onActiveCanvasChange: ((canvasIndex: number) => void) | undefined
  onIsSelectionLockedChange: ((canvasIndex: number, isLocked: boolean) => void) | undefined
}

export type FabricCanvasCallbackRefs = {
  onHasSelectionChangeRef: MutableRefObject<((hasSelection: boolean) => void) | null>
  onSelectionInfoChangeRef: MutableRefObject<((info: CanvasSelectionInfo) => void) | null>
  onCanvasReadyRef: MutableRefObject<
    ((canvasIndex: number, canvas: Canvas | null) => void) | undefined
  >
  onActiveCanvasChangeRef: MutableRefObject<((canvasIndex: number) => void) | undefined>
  onIsSelectionLockedChangeRef: MutableRefObject<
    ((canvasIndex: number, isLocked: boolean) => void) | undefined
  >
}

/**
 * Mirrors the latest prop callbacks into refs so long-lived effects can call
 * them without re-registering on every render. `onHasSelectionChange` and
 * `onSelectionInfoChange` normalize `undefined` to `null` to match the
 * existing consumer contracts.
 */
export function useFabricCanvasCallbackRefs(
  callbacks: FabricCanvasCallbacks,
): FabricCanvasCallbackRefs {
  const onHasSelectionChangeRef = useRef<((hasSelection: boolean) => void) | null>(null)
  const onSelectionInfoChangeRef = useRef<((info: CanvasSelectionInfo) => void) | null>(null)
  const onCanvasReadyRef = useRef(callbacks.onCanvasReady)
  const onActiveCanvasChangeRef = useRef(callbacks.onActiveCanvasChange)
  const onIsSelectionLockedChangeRef = useRef(callbacks.onIsSelectionLockedChange)

  useEffect(() => {
    onHasSelectionChangeRef.current = callbacks.onHasSelectionChange ?? null
  }, [callbacks.onHasSelectionChange])

  useEffect(() => {
    onSelectionInfoChangeRef.current = callbacks.onSelectionInfoChange ?? null
  }, [callbacks.onSelectionInfoChange])

  useEffect(() => {
    onCanvasReadyRef.current = callbacks.onCanvasReady
    onActiveCanvasChangeRef.current = callbacks.onActiveCanvasChange
    onIsSelectionLockedChangeRef.current = callbacks.onIsSelectionLockedChange
  }, [callbacks.onActiveCanvasChange, callbacks.onCanvasReady, callbacks.onIsSelectionLockedChange])

  return {
    onHasSelectionChangeRef,
    onSelectionInfoChangeRef,
    onCanvasReadyRef,
    onActiveCanvasChangeRef,
    onIsSelectionLockedChangeRef,
  }
}
