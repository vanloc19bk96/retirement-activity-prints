import type { StudioCategory } from '@/types/studio-template.types'

/** Category filter value in the Studio panel (`all` = no filter). */
export type StudioCategoryFilter = StudioCategory | 'all'

/**
 * Single source of truth for category tabs: label + tab order.
 * Adding a category = one entry here plus one union member in
 * `StudioCategory`. Ordered easiest to grasp first.
 */
export const STUDIO_CATEGORIES: { value: StudioCategoryFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'logic', label: 'Logic' },
  { value: 'word', label: 'Word' },
  { value: 'spatial', label: 'Spatial' },
  { value: 'reminiscence', label: 'Reminiscence' },
  { value: 'tracker', label: 'Trackers' },
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
  logic: 'Logic',
  word: 'Word',
  spatial: 'Spatial',
  reminiscence: 'Reminiscence',
  tracker: 'Trackers',
}
