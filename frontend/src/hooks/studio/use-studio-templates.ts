import { useMemo, useState } from 'react'
import { STUDIO_TEMPLATES } from '@/constants/studio-templates'
import { isStarterStudioTemplate } from '@/constants/studio-plan-access'
import {
  STUDIO_CATEGORY_LABELS,
  STUDIO_TAG_FILTERS,
  type StudioCategoryFilter,
} from '@/constants/studio-categories'
import { isUserStudioTemplateLibraryLimited } from '@/utils/user-plan'
import type { StudioTemplateDefinition } from '@/types/studio-template.types'

/** One card in the Studio grid, with its plan-lock state. */
export interface StudioTemplateListItem {
  template: StudioTemplateDefinition
  isLocked: boolean
}

export function useStudioTemplates(user: { plan: string | null } | null) {
  const [category, setCategory] = useState<StudioCategoryFilter>('all')
  const [tag, setTag] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const isLimited = isUserStudioTemplateLibraryLimited(user)

  const templates = useMemo<StudioTemplateListItem[]>(() => {
    const q = query.trim().toLowerCase()
    const matched = STUDIO_TEMPLATES.filter((t) => {
      if (category !== 'all' && t.category !== category) return false
      if (tag && !t.tags?.includes(tag)) return false
      if (!q) return true
      // Match user-facing copy only — not registry keys (e.g. word-search → Word Search).
      const tagLabels = STUDIO_TAG_FILTERS.filter((filter) =>
        t.tags?.includes(filter.value),
      ).map((filter) => filter.label.toLowerCase())
      return (
        t.label.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        STUDIO_CATEGORY_LABELS[t.category].toLowerCase().includes(q) ||
        tagLabels.some((label) => label.includes(q))
      )
    })

    const items = matched.map<StudioTemplateListItem>((template) => ({
      template,
      isLocked: isLimited && !isStarterStudioTemplate(template.key),
    }))
    if (!isLimited) return items
    // Unlocked cards first, locked ones after — each half keeps registry order,
    // so the grid still reads grouped by category instead of shuffled.
    return [
      ...items.filter((item) => !item.isLocked),
      ...items.filter((item) => item.isLocked),
    ]
  }, [category, tag, query, isLimited])

  return { templates, category, setCategory, tag, setTag, query, setQuery }
}
