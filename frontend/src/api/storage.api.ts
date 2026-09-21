import type { UploadImageResponse } from '@/types/storage.types'

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

export const storageApi = {
  uploadImage: async (file: File): Promise<UploadImageResponse> => {
    const formData = new FormData()
    formData.append('file', file)
    const authHeader = getLaunchAuthHeader()

    const response = await fetch('/api/storage/images', {
      method: 'POST',
      headers: authHeader,
      body: formData,
    })

    if (!response.ok) {
      throw await parseError(response)
    }

    return (await response.json()) as UploadImageResponse
  },
}

