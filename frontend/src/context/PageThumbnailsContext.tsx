import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { Dispatch, ReactNode, SetStateAction } from 'react'

export type PageThumbnailsControllerState = {
  isVisible: boolean
  isLoading: boolean
  pageCount: number
  pageKeys: string[]
  activePageIndex: number
  pageWidth: number
  pageHeight: number
  thumbnailUrls: Record<number, string>
  onSelectPage: (pageIndex: number) => void
  onAddPageAfterLast?: () => void
  onRequestThumbnail?: (pageIndex: number) => void
}

const noop = (): void => {}

const DEFAULT_CONTROLLER_STATE: PageThumbnailsControllerState = {
  isVisible: false,
  isLoading: false,
  pageCount: 0,
  pageKeys: [],
  activePageIndex: 0,
  pageWidth: 1,
  pageHeight: 1,
  thumbnailUrls: {},
  onSelectPage: noop,
}

const PageThumbnailsStateContext = createContext<PageThumbnailsControllerState | null>(null)
const PageThumbnailsDispatchContext = createContext<Dispatch<SetStateAction<PageThumbnailsControllerState>> | null>(
  null,
)

type PageThumbnailsProviderProps = {
  children: ReactNode
}

export function PageThumbnailsProvider({ children }: PageThumbnailsProviderProps): JSX.Element {
  const [controllerState, setControllerState] = useState<PageThumbnailsControllerState>(
    DEFAULT_CONTROLLER_STATE,
  )

  const state = useMemo<PageThumbnailsControllerState>(
    () => controllerState,
    [controllerState],
  )

  return (
    <PageThumbnailsDispatchContext.Provider value={setControllerState}>
      <PageThumbnailsStateContext.Provider value={state}>
        {children}
      </PageThumbnailsStateContext.Provider>
    </PageThumbnailsDispatchContext.Provider>
  )
}

export function usePageThumbnails(): PageThumbnailsControllerState {
  const context = useContext(PageThumbnailsStateContext)
  if (!context) {
    throw new Error('usePageThumbnails must be used within a PageThumbnailsProvider')
  }
  return context
}

export function usePageThumbnailsController(nextState: PageThumbnailsControllerState): void {
  const setControllerState = useContext(PageThumbnailsDispatchContext)

  useEffect(() => {
    if (!setControllerState) return
    setControllerState(nextState)
  }, [setControllerState, nextState])

  useEffect(() => {
    if (!setControllerState) return
    return () => {
      setControllerState(DEFAULT_CONTROLLER_STATE)
    }
  }, [setControllerState])
}