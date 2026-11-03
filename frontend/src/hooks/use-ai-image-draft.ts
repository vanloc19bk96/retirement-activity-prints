import { useEffect, useRef, useState } from 'react'

import { projectsApi } from '@/api/projects.api'
import type { AiImageDraft } from '@/types/projects.types'

const SAVE_DELAY_MS = 600

/**
 * Restores the AI image form when the project opens, then keeps the project's copy current.
 * Nothing is saved until the stored draft has been read, so a failed read cannot overwrite it.
 */
export function useAiImageDraft(
  draft: AiImageDraft,
  isEnabled: boolean,
  onLoaded: (draft: AiImageDraft) => void,
): void {
  const [isLoaded, setIsLoaded] = useState(false)
  const onLoadedRef = useRef(onLoaded)
  onLoadedRef.current = onLoaded
  const savedJsonRef = useRef<string | null>(null)
  const draftRef = useRef(draft)
  draftRef.current = draft

  useEffect(() => {
    if (!isEnabled) return
    let cancelled = false
    projectsApi
      .getAiImageDraft()
      .then((stored) => {
        if (cancelled) return
        if (stored) onLoadedRef.current(stored)
        setIsLoaded(true)
      })
      .catch((caught) => {
        // eslint-disable-next-line no-console
        console.error('ai_image_draft_load_failed', caught)
      })
    return () => {
      cancelled = true
    }
  }, [isEnabled])

  const draftJson = JSON.stringify(draft)

  useEffect(() => {
    if (!isLoaded) return
    // The first render after loading shows what is already stored.
    if (savedJsonRef.current === null) {
      savedJsonRef.current = draftJson
      return
    }
    if (savedJsonRef.current === draftJson) return

    const timer = window.setTimeout(() => {
      projectsApi
        .saveAiImageDraft(draftRef.current)
        .then(() => {
          savedJsonRef.current = draftJson
        })
        .catch((caught) => {
          // eslint-disable-next-line no-console
          console.error('ai_image_draft_save_failed', caught)
        })
    }, SAVE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [draftJson, isLoaded])

  useEffect(() => {
    if (!isLoaded) return
    const flush = (): void => {
      if (savedJsonRef.current === JSON.stringify(draftRef.current)) return
      void projectsApi.saveAiImageDraft(draftRef.current, { keepalive: true }).catch(() => undefined)
    }
    window.addEventListener('pagehide', flush)
    return () => window.removeEventListener('pagehide', flush)
  }, [isLoaded])
}
