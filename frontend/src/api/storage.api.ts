import type { UploadImageResponse } from '@/types/storage.types'
import { launchAuthHeaders, launchFetch } from '@/lib/launch-session'

async function parseError(response: Response): Promise<Error> {
  try {
    const body = (await response.json()) as { detail?: unknown }
    const detail = typeof body.detail === 'string' ? body.detail : null
    return new Error(detail ?? `Request failed (${response.status})`)
  } catch {
    return new Error(`Request failed (${response.status})`)
  }
}

function getLaunchAuthHeader(): Record<string, string> | undefined {
  return launchAuthHeaders()
}

export const storageApi = {
  uploadImage: async (file: File): Promise<UploadImageResponse> => {
    const formData = new FormData()
    formData.append('file', file)
    const authHeader = getLaunchAuthHeader()

    const response = await launchFetch('/api/storage/images', {
      method: 'POST',
      headers: authHeader,
      body: formData,
    })

    if (!response.ok) {
      throw await parseError(response)
    }

    return (await response.json()) as UploadImageResponse
  },
}

