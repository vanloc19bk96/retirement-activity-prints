import { useCallback, useState } from 'react'

import { coverApi } from '@/api/cover.api'
import type { GenerateCoverPayload, GenerateCoverResult } from '@/types/cover.types'

type UseGenerateCoverResult = {
  isGenerating: boolean
  error: string | null
  generateCover: (payload: GenerateCoverPayload) => Promise<GenerateCoverResult>
  resetError: () => void
}

export function useGenerateCover(): UseGenerateCoverResult {
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generateCover = useCallback(async (payload: GenerateCoverPayload) => {
    setIsGenerating(true)
    setError(null)
    try {
      return await coverApi.generateCover(payload)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Failed to generate cover'
      setError(message)
      throw caught
    } finally {
      setIsGenerating(false)
    }
  }, [])

  const resetError = useCallback(() => {
    setError(null)
  }, [])

  return { isGenerating, error, generateCover, resetError }
}
