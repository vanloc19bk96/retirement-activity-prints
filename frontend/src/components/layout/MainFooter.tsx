import type { ReactNode } from 'react'
import { BookOpen, FileText, Grid3x3, Lock, Trash2 } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { ZoomControl } from './ZoomControl'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { getPlanLockedTooltip } from '@/constants/plan-lock-tooltips'
import { cn } from '@/lib/utils'

export type MainFooterProps = {
  isInteriorMode: boolean
  onToggleInteriorMode: (next: boolean) => void
  isStarterPlanLocked: boolean
  zoomLevel: number
  onZoomChange: (level: number) => void
  /** 1-based page the editor is on (interior mode). */
  currentPage: number
  totalPages: number
  onRemoveCanvas?: () => void
  showCanvasGrid: boolean
  onShowCanvasGridChange: (next: boolean) => void
}

const FOOTER_GROUP_CLASS = 'flex h-8 items-center rounded-lg border border-border bg-muted/50'

function ModeButton({
  isSelected,
  disabled,
  onClick,
  children,
}: {
  isSelected: boolean
  disabled: boolean
  onClick: () => void
  children: ReactNode
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={isSelected}
      className={cn(
        'inline-flex h-full items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none',
        isSelected
          ? 'bg-card text-primary-text shadow-sm dark:bg-accent dark:text-accent-foreground'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

export function MainFooter({
  isInteriorMode,
  onToggleInteriorMode,
  isStarterPlanLocked,
  zoomLevel,
  onZoomChange,
  currentPage,
  totalPages,
  onRemoveCanvas,
  showCanvasGrid,
  onShowCanvasGridChange,
}: MainFooterProps): JSX.Element {
  const removeCanvasLabel = isInteriorMode ? 'Reset to one blank page' : 'Clear the cover'

  return (
    <TooltipProvider delayDuration={120}>
      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border bg-card px-4 py-1.5 sm:px-6">
        <span className="text-xs font-medium tabular-nums text-muted-foreground" aria-live="polite">
          {isInteriorMode ? (
            <>
              Page <span className="text-foreground">{currentPage}</span> of {totalPages}
            </>
          ) : (
            'Book cover'
          )}
        </span>

        <div className="flex flex-wrap items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(FOOTER_GROUP_CLASS, 'gap-2 px-2.5', isStarterPlanLocked && 'cursor-not-allowed opacity-60')}
                role="group"
                aria-label="Canvas grid overlay"
              >
                <Grid3x3 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="text-xs font-medium text-muted-foreground">Grid</span>
                <Switch
                  checked={showCanvasGrid}
                  onCheckedChange={onShowCanvasGridChange}
                  aria-label="Show canvas grid"
                  disabled={isStarterPlanLocked}
                />
                {isStarterPlanLocked && (
                  <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                )}
              </div>
            </TooltipTrigger>
            {isStarterPlanLocked && (
              <TooltipContent side="top">
                {getPlanLockedTooltip('Canvas grid overlay', 'standard')}
              </TooltipContent>
            )}
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(FOOTER_GROUP_CLASS, 'gap-0.5 p-0.5', isStarterPlanLocked && 'cursor-not-allowed opacity-60')}
                role="group"
                aria-label="Canvas mode"
              >
                <ModeButton
                  isSelected={!isInteriorMode}
                  disabled={isStarterPlanLocked}
                  onClick={() => onToggleInteriorMode(false)}
                >
                  <BookOpen className="h-3.5 w-3.5" aria-hidden />
                  Cover
                </ModeButton>
                <ModeButton
                  isSelected={isInteriorMode}
                  disabled={isStarterPlanLocked}
                  onClick={() => onToggleInteriorMode(true)}
                >
                  <FileText className="h-3.5 w-3.5" aria-hidden />
                  Interior
                </ModeButton>
                {isStarterPlanLocked && (
                  <Lock className="mx-1.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                )}
              </div>
            </TooltipTrigger>
            {isStarterPlanLocked && (
              <TooltipContent side="top">
                {getPlanLockedTooltip('Book cover mode', 'standard')}
              </TooltipContent>
            )}
          </Tooltip>

          <div className={cn(FOOTER_GROUP_CLASS, 'px-1')}>
            <ZoomControl zoomLevel={zoomLevel} onZoomChange={onZoomChange} />
          </div>

          {onRemoveCanvas ? (
            <>
              <span className="mx-1 h-5 w-px bg-border" aria-hidden />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive-text"
                    onClick={onRemoveCanvas}
                    aria-label={removeCanvasLabel}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">{removeCanvasLabel}</TooltipContent>
              </Tooltip>
            </>
          ) : null}
        </div>
      </footer>
    </TooltipProvider>
  )
}
