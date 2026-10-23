import type { GetCanvasesResponse, SaveCanvasesRequest, SaveCanvasesResponse } from '@/types/canvases.types'
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

export const canvasesApi = {
  saveCanvasesBatch: async (payload: SaveCanvasesRequest): Promise<SaveCanvasesResponse> => {
    const authHeader = getLaunchAuthHeader()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (authHeader) Object.assign(headers, authHeader)

    const response = await launchFetch('/api/canvases/batch', {
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
    const response = await launchFetch('/api/canvases', {
      method: 'GET',
      headers: authHeader,
    })

    if (!response.ok) {
      throw await parseError(response)
    }

    return (await response.json()) as GetCanvasesResponse
  },
}

