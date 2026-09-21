import { columns, type Box } from '../studio-layout'

/** Breathing room from the safe edges — matches the other boxed word sheets. */
export const FIELD_INSET = 16
const COLUMN_GUTTER = 26
/** Gap between rungs as a share of the cell — reads as separate words. */
const RUNG_GAP_RATIO = 0.32
/** Ceiling for the stretched gap — wider and the rungs stop reading as one ladder. */
const MAX_RUNG_GAP_RATIO = 0.85
const PREFERRED_CELL = 72
const MIN_CELL = 18
const LABEL_GAP = 10
const LABEL_MIN_SIZE = 11
const LABEL_MAX_SIZE = 15

export interface LadderMetrics {
  cell: number
  rungGap: number
  labelHeight: number
  blockHeight: number
}

export function labelSizeFor(cell: number): number {
  return Math.max(LABEL_MIN_SIZE, Math.min(LABEL_MAX_SIZE, Math.round(cell * 0.42)))
}

/**
 * Cell size that fits the widest word and the tallest ladder at once.
 * Both constraints are applied before rounding, so a long ladder shrinks
 * evenly instead of running past the bottom of the body.
 */
export function measureLadder(options: {
  column: Box
  wordLength: number
  rungCount: number
  showLabels: boolean
  maxCell?: number
}): LadderMetrics {
  const { column, wordLength, rungCount, showLabels, maxCell } = options
  const fromWidth = Math.floor(column.width / wordLength)
  // rungCount cells plus (rungCount - 1) gaps, expressed in cells.
  const rungUnits = rungCount + (rungCount - 1) * RUNG_GAP_RATIO
  const labelReserve = showLabels ? LABEL_MAX_SIZE + LABEL_GAP : 0
  const fromHeight = Math.floor((column.height - labelReserve) / rungUnits)
  const capped = Math.min(fromWidth, fromHeight, PREFERRED_CELL, maxCell ?? PREFERRED_CELL)
  const cell = Math.max(MIN_CELL, capped)
  const labelHeight = showLabels ? labelSizeFor(cell) + LABEL_GAP : 0

  // Narrow columns cap the cell on width, which would otherwise leave a short
  // ladder marooned in a tall body. The height that buys goes into the gaps
  // (up to a cap, so the rungs still read as one ladder) rather than to waste.
  const slack = column.height - labelHeight - rungCount * cell
  const rungGap =
    rungCount > 1
      ? Math.max(
          Math.round(cell * RUNG_GAP_RATIO),
          Math.min(
            Math.round(cell * MAX_RUNG_GAP_RATIO),
            Math.floor(slack / (rungCount - 1)),
          ),
        )
      : 0

  return {
    cell,
    rungGap,
    labelHeight,
    blockHeight: labelHeight + rungCount * cell + (rungCount - 1) * rungGap,
  }
}

/** Equal slots across the field, before they are re-spaced around their content. */
export function ladderSlots(field: Box, count: number): Box[] {
  return columns(field, count, COLUMN_GUTTER)
}

/**
 * Re-space equal slots around their real content width, then centre the run.
 * Even gutters left and right of the block read as one composition; equal
 * slots alone leave a wide trough between two narrow ladders.
 */
export function centerColumns(field: Box, slots: Box[], contentWidth: number): Box[] {
  if (slots.length <= 1) return slots
  const gutter = Math.max(COLUMN_GUTTER, Math.round(contentWidth * 0.28))
  const blockWidth = slots.length * contentWidth + (slots.length - 1) * gutter
  if (blockWidth > field.width) return slots
  const left = field.left + (field.width - blockWidth) / 2
  return slots.map((slot, index) => ({
    ...slot,
    left: left + index * (contentWidth + gutter),
    width: contentWidth,
  }))
}
