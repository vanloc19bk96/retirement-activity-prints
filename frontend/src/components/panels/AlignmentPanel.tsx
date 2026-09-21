import type { LucideIcon } from 'lucide-react'
import {
  AlignCenter,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignHorizontalSpaceBetween,
  AlignLeft,
  AlignRight,
  AlignStartHorizontal,
  AlignVerticalSpaceBetween,
  Grid2x2Check,
  TextAlignCenter,
  TextAlignEnd,
  TextAlignStart,
} from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import type { CanvasAlignmentAction } from '@/utils/canvas-align'
import {
  CANVAS_ALIGNMENT_CONTEXT_CHANGED_EVENT,
  REQUEST_CANVAS_ALIGNMENT_EVENT,
  REQUEST_CANVAS_TEXT_PARAGRAPH_ALIGN_EVENT,
  type CanvasAlignmentContextChangedEventDetail,
  type FabricTextParagraphAlign,
  type RequestCanvasAlignmentEventDetail,
  type RequestCanvasTextParagraphAlignEventDetail,
} from '@/utils/alignment-events'

type AlignmentAction = {
  align: CanvasAlignmentAction
  label: string
  Icon: LucideIcon
}

const HORIZONTAL_ALIGNMENT_ACTIONS: AlignmentAction[] = [
  { align: 'left', label: 'Left', Icon: AlignLeft },
  { align: 'center', label: 'Center', Icon: AlignCenter },
  { align: 'right', label: 'Right', Icon: AlignRight },
]

const VERTICAL_ALIGNMENT_ACTIONS: AlignmentAction[] = [
  { align: 'top', label: 'Top', Icon: AlignStartHorizontal },
  { align: 'middle', label: 'Middle', Icon: AlignCenterHorizontal },
  { align: 'bottom', label: 'Bottom', Icon: AlignEndHorizontal },
]

const SPACE_EVENLY_ACTIONS: AlignmentAction[] = [
  { align: 'space-vertical', label: 'Vertically', Icon: AlignVerticalSpaceBetween },
  { align: 'space-horizontal', label: 'Horizontally', Icon: AlignHorizontalSpaceBetween },
  { align: 'tidy-up', label: 'Tidy Up', Icon: Grid2x2Check },
]

function requestAlignment(align: CanvasAlignmentAction): void {
  window.dispatchEvent(
    new CustomEvent<RequestCanvasAlignmentEventDetail>(REQUEST_CANVAS_ALIGNMENT_EVENT, {
      detail: { align },
    }),
  )
}

function requestTextParagraphAlign(textAlign: FabricTextParagraphAlign): void {
  window.dispatchEvent(
    new CustomEvent<RequestCanvasTextParagraphAlignEventDetail>(REQUEST_CANVAS_TEXT_PARAGRAPH_ALIGN_EVENT, {
      detail: { textAlign },
    }),
  )
}

type TextParagraphAlignAction = {
  textAlign: FabricTextParagraphAlign
  label: string
  Icon: LucideIcon
}

const TEXT_PARAGRAPH_ALIGN_ACTIONS: TextParagraphAlignAction[] = [
  { textAlign: 'left', label: 'Left', Icon: TextAlignStart },
  { textAlign: 'center', label: 'Center', Icon: TextAlignCenter },
  { textAlign: 'right', label: 'Right', Icon: TextAlignEnd },
]

function AlignmentButton({ action }: { action: AlignmentAction }): JSX.Element {
  const { align, label, Icon } = action

  return (
    <Button
      type="button"
      variant="outline"
      className="h-auto min-h-16 flex-col gap-2 py-3 text-xs"
      onClick={() => requestAlignment(align)}
      aria-label={`Align ${label.toLowerCase()}`}
    >
      <Icon className="h-4 w-4" aria-hidden />
      <span>{label}</span>
    </Button>
  )
}

