/**
 * Card arrangement. Computes slots; it never draws.
 *
 * Templates ask for `n` cards in a field and get back a card width plus one box
 * per card. Keeping placement separate from rendering is what lets the same
 * grid hold faces, backs and blank write-in slots side by side.
 */

import type { Box } from '../../studio-layout'
import { MIN_CARD_WIDTH_PX } from './geometry'
import { CARD_ASPECT, cardWidthForSize, type CardSizeName } from './types'

/**
 * `fan` and `stack` overlap cards, which hides pips — decorative headers only,
 * never puzzle content (§3.3).
 */
export type ArrangeMode = 'grid' | 'row' | 'spread' | 'fan' | 'stack'

export interface CardSlot {
  index: number
  row: number
  col: number
  left: number
  top: number
  width: number
  height: number
  /** Degrees. Non-zero only in `fan`. */
  angle: number
}

export interface ArrangeResult {
  slots: CardSlot[]
  cardWidth: number
  cardHeight: number
  cols: number
  rows: number
  /** Tight box around the arrangement. */
  bounds: Box
}

export interface ArrangeOptions {
  field: Box
  count: number
  mode?: ArrangeMode
  /** Fixed column count; omitted means "pick the shape that prints largest". */
  cols?: number
  /** Horizontal gap as a fraction of card width. */
  gapRatio?: number
  /** Vertical gap as a fraction of card width. */
  rowGapRatio?: number
  /**
   * Floor when gaps must close to keep cards legible.
   * Ringed answer layouts pass a higher floor so adjacent rings never merge.
   */
  minGapRatio?: number
  /** Preferred card width, usually a size preset. Never exceeded. */
  maxCardWidth?: number
  /** Below this the face stops being legible in print; layout throws instead. */
  minCardWidth?: number
}

const DEFAULT_GAP_RATIO = 0.12
const DEFAULT_ROW_GAP_RATIO = 0.12
/** Tightest the gaps close to before the print floor is allowed to fail. */
const MIN_GAP_RATIO = 0.04
/**
 * A card narrower than this prints its corner index on top of the pips — see
 * `MIN_CARD_WIDTH_PX`, which derives it from the 12pt index floor.
 */
export const MIN_LEGIBLE_CARD_WIDTH = MIN_CARD_WIDTH_PX

/** Card width that fits `cols` x `rows` cards in the field. */
function fitCardWidth(
  field: Box,
  cols: number,
  rows: number,
  gapRatio: number,
  rowGapRatio: number,
): number {
  const byWidth = field.width / (cols + (cols - 1) * gapRatio)
  const byHeight = field.height / (rows / CARD_ASPECT + (rows - 1) * rowGapRatio)
  return Math.min(byWidth, byHeight)
}

/** Column count that prints the largest card for `count` cards in `field`. */
export function bestColumnCount(
  field: Box,
  count: number,
  gapRatio = DEFAULT_GAP_RATIO,
  rowGapRatio = DEFAULT_ROW_GAP_RATIO,
): number {
  let best = 1
  let bestWidth = -1
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols)
    const width = fitCardWidth(field, cols, rows, gapRatio, rowGapRatio)
    // Strictly greater keeps the squattest shape on a tie, which reads better
    // than a long thin row of the same card size.
    if (width > bestWidth + 0.01) {
      bestWidth = width
      best = cols
    }
  }
  return best
}

function boundsOf(slots: readonly CardSlot[], fallback: Box): Box {
  if (slots.length === 0) return { ...fallback, width: 0, height: 0 }
  let minL = Infinity
  let minT = Infinity
  let maxR = -Infinity
  let maxB = -Infinity
  for (const slot of slots) {
    if (slot.left < minL) minL = slot.left
    if (slot.top < minT) minT = slot.top
    if (slot.left + slot.width > maxR) maxR = slot.left + slot.width
    if (slot.top + slot.height > maxB) maxB = slot.top + slot.height
  }
  return { left: minL, top: minT, width: maxR - minL, height: maxB - minT }
}

/**
 * Place `count` card boxes inside `field`.
 *
 * Throws when the field cannot hold a legible card — silently shrinking below
 * the print floor is how a book gets rejected at upload, so the caller has to
 * choose fewer cards or a smaller figure count instead.
 */
