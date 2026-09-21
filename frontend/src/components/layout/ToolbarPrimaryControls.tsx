import type { JSX } from 'react'

import type { ToolbarControlsProps } from './ToolbarControls'
import { ToolbarTextSettingsPopover } from './ToolbarTextSettingsPopover'
import { ToolbarAlignmentPanelButton } from './ToolbarAlignmentPanelButton'
import { ToolbarShapeSettingsControls } from './ToolbarShapeSettingsControls'

export function ToolbarPrimaryControls(props: ToolbarControlsProps): JSX.Element {
  const {
    textSelection,
    shapeSelection,
    isImageSelection,
    isSelectionLocked,
    bookCoverGuideOpacityControl: _bookCoverGuideOpacityControl,
    onOpenAlignmentPanel,
    onFontFamilyChange,
    onFontSizeChange,
    onTextColorChange,
    onToggleTextStyle,
    onStrokeWidthChange,
    onBorderStyleChange,
    onStrokeColorChange,
    onFillColorChange,
    onCornerRadiusChange,
  } = props

  return (
    <>
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
          withDivider={false}
        />
      )}

      <ToolbarAlignmentPanelButton
        isDisabled={isSelectionLocked}
        onOpenAlignmentPanel={onOpenAlignmentPanel}
        withDivider={Boolean(textSelection || shapeSelection)}
      />
    </>
  )
}
