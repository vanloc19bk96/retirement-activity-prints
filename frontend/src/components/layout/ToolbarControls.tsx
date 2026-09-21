import {
  BringToFront,
  SendToBack,
} from 'lucide-react'
import type { JSX } from 'react'
import { Button } from '@/components/ui/button'
import type { TextToolbarState, TextToolbarStyle } from '@/types/text-toolbar.types'
import type { ShapeBorderStyle } from '@/utils/fabric-selection'
import { ToolbarTextSettingsPopover } from './ToolbarTextSettingsPopover'
import { ToolbarHintButton } from './ToolbarHintButton'
import { ToolbarAlignmentPanelButton } from './ToolbarAlignmentPanelButton'
import { ToolbarShapeSettingsControls } from './ToolbarShapeSettingsControls'

export type ToolbarControlsProps = {
  textSelection: TextToolbarState | null
  shapeSelection:
    | {
        strokeWidth: number
        borderStyle: ShapeBorderStyle
        strokeColor: string
        fillColor: string
        canEditCornerRadius: boolean
        cornerRadius: number
        cornerRadiusMax?: number
      }
    | null
  isImageSelection: boolean
  isEraseToolActive?: boolean
  eraseBrushSize?: number
  onEraseBrushSizeChange?: (size: number) => void
  isSelectionLocked: boolean
  isBookCoverMode: boolean
  bookCoverGuideOpacityControl: JSX.Element
  onBringToFrontSelection?: () => void
  onSendToBackSelection?: () => void
  onFontFamilyChange?: (fontFamily: string) => void
  onFontSizeChange?: (fontSize: number) => void
  onTextColorChange?: (textColor: string) => void
  onToggleTextStyle?: (style: TextToolbarStyle) => void
  onStrokeWidthChange?: (strokeWidth: number) => void
  onBorderStyleChange?: (borderStyle: ShapeBorderStyle) => void
  onStrokeColorChange?: (strokeColor: string) => void
  onFillColorChange?: (fillColor: string) => void
  onCornerRadiusChange?: (cornerRadius: number) => void
  onOpenAlignmentPanel?: () => void
}
export function ToolbarControls({
  textSelection,
  shapeSelection,
  isImageSelection,
  isEraseToolActive = false,
  eraseBrushSize = 24,
  onEraseBrushSizeChange,
  isSelectionLocked,
  isBookCoverMode,
  bookCoverGuideOpacityControl,
  onBringToFrontSelection,
  onSendToBackSelection,
  onFontFamilyChange,
  onFontSizeChange,
  onTextColorChange,
  onToggleTextStyle,
  onStrokeWidthChange,
  onBorderStyleChange,
  onStrokeColorChange,
  onFillColorChange,
  onCornerRadiusChange,
  onOpenAlignmentPanel,
}: ToolbarControlsProps): JSX.Element {
  return (
    <>
      {isEraseToolActive ? (
        <div className="flex h-8 items-center gap-2 rounded-md border border-border/80 bg-background/70 px-2">
          <label className="flex h-full items-center gap-2 text-sm text-muted-foreground leading-none" aria-label="Erase brush size">
            <span className="whitespace-nowrap text-xs text-muted-foreground">Brush size</span>
            <input
              type="range"
              min={4}
              max={120}
              step={1}
              value={eraseBrushSize}
              onChange={(event) => onEraseBrushSizeChange?.(Number(event.target.value))}
              aria-label="Erase brush size"
              className="m-0 block h-2 w-24 translate-y-px self-center cursor-pointer align-middle accent-[var(--color-primary)]"
            />
            <span className="w-10 text-right text-xs text-muted-foreground">{eraseBrushSize}px</span>
          </label>
        </div>
      ) : null}
      {textSelection && (
        <ToolbarTextSettingsPopover
          textSelection={textSelection}
          isSettingsDisabled={isSelectionLocked}
          onFontFamilyChange={onFontFamilyChange}
          onFontSizeChange={onFontSizeChange}
          onTextColorChange={onTextColorChange}
          onToggleTextStyle={onToggleTextStyle}
        />
      )}
      {shapeSelection && !textSelection && !isImageSelection && (
        <ToolbarShapeSettingsControls
          shapeSelection={shapeSelection}
          isSettingsDisabled={isSelectionLocked}
          onStrokeWidthChange={onStrokeWidthChange}
          onBorderStyleChange={onBorderStyleChange}
          onStrokeColorChange={onStrokeColorChange}
          onFillColorChange={onFillColorChange}
          onCornerRadiusChange={onCornerRadiusChange}
        />
      )}

      <div className="flex items-center gap-1" role="group" aria-label="Layer order">
        <ToolbarHintButton hint="Bring to front">
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
        </ToolbarHintButton>
        <ToolbarHintButton hint="Send to back">
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
        </ToolbarHintButton>
      </div>
      <ToolbarAlignmentPanelButton
        isDisabled={isSelectionLocked}
        onOpenAlignmentPanel={onOpenAlignmentPanel}
      />

      {isBookCoverMode && (
        <>
          <div className="h-6 w-px bg-border" aria-hidden />
          {bookCoverGuideOpacityControl}
        </>
      )}
    </>
  )
}
