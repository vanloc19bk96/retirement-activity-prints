/**
 * Fabric Textbox soft-wraps to the current `width`. After font metric changes
 * (size / family / weight), `dynamicMinWidth` is only the longest word — using
 * it as width stacks one word per line.
 *
 * Refit only when the box is a single visual line (labels / instructions) or
 * already collapsed to one-word columns. Leave intentional soft-wrapped
 * paragraphs (story body, journal prompts) at their column width.
 *
 * Call `shouldRefitFabricTextboxToUnwrappedLine` *before* changing metrics,
 * then `applyFabricTextboxWidthAfterMetricChange` after.
 */

type FabricTextboxWidthTarget = {
  type?: string
  text?: string
  width?: number
  minWidth?: number
  dynamicMinWidth?: number
  /** Fabric internal wrapped lines (array of grapheme arrays or strings). */
  _textLines?: unknown[]
  textLines?: unknown[]
  calcTextWidth?: () => number
  initDimensions?: () => void
  set?: (key: string | Record<string, unknown>, value?: unknown) => void
}

const UNWRAPPED_WIDTH_PROBE = 10_000
const TEXTBOX_WIDTH_PAD = 2
/** Width within this factor of longest-word min ⇒ treated as collapsed. */
const COLLAPSED_WIDTH_RATIO = 1.2

function getVisualLineCount(target: FabricTextboxWidthTarget): number {
  const lines = target._textLines ?? target.textLines
  return Array.isArray(lines) ? lines.length : 1
}

function isCollapsedToLongestWord(target: FabricTextboxWidthTarget): boolean {
  const dynamicMin = target.dynamicMinWidth
  const width = target.width
  if (typeof dynamicMin !== 'number' || !Number.isFinite(dynamicMin) || dynamicMin <= 0) {
    return false
  }
  if (typeof width !== 'number' || !Number.isFinite(width) || width <= 0) {
    return false
  }
  return width <= dynamicMin * COLLAPSED_WIDTH_RATIO
}

/** Inspect wrap state *before* fontSize / family / weight changes. */
export function shouldRefitFabricTextboxToUnwrappedLine(
  target: FabricTextboxWidthTarget,
): boolean {
  if (target.type !== 'textbox') return false
  if (typeof target.text !== 'string' || target.text.length === 0) return false
  if (target.text.includes('\n')) return false
  if (typeof target.calcTextWidth !== 'function') return false

  target.initDimensions?.()
  if (getVisualLineCount(target) <= 1) return true
  return isCollapsedToLongestWord(target)
}

/** Probe with a wide box, then shrink to the unwrapped glyph run. */
export function fitFabricTextboxWidthToUnwrappedLine(target: FabricTextboxWidthTarget): void {
  if (target.type !== 'textbox') return
  if (typeof target.text !== 'string' || target.text.includes('\n')) return
  if (typeof target.calcTextWidth !== 'function') return

  const previousWidth =
    typeof target.width === 'number' && Number.isFinite(target.width) ? target.width : 0
  const minimumWidth =
    typeof target.minWidth === 'number' && Number.isFinite(target.minWidth) && target.minWidth > 0
      ? target.minWidth
      : 1

  target.set?.('width', Math.max(previousWidth * 4, UNWRAPPED_WIDTH_PROBE))
  target.initDimensions?.()

  const measuredWidth = target.calcTextWidth()
  const nextWidth =
    Number.isFinite(measuredWidth) && measuredWidth > 0
      ? Math.max(minimumWidth, Math.ceil(measuredWidth) + TEXTBOX_WIDTH_PAD)
      : previousWidth > 0
        ? previousWidth
        : minimumWidth

  target.set?.('width', nextWidth)
  target.initDimensions?.()
}

/** Apply width policy after a font metric change. */
export function applyFabricTextboxWidthAfterMetricChange(
  target: FabricTextboxWidthTarget,
  shouldRefitToUnwrapped: boolean,
): void {
  if (shouldRefitToUnwrapped) {
    fitFabricTextboxWidthToUnwrappedLine(target)
    return
  }
  target.initDimensions?.()
}
