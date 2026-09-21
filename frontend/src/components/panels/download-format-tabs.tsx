import { Lock } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { getPlanLockedTooltip } from '@/constants/plan-lock-tooltips'
import { PRO_ONLY_DOWNLOAD_FORMATS, type DownloadFormat } from '@/types/canvas-download.types'

const FORMAT_TAB_ACTIVE_CLASS =
  'border-primary bg-primary text-primary-foreground dark:border-zinc-700 dark:bg-zinc-700 dark:text-zinc-50'
const FORMAT_TAB_INACTIVE_CLASS =
  'border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground dark:hover:bg-zinc-800 dark:hover:text-zinc-100'
const FORMAT_TAB_LOCKED_CLASS =
  'cursor-not-allowed opacity-50 hover:bg-background hover:text-foreground dark:hover:bg-background'

const DOWNLOAD_FORMATS: Array<{ id: DownloadFormat; label: string }> = [
  { id: 'png', label: 'PNG' },
  { id: 'jpg', label: 'JPG' },
  { id: 'pdf', label: 'PDF' },
  { id: 'svg', label: 'SVG' },
  { id: 'ppt', label: 'PPT' },
]

interface DownloadFormatTabsProps {
  format: DownloadFormat
  isProLocked: boolean
  onSelect: (format: DownloadFormat) => void
}

export function DownloadFormatTabs({ format, isProLocked, onSelect }: DownloadFormatTabsProps): JSX.Element {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5" role="group" aria-label="Download format">
      {DOWNLOAD_FORMATS.map((option) => {
        const isActive = format === option.id
        const isLocked = isProLocked && PRO_ONLY_DOWNLOAD_FORMATS.has(option.id)
        const button = (
          <Button
            key={option.id}
            type="button"
            variant={isActive ? 'default' : 'outline'}
            className={`h-9 justify-center gap-1 rounded-md px-3 text-xs transition-colors ${
              isActive ? FORMAT_TAB_ACTIVE_CLASS : FORMAT_TAB_INACTIVE_CLASS
            } ${isLocked ? FORMAT_TAB_LOCKED_CLASS : ''}`}
            aria-label={`Select download format ${option.label}`}
            aria-pressed={isActive}
            aria-disabled={isLocked}
            disabled={isLocked}
            onClick={() => onSelect(option.id)}
          >
            <span className="font-semibold">{option.label}</span>
            {isLocked && <Lock className="h-3 w-3" aria-hidden />}
          </Button>
        )

        if (!isLocked) return button

        return (
          <Tooltip key={option.id}>
            <TooltipTrigger asChild>{button}</TooltipTrigger>
            <TooltipContent side="bottom">{getPlanLockedTooltip('PPT and SVG export', 'pro')}</TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}
