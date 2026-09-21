import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { CanvasStateStore } from '@/utils/canvas-state-store'

interface StudioTargetValue {
  canvasStateStore: CanvasStateStore
  currentPageIndex: number
  interiorPageCount: number
}

const StudioTargetContext = createContext<StudioTargetValue | null>(null)

interface Props extends StudioTargetValue {
  children: ReactNode
}

export function StudioTargetProvider({
  canvasStateStore,
  currentPageIndex,
  interiorPageCount,
  children,
}: Props) {
  const value = useMemo(
    () => ({ canvasStateStore, currentPageIndex, interiorPageCount }),
    [canvasStateStore, currentPageIndex, interiorPageCount],
  )
  return (
    <StudioTargetContext.Provider value={value}>{children}</StudioTargetContext.Provider>
  )
}

export function useStudioTarget(): StudioTargetValue {
  const ctx = useContext(StudioTargetContext)
  if (!ctx) throw new Error('useStudioTarget must be used inside StudioTargetProvider')
  return ctx
}
