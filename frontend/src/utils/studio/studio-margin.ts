import { STUDIO_SAFE_AREA_PADDING_X, STUDIO_SAFE_AREA_PADDING_Y } from '@/constants/studio.constants'
import { DPI, getInsideMarginInches, type MarginGuide } from '@/types/canvas-settings.types'
import type { StudioMargin } from '@/types/studio-template.types'
import {
  resolveInteriorIsLeftPage,
  resolveInteriorPageSafeArea,
} from '@/utils/canvas-template'

/**
 * Convert the editor safe-area box (same math as MarginGuideOverlay /
 * FabricCanvasItemActive) into the inset Studio generators use.
 */
export function toStudioMargin(
  safeArea: { left: number; top: number; width: number; height: number },
  pageWidth: number,
  pageHeight: number,
): StudioMargin {
  return {
    left: safeArea.left,
    top: safeArea.top,
    right: pageWidth - safeArea.left - safeArea.width,
    bottom: pageHeight - safeArea.top - safeArea.height,
  }
}

/** Fallback when safe-area math cannot produce a valid box. */
export const STUDIO_FALLBACK_MARGIN: StudioMargin = {
  top: 36 + STUDIO_SAFE_AREA_PADDING_Y,
  right: 36 + STUDIO_SAFE_AREA_PADDING_X,
  bottom: 36 + STUDIO_SAFE_AREA_PADDING_Y,
  left: 48 + STUDIO_SAFE_AREA_PADDING_X,
}

/**
 * Air on every side. Equal left and right keep the column the same width on a
 * recto and a verso, so a sheet laid out once can still be shifted across.
 */
function padStudioMargin(margin: StudioMargin): StudioMargin {
  return {
    left: margin.left + STUDIO_SAFE_AREA_PADDING_X,
    top: margin.top + STUDIO_SAFE_AREA_PADDING_Y,
    right: margin.right + STUDIO_SAFE_AREA_PADDING_X,
    bottom: margin.bottom + STUDIO_SAFE_AREA_PADDING_Y,
  }
}

export function resolveStudioMarginForPage(options: {
  pageIndex: number
  pageWidth: number
  pageHeight: number
  marginGuide: MarginGuide
}): StudioMargin {
  const { pageIndex, pageWidth, pageHeight, marginGuide } = options
  const isLeftPage = resolveInteriorIsLeftPage(pageIndex)
  const safe = resolveInteriorPageSafeArea({
    canvasSize: { width: pageWidth, height: pageHeight },
    marginGuide,
    isLeftPage,
  })
  if (!safe) return STUDIO_FALLBACK_MARGIN
  // Pad inside the guide so nothing a generator draws sits on its edge.
  return padStudioMargin(toStudioMargin(safe, pageWidth, pageHeight))
}

/**
 * The margin guide a run must lay out with once the book reaches `pageCount`.
 *
 * KDP sizes the inside (gutter) margin by the final page count: 0.375in up to
 * 150 pages, 0.5in to 300, and so on. The editor's guide is computed from the
 * page count before a run, so a book builder that takes 40 pages to 200 laid
 * every new sheet against the 0.375in gutter the finished book is not allowed
 * to use. Only ever widens: a guide already sized for a larger book stays.
 */
export function studioMarginGuideForPageCount(
  marginGuide: MarginGuide,
  pageCount: number,
): MarginGuide {
  if (!Number.isFinite(pageCount) || pageCount <= 0) return marginGuide
  const insidePixels = Math.round(getInsideMarginInches(pageCount) * DPI)
  return insidePixels > marginGuide.insidePixels ? { ...marginGuide, insidePixels } : marginGuide
}
