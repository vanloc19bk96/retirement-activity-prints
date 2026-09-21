import { memo } from 'react'
import { Lock } from 'lucide-react'
import { getPlanLockedTooltip } from '@/constants/plan-lock-tooltips'
import { cn } from '@/lib/utils'
import type { StudioTemplateDefinition } from '@/types/studio-template.types'

interface Props {
  template: StudioTemplateDefinition
  isLocked?: boolean
  onSelect: () => void
}

function StudioTemplateCardBase({ template, isLocked = false, onSelect }: Props) {
  const card = (
    <button
      type="button"
      onClick={onSelect}
      disabled={isLocked}
      aria-disabled={isLocked}
      title={isLocked ? undefined : template.description}
      className={cn(
        'group relative flex h-full w-full flex-col items-center gap-1.5 rounded-lg border border-border p-2 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isLocked
          ? 'cursor-not-allowed opacity-50'
          : 'hover:border-primary hover:bg-accent',
      )}
    >
      {isLocked ? (
        <span
          className="absolute right-1.5 top-1.5 rounded-full bg-background/90 p-1 text-muted-foreground shadow-sm"
          aria-hidden
        >
          <Lock className="h-3 w-3" />
        </span>
      ) : null}
      <div
        className="aspect-[8/5] w-full rounded bg-muted p-2 text-foreground/70 [&>svg]:h-full [&>svg]:w-full group-hover:text-foreground"
        dangerouslySetInnerHTML={{ __html: template.thumbnail }}
      />
      <span className="line-clamp-2 w-full text-xs font-medium leading-tight">
        {template.label}
      </span>
      {template.pageCount === 2 ? (
        <span className="w-full text-[10px] text-muted-foreground">2-page spread</span>
      ) : null}
    </button>
  )

  // A disabled button swallows hover events, so the lock tooltip lives on a
  // wrapper (same pattern as the "Build a book" tab).
  if (!isLocked) return card
  return (
    <span className="block" title={getPlanLockedTooltip(template.label, 'standard')}>
      {card}
    </span>
  )
}

export const StudioTemplateCard = memo(StudioTemplateCardBase)
