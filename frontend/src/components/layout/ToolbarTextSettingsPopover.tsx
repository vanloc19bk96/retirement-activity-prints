import type { JSX } from 'react'
import { Bold, Italic, Underline } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { FontFamilySelect } from '@/components/ui/font-family-select'
import type { TextToolbarState, TextToolbarStyle } from '@/types/text-toolbar.types'
import { ToolbarHintButton } from './ToolbarHintButton'

type ToolbarTextSettingsPopoverProps = {
  textSelection: TextToolbarState
  isSettingsDisabled?: boolean
  onFontFamilyChange?: (fontFamily: string) => void
  onFontSizeChange?: (fontSize: number) => void
  onTextColorChange?: (textColor: string) => void
  onToggleTextStyle?: (style: TextToolbarStyle) => void
}

export function ToolbarTextSettingsPopover({
  textSelection,
  isSettingsDisabled = false,
  onFontFamilyChange,
  onFontSizeChange,
  onTextColorChange,
  onToggleTextStyle,
}: ToolbarTextSettingsPopoverProps): JSX.Element {
  return (
    <>
      <div className="flex min-w-0 items-center gap-2" role="group" aria-label="Text tools">
        <ToolbarHintButton hint="Font family">
          <label className="min-w-0">
            <span className="sr-only">Font family</span>
            <FontFamilySelect
              className="h-8 w-44 rounded-md border border-input bg-background px-2 text-sm text-foreground"
              value={textSelection.fontFamily}
              disabled={isSettingsDisabled}
              onChange={(fontFamily) => onFontFamilyChange?.(fontFamily)}
            />
          </label>
        </ToolbarHintButton>

        <>
        <ToolbarHintButton hint="Font size">
          <label>
            <span className="sr-only">Font size</span>
            <input
              className="h-8 w-16 rounded-md border border-input bg-background px-2 text-sm text-foreground"
              type="number"
              min={1}
              step={1}
              value={textSelection.fontSize}
              disabled={isSettingsDisabled}
              onChange={(e) => onFontSizeChange?.(Number(e.target.value))}
              aria-label="Font size"
            />
          </label>
        </ToolbarHintButton>

        <div className="flex items-center gap-2" role="group" aria-label="Text color">
          <ToolbarHintButton hint="Text color picker">
            <span className="inline-flex">
              <input
                type="color"
                value={textSelection.textColor}
                disabled={isSettingsDisabled}
                onChange={(e) => onTextColorChange?.(e.target.value)}
                aria-label="Text color picker"
                className="h-8 w-10 cursor-pointer rounded border border-input bg-background p-1"
              />
            </span>
          </ToolbarHintButton>
          <ToolbarHintButton hint="Text color">
            <span className="inline-flex">
              <input
                className="h-8 w-24 rounded-md border border-input bg-background px-2 text-sm text-foreground"
                value={textSelection.textColor}
                disabled={isSettingsDisabled}
                onChange={(e) => onTextColorChange?.(e.target.value)}
                aria-label="Text color"
                placeholder="#000000"
              />
            </span>
          </ToolbarHintButton>
        </div>

        <div className="flex items-center gap-1" role="group" aria-label="Text style">
          <ToolbarHintButton hint="Bold">
            <Button
              type="button"
              variant={textSelection.isBold ? 'outline' : 'ghost'}
              size="icon"
              className="h-8 w-8"
              disabled={isSettingsDisabled}
              onClick={() => onToggleTextStyle?.('bold')}
              aria-label="Bold"
            >
              <Bold className="h-4 w-4" />
            </Button>
          </ToolbarHintButton>
          <ToolbarHintButton hint="Italic">
            <Button
              type="button"
              variant={textSelection.isItalic ? 'outline' : 'ghost'}
              size="icon"
              className="h-8 w-8"
              disabled={isSettingsDisabled}
              onClick={() => onToggleTextStyle?.('italic')}
              aria-label="Italic"
            >
              <Italic className="h-4 w-4" />
            </Button>
          </ToolbarHintButton>
          <ToolbarHintButton hint="Underline">
            <Button
              type="button"
              variant={textSelection.isUnderline ? 'outline' : 'ghost'}
              size="icon"
              className="h-8 w-8"
              disabled={isSettingsDisabled}
              onClick={() => onToggleTextStyle?.('underline')}
              aria-label="Underline"
            >
              <Underline className="h-4 w-4" />
            </Button>
          </ToolbarHintButton>
        </div>
        </>
      </div>
      <div className="h-6 w-px bg-border" aria-hidden />
    </>
  )
}
