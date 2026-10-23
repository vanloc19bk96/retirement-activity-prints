import type {
  MissingVowelsRequest,
  MissingVowelsResponse,
} from '@/types/studio-missing-vowels.types'
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
    return new Error(`Missing vowels generation failed (${response.status})`)
  } catch {
    return new Error(`Missing vowels generation failed (${response.status})`)
  }
}

export async function generateMissingVowels(
  req: MissingVowelsRequest,
  signal: AbortSignal,
): Promise<MissingVowelsResponse> {
  const response = await launchFetch('/api/studio/missing-vowels', {
    method: 'POST',
    signal,
    headers: buildJsonHeaders(),
    body: JSON.stringify(req),
  })

  if (!response.ok) {
    throw await parseError(response)
  }
  return response.json() as Promise<MissingVowelsResponse>
}