export function arrangeCards(options: ArrangeOptions): ArrangeResult {
  const {
    field,
    count,
    mode = 'grid',
    gapRatio = DEFAULT_GAP_RATIO,
    rowGapRatio = DEFAULT_ROW_GAP_RATIO,
    maxCardWidth,
    minCardWidth = MIN_LEGIBLE_CARD_WIDTH,
  } = options
  // Never close below the caller's floor (answer rings need more than MIN_GAP).
  const gapFloor = Math.max(MIN_GAP_RATIO, options.minGapRatio ?? MIN_GAP_RATIO)

  if (count <= 0) {
    return {
      slots: [],
      cardWidth: 0,
      cardHeight: 0,
      cols: 0,
      rows: 0,
      bounds: { ...field, width: 0, height: 0 },
    }
  }

  if (mode === 'fan' || mode === 'stack') {
    return arrangeOverlapping(options, mode)
  }

  // The gap between cards is whitespace; the card size is a print requirement.
  // When the requested gaps put the card under the floor, close them up before
  // giving up — a slightly tighter grid beats a page that cannot be built.
  // Stop at `gapFloor` so ringed layouts prefer fewer cards over merged rings.
  let gaps = { gapRatio, rowGapRatio }
  let cols =
    mode === 'row'
      ? count
      : (options.cols ?? bestColumnCount(field, count, gapRatio, rowGapRatio))
  let cardWidth = Math.min(
    fitCardWidth(field, cols, Math.ceil(count / cols), gapRatio, rowGapRatio),
    maxCardWidth ?? Infinity,
  )

  if (cardWidth < minCardWidth && gapRatio > gapFloor) {
    gaps = { gapRatio: gapFloor, rowGapRatio: Math.min(rowGapRatio, gapFloor) }
    cols =
      mode === 'row'
        ? count
        : (options.cols ??
          bestColumnCount(field, count, gaps.gapRatio, gaps.rowGapRatio))
    cardWidth = Math.min(
      fitCardWidth(field, cols, Math.ceil(count / cols), gaps.gapRatio, gaps.rowGapRatio),
      maxCardWidth ?? Infinity,
    )
  }

  const rows = Math.ceil(count / cols)
  if (cardWidth < minCardWidth) {
    throw new Error(
      `arrangeCards: ${count} cards in ${Math.round(field.width)}x${Math.round(field.height)} ` +
        `needs a ${cardWidth.toFixed(1)}px card, below the ${minCardWidth.toFixed(1)}px print floor`,
    )
  }

  const cardHeight = cardWidth / CARD_ASPECT
  const gap = cardWidth * gaps.gapRatio
  const rowGap = cardWidth * gaps.rowGapRatio
  const gridHeight = rows * cardHeight + (rows - 1) * rowGap
  const originY = field.top + (field.height - gridHeight) / 2

  const slots: CardSlot[] = []
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / cols)
    const col = i % cols
    // `spread` centres a short final row; `grid` keeps every row left-aligned
    // to the same column rail so the eye can scan down a column.
    const inRow = mode === 'spread' ? Math.min(cols, count - row * cols) : cols
    const rowWidth = inRow * cardWidth + (inRow - 1) * gap
    const originX = field.left + (field.width - rowWidth) / 2
    slots.push({
      index: i,
      row,
      col,
      left: Math.round((originX + col * (cardWidth + gap)) * 100) / 100,
      top: Math.round((originY + row * (cardHeight + rowGap)) * 100) / 100,
      width: cardWidth,
      height: cardHeight,
      angle: 0,
    })
  }

  return { slots, cardWidth, cardHeight, cols, rows, bounds: boundsOf(slots, field) }
}

/**
 * Overlapping arrangements for decorative headers.
 * Never used for puzzle content — overlap hides the pips that carry the answer.
 */
function arrangeOverlapping(
  options: ArrangeOptions,
  mode: 'fan' | 'stack',
): ArrangeResult {
  const { field, count, maxCardWidth, minCardWidth = MIN_LEGIBLE_CARD_WIDTH } = options
  const overlap = mode === 'fan' ? 0.45 : 0.12
  const byWidth = field.width / (1 + (count - 1) * overlap)
  const byHeight = field.height * CARD_ASPECT
  let cardWidth = Math.min(byWidth, byHeight)
  if (maxCardWidth) cardWidth = Math.min(cardWidth, maxCardWidth)
  cardWidth = Math.max(cardWidth, minCardWidth * 0.5)

  const cardHeight = cardWidth / CARD_ASPECT
  const step = cardWidth * overlap
  const totalWidth = cardWidth + (count - 1) * step
  const originX = field.left + (field.width - totalWidth) / 2
  const originY = field.top + (field.height - cardHeight) / 2
  const spanDeg = mode === 'fan' ? 26 : 0
  const mid = (count - 1) / 2

  const slots: CardSlot[] = Array.from({ length: count }, (_, i) => {
    const t = count === 1 ? 0 : (i - mid) / Math.max(1, mid)
    return {
      index: i,
      row: 0,
      col: i,
      left: Math.round((originX + i * step) * 100) / 100,
      // Arc lift, so a fan reads as a held hand rather than a sheared row.
      top: Math.round((originY + (mode === 'fan' ? t * t * cardHeight * 0.08 : 0)) * 100) / 100,
      width: cardWidth,
      height: cardHeight,
      angle: Math.round(t * spanDeg * 10) / 10,
    }
  })

  return {
    slots,
    cardWidth,
    cardHeight,
    cols: count,
    rows: 1,
    bounds: boundsOf(slots, field),
  }
}

/** Arrangement knobs a fit check has to mirror, or it answers the wrong question. */
export type FitOverrides = Pick<
  ArrangeOptions,
  'cols' | 'mode' | 'gapRatio' | 'rowGapRatio' | 'minGapRatio'
