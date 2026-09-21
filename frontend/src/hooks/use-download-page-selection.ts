import { useCallback, useEffect, useMemo, useState } from 'react'

type UseDownloadPageSelectionOptions = {
  pageCount: number
  onEmptySelectionBlocked?: () => void
}

export type UseDownloadPageSelectionResult = {
  pageList: number[]
  selectedPageIndices: number[]
  safePageCount: number
  isAllSelected: boolean
  isSomeSelected: boolean
  toggleSelectAll: (checked: boolean) => void
  togglePage: (pageIndex: number, checked: boolean) => void
}

function buildAllPages(pageCount: number): number[] {
  return Array.from({ length: pageCount }, (_, pageIndex) => pageIndex)
}

export function useDownloadPageSelection({
  pageCount,
  onEmptySelectionBlocked,
}: UseDownloadPageSelectionOptions): UseDownloadPageSelectionResult {
  const safePageCount = Math.max(1, pageCount)
  const [selectedPageIndices, setSelectedPageIndices] = useState<number[]>(() => buildAllPages(safePageCount))

  // Keep selection valid when pages are added/removed (load project, delete page).
  useEffect(() => {
    setSelectedPageIndices((prev) => {
      const next = prev.filter((index) => index >= 0 && index < safePageCount)
      if (next.length === 0) return buildAllPages(safePageCount)
      const isUnchanged = next.length === prev.length && next.every((value, idx) => value === prev[idx])
      return isUnchanged ? prev : next
    })
  }, [safePageCount])

  const pageList = useMemo(() => buildAllPages(safePageCount), [safePageCount])
  const isAllSelected = selectedPageIndices.length === safePageCount
  const isSomeSelected = selectedPageIndices.length > 0 && !isAllSelected

  const toggleSelectAll = useCallback(
    (checked: boolean) => {
      if (!checked) {
        onEmptySelectionBlocked?.()
        setSelectedPageIndices([0])
        return
      }
      setSelectedPageIndices(buildAllPages(safePageCount))
    },
    [onEmptySelectionBlocked, safePageCount],
  )

  const togglePage = useCallback(
    (pageIndex: number, checked: boolean) => {
      setSelectedPageIndices((prev) => {
        if (checked) {
          if (prev.includes(pageIndex)) return prev
          return [...prev, pageIndex].sort((a, b) => a - b)
        }

        if (!prev.includes(pageIndex)) return prev
        if (prev.length === 1) {
          onEmptySelectionBlocked?.()
          return prev
        }
        return prev.filter((index) => index !== pageIndex)
      })
    },
    [onEmptySelectionBlocked],
  )

  return {
    pageList,
    selectedPageIndices,
    safePageCount,
    isAllSelected,
    isSomeSelected,
    toggleSelectAll,
    togglePage,
  }
}
