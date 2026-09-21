import type { CanvasAlignmentAction } from '@/utils/canvas-align'

export const REQUEST_CANVAS_ALIGNMENT_EVENT = 'canvas:request-alignment'
export const CANVAS_ALIGNMENT_CONTEXT_CHANGED_EVENT = 'canvas:alignment-context-changed'

/** Horizontal alignment of lines inside a Fabric Textbox / IText (`textAlign`). */
export const REQUEST_CANVAS_TEXT_PARAGRAPH_ALIGN_EVENT = 'canvas:request-text-paragraph-align'

export type FabricTextParagraphAlign = 'left' | 'center' | 'right'

export type RequestCanvasAlignmentEventDetail = {
  align: CanvasAlignmentAction
}

export type RequestCanvasTextParagraphAlignEventDetail = {
  textAlign: FabricTextParagraphAlign
}

export type CanvasAlignmentContextChangedEventDetail = {
  selectionCount: number
  /** True when the selection is a single editable text object (Textbox / IText / text). */
  isEditableTextSelection?: boolean
  /** Current Fabric `textAlign` for that text, when {@link isEditableTextSelection} is true. */
  textParagraphAlign?: 'left' | 'center' | 'right' | 'justify'
}
