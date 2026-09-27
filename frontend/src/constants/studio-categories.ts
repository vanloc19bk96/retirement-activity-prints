import type { StudioCategory } from '@/types/studio-template.types'

/** Category filter value in the Studio panel (`all` = no filter). */
export type StudioCategoryFilter = StudioCategory | 'all'

/**
 * Single source of truth for category tabs: label + tab order.
 * Adding a category = one entry here plus one union member in
 * `StudioCategory`. Puzzles first (most familiar first), then the pages that
 * are played or kept rather than solved.
 */
export const STUDIO_CATEGORIES: { value: StudioCategoryFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'word', label: 'Word' },
  { value: 'logic', label: 'Logic' },
  { value: 'visual', label: 'Visual' },
  { value: 'coloring', label: 'Coloring' },
  { value: 'trivia', label: 'Trivia' },
  { value: 'party', label: 'Party' },
  { value: 'keepsake', label: 'Keepsake' },
]

/**
 * Cross-cutting tag filters, shown as chips beside the category tabs.
 *
 * A tag is not a category. Keep this empty until a pack again needs a
 * one-click filter that cuts across the cognitive taxonomy.
 */
export const STUDIO_TAG_FILTERS: { value: string; label: string }[] = []

/** Category label lookup (used by search so "memory" matches memory games). */
export const STUDIO_CATEGORY_LABELS: Record<StudioCategory, string> = {
  word: 'Word',
  logic: 'Logic',
  visual: 'Visual',
  coloring: 'Coloring',
  trivia: 'Trivia',
  party: 'Party',
  keepsake: 'Keepsake',
}
