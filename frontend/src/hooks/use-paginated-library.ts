import { useCallback, useEffect, useRef, useState } from 'react'

interface LibraryItem {
  id: string
}

interface LibraryPage<Item extends LibraryItem> {
  items: Item[]
  nextOffset: number | null
  hasMore: boolean
}

interface LoadPageParams {
  q?: string
  limit: number
  offset: number
  signal: AbortSignal
}

interface PaginatedLibraryOptions<Item extends LibraryItem> {
  query?: string
  isEnabled: boolean
  pageSize: number
  loadPage: (params: LoadPageParams) => Promise<LibraryPage<Item>>
  initialErrorMessage: string
  moreErrorMessage: string
}

interface PaginatedLibraryState<Item extends LibraryItem> {
  items: Item[]
  isLoading: boolean
  isLoadingMore: boolean
  error: string | null
  hasMore: boolean
  nextOffset: number | null
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

export function usePaginatedLibrary<Item extends LibraryItem>({
  query = '',
  isEnabled,
  pageSize,
  loadPage,
  initialErrorMessage,
  moreErrorMessage,
}: PaginatedLibraryOptions<Item>) {
  const normalizedQuery = query.trim()
  const [state, setState] = useState<PaginatedLibraryState<Item>>({
    items: [],
    isLoading: false,
    isLoadingMore: false,
    error: null,
    hasMore: false,
    nextOffset: null,
  })
  const controllerRef = useRef<AbortController | null>(null)
  const requestVersionRef = useRef(0)
  const loadedQueryRef = useRef<string | null>(null)
  const isLoadingMoreRef = useRef(false)
  const itemIdsRef = useRef(new Set<string>())

  const loadFirstPage = useCallback(async () => {
    if (!isEnabled) {
      return
    }

    controllerRef.current?.abort()
    const controller = new AbortController()
    const requestVersion = ++requestVersionRef.current
    controllerRef.current = controller
    isLoadingMoreRef.current = false
    setState((current) => ({
      ...current,
      items: loadedQueryRef.current === normalizedQuery ? current.items : [],
      isLoading: true,
      isLoadingMore: false,
      error: null,
    }))

    try {
      const response = await loadPage({
        q: normalizedQuery || undefined,
        limit: pageSize,
        offset: 0,
        signal: controller.signal,
      })
      if (requestVersion !== requestVersionRef.current) {
        return
      }
      itemIdsRef.current = new Set(response.items.map((item) => item.id))
      loadedQueryRef.current = normalizedQuery
      setState({
        items: response.items,
        isLoading: false,
        isLoadingMore: false,
        error: null,
        hasMore: response.hasMore,
        nextOffset: response.nextOffset,
      })
    } catch (error: unknown) {
      if (requestVersion !== requestVersionRef.current || isAbortError(error)) {
        return
      }
      itemIdsRef.current.clear()
      setState({
        items: [],
        isLoading: false,
        isLoadingMore: false,
        error: error instanceof Error ? error.message : initialErrorMessage,
        hasMore: false,
        nextOffset: null,
      })
    }
  }, [initialErrorMessage, isEnabled, loadPage, normalizedQuery, pageSize])

  useEffect(() => {
    if (!isEnabled) {
      controllerRef.current?.abort()
      requestVersionRef.current += 1
      isLoadingMoreRef.current = false
      setState((current) => ({
        ...current,
        isLoading: false,
        isLoadingMore: false,
      }))
      return
    }
    if (loadedQueryRef.current !== normalizedQuery) {
      void loadFirstPage()
    }
    return () => controllerRef.current?.abort()
  }, [isEnabled, loadFirstPage, normalizedQuery])

  const loadMore = useCallback(async () => {
    if (
      !isEnabled ||
      state.isLoading ||
      state.nextOffset == null ||
      isLoadingMoreRef.current
    ) {
      return
    }

    isLoadingMoreRef.current = true
    const controller = new AbortController()
    const requestVersion = ++requestVersionRef.current
    controllerRef.current?.abort()
    controllerRef.current = controller
    setState((current) => ({ ...current, isLoadingMore: true, error: null }))

    try {
      const response = await loadPage({
        q: normalizedQuery || undefined,
        limit: pageSize,
        offset: state.nextOffset,
        signal: controller.signal,
      })
      if (requestVersion !== requestVersionRef.current) {
        return
      }
      const uniqueItems = response.items.filter((item) => {
        if (itemIdsRef.current.has(item.id)) {
          return false
        }
        itemIdsRef.current.add(item.id)
        return true
      })
      setState((current) => ({
        ...current,
        items: [...current.items, ...uniqueItems],
        isLoadingMore: false,
        hasMore: response.hasMore,
        nextOffset: response.nextOffset,
      }))
    } catch (error: unknown) {
      if (requestVersion === requestVersionRef.current && !isAbortError(error)) {
        setState((current) => ({
          ...current,
          isLoadingMore: false,
          error: error instanceof Error ? error.message : moreErrorMessage,
        }))
      }
    } finally {
      if (requestVersion === requestVersionRef.current) {
        isLoadingMoreRef.current = false
      }
    }
  }, [
    isEnabled,
    loadPage,
    moreErrorMessage,
    normalizedQuery,
    pageSize,
    state.isLoading,
    state.nextOffset,
  ])

  return {
    ...state,
    loadMore,
    reload: loadFirstPage,
  }
}
