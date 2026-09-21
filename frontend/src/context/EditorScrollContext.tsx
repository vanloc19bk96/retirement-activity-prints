import { createContext, useContext, type ReactNode, type RefObject } from 'react'

const EditorScrollRootContext = createContext<RefObject<HTMLElement | null> | null>(null)

type EditorScrollRootProviderProps = {
  scrollRootRef: RefObject<HTMLElement | null>
  children: ReactNode
}

/** Supplies the editor's main scroll container for per-page IntersectionObserver roots. */
export function EditorScrollRootProvider({
  scrollRootRef,
  children,
}: EditorScrollRootProviderProps): JSX.Element {
  return (
    <EditorScrollRootContext.Provider value={scrollRootRef}>
      {children}
    </EditorScrollRootContext.Provider>
  )
}

export function useEditorScrollRootRef(): RefObject<HTMLElement | null> | null {
  return useContext(EditorScrollRootContext)
}
