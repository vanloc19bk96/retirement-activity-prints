import type {
  CurrentProject,
  ListPageSizeOptionsResponse,
  ProjectSettings,
  SaveProjectSettingsResponse,
} from '@/types/projects.types'
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

export const projectsApi = {
  getSettings: async (): Promise<ProjectSettings | null> => {
    const authHeader = getLaunchAuthHeader()
    const response = await launchFetch('/api/projects/settings', {
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
    const response = await launchFetch('/api/projects/page-size-options', {
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

    const response = await launchFetch('/api/projects/settings', {
      method: 'POST',
      headers,
      body: JSON.stringify(settings),
    })

    if (!response.ok) {
      throw await parseError(response)
    }

    return (await response.json()) as SaveProjectSettingsResponse
  },

  getCurrentProject: async (): Promise<CurrentProject> => {
    const response = await launchFetch('/api/projects/current', { method: 'GET' })
    if (!response.ok) {
      throw await parseError(response)
    }
    return (await response.json()) as CurrentProject
  },

  renameCurrentProject: async (name: string): Promise<CurrentProject> => {
    const response = await launchFetch('/api/projects/current', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!response.ok) {
      throw await parseError(response)
    }
    return (await response.json()) as CurrentProject
  },
}

