import type { MarginGuide } from '@/types/canvas-settings.types'
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
  top: 36,
  right: 36,
  bottom: 36,
  left: 48,
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
  return toStudioMargin(safe, pageWidth, pageHeight)
}
