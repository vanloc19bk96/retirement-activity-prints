import { useCallback, useState } from 'react'

import { canvasesApi } from '@/api/canvases.api'
import type { SaveCanvasesRequest, SaveCanvasesResponse } from '@/types/canvases.types'

interface UseCanvasSavesResult {
  isSaving: boolean
  error: string | null
  saveCanvases: (payload: SaveCanvasesRequest) => Promise<SaveCanvasesResponse>
}

export function useCanvasSaves(): UseCanvasSavesResult {
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const saveCanvases = useCallback(async (payload: SaveCanvasesRequest) => {
    setIsSaving(true)
    setError(null)

    try {
      return await canvasesApi.saveCanvasesBatch(payload)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Failed to save canvases'
      setError(message)
      throw caught
    } finally {
      setIsSaving(false)
    }
  }, [])

  return { isSaving, error, saveCanvases }
}

