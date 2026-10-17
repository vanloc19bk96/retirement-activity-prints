import { DPI } from '@/types/canvas-settings.types'

/**
 * The canvas lays out text in CSS px at {@link DPI} per inch, but print tools
 * (Word, PowerPoint, KDP guidelines) speak in points (72 per inch). The toolbar
 * shows points so "16" means 16 pt in the exported PDF/PPTX, not 12 pt.
 */
export function fontSizePixelsToPoints(pixels: number): number {
  // Half-point steps, matching Word/PowerPoint size pickers.
  return Math.round(((pixels * 72) / DPI) * 2) / 2
}

export function fontSizePointsToPixels(points: number): number {
  return (points * DPI) / 72
}