>

/** Whether `count` cards fit in `field` at or above the print floor. */
export function cardsFit(
  field: Box,
  count: number,
  maxCardWidth?: number,
  overrides?: FitOverrides,
): boolean {
  try {
    arrangeCards({ field, count, maxCardWidth, ...overrides })
    return true
  } catch {
    return false
  }
}

/** Shortest band that can hold one card at the print floor. */
export const MIN_CARD_BAND_HEIGHT = MIN_CARD_WIDTH_PX / CARD_ASPECT

/**
 * Most cards that fit `field` at or above the print floor.
 *
 * Card counts are a template's difficulty dial, but what a page can hold is a
 * property of the seller's trim. Templates ask for their tier's count and take
 * whichever is smaller.
 */
export function maxCardsInField(
  field: Box,
  maxCardWidth?: number,
  cap = 24,
  overrides?: FitOverrides,
): number {
  for (let count = cap; count > 1; count--) {
    if (cardsFit(field, count, maxCardWidth, overrides)) return count
  }
  return 1
}

/** Most equal-height bands `field` can be cut into that still hold a card. */
export function maxCardBands(field: Box, gap = 0, cap = 12): number {
  for (let bands = cap; bands > 1; bands--) {
    if ((field.height - gap * (bands - 1)) / bands >= MIN_CARD_BAND_HEIGHT) return bands
  }
  return 1
}

/**
 * How several figures divide a page.
 *
 * Two figures stacked as rows halve the height a card grid can use, which on a
 * portrait trim is the dimension it needs most: 13 cards in a 592x272 band
 * cannot reach the 0.9" print floor, while the same cards in a 296x772 column
 * can. `auto` therefore splits a tall field into columns and a wide one into
 * rows, rather than always stacking.
 */
export type FigureBandOrientation = 'rows' | 'columns' | 'auto'

export function figureBands(
  field: Box,
  count: number,
  gap: number,
  orientation: FigureBandOrientation = 'auto',
): Box[] {
  if (count <= 1) return [field]

  if (count === 2) {
    const useColumns =
      orientation === 'columns' ||
      (orientation === 'auto' && field.height > field.width)
    return useColumns ? splitEvenly(field, 2, gap, 'x') : splitEvenly(field, 2, gap, 'y')
  }

  // Four or more: a grid of bands, two across.
  const across = Math.min(2, count)
  const down = Math.ceil(count / across)
  const bands: Box[] = []
  for (const row of splitEvenly(field, down, gap, 'y')) {
    bands.push(...splitEvenly(row, across, gap, 'x'))
  }
  return bands.slice(0, count)
}

function splitEvenly(field: Box, n: number, gap: number, axis: 'x' | 'y'): Box[] {
  const total = axis === 'x' ? field.width : field.height
  const size = (total - gap * (n - 1)) / n
  return Array.from({ length: n }, (_, i) =>
    axis === 'x'
      ? { ...field, left: field.left + i * (size + gap), width: size }
      : { ...field, top: field.top + i * (size + gap), height: size },
  )
}

/**
 * Largest figure count from `candidates` whose band still holds a legible card.
 *
 * Templates offer 1 / 2 / 4 figures a page, but whether that fits is a property
 * of the seller's trim size, not of the template. Resolving it here means a
 * 5 x 8 book quietly prints fewer, larger figures instead of throwing halfway
 * through a 60-page build.
 */
export function fitFigureCount(options: {
  field: Box
  candidates: readonly number[]
  cardsPerFigure: number
  /** Space each figure spends on captions, labels and write-in lines. */
  reservedPerFigure?: number
  maxCardWidth?: number
  bandGap?: number
  orientation?: FigureBandOrientation
}): number {
  const {
    field,
    candidates,
    cardsPerFigure,
    reservedPerFigure = 0,
    maxCardWidth,
    bandGap = 0,
    orientation = 'auto',
  } = options
  const sorted = [...candidates].sort((a, b) => b - a)
  for (const count of sorted) {
    const bands = figureBands(field, count, bandGap, orientation)
    const usable = bands.every(
      (band) =>
        band.height - reservedPerFigure > 0 &&
        cardsFit(
          { ...band, height: band.height - reservedPerFigure },
          cardsPerFigure,
          maxCardWidth,
        ),
    )
    if (usable) return count
  }
  return Math.min(...candidates)
}

/**
 * Largest size preset whose card still fits — templates ask for S/M/L, and a
 * tight trim has to be allowed to step the request down rather than overflow.
 */
export function fitCardSizePreset(
  field: Box,
  count: number,
  preferred: CardSizeName,
  cols?: number,
): CardSizeName {
  const order: CardSizeName[] = ['L', 'M', 'S']
  const start = order.indexOf(preferred)
  for (const size of order.slice(start < 0 ? 1 : start)) {
    try {
      arrangeCards({ field, count, cols, maxCardWidth: cardWidthForSize(size) })
      return size
    } catch {
      // Try the next size down.
    }
  }
  return 'S'
}
