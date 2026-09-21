import type {
  AiImageJobAcceptedApiResponse,
  AiImageJobStatusApiResponse,
  GenerateImagesApiResponse,
  GenerateInteriorImagesResult,
  GenerateInteriorImagesPayload,
  GeneratedImage,
} from '@/types/ai-images.types'

const POLL_INTERVAL_MS = 1500
const MAX_POLL_DURATION_MS = 12 * 60 * 1000

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

function mapGeneratedImages(body: GenerateImagesApiResponse): GeneratedImage[] {
  return body.images.map((item) => ({
    idea: item.idea ?? null,
    publicUrl: item.public_url,
    bucket: item.bucket,
    path: item.path,
  }))
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function buildAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const authHeaders = getLaunchAuthHeader()
  if (authHeaders) Object.assign(headers, authHeaders)
  return headers
}

async function submitInteriorImageJob(payload: GenerateInteriorImagesPayload): Promise<string> {
  const response = await fetch('/api/ai-images/interior/jobs', {
    method: 'POST',
    headers: buildAuthHeaders(),
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    throw await parseError(response)
  }
  const body = (await response.json()) as AiImageJobAcceptedApiResponse
  if (!body.job_id) {
    throw new Error('Invalid job response: missing job id')
  }
  return body.job_id
}

async function pollImageJobUntilCompleted(jobId: string): Promise<GenerateImagesApiResponse> {
  const startedAt = Date.now()
  while (Date.now() - startedAt <= MAX_POLL_DURATION_MS) {
    const response = await fetch(`/api/ai-images/jobs/${jobId}`, {
      method: 'GET',
      headers: buildAuthHeaders(),
    })
    if (!response.ok) {
      throw await parseError(response)
    }

    const body = (await response.json()) as AiImageJobStatusApiResponse
    if (body.status === 'finished') {
      if (!body.result) {
        throw new Error('Job finished without result')
      }
      return body.result
    }
    if (body.status === 'failed') {
      throw new Error(body.error ?? 'AI image generation failed')
    }
    await sleep(POLL_INTERVAL_MS)
  }
  throw new Error('AI image generation timed out while polling job status')
}

export const aiImagesApi = {
  generateInteriorImages: async (
    payload: GenerateInteriorImagesPayload,
  ): Promise<GenerateInteriorImagesResult> => {
    const jobId = await submitInteriorImageJob(payload)
    const body = await pollImageJobUntilCompleted(jobId)
    return {
      images: mapGeneratedImages(body),
    }
  },
}
