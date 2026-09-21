import { createContext, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

interface EditorModeContextValue {
  isInteriorMode: boolean
  setIsInteriorMode: (next: boolean) => void
  isBookCoverMode: boolean
}

const EditorModeContext = createContext<EditorModeContextValue | null>(null)

interface EditorModeProviderProps {
  children: ReactNode
}

export function EditorModeProvider({ children }: EditorModeProviderProps): JSX.Element {
  const [isInteriorMode, setIsInteriorMode] = useState(true)

  const value = useMemo<EditorModeContextValue>(
    () => ({
      isInteriorMode,
      setIsInteriorMode,
      isBookCoverMode: !isInteriorMode,
    }),
    [isInteriorMode],
  )

  return <EditorModeContext.Provider value={value}>{children}</EditorModeContext.Provider>
}

export function useEditorMode(): EditorModeContextValue {
  const context = useContext(EditorModeContext)
  if (!context) {
    throw new Error('useEditorMode must be used within an EditorModeProvider')
  }
  return context
}
