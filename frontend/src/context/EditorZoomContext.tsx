import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type MutableRefObject,
  type ReactNode,
} from 'react'

import { clampZoom, DEFAULT_ZOOM } from '@/components/layout/ZoomControl'

type EditorZoomStore = {
  subscribe: (listener: () => void) => () => void
  getZoom: () => number
  getZoomRef: () => MutableRefObject<number>
  setZoom: (level: number) => void
}

function createEditorZoomStore(initialZoom: number): EditorZoomStore {
  let zoom = clampZoom(initialZoom)
  const listeners = new Set<() => void>()
  const zoomRef: MutableRefObject<number> = { current: zoom }

  return {
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getZoom: () => zoom,
    getZoomRef: () => zoomRef,
    setZoom: (level) => {
      const next = clampZoom(level)
      if (next === zoom) return
      zoom = next
      zoomRef.current = next
      listeners.forEach((listener) => listener())
    },
  }
}

const EditorZoomStoreContext = createContext<EditorZoomStore | null>(null)

type EditorZoomProviderProps = {
  zoomLevel: number
  children: ReactNode
}

export function EditorZoomProvider({ zoomLevel, children }: EditorZoomProviderProps): JSX.Element {
  const storeRef = useRef<EditorZoomStore | null>(null)
  if (!storeRef.current) {
    storeRef.current = createEditorZoomStore(zoomLevel)
  }
  const store = storeRef.current

  useLayoutEffect(() => {
    store.setZoom(zoomLevel)
  }, [store, zoomLevel])

  return (
    <EditorZoomStoreContext.Provider value={store}>{children}</EditorZoomStoreContext.Provider>
  )
}

function useEditorZoomStore(): EditorZoomStore {
  const store = useContext(EditorZoomStoreContext)
  if (!store) {
    throw new Error('useEditorZoom must be used within EditorZoomProvider')
  }
  return store
}

/** Subscribe to zoom changes — use only in mounted Fabric surfaces near the viewport. */
export function useEditorZoom(): number {
  const store = useEditorZoomStore()
  return useSyncExternalStore(store.subscribe, store.getZoom, store.getZoom)
}

/** Read the latest zoom without re-rendering when zoom changes. */
export function useEditorZoomRef(): MutableRefObject<number> {
  const store = useEditorZoomStore()
  return store.getZoomRef()
}

export function useOptionalEditorZoomRef(): MutableRefObject<number> {
  const store = useContext(EditorZoomStoreContext)
  const fallbackRef = useRef(DEFAULT_ZOOM)
  if (!store) return fallbackRef
  return store.getZoomRef()
}
