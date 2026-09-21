import type { GenerateTraceImagePayload, GenerateTraceImageResponse } from '@/types/trace-image.types'

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

export const traceImageApi = {
  generate: async (payload: GenerateTraceImagePayload): Promise<GenerateTraceImageResponse> => {
    const authHeaders = getLaunchAuthHeader()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (authHeaders) Object.assign(headers, authHeaders)

    const response = await fetch('/api/trace-image/generate', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })
    if (!response.ok) {
      throw await parseError(response)
    }
    return (await response.json()) as GenerateTraceImageResponse
  },
}
