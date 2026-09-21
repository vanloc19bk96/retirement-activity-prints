import type {
  ListPageSizeOptionsResponse,
  ProjectSettings,
  SaveProjectSettingsResponse,
} from '@/types/projects.types'

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

export const projectsApi = {
  getSettings: async (): Promise<ProjectSettings | null> => {
    const authHeader = getLaunchAuthHeader()
    const response = await fetch('/api/projects/settings', {
      method: 'GET',
      headers: authHeader,
    })

    if (response.status === 404) return null

    if (!response.ok) {
      throw await parseError(response)
    }

    const body = (await response.json()) as SaveProjectSettingsResponse
    return body.settings
  },

  getPageSizeOptions: async (): Promise<ListPageSizeOptionsResponse> => {
    const authHeader = getLaunchAuthHeader()
    const response = await fetch('/api/projects/page-size-options', {
      method: 'GET',
      headers: authHeader,
    })

    if (!response.ok) {
      throw await parseError(response)
    }

    return (await response.json()) as ListPageSizeOptionsResponse
  },

  saveSettings: async (settings: ProjectSettings): Promise<SaveProjectSettingsResponse> => {
    const authHeader = getLaunchAuthHeader()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (authHeader) Object.assign(headers, authHeader)

    const response = await fetch('/api/projects/settings', {
      method: 'POST',
      headers,
      body: JSON.stringify(settings),
    })

    if (!response.ok) {
      throw await parseError(response)
    }

    return (await response.json()) as SaveProjectSettingsResponse
  },
}

