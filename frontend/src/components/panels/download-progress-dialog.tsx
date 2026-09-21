import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { DownloadProgressStatus } from '@/types/canvas-download.types'

const STATUS_DESCRIPTION: Record<DownloadProgressStatus, string> = {
  idle: 'Preparing files...',
  preparing: 'Preparing files...',
  exporting: 'Exporting selected canvases...',
  packaging: 'Packaging download files...',
  completed: 'Export complete. Your download will start shortly.',
  failed: 'Download failed.',
  cancelled: 'Download cancelled.',
}

interface DownloadProgressDialogProps {
  open: boolean
  isDownloading: boolean
  status: DownloadProgressStatus
  progress: number
  currentLabel: string
  onOpenChange: (isOpen: boolean) => void
  onClose: () => void
}

function getStatusText(status: DownloadProgressStatus): string {
  if (status === 'completed') return 'Completed'
  if (status === 'failed') return 'Failed'
  if (status === 'cancelled') return 'Cancelled'
  return 'In progress'
}

function getBarColorClass(status: DownloadProgressStatus): string {
  if (status === 'failed' || status === 'cancelled') return 'bg-red-600 dark:bg-red-500'
  if (status === 'completed') return 'bg-green-600 dark:bg-green-500'
  return 'bg-blue-600 dark:bg-blue-500'
}

export function DownloadProgressDialog({
  open,
  isDownloading,
  status,
  progress,
  currentLabel,
  onOpenChange,
  onClose,
}: DownloadProgressDialogProps): JSX.Element {
  const isCompleted = status === 'completed'
  const isBusy = isDownloading && !isCompleted && status !== 'failed' && status !== 'cancelled'
  const clampedPercent = Math.max(0, Math.min(100, Math.round(progress)))

  const primaryLine = isCompleted
    ? 'Export complete — starting download...'
    : currentLabel || STATUS_DESCRIPTION[status]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md gap-5 bg-white p-5 dark:bg-slate-900"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader className="space-y-1.5">
          <DialogTitle>Download progress</DialogTitle>
          <DialogDescription>{STATUS_DESCRIPTION[status]}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <p className="truncate text-sm font-medium text-foreground" aria-live="polite" aria-atomic="true">
            {primaryLine}
          </p>

          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-foreground">{getStatusText(status)}</span>
            <span className="rounded-full bg-muted px-2 py-0.5 font-semibold text-foreground">
              {clampedPercent}%
            </span>
          </div>

          <div
            className="relative h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
            role="progressbar"
            aria-label="Download progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={clampedPercent}
            aria-valuetext={`${clampedPercent}%`}
          >
            <div
              className={`h-full rounded-full transition-all duration-150 ${getBarColorClass(status)}`}
              style={{ width: `${clampedPercent}%` }}
            />
            {isBusy && (
              <div
                className="animate-progress-indeterminate-sweep pointer-events-none absolute inset-y-0 left-0 w-1/3 rounded-full bg-gradient-to-r from-transparent via-white/70 to-transparent dark:via-white/40"
                aria-hidden
              />
            )}
          </div>
        </div>

        <DialogFooter className="mt-2 pt-3 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="min-w-24"
            aria-label={isBusy ? 'Cancel download' : 'Close download progress dialog'}
          >
            {isBusy ? 'Cancel' : 'Close'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
