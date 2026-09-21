import type { CanvasSelectionInfo } from '@/utils/fabric-selection'
import type { TextToolbarState } from '@/types/text-toolbar.types'

import {
  DEFAULT_RECT_CORNER_RADIUS,
  DEFAULT_SHAPE_BORDER_STYLE,
  DEFAULT_SHAPE_FILL_COLOR,
  DEFAULT_SHAPE_STROKE_COLOR,
  DEFAULT_SHAPE_STROKE_WIDTH,
  DEFAULT_TEXT_COLOR,
} from './canvas-editor-constants'
import type { ShapeSelectionState } from './canvas-editor-types'

export function deriveIsImageSelection(info: CanvasSelectionInfo): boolean {
  return Boolean(info.hasSelection && info.isImage)
}

export function deriveShapeSelectionFromInfo(info: CanvasSelectionInfo): ShapeSelectionState {
  if (!info.hasSelection || !info.isShape) return null

  return {
    strokeWidth: info.strokeWidth ?? DEFAULT_SHAPE_STROKE_WIDTH,
    borderStyle: info.borderStyle ?? DEFAULT_SHAPE_BORDER_STYLE,
    strokeColor: info.strokeColor ?? DEFAULT_SHAPE_STROKE_COLOR,
    fillColor: info.fillColor ?? DEFAULT_SHAPE_FILL_COLOR,
    canEditCornerRadius: Boolean(info.canEditCornerRadius),
    cornerRadius: info.cornerRadius ?? (info.canEditCornerRadius ? DEFAULT_RECT_CORNER_RADIUS : 0),
    cornerRadiusMax: info.canEditCornerRadius ? info.cornerRadiusMax : undefined,
  }
}

export function deriveTextSelectionFromInfo(
  info: CanvasSelectionInfo,
  defaultTextFontFamily: string,
  defaultTextFontSize: number,
): TextToolbarState | null {
  if (!info.hasSelection || !info.isText) return null

  return {
    fontFamily: info.fontFamily ?? defaultTextFontFamily,
    fontSize: info.fontSize ?? defaultTextFontSize,
    textColor: info.textColor ?? DEFAULT_TEXT_COLOR,
    isBold: info.isBold ?? false,
    isItalic: info.isItalic ?? false,
    isUnderline: info.isUnderline ?? false,
  }
}
