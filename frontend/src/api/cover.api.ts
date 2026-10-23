import type { GenerateCoverPayload, GenerateCoverResult } from '@/types/cover.types'
import { launchAuthHeaders, launchFetch } from '@/lib/launch-session'

function getLaunchAuthHeader(): Record<string, string> | undefined {
  return launchAuthHeaders()
}

function buildJsonHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const authHeaders = getLaunchAuthHeader()
  if (authHeaders) Object.assign(headers, authHeaders)
  return headers
}

async function parseError(response: Response): Promise<Error> {
  try {
    const body = (await response.json()) as {
      detail?: string | { message?: string }
    }
    if (typeof body.detail === 'string') {
      return new Error(body.detail)
    }
    if (body.detail && typeof body.detail === 'object' && body.detail.message) {
      return new Error(body.detail.message)
    }
    return new Error(`Request failed (${response.status})`)
  } catch {
    return new Error(`Request failed (${response.status})`)
  }
}

export const coverApi = {
  generateCover: async (payload: GenerateCoverPayload): Promise<GenerateCoverResult> => {
    const response = await launchFetch('/api/cover/generate', {
      method: 'POST',
      headers: buildJsonHeaders(),
      body: JSON.stringify(payload),
    })
    if (!response.ok) {
      throw await parseError(response)
    }
    const body = (await response.json()) as {
      success: boolean
      imageUrl?: string
      image_url?: string
      generationId?: string
      generation_id?: string
    }
    const imageUrl = body.imageUrl ?? body.image_url
    const generationId = body.generationId ?? body.generation_id
    if (!imageUrl || !generationId) {
      throw new Error('Invalid cover generation response')
    }
    return { imageUrl, generationId }
  },
}
