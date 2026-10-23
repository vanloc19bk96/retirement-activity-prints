import type {
  ConsumeDownloadQuotaResponse,
  CreatePdfMergeSessionResponse,
  DownloadQuota,
} from '@/types/downloads.types'
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

export const downloadsApi = {
  getQuota: async (): Promise<DownloadQuota> => {
    const authHeader = getLaunchAuthHeader()
    const response = await launchFetch('/api/downloads/quota', {
      method: 'GET',
      headers: authHeader,
    })

    if (!response.ok) {
      throw await parseError(response)
    }

    return (await response.json()) as DownloadQuota
  },

  consumeQuota: async (): Promise<ConsumeDownloadQuotaResponse> => {
    const authHeader = getLaunchAuthHeader()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (authHeader) Object.assign(headers, authHeader)

    const response = await launchFetch('/api/downloads/consume', {
      method: 'POST',
      headers,
    })

    if (!response.ok) {
      throw await parseError(response)
    }

    return (await response.json()) as ConsumeDownloadQuotaResponse
  },

  createPdfMergeSession: async (payload: { chunkCount: number }): Promise<CreatePdfMergeSessionResponse> => {
    const authHeader = getLaunchAuthHeader()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (authHeader) Object.assign(headers, authHeader)

    const response = await launchFetch('/api/downloads/pdf-merge/sessions', {
      method: 'POST',
      headers,
      body: JSON.stringify({ chunk_count: payload.chunkCount }),
    })

    if (!response.ok) {
      throw await parseError(response)
    }

    return (await response.json()) as CreatePdfMergeSessionResponse
  },

  uploadPdfMergeChunk: async (payload: {
    sessionId: string
    chunkIndex: number
    chunkBlob: Blob
  }): Promise<void> => {
    const authHeader = getLaunchAuthHeader()
    const formData = new FormData()
    formData.append('chunk_index', String(payload.chunkIndex))
    formData.append('chunk', payload.chunkBlob, `chunk-${payload.chunkIndex}.pdf`)

    const response = await launchFetch(`/api/downloads/pdf-merge/sessions/${payload.sessionId}/chunks`, {
      method: 'POST',
      headers: authHeader,
      body: formData,
    })

    if (!response.ok) {
      throw await parseError(response)
    }
  },

  finalizePdfMergeSession: async (sessionId: string): Promise<Blob> => {
    const authHeader = getLaunchAuthHeader()
    const headers: Record<string, string> = {}
    if (authHeader) Object.assign(headers, authHeader)

    const response = await launchFetch(`/api/downloads/pdf-merge/sessions/${sessionId}/finalize`, {
      method: 'POST',
      headers,
    })

    if (!response.ok) {
      throw await parseError(response)
    }

    return response.blob()
  },
}
