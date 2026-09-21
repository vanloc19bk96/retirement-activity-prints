import { STUDIO_CATEGORIES } from '@/constants/studio-categories'
import { cn } from '@/lib/utils'
import { FieldShell } from './fields/FieldShell'
import { STUDIO_FIELD_INPUT_CLASS } from './fields/field-input-classes'
import { STUDIO_BOOK_MAX_GAMES } from '@/utils/studio/studio-book-plan'
import type { StudioCategory } from '@/types/studio-template.types'

interface Props {
  gameCount: number
  categories: StudioCategory[]
  onGameCountChange: (value: number) => void
  onToggleCategory: (category: StudioCategory) => void
}

const CATEGORY_OPTIONS = STUDIO_CATEGORIES.filter(
  (c): c is { value: StudioCategory; label: string } => c.value !== 'all',
)

export function StudioBookRandomForm({
  gameCount,
  categories,
  onGameCountChange,
  onToggleCategory,
}: Props) {
  return (
    <div className="space-y-4">
      <FieldShell
        htmlFor="book-game-count"
        label="Number of games"
        help="How many puzzles to add. Answer keys are added automatically."
      >
        <input
          id="book-game-count"
          type="number"
          min={1}
          max={STUDIO_BOOK_MAX_GAMES}
          step={1}
          value={gameCount}
          onChange={(e) => onGameCountChange(Number(e.target.value) || 1)}
          className={STUDIO_FIELD_INPUT_CLASS}
        />
      </FieldShell>

      <FieldShell
        label="Draw from"
        help="Leave them all off to use every category."
      >
        <div className="flex flex-wrap gap-1" role="group" aria-label="Category filter">
          {CATEGORY_OPTIONS.map((c) => {
            const active = categories.includes(c.value)
            return (
              <button
                key={c.value}
                type="button"
                aria-pressed={active}
                onClick={() => onToggleCategory(c.value)}
                className={cn(
                  'rounded-full px-2.5 py-1 text-xs transition-colors',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80',
                )}
              >
                {c.label}
              </button>
            )
          })}
        </div>
      </FieldShell>
    </div>
  )
}
