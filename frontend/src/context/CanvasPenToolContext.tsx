import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

export type CanvasDrawingToolId = 'none' | 'pen' | 'pencil' | 'erase'

type CanvasPenToolContextValue = {
  activeDrawingTool: CanvasDrawingToolId
  setActiveDrawingTool: (tool: CanvasDrawingToolId) => void
  isPenToolActive: boolean
  isPencilToolActive: boolean
  isEraseToolActive: boolean
  setPenToolActive: (value: boolean) => void
  togglePenTool: () => void
  togglePencilTool: () => void
  toggleEraseTool: () => void
  eraseBrushSize: number
  setEraseBrushSize: (size: number) => void
}

const CanvasPenToolContext = createContext<CanvasPenToolContextValue | null>(null)

export function CanvasPenToolProvider({ children }: { children: ReactNode }): JSX.Element {
  const [activeDrawingTool, setActiveDrawingToolState] = useState<CanvasDrawingToolId>('none')
  const [eraseBrushSize, setEraseBrushSizeState] = useState(24)

  const setActiveDrawingTool = useCallback((tool: CanvasDrawingToolId) => {
    setActiveDrawingToolState(tool)
  }, [])

  const setPenToolActive = useCallback((value: boolean) => {
    setActiveDrawingToolState(value ? 'pen' : 'none')
  }, [])

  const togglePenTool = useCallback(() => {
    setActiveDrawingToolState((t) => (t === 'pen' ? 'none' : 'pen'))
  }, [])

  const togglePencilTool = useCallback(() => {
    setActiveDrawingToolState((t) => (t === 'pencil' ? 'none' : 'pencil'))
  }, [])

  const toggleEraseTool = useCallback(() => {
    setActiveDrawingToolState((t) => (t === 'erase' ? 'none' : 'erase'))
  }, [])

  const setEraseBrushSize = useCallback((size: number) => {
    setEraseBrushSizeState(Math.max(2, Math.min(200, size)))
  }, [])

  const isPenToolActive = activeDrawingTool === 'pen'
  const isPencilToolActive = activeDrawingTool === 'pencil'
  const isEraseToolActive = activeDrawingTool === 'erase'

  const value = useMemo(
    () => ({
      activeDrawingTool,
      setActiveDrawingTool,
      isPenToolActive,
      isPencilToolActive,
      isEraseToolActive,
      setPenToolActive,
      togglePenTool,
      togglePencilTool,
      toggleEraseTool,
      eraseBrushSize,
      setEraseBrushSize,
    }),
    [
      activeDrawingTool,
      setActiveDrawingTool,
      isPenToolActive,
      isPencilToolActive,
      isEraseToolActive,
      setPenToolActive,
      togglePenTool,
      togglePencilTool,
      toggleEraseTool,
      eraseBrushSize,
      setEraseBrushSize,
    ],
  )

  return <CanvasPenToolContext.Provider value={value}>{children}</CanvasPenToolContext.Provider>
}

export function useCanvasPenTool(): CanvasPenToolContextValue {
  const ctx = useContext(CanvasPenToolContext)
  if (!ctx) {
    throw new Error('useCanvasPenTool must be used within CanvasPenToolProvider')
  }
  return ctx
}
