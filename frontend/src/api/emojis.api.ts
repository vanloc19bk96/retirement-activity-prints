import type { ListEmojiAssetsResponse } from '@/types/emojis.types'
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

function buildAssetsQuery(params: { q?: string; limit: number; offset: number }): string {
  const search = new URLSearchParams()
  if (params.q?.trim()) search.set('q', params.q.trim())
  search.set('limit', String(params.limit))
  search.set('offset', String(params.offset))
  return search.toString()
}

export const emojisApi = {
  getAssets: async (params: {
    q?: string
    limit?: number
    offset?: number
    signal?: AbortSignal
  }): Promise<ListEmojiAssetsResponse> => {
    const authHeader = getLaunchAuthHeader()
    const query = buildAssetsQuery({
      q: params.q,
      limit: params.limit ?? 40,
      offset: params.offset ?? 0,
    })
    const response = await launchFetch(`/api/emojis/assets?${query}`, {
      method: 'GET',
      headers: authHeader,
      signal: params.signal,
    })
    if (!response.ok) {
      throw await parseError(response)
    }
    return (await response.json()) as ListEmojiAssetsResponse
  },
}
