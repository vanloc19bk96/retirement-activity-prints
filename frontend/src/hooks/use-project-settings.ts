import { useCallback, useState } from 'react'

import { projectsApi } from '@/api/projects.api'
import type { ProjectSettings, SaveProjectSettingsResponse } from '@/types/projects.types'

interface UseProjectSettingsResult {
  isSaving: boolean
  error: string | null
  saveSettings: (settings: ProjectSettings) => Promise<SaveProjectSettingsResponse>
}

export function useProjectSettings(): UseProjectSettingsResult {
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const saveSettings = useCallback(async (settings: ProjectSettings) => {
    setIsSaving(true)
    setError(null)

    try {
      const result = await projectsApi.saveSettings(settings)
      return result
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Failed to save settings'
      setError(message)
      throw caught
    } finally {
      setIsSaving(false)
    }
  }, [])

  return { isSaving, error, saveSettings }
}

