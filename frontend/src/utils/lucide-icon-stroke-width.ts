import { isLucideIconGroup, isLucideViewBoxFrame } from '@/utils/lucide-fabric'

const LUCIDE_ICON_BASE_STROKE_WIDTH_KEY = '__lucideBaseStrokeWidth'

/**
 * Lucide-group icons are stored as a Fabric group of SVG paths; scaling a group
 * multiplies stroke widths. Pin each child back to its captured base stroke width
 * (with `strokeUniform`) so the icon remains visually identical at any scale.
 */
export function keepLucideIconStrokeWidthStableOnScale(target: unknown): void {
  if (!isLucideIconGroup(target)) return
  const children = target.getObjects?.() ?? []
  for (const child of children as Array<{
    strokeWidth?: unknown
    set?: (key: string, value: unknown) => void
  }>) {
    if (isLucideViewBoxFrame(child)) continue
    const strokeWidth = child.strokeWidth
    if (typeof strokeWidth !== 'number' || !Number.isFinite(strokeWidth) || strokeWidth <= 0) {
      continue
    }
    const withMeta = child as { [LUCIDE_ICON_BASE_STROKE_WIDTH_KEY]?: number }
    if (typeof withMeta[LUCIDE_ICON_BASE_STROKE_WIDTH_KEY] !== 'number') {
      withMeta[LUCIDE_ICON_BASE_STROKE_WIDTH_KEY] = strokeWidth
    }
    const baseStrokeWidth = withMeta[LUCIDE_ICON_BASE_STROKE_WIDTH_KEY] ?? strokeWidth
    child.set?.('strokeWidth', baseStrokeWidth)
    child.set?.('strokeUniform', true)
  }
}
