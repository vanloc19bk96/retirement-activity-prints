import type { JSX } from 'react'
import {
  BringToFront,
  SendToBack,
} from 'lucide-react'

import type { ToolbarControlsProps } from './ToolbarControls'
import { Button } from '@/components/ui/button'

export function ToolbarOverflowControls(props: ToolbarControlsProps): JSX.Element {
  const {
    isSelectionLocked,
    isBookCoverMode,
    bookCoverGuideOpacityControl,
    onBringToFrontSelection,
    onSendToBackSelection,
  } = props

  return (
    <>
      <div className="flex items-center gap-1" role="group" aria-label="Layer order">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          disabled={isSelectionLocked}
          onClick={() => onBringToFrontSelection?.()}
          aria-label="Bring selection to front"
        >
          <BringToFront className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          disabled={isSelectionLocked}
          onClick={() => onSendToBackSelection?.()}
          aria-label="Send selection to back"
        >
          <SendToBack className="h-4 w-4" />
        </Button>
      </div>

      {isBookCoverMode && (
        <>
          <div className="h-6 w-px bg-border" aria-hidden />
          {bookCoverGuideOpacityControl}
        </>
      )}
    </>
  )
}

