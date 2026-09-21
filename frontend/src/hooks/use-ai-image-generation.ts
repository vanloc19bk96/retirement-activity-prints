import { useCallback, useState } from 'react'

import { aiImagesApi } from '@/api/ai-images.api'
import type {
  GenerateInteriorImagesResult,
  GenerateInteriorImagesPayload,
} from '@/types/ai-images.types'

type UseAiImageGenerationResult = {
  isGenerating: boolean
  error: string | null
  generateInteriorImages: (payload: GenerateInteriorImagesPayload) => Promise<GenerateInteriorImagesResult>
  resetError: () => void
}

export function useAiImageGeneration(): UseAiImageGenerationResult {
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generateInteriorImages = useCallback(async (payload: GenerateInteriorImagesPayload) => {
    setIsGenerating(true)
    setError(null)
    try {
      return await aiImagesApi.generateInteriorImages(payload)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Failed to generate interior image'
      setError(message)
      throw caught
    } finally {
      setIsGenerating(false)
    }
  }, [])

  const resetError = useCallback(() => {
    setError(null)
  }, [])

  return { isGenerating, error, generateInteriorImages, resetError }
}
