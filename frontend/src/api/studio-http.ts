/**
 * Shared transport for studio content endpoints.
 *
 * Older studio-*.api.ts files carry their own copy of these helpers; new ones
 * build on this module so auth headers and error shapes stay in one place.
 */

interface ApiErrorBody {
  detail?: string | { message?: string }
}

function readStoredUserId(): string | undefined {
  const raw = localStorage.getItem('user')
  if (!raw) return undefined
  try {
    const user = JSON.parse(raw) as { id?: unknown }
    return typeof user.id === 'string' && user.id.trim() ? user.id.trim() : undefined
  } catch {
    return undefined
  }
}

function buildJsonHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = localStorage.getItem('launch_token')?.trim()
  const userId = readStoredUserId()
  if (token) headers.Authorization = `Bearer ${token}`
  if (userId) headers['X-User-Id'] = userId
  return headers
}

async function readError(response: Response, label: string): Promise<Error> {
  const fallback = new Error(`${label} failed (${response.status})`)
  try {
    const body = (await response.json()) as ApiErrorBody
    if (typeof body.detail === 'string' && body.detail.trim()) {
      return new Error(body.detail.trim())
    }
    if (body.detail && typeof body.detail === 'object') {
      const message = body.detail.message?.trim()
      if (message) return new Error(message)
    }
    return fallback
  } catch {
    return fallback
  }
}

/** POST JSON to a studio endpoint and parse the JSON response. */
export async function postStudioJson<TRequest, TResponse>(options: {
  path: string
  body: TRequest
  signal: AbortSignal
  /** Used in the error message the form shows. */
  label: string
}): Promise<TResponse> {
  const { path, body, signal, label } = options
  const response = await fetch(path, {
    method: 'POST',
    signal,
    headers: buildJsonHeaders(),
    body: JSON.stringify(body),
  })

  if (!response.ok) throw await readError(response, label)
  return response.json() as Promise<TResponse>
}
