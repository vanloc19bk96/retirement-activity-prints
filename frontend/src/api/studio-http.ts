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

/** A studio endpoint's error, with the HTTP status it came back with. */
export class StudioHttpError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'StudioHttpError'
    this.status = status
  }
}

/**
 * The service refused the request itself (422) — a typed occupation no page
 * can be written for, say. Asking again gets the same answer, so callers stop.
 */
export const isStudioRefusal = (error: unknown): boolean =>
  error instanceof StudioHttpError && error.status === 422

function buildJsonHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json', ...launchAuthHeaders() }
}

async function readError(response: Response, label: string): Promise<Error> {
  const fallback = new StudioHttpError(`${label} failed (${response.status})`, response.status)
  try {
    const body = (await response.json()) as ApiErrorBody
    if (typeof body.detail === 'string' && body.detail.trim()) {
      return new StudioHttpError(body.detail.trim(), response.status)
    }
    if (body.detail && typeof body.detail === 'object') {
      const message = body.detail.message?.trim()
      if (message) return new StudioHttpError(message, response.status)
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
