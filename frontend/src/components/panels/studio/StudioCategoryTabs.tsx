import {
  STUDIO_CATEGORIES,
  type StudioCategoryFilter,
} from '@/constants/studio-categories'
import { cn } from '@/lib/utils'

interface Props {
  value: StudioCategoryFilter
  onChange: (value: StudioCategoryFilter) => void
}

export function StudioCategoryTabs({ value, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-1" role="tablist" aria-label="Template categories">
      {STUDIO_CATEGORIES.map((c) => (
        <button
          key={c.value}
          type="button"
          role="tab"
          aria-selected={value === c.value}
          onClick={() => onChange(c.value)}
          className={cn(
            'rounded-full px-2.5 py-1 text-xs transition-colors',
            value === c.value
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-muted/80',
          )}
        >
          {c.label}
        </button>
      ))}
    </div>
  )
}
