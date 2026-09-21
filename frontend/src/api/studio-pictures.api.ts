import type {
  PictureSetRequest,
  PictureSetResponse,
} from '@/types/studio-pictures.types'

/** Book builds can briefly hit the per-minute quota; wait and retry instead of skipping games. */
const PICTURE_RATE_LIMIT_RETRIES = 4
const PICTURE_RATE_LIMIT_BACKOFF_MS = [3_000, 6_000, 12_000, 20_000] as const

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
    return new Error(`Picture set failed (${response.status})`)
  } catch {
    return new Error(`Picture set failed (${response.status})`)
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const timerId = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timerId)
      signal.removeEventListener('abort', onAbort)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

export async function fetchPictureSet(
  req: PictureSetRequest,
  signal: AbortSignal,
): Promise<PictureSetResponse> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= PICTURE_RATE_LIMIT_RETRIES; attempt++) {
    if (signal.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }

    const response = await fetch('/api/studio/pictures', {
      method: 'POST',
      signal,
      headers: buildJsonHeaders(),
      body: JSON.stringify(req),
    })

    if (response.ok) {
      return response.json() as Promise<PictureSetResponse>
    }

    lastError = await parseError(response)
    const canRetry =
      response.status === 429 && attempt < PICTURE_RATE_LIMIT_RETRIES
    if (!canRetry) throw lastError

    const waitMs = PICTURE_RATE_LIMIT_BACKOFF_MS[attempt] ?? 20_000
    await sleep(waitMs, signal)
  }

  throw lastError ?? new Error('Picture set failed')
}
