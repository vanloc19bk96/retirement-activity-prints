import { outlinesApi } from '@/api/outlines.api'
import { usePaginatedLibrary } from '@/hooks/use-paginated-library'

const PAGE_SIZE = 40

interface UseOutlineLibraryOptions {
  query: string
  isEnabled: boolean
}

export function useOutlineLibrary({ query, isEnabled }: UseOutlineLibraryOptions) {
  return usePaginatedLibrary({
    query,
    isEnabled,
    pageSize: PAGE_SIZE,
    loadPage: outlinesApi.getAssets,
    initialErrorMessage: 'Failed to load photos',
    moreErrorMessage: 'Failed to load more photos',
  })
}
