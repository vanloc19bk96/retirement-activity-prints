import { useCallback } from 'react'
import { dispatchStudioWritePage } from '@/utils/studio/studio-events'
import { normalizeFabricCanvasJsonToLogicalSize } from '@/utils/canvas-template'
import type { StudioFabricObject } from '@/types/studio-template.types'
import type { CanvasStateStore } from '@/utils/canvas-state-store'
import type { StudioWritePageOptions } from '@/utils/studio/studio-events'

interface Params {
  canvasStateStore: CanvasStateStore
  pageWidth: number
  pageHeight: number
}

type StoredCanvasJson = {
  version?: string
  objects?: unknown[]
  background?: string
}

/**
 * Writes generated objects whether or not the page Fabric instance is live.
 * Store is durable truth; event syncs live canvas when mounted.
 */
export function useStudioPageWriter({ canvasStateStore, pageWidth, pageHeight }: Params) {
  return useCallback(
    (
      pageIndex: number,
      objects: StudioFabricObject[],
      mode: 'replace' | 'append',
      options?: StudioWritePageOptions,
    ) => {
      const existing =
        mode === 'append'
          ? (canvasStateStore.getSerialized(pageIndex) as StoredCanvasJson | null)
          : null
      const existingObjects = Array.isArray(existing?.objects) ? existing.objects : []
      const logicalSize = { width: pageWidth, height: pageHeight }
      const merged = normalizeFabricCanvasJsonToLogicalSize(
        {
          version: '6.0.0',
          objects: [...existingObjects, ...objects],
          background: '#FFFFFF',
        },
        logicalSize,
      )

      canvasStateStore.setSerialized(pageIndex, merged)
      canvasStateStore.setAuthoringLogicalSize(pageIndex, logicalSize)
      canvasStateStore.markFabricLiveUntrusted(pageIndex)

      if (options?.syncLive === false) return

      dispatchStudioWritePage({ pageIndex, objects, mode, syncLive: true })
    },
    [canvasStateStore, pageHeight, pageWidth],
  )
}
