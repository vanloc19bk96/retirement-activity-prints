import { BookOpen, FileText, Grid3x3, Lock } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { ZoomControl } from './ZoomControl'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { getPlanLockedTooltip } from '@/constants/plan-lock-tooltips'

export type MainFooterProps = {
  isInteriorMode: boolean
  onToggleInteriorMode: (next: boolean) => void
  isStarterPlanLocked: boolean
  zoomLevel: number
  onZoomChange: (level: number) => void
  totalPages: number
  onRemoveCanvas?: () => void
  showCanvasGrid: boolean
  onShowCanvasGridChange: (next: boolean) => void
}

export function MainFooter({
  isInteriorMode,
  onToggleInteriorMode,
  isStarterPlanLocked,
  zoomLevel,
  onZoomChange,
  totalPages,
  onRemoveCanvas,
  showCanvasGrid,
  onShowCanvasGridChange,
}: MainFooterProps): JSX.Element {
  return (
    <TooltipProvider delayDuration={120}>
      <footer className="shrink-0 border-t border-border bg-card/70 px-4 py-2 sm:px-6">
        <div className="flex flex-wrap items-center justify-end gap-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={`flex h-9 items-center gap-2 rounded-md border bg-muted/40 px-3 ${
                  isStarterPlanLocked ? 'cursor-not-allowed opacity-60' : ''
                }`}
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
                className={`flex h-9 items-center gap-2 rounded-md border bg-muted/40 px-3 ${
                  isStarterPlanLocked ? 'cursor-not-allowed opacity-60' : ''
                }`}
                role="group"
                aria-label="Canvas mode"
              >
                <span
                  className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                    isInteriorMode ? 'text-muted-foreground' : 'text-primary'
                  }`}
                >
                  <BookOpen className="h-3.5 w-3.5" aria-hidden />
                  Cover
                </span>
                <Switch
                  checked={isInteriorMode}
                  onCheckedChange={onToggleInteriorMode}
                  aria-label="Toggle book interior mode"
                  disabled={isStarterPlanLocked}
                />
                {isStarterPlanLocked && (
                  <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                )}
                <span
                  className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                    isInteriorMode ? 'text-primary' : 'text-muted-foreground'
                  }`}
                >
                  <FileText className="h-3.5 w-3.5" aria-hidden />
                  Interior
                </span>
              </div>
            </TooltipTrigger>
            {isStarterPlanLocked && (
              <TooltipContent side="top">
                {getPlanLockedTooltip('Book cover mode', 'standard')}
              </TooltipContent>
            )}
          </Tooltip>

          <div className="flex h-9 items-center rounded-md border bg-muted/40 px-3">
            <ZoomControl
              className="gap-2"
              zoomLevel={zoomLevel}
              onZoomChange={onZoomChange}
              totalPages={totalPages}
              onRemoveCanvas={onRemoveCanvas}
            />
          </div>
        </div>
      </footer>
    </TooltipProvider>
  )
}
