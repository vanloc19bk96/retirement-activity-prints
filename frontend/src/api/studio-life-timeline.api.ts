import type {
  LifeTimelineRequest,
  LifeTimelineResponse,
} from '@/types/studio-life-timeline.types'

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
    return new Error(`Life timeline generation failed (${response.status})`)
  } catch {
    return new Error(`Life timeline generation failed (${response.status})`)
  }
}

export async function generateLifePrompts(
  req: LifeTimelineRequest,
  signal: AbortSignal,
): Promise<LifeTimelineResponse> {
  const response = await fetch('/api/studio/life-prompts', {
    method: 'POST',
    signal,
    headers: buildJsonHeaders(),
    body: JSON.stringify(req),
  })

  if (!response.ok) {
    throw await parseError(response)
  }
  return response.json() as Promise<LifeTimelineResponse>
}
