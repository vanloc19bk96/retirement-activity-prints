import { useEffect, useRef, useState } from 'react'

import { projectsApi } from '@/api/projects.api'
import type { ProjectSettings } from '@/types/projects.types'

interface UseProjectSettingsSyncResult {
  isLoading: boolean
  error: string | null
  projectSettings: ProjectSettings | null
}

export function useProjectSettingsSync(defaultProjectSettings: ProjectSettings): UseProjectSettingsSyncResult {
  const defaultSettingsRef = useRef<ProjectSettings | null>(null)
  if (!defaultSettingsRef.current) defaultSettingsRef.current = defaultProjectSettings

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [projectSettings, setProjectSettings] = useState<ProjectSettings | null>(null)

  useEffect(() => {
    let cancelled = false

    async function ensureProjectSettings(): Promise<void> {
      setIsLoading(true)
      setError(null)

      try {
        const existing = await projectsApi.getSettings()
        if (existing) {
          if (!cancelled) setProjectSettings(existing)
          return
        }

        const saved = await projectsApi.saveSettings(defaultSettingsRef.current!)
        if (!cancelled) setProjectSettings(saved.settings)
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : 'Failed to load project settings'
        if (!cancelled) setError(message)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void ensureProjectSettings()

    return () => {
      cancelled = true
    }
  }, [])

  return { isLoading, error, projectSettings }
}

