import type { GenerateCoverPayload, GenerateCoverResult } from '@/types/cover.types'

function getLaunchAuthHeader(): Record<string, string> | undefined {
  const userStr = localStorage.getItem('user')
  let userId: string | undefined
  if (userStr) {
    try {
      const user = JSON.parse(userStr) as { id?: unknown }
      if (typeof user.id === 'string' && user.id.trim()) userId = user.id.trim()
    } catch {
      userId = undefined
    }
  }

  const token = localStorage.getItem('launch_token')?.trim()
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (userId) headers['X-User-Id'] = userId
  return Object.keys(headers).length > 0 ? headers : undefined
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
    const response = await fetch('/api/cover/generate', {
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
