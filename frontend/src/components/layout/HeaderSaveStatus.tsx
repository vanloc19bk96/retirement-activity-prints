import { memo } from 'react'
import { CloudAlert, CloudCheck, CloudUpload, Loader2, type LucideIcon } from 'lucide-react'

import { useCanvasSave } from '@/context/CanvasSaveContext'

interface HeaderSaveStatusProps {
  /** Light header uses `bg-primary`; text needs light-on-blue styles. */
  isOnBlueHeader: boolean
}

interface SaveStatusView {
  label: string
  Icon: LucideIcon
  isSpinning?: boolean
  isWarning?: boolean
}

function formatSavedTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/** Auto-save state next to the app name: saving, unsaved, failed (retrying) or all saved. */
function HeaderSaveStatusComponent({ isOnBlueHeader }: HeaderSaveStatusProps): JSX.Element {
  const { isSaving, hasUnsavedChanges, error, lastSavedAt } = useCanvasSave()

  const view: SaveStatusView = isSaving
    ? { label: 'Saving…', Icon: Loader2, isSpinning: true }
    : error && hasUnsavedChanges
      ? { label: 'Save failed, retrying', Icon: CloudAlert, isWarning: true }
      : hasUnsavedChanges
        ? { label: 'Unsaved changes', Icon: CloudUpload }
        : { label: 'All changes saved', Icon: CloudCheck }

  const title = [view.label, error && `Error: ${error}`, lastSavedAt && `Last saved ${formatSavedTime(lastSavedAt)}`]
    .filter(Boolean)
    .join(' · ')

  const toneClassName = view.isWarning
    ? isOnBlueHeader
      ? 'text-amber-200'
      : 'text-destructive-text'
    : isOnBlueHeader
      ? 'text-primary-foreground/75'
      : 'text-muted-foreground'

  return (
    <span
      role="status"
      aria-live="polite"
      title={title}
      className={'inline-flex shrink-0 items-center gap-1.5 text-xs ' + toneClassName}
    >
      <view.Icon className={'h-4 w-4 shrink-0' + (view.isSpinning ? ' animate-spin' : '')} aria-hidden />
      <span className="sr-only sm:not-sr-only">{view.label}</span>
    </span>
  )
}

export const HeaderSaveStatus = memo(HeaderSaveStatusComponent)
