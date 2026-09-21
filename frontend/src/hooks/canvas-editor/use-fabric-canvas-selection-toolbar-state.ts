import { useCallback, useMemo, useState } from 'react'
import type { CanvasSelectionFloatingToolbarPosition } from '@/components/layout/CanvasSelectionFloatingToolbar'

export type SelectionFloatingToolbarState = {
  position: CanvasSelectionFloatingToolbarPosition | null
  canDelete: boolean
  canGroup: boolean
  canUngroup: boolean
  isLocked: boolean
  isTextSelection: boolean
}

const INITIAL_STATE: SelectionFloatingToolbarState = {
  position: null,
  canDelete: false,
  canGroup: false,
  canUngroup: false,
  isLocked: false,
  isTextSelection: false,
}

export type SelectionFloatingToolbarStateApi = {
  state: SelectionFloatingToolbarState
  patch: (partial: Partial<SelectionFloatingToolbarState>) => void
  reset: () => void
}

function isSameToolbarState(
  previous: SelectionFloatingToolbarState,
  next: SelectionFloatingToolbarState,
): boolean {
  return (
    previous.position === next.position &&
    previous.canDelete === next.canDelete &&
    previous.canGroup === next.canGroup &&
    previous.canUngroup === next.canUngroup &&
    previous.isLocked === next.isLocked &&
    previous.isTextSelection === next.isTextSelection
  )
}

/**
 * Combines the floating-toolbar UI state into a single atomic object. Callers
 * patch a subset of keys to match the exact behavior of the previous individual
 * setters.
 *
 * `patch` is idempotent: if the partial update produces a shallow-equal state,
 * no re-render is scheduled. This is required because the initial `position`
 * is a structural reference (can be `null`) and callers may patch the same
 * values from effects, which would otherwise cause a render loop.
 */
export function useFabricCanvasSelectionToolbarState(): SelectionFloatingToolbarStateApi {
  const [state, setState] = useState<SelectionFloatingToolbarState>(INITIAL_STATE)

  const patch = useCallback((partial: Partial<SelectionFloatingToolbarState>): void => {
    setState((previous) => {
      const next = { ...previous, ...partial }
      return isSameToolbarState(previous, next) ? previous : next
    })
  }, [])

  const reset = useCallback((): void => {
    setState((previous) => (isSameToolbarState(previous, INITIAL_STATE) ? previous : INITIAL_STATE))
  }, [])

  return useMemo(() => ({ state, patch, reset }), [state, patch, reset])
}
