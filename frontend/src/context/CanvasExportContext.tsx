import { createContext, useCallback, useContext, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'

import type { CanvasExportSourceFactory } from '@/types/canvas-export-plan.types'

export type CanvasesExportRequest = {
  interiorPageIndices: number[]
  includeCover: boolean
}

export type CanvasExportItem = {
  page_index: number
  canvas_type: 'interior' | 'cover'
  canvas_data: Record<string, unknown>
}

interface CanvasExportContextValue {
  createExportSource: (request: CanvasesExportRequest) => Promise<import('@/types/canvas-export-plan.types').CanvasExportSource>
  registerExportSourceFactory: (factory: CanvasExportSourceFactory) => void
}

const CanvasExportContext = createContext<CanvasExportContextValue | null>(null)

interface CanvasExportProviderProps {
  children: ReactNode
}

export function CanvasExportProvider({ children }: CanvasExportProviderProps): JSX.Element {
  const factoryRef = useRef<CanvasExportSourceFactory | null>(null)

  const registerExportSourceFactory = useCallback((factory: CanvasExportSourceFactory) => {
    factoryRef.current = factory
  }, [])

  const createExportSource = useCallback(async (request: CanvasesExportRequest) => {
    const factory = factoryRef.current
    if (!factory) {
      throw new Error('Canvas export source factory is not ready')
    }
    return Promise.resolve(factory(request))
  }, [])

  const value = useMemo<CanvasExportContextValue>(
    () => ({
      createExportSource,
      registerExportSourceFactory,
    }),
    [createExportSource, registerExportSourceFactory],
  )

  return <CanvasExportContext.Provider value={value}>{children}</CanvasExportContext.Provider>
}

export function useCanvasExport(): CanvasExportContextValue {
  const context = useContext(CanvasExportContext)
  if (!context) {
    throw new Error('useCanvasExport must be used within CanvasExportProvider')
  }
  return context
}
