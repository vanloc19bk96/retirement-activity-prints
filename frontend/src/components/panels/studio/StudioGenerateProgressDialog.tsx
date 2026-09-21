import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { StudioGenerateProgress } from '@/types/studio-template.types'

interface StudioGenerateProgressDialogProps {
  open: boolean
  progress: StudioGenerateProgress | null
  label: string
  onCancel: () => void
  onOpenChange: (open: boolean) => void
}

function resolveProgressPercent(progress: StudioGenerateProgress | null): number | null {
  if (!progress || progress.total <= 0) return null
  return Math.max(0, Math.min(100, Math.round((progress.completed / progress.total) * 100)))
}

export function StudioGenerateProgressDialog({
  open,
  progress,
  label,
  onCancel,
  onOpenChange,
}: StudioGenerateProgressDialogProps): JSX.Element {
  const percent = resolveProgressPercent(progress)
  const isDeterminate = percent != null
  const displayPercent = percent ?? 0
  const isBusy = open && (!isDeterminate || displayPercent < 100)
  // Only instance runs mean “games”; phase totals are internal steps (e.g. AI then layout).
  const statusLine =
    isDeterminate && progress?.countKind === 'instance'
      ? `${progress.completed} of ${progress.total} done`
      : 'Working on it…'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex flex-col gap-6 bg-white p-6 sm:max-w-md dark:bg-slate-900"
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => {
          event.preventDefault()
          onCancel()
        }}
      >
        <DialogHeader className="space-y-2 text-left">
          <DialogTitle className="pr-8 text-base">Creating your pages</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
            This usually takes a few moments. You can cancel anytime, whatever is
            already finished stays in your book.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <p
              className="min-w-0 truncate text-sm font-medium text-foreground"
              aria-live="polite"
              aria-atomic="true"
            >
              {label}
            </p>
            <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
              {displayPercent}%
            </span>
          </div>

          <div
            className="relative h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
            role="progressbar"
            aria-label="Generation progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={displayPercent}
            aria-valuetext={`${displayPercent}%`}
          >
            <div
              className="h-full w-full origin-left rounded-full bg-blue-600 transition-transform duration-150 ease-out dark:bg-blue-500"
              style={{
                transform: `scaleX(${Math.max(displayPercent, isBusy && !isDeterminate ? 30 : 0) / 100})`,
              }}
            />
            {isBusy ? (
              <div
                className="animate-progress-indeterminate-sweep pointer-events-none absolute inset-y-0 left-0 w-1/3 rounded-full bg-gradient-to-r from-transparent via-white/70 to-transparent dark:via-white/40"
                aria-hidden
              />
            ) : null}
          </div>

          <p className="text-xs text-muted-foreground">{statusLine}</p>
        </div>

        <DialogFooter className="sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            className="w-full sm:w-auto sm:min-w-28"
            aria-label="Cancel generation"
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
