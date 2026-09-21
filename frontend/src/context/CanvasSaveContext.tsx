import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { useToast } from '@/hooks/use-toast'
import { useCanvasSaves } from '@/hooks/use-canvas-saves'
import type { SaveCanvasesRequest } from '@/types/canvases.types'
import { CANVAS_LIVE_EVENT } from '@/utils/canvas-events'

const SKIP_UNSAVED_WARNING_ONCE_KEY = 'skip_unsaved_warning_once'

type CanvasesPayloadGetter = () => SaveCanvasesRequest
type AfterSaveCallback = () => void
type HasUnsavedCheckGetter = () => boolean

const UNSAVED_REFRESH_DEBOUNCE_MS = 150

interface SaveCanvasesOptions {
  /** Skip success toast (e.g. auto-save after settings apply). Errors still toast. */
  quiet?: boolean
  /** POST even when no canvas is dirty (e.g. persist page-count prune after new project). */
  persistIfClean?: boolean
}

interface CanvasSaveContextValue {
  isSaving: boolean
  hasUnsavedChanges: boolean
  error: string | null
  lastSavedAt: Date | null
  saveCanvases: (options?: SaveCanvasesOptions) => Promise<void>
  registerCanvasesPayloadGetter: (getter: CanvasesPayloadGetter) => void
  registerAfterSaveCallback: (callback: AfterSaveCallback) => void
  registerHasUnsavedCheckGetter: (getter: HasUnsavedCheckGetter) => void
  refreshHasUnsavedChanges: () => void
}

const CanvasSaveContext = createContext<CanvasSaveContextValue | null>(null)

interface CanvasSaveProviderProps {
  children: ReactNode
}

export function CanvasSaveProvider({ children }: CanvasSaveProviderProps): JSX.Element {
  const { toast } = useToast()
  const { isSaving, error, saveCanvases } = useCanvasSaves()
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  const payloadGetterRef = useRef<CanvasesPayloadGetter | null>(null)
  const afterSaveCallbackRef = useRef<AfterSaveCallback | null>(null)
  const hasUnsavedCheckGetterRef = useRef<HasUnsavedCheckGetter | null>(null)
  const unsavedRefreshTimerRef = useRef<number | null>(null)

  const isSavingRef = useRef(isSaving)
  isSavingRef.current = isSaving

  const registerCanvasesPayloadGetter = useCallback((getter: CanvasesPayloadGetter) => {
    payloadGetterRef.current = getter
  }, [])

  const registerAfterSaveCallback = useCallback((callback: AfterSaveCallback) => {
    afterSaveCallbackRef.current = callback
  }, [])

  const syncHasUnsavedChanges = useCallback(() => {
    const getter = hasUnsavedCheckGetterRef.current
    if (!getter) {
      setHasUnsavedChanges(false)
      return
    }

    try {
      setHasUnsavedChanges(getter())
    } catch {
      setHasUnsavedChanges(false)
    }
  }, [])

  const refreshHasUnsavedChanges = useCallback(() => {
    if (unsavedRefreshTimerRef.current != null) {
      window.clearTimeout(unsavedRefreshTimerRef.current)
    }

    unsavedRefreshTimerRef.current = window.setTimeout(() => {
      unsavedRefreshTimerRef.current = null
      syncHasUnsavedChanges()
    }, UNSAVED_REFRESH_DEBOUNCE_MS)
  }, [syncHasUnsavedChanges])

  const registerHasUnsavedCheckGetter = useCallback(
    (getter: HasUnsavedCheckGetter) => {
      hasUnsavedCheckGetterRef.current = getter
      syncHasUnsavedChanges()
    },
    [syncHasUnsavedChanges],
  )

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent): void => {
      const skipWarningOnce = sessionStorage.getItem(SKIP_UNSAVED_WARNING_ONCE_KEY) === '1'
      if (skipWarningOnce) {
        sessionStorage.removeItem(SKIP_UNSAVED_WARNING_ONCE_KEY)
        return
      }

      if (isSavingRef.current) return
      if (!payloadGetterRef.current) return

      try {
        const payload = payloadGetterRef.current()
        if (payload.canvases.length === 0) return
      } catch (caught) {
        const error = caught instanceof Error ? caught : null
        if (error?.message === 'No pages to save') return
        // If we cannot compute dirty state, prefer warning the user.
        event.preventDefault()
        event.returnValue = ''
        return
      }

      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [])

  useEffect(() => {
    const handleCanvasLive = (): void => {
      refreshHasUnsavedChanges()
    }

    window.addEventListener(CANVAS_LIVE_EVENT, handleCanvasLive)
    return () => {
      window.removeEventListener(CANVAS_LIVE_EVENT, handleCanvasLive)
      if (unsavedRefreshTimerRef.current != null) {
        window.clearTimeout(unsavedRefreshTimerRef.current)
        unsavedRefreshTimerRef.current = null
      }
    }
  }, [refreshHasUnsavedChanges])

  const saveAllCanvases = useCallback(async (options?: SaveCanvasesOptions) => {
    if (!payloadGetterRef.current) {
      throw new Error('Canvas payload is not ready')
    }

    const payload = payloadGetterRef.current()
    if (payload.canvases.length === 0 && !options?.persistIfClean) {
      syncHasUnsavedChanges()
      // Manual save with nothing dirty previously returned silently — users saw no feedback.
      if (!options?.quiet) {
        toast({
          title: 'Nothing to save',
          description: 'All canvases are already up to date.',
        })
      }
      return
    }

    try {
      await saveCanvases(payload)
      setLastSavedAt(new Date())
      if (!options?.quiet) {
        toast({
          title: 'Canvases saved',
        })
      }

      afterSaveCallbackRef.current?.()
      syncHasUnsavedChanges()
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Failed to save canvases'
      toast({
        title: 'Save failed',
        description: message,
      })
      throw caught
    }
  }, [saveCanvases, syncHasUnsavedChanges, toast])

  const value = useMemo<CanvasSaveContextValue>(
    () => ({
      isSaving,
      hasUnsavedChanges,
      error,
      lastSavedAt,
      saveCanvases: saveAllCanvases,
      registerCanvasesPayloadGetter,
      registerAfterSaveCallback,
      registerHasUnsavedCheckGetter,
      refreshHasUnsavedChanges,
    }),
    [
      error,
      hasUnsavedChanges,
      isSaving,
      lastSavedAt,
      refreshHasUnsavedChanges,
      registerAfterSaveCallback,
      registerCanvasesPayloadGetter,
      registerHasUnsavedCheckGetter,
      saveAllCanvases,
    ],
  )

  return <CanvasSaveContext.Provider value={value}>{children}</CanvasSaveContext.Provider>
}

export function useCanvasSave(): CanvasSaveContextValue {
  const context = useContext(CanvasSaveContext)
  if (!context) {
    throw new Error('useCanvasSave must be used within CanvasSaveProvider')
  }
  return context
}

