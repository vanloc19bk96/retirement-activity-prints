import type { GetCanvasesResponse, SaveCanvasesRequest, SaveCanvasesResponse } from '@/types/canvases.types'

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

export const canvasesApi = {
  saveCanvasesBatch: async (payload: SaveCanvasesRequest): Promise<SaveCanvasesResponse> => {
    const authHeader = getLaunchAuthHeader()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (authHeader) Object.assign(headers, authHeader)

    const response = await fetch('/api/canvases/batch', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      throw await parseError(response)
    }

    return (await response.json()) as SaveCanvasesResponse
  },

  getCanvases: async (): Promise<GetCanvasesResponse> => {
    const authHeader = getLaunchAuthHeader()
    const response = await fetch('/api/canvases', {
      method: 'GET',
      headers: authHeader,
    })

    if (!response.ok) {
      throw await parseError(response)
    }

    return (await response.json()) as GetCanvasesResponse
  },
}

