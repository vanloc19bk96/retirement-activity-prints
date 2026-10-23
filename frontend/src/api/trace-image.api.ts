import type { GenerateTraceImagePayload, GenerateTraceImageResponse } from '@/types/trace-image.types'
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

export const traceImageApi = {
  generate: async (payload: GenerateTraceImagePayload): Promise<GenerateTraceImageResponse> => {
    const authHeaders = getLaunchAuthHeader()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (authHeaders) Object.assign(headers, authHeaders)

    const response = await launchFetch('/api/trace-image/generate', {
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
