import type { CSSProperties } from 'react'

export const EDITOR_ZOOM_CSS_VAR = '--editor-zoom'
export const EDITOR_PAGE_WIDTH_CSS_VAR = '--editor-page-width'
export const EDITOR_PAGE_HEIGHT_CSS_VAR = '--editor-page-height'

/** Layout size for a canvas shell; inherits zoom + logical page size from an ancestor. */
export const EDITOR_CANVAS_SIZE_STYLE: CSSProperties = {
  width: `calc(var(${EDITOR_PAGE_WIDTH_CSS_VAR}) * var(${EDITOR_ZOOM_CSS_VAR}) * 1px)`,
  height: `calc(var(${EDITOR_PAGE_HEIGHT_CSS_VAR}) * var(${EDITOR_ZOOM_CSS_VAR}) * 1px)`,
}

export const EDITOR_PAGE_ROW_WIDTH_STYLE: CSSProperties = {
  width: `calc(var(${EDITOR_PAGE_WIDTH_CSS_VAR}) * var(${EDITOR_ZOOM_CSS_VAR}) * 1px)`,
}

export function buildEditorZoomContainerStyle(args: {
  zoomLevel: number
  pageWidth: number
  pageHeight: number
}): CSSProperties {
  return {
    [EDITOR_ZOOM_CSS_VAR]: args.zoomLevel,
    [EDITOR_PAGE_WIDTH_CSS_VAR]: args.pageWidth,
    [EDITOR_PAGE_HEIGHT_CSS_VAR]: args.pageHeight,
  } as CSSProperties
}
