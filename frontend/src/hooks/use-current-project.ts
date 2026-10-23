import { useCallback, useEffect, useState } from 'react'

import { projectsApi } from '@/api/projects.api'
import { getLaunchProject, setLaunchProject, type LaunchProject } from '@/lib/launch-session'

const APP_TITLE = 'Retirement Activity Prints'

interface UseCurrentProjectResult {
  /** The project this tab edits; null outside hub projects. */
  project: LaunchProject | null
  rename: (name: string) => Promise<void>
}

/**
 * The tab's hub project. Its name is re-read when the tab comes back into view, since it
 * may have been renamed in the hub meanwhile, and shown in the browser tab title so tabs on
 * different projects can be told apart.
 */
export function useCurrentProject(enabled: boolean): UseCurrentProjectResult {
  const [project, setProject] = useState<LaunchProject | null>(() => getLaunchProject())

  const reload = useCallback(async () => {
    try {
      const current = await projectsApi.getCurrentProject()
      if (!current.is_hub_project) return
      const next = { id: current.id, name: current.name }
      setLaunchProject(next)
      setProject(next)
    } catch {
      // Keep the last known name; the editor works without it.
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    void reload()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void reload()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [enabled, reload])

  useEffect(() => {
    document.title = project?.name ? `${project.name} – ${APP_TITLE}` : APP_TITLE
  }, [project?.name])

  const rename = useCallback(async (name: string) => {
    const renamed = await projectsApi.renameCurrentProject(name)
    const next = { id: renamed.id, name: renamed.name }
    setLaunchProject(next)
    setProject(next)
  }, [])

  return { project, rename }
}
