/**
 * Shared transport for studio content endpoints.
 *
 * Older studio-*.api.ts files carry their own copy of these helpers; new ones
 * build on this module so auth headers and error shapes stay in one place.
 */

import { launchAuthHeaders, launchFetch } from '@/lib/launch-session'

interface ApiErrorBody {
  detail?: string | { message?: string }
}

function buildJsonHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json', ...launchAuthHeaders() }
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
  const response = await launchFetch(path, {
    method: 'POST',
    signal,
    headers: buildJsonHeaders(),
    body: JSON.stringify(body),
  })

  if (!response.ok) throw await readError(response, label)
  return response.json() as Promise<TResponse>
}
