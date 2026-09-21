import type {
  TitleCompleteRequest,
  TitleCompleteResponse,
} from '@/types/studio-title-complete.types'

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
    return new Error(`Title complete generation failed (${response.status})`)
  } catch {
    return new Error(`Title complete generation failed (${response.status})`)
  }
}

export async function generateTitleComplete(
  req: TitleCompleteRequest,
  signal: AbortSignal,
): Promise<TitleCompleteResponse> {
  const response = await fetch('/api/studio/title-complete', {
    method: 'POST',
    signal,
    headers: buildJsonHeaders(),
    body: JSON.stringify(req),
  })

  if (!response.ok) {
    throw await parseError(response)
  }
  return response.json() as Promise<TitleCompleteResponse>
}
