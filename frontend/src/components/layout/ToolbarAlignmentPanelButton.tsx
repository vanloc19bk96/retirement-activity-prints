import { AlignCenter } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ToolbarHintButton } from './ToolbarHintButton'

type ToolbarAlignmentPanelButtonProps = {
  isDisabled?: boolean
  onOpenAlignmentPanel?: () => void
  withDivider?: boolean
}

export function ToolbarAlignmentPanelButton({
  isDisabled = false,
  onOpenAlignmentPanel,
  withDivider = true,
}: ToolbarAlignmentPanelButtonProps): JSX.Element {
  return (
    <>
      {withDivider && <div className="h-6 w-px bg-border" aria-hidden />}
      <div className="flex items-center gap-1" role="group" aria-label="Alignment">
        <ToolbarHintButton hint="Alignment">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            disabled={isDisabled}
            onClick={() => onOpenAlignmentPanel?.()}
            aria-label="Open alignment panel"
          >
            <AlignCenter className="h-4 w-4" />
          </Button>
        </ToolbarHintButton>
      </div>
    </>
  )
}

