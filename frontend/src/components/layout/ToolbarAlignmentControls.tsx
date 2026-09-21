import {
  AlignCenter,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignLeft,
  AlignRight,
  AlignStartHorizontal,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { CanvasAlign } from '@/utils/canvas-align'

type ToolbarAlignmentControlsProps = {
  onAlign?: (align: CanvasAlign) => void
  isDisabled?: boolean
}

export function ToolbarAlignmentControls({ onAlign, isDisabled = false }: ToolbarAlignmentControlsProps): JSX.Element {
  return (
    <>
      <div className="h-6 w-px bg-border" aria-hidden />
      <div className="flex items-center gap-1" role="group" aria-label="Horizontal alignment">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          disabled={isDisabled}
          onClick={() => onAlign?.('left')}
          aria-label="Align left"
        >
          <AlignLeft className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          disabled={isDisabled}
          onClick={() => onAlign?.('center')}
          aria-label="Align center"
        >
          <AlignCenter className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          disabled={isDisabled}
          onClick={() => onAlign?.('right')}
          aria-label="Align right"
        >
          <AlignRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="h-6 w-px bg-border" aria-hidden />
      <div className="flex items-center gap-1" role="group" aria-label="Vertical alignment">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          disabled={isDisabled}
          onClick={() => onAlign?.('top')}
          aria-label="Align top"
        >
          <AlignStartHorizontal className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          disabled={isDisabled}
          onClick={() => onAlign?.('middle')}
          aria-label="Align middle"
        >
          <AlignCenterHorizontal className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          disabled={isDisabled}
          onClick={() => onAlign?.('bottom')}
          aria-label="Align bottom"
        >
          <AlignEndHorizontal className="h-4 w-4" />
        </Button>
      </div>
    </>
  )
}

