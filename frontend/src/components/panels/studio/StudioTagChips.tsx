import { STUDIO_TAG_FILTERS } from '@/constants/studio-categories'
import { cn } from '@/lib/utils'

interface Props {
  value: string | null
  onChange: (value: string | null) => void
}

/**
 * Cross-cutting tag filters, beside the category tabs.
 *
 * Deliberately a second row rather than another tab: a tag can span
 * categories while the Build-a-book planner keeps a real cognitive taxonomy.
 * Clicking an active chip clears it.
 */
export function StudioTagChips({ value, onChange }: Props) {
  if (STUDIO_TAG_FILTERS.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label="Template tags">
      {STUDIO_TAG_FILTERS.map((tag) => {
        const isActive = value === tag.value
        return (
          <button
            key={tag.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(isActive ? null : tag.value)}
            className={cn(
              'rounded-full border px-2.5 py-1 text-xs transition-colors',
              isActive
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-background text-muted-foreground hover:bg-muted',
            )}
          >
            {tag.label}
          </button>
        )
      })}
    </div>
  )
}
