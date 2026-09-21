import { useCallback, useState } from 'react'

import { storageApi } from '@/api/storage.api'
import type { UploadImageResponse } from '@/types/storage.types'

interface UseUploadImageResult {
  uploaded: UploadImageResponse | null
  isUploading: boolean
  error: string | null
  uploadImage: (file: File) => Promise<UploadImageResponse>
  reset: () => void
}

export function useUploadImage(): UseUploadImageResult {
  const [uploaded, setUploaded] = useState<UploadImageResponse | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = useCallback(() => {
    setUploaded(null)
    setError(null)
    setIsUploading(false)
  }, [])

  const uploadImage = useCallback(async (file: File) => {
    if (!file) {
      throw new Error('File is required')
    }

    setIsUploading(true)
    setError(null)
    try {
      const result = await storageApi.uploadImage(file)
      setUploaded(result)
      return result
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Upload failed'
      setError(message)
      throw caught
    } finally {
      setIsUploading(false)
    }
  }, [])

  return { uploaded, isUploading, error, uploadImage, reset }
}

