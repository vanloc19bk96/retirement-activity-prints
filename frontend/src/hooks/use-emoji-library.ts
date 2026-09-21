import { emojisApi } from '@/api/emojis.api'
import { usePaginatedLibrary } from '@/hooks/use-paginated-library'

const PAGE_SIZE = 48

export function useEmojiLibrary() {
  return usePaginatedLibrary({
    isEnabled: true,
    pageSize: PAGE_SIZE,
    loadPage: emojisApi.getAssets,
    initialErrorMessage: 'Failed to load emojis',
    moreErrorMessage: 'Failed to load more emojis',
  })
}
