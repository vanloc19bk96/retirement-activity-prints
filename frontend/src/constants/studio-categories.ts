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
  { value: 'memory', label: 'Memory' },
  { value: 'focus', label: 'Focus' },
  { value: 'logic', label: 'Logic' },
  { value: 'word', label: 'Word' },
  { value: 'spatial', label: 'Spatial' },
  { value: 'reminiscence', label: 'Reminiscence' },
  { value: 'tracker', label: 'Trackers' },
]

/**
 * Cross-cutting tag filters, shown as chips beside the category tabs.
 *
 * A tag is not a category. The Card Games Pack registers in `logic` and
 * `memory` so the Build-a-book planner keeps an honest cognitive taxonomy,
 * while the chip still gives sellers one click to see the whole pack — and the
 * sales page a "Card Games Pack" bullet (Card Games Pack spec §7).
 */
export const STUDIO_TAG_FILTERS: { value: string; label: string }[] = [
  { value: 'card', label: 'Cards' },
]

/** Category label lookup (used by search so "memory" matches memory games). */
export const STUDIO_CATEGORY_LABELS: Record<StudioCategory, string> = {
  memory: 'Memory',
  focus: 'Focus',
  logic: 'Logic',
  word: 'Word',
  spatial: 'Spatial',
  reminiscence: 'Reminiscence',
  tracker: 'Trackers',
}