function TextParagraphAlignButton({
  action,
  isActive,
}: {
  action: TextParagraphAlignAction
  isActive: boolean
}): JSX.Element {
  const { textAlign, label, Icon } = action

  return (
    <Button
      type="button"
      variant={isActive ? 'default' : 'outline'}
      className="h-auto min-h-16 flex-col gap-2 py-3 text-xs"
      onClick={() => requestTextParagraphAlign(textAlign)}
      aria-label={`Align text ${label.toLowerCase()}`}
    >
      <Icon className="h-4 w-4" aria-hidden />
      <span>{label}</span>
    </Button>
  )
}

export function AlignmentPanel(): JSX.Element {
  const [selectionCount, setSelectionCount] = useState(1)
  const [isEditableTextSelection, setIsEditableTextSelection] = useState(false)
  const [textParagraphAlign, setTextParagraphAlign] = useState<'left' | 'center' | 'right' | 'justify'>('left')
  const alignmentLabel = selectionCount > 1 ? 'Align elements' : 'Align to page'
  const alignmentDescription =
    selectionCount > 1
      ? 'Move the selected elements relative to each other.'
      : 'Move the selected object into position on the page.'

  useEffect(() => {
    const handleAlignmentContextChanged = (event: Event): void => {
      const customEvent = event as CustomEvent<CanvasAlignmentContextChangedEventDetail>
      const detail = customEvent.detail
      const nextSelectionCount = Number(detail?.selectionCount)
      setSelectionCount(Number.isFinite(nextSelectionCount) ? Math.max(0, nextSelectionCount) : 0)
      setIsEditableTextSelection(Boolean(detail?.isEditableTextSelection))
      const align = detail?.textParagraphAlign
      if (align === 'center' || align === 'right' || align === 'justify' || align === 'left') {
        setTextParagraphAlign(align)
      }
    }

    window.addEventListener(CANVAS_ALIGNMENT_CONTEXT_CHANGED_EVENT, handleAlignmentContextChanged)
    return () => {
      window.removeEventListener(CANVAS_ALIGNMENT_CONTEXT_CHANGED_EVENT, handleAlignmentContextChanged)
    }
  }, [])

  return (
    <section className="flex w-full flex-col rounded-lg border border-border bg-card">
      <div className="space-y-5 p-4 pb-24">
        <header className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground">{alignmentLabel}</h3>
          <p className="text-xs text-muted-foreground">{alignmentDescription}</p>
        </header>

        <div className="space-y-2">
          <div>
            <h4 className="text-sm font-medium text-foreground">Horizontal</h4>
            <p className="text-xs text-muted-foreground">Use the left, center, or right edge.</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {HORIZONTAL_ALIGNMENT_ACTIONS.map((action) => (
              <AlignmentButton key={action.align} action={action} />
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div>
            <h4 className="text-sm font-medium text-foreground">Vertical</h4>
            <p className="text-xs text-muted-foreground">Use the top, middle, or bottom edge.</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {VERTICAL_ALIGNMENT_ACTIONS.map((action) => (
              <AlignmentButton key={action.align} action={action} />
            ))}
          </div>
        </div>

        {isEditableTextSelection && (
          <div className="space-y-2">
            <div>
              <h4 className="text-sm font-medium text-foreground">Text alignment</h4>
              <p className="text-xs text-muted-foreground">Align lines inside the text box (paragraph).</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {TEXT_PARAGRAPH_ALIGN_ACTIONS.map((action) => (
                <TextParagraphAlignButton
                  key={action.textAlign}
                  action={action}
                  isActive={action.textAlign === textParagraphAlign}
                />
              ))}
            </div>
          </div>
        )}

        {selectionCount > 2 && (
          <div className="space-y-2">
            <div>
              <h4 className="text-sm font-medium text-foreground">Space evenly</h4>
              <p className="text-xs text-muted-foreground">Balance spacing for three or more elements.</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {SPACE_EVENLY_ACTIONS.map((action) => (
                <AlignmentButton key={action.align} action={action} />
              ))}
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Select one object to align with the canvas, or select multiple objects to align them with each other.
        </p>
      </div>
    </section>
  )
}
