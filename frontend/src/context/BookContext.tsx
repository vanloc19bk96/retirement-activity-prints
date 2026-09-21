import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

interface BookContextValue {
  bookId: string | null
  setBookId: (bookId: string) => void
}

const BookContext = createContext<BookContextValue | null>(null)

interface BookProviderProps {
  children: ReactNode
}

export function BookProvider({ children }: BookProviderProps): JSX.Element {
  const [bookId, setBookIdState] = useState<string | null>(null)

  const setBookId = useCallback((nextBookId: string): void => {
    const trimmed = nextBookId.trim()
    if (!trimmed) return
    setBookIdState(trimmed)
  }, [])

  const value = useMemo<BookContextValue>(
    () => ({
      bookId,
      setBookId,
    }),
    [bookId, setBookId],
  )

  return <BookContext.Provider value={value}>{children}</BookContext.Provider>
}

export function useBook(): BookContextValue {
  const context = useContext(BookContext)
  if (!context) {
    throw new Error('useBook must be used within BookProvider')
  }
  return context
}
