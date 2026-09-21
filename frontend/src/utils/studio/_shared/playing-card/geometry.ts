/**
 * Card box maths and the pip-position lookup table.
 *
 * Everything is expressed as a fraction of the card box, so one table serves
 * all three size presets and any future one. Nothing here draws.
 *
 * The one thing that is *not* a fixed fraction is the pip field. A 12pt corner
 * index (§2.2) is a fixed physical size, so on a 0.9" card it eats a fifth of
 * the width and on a 1.5" card barely an eighth. Tabling one pip field for both
 * either collides at S or wastes half the face at L, which is what made every
 * card print its two pip columns jammed against the centre line. The field is
 * therefore *derived* from the index column that actually prints at that width
 * — see `pipFieldBox`.
 */

import {
  CARD_ASPECT,
  CARD_CORNER_RADIUS_RATIO,
  MIN_INDEX_PX,
  MIN_STROKE_PX,
  isCourtRank,
  pt,
  type Rank,
} from './types'
import { suitGlyph } from './suits'

export interface CardBox {
  left: number
  top: number
  width: number
  height: number
}

/** Pip anchor in pip-field fractions. y > 0.5 prints rotated 180 degrees. */
export interface PipAnchor {
  x: number
  y: number
}

const THIRD = 1 / 3
const SIXTH = 1 / 6

/**
 * The classic pip arrangement, A through 10.
 *
 * Column x values are 0 / 0.5 / 1 of the pip field; rows are spaced so each
 * rank reads as its familiar face. Anything below the vertical midline is
 * drawn rotated, which is what makes a real card look right either way up.
 */
export const PIP_LAYOUT: Record<number, readonly PipAnchor[]> = {
  1: [{ x: 0.5, y: 0.5 }],
  2: [
    { x: 0.5, y: 0 },
    { x: 0.5, y: 1 },
  ],
  3: [
    { x: 0.5, y: 0 },
    { x: 0.5, y: 0.5 },
    { x: 0.5, y: 1 },
  ],
  4: [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: 1, y: 1 },
  ],
  5: [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 0.5, y: 0.5 },
    { x: 0, y: 1 },
    { x: 1, y: 1 },
  ],
  6: [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: 0.5 },
    { x: 1, y: 0.5 },
    { x: 0, y: 1 },
    { x: 1, y: 1 },
  ],
  7: [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 0.5, y: 0.25 },
    { x: 0, y: 0.5 },
    { x: 1, y: 0.5 },
    { x: 0, y: 1 },
    { x: 1, y: 1 },
  ],
  8: [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 0.5, y: 0.25 },
    { x: 0, y: 0.5 },
    { x: 1, y: 0.5 },
    { x: 0.5, y: 0.75 },
    { x: 0, y: 1 },
    { x: 1, y: 1 },
  ],
  9: [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: THIRD },
    { x: 1, y: THIRD },
    { x: 0.5, y: 0.5 },
    { x: 0, y: 2 * THIRD },
    { x: 1, y: 2 * THIRD },
    { x: 0, y: 1 },
    { x: 1, y: 1 },
  ],
  10: [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 0.5, y: SIXTH },
    { x: 0, y: THIRD },
    { x: 1, y: THIRD },
    { x: 0, y: 2 * THIRD },
    { x: 1, y: 2 * THIRD },
    { x: 0.5, y: 5 * SIXTH },
    { x: 0, y: 1 },
    { x: 1, y: 1 },
  ],
}

/**
 * Top and bottom pip rows, as fractions of card height.
 *
 * A standard deck sets them a fifth of the way in, which reads as a margin.
 * Running the field closer to the edge fits no more pips — the columns, not the
 * rows, are what the rank sizes against — and puts the top row level with the
 * corner index, so the face looks like it slid upwards.
 */
const PIP_FIELD_TOP = 0.2
const PIP_FIELD_BOTTOM = 0.8

/**
 * Corner index column, in fractions of card width unless noted.
 *
 * Proportions are the ones a standard 2.5 x 3.5" deck uses, so a card printed
 * at 1.5" reads as a scaled playing card rather than as a diagram: the rank ink
 * starts 5.5% of the width in from the edge and its cap sits 4.6% of the height
 * down from the top.
 */
const INDEX_FONT_RATIO = 0.155
const INDEX_MARGIN_RATIO = 0.055
/** Floor under that margin on a heavy border, so ink never touches the frame. */
const INDEX_BORDER_CLEARANCE_RATIO = 0.015
const INDEX_TOP_RATIO = 0.046
/** Suit glyph under the rank character, as a fraction of the index font size. */
const INDEX_SUIT_RATIO = 0.66
/** "10" is the only two-glyph index; it has to give width back to fit. */
const WIDE_INDEX_SHRINK = 0.8
/** How many lining digits the widest corner index ("10") spans. */
const WIDE_INDEX_GLYPHS = 2
/** Approximate advance of one lining digit, in em. Budget, not a measurement. */
const INDEX_GLYPH_EM = 0.62
/**
 * Where a rank textbox drawn with `originY: 'center'` puts the cap top,
 * measured down from the textbox's own top, as a fraction of font size.
 *
 * Fabric centres a line box of `fontSize x FABRIC_FONT_SIZE_MULT` and the caps
 * sit inside that, so laying a rank out by its box top drops the ink a third of
 * its own height too low. Every rank glyph on a card — corner index, court
 * letter, compact card — is positioned by its *ink* through these two.
 */
export const RANK_CAP_TOP_RATIO = 0.1365
/** Cap height of the rank face, as a fraction of font size. */
export const RANK_CAP_HEIGHT_RATIO = 0.72
/** Clear space between the index column and the nearest pip, in card widths. */
const INDEX_PIP_GAP = 0.025

/** Widest pip aspect in the set (hearts) — the width constraint to respect. */
const WIDEST_PIP_ASPECT = Math.max(
  ...[0, 1, 2, 3].map((suit) => suitGlyph(suit as 0 | 1 | 2 | 3).aspect),
)

/** Share of the smallest centre-to-centre gap a pip may occupy. */
const PIP_PACKING = 0.88
const PIP_MAX_RATIO = 0.17
/** §2.2 — a pip below this share of the card width stops carrying the rank. */
const PIP_MIN_RATIO = 0.11
/** An Ace prints one large display pip, not a shrunken single. */
const ACE_PIP_RATIO = 0.4

/** Rank letter on a court card: fraction of card height (§3.2). */
const COURT_LETTER_RATIO = 0.36
/**
 * Suit pip on a court card, as a fraction of card width.
 *
 * Larger than a numbered rank's pip: a court face carries two of them against a
 * letter half the height of the card, and a 2's pip at that scale reads as a
 * speck someone forgot to delete rather than as the card's suit.
 */
const COURT_PIP_RATIO = 0.22

/** Cross-hatch pitch on the card back, in inches (§3.2). */
export const CARD_BACK_HATCH_PITCH_IN = 0.1
/** Inner frame on the card back, as a fraction of card width. */
export const CARD_BACK_FRAME_INSET = 0.075

export interface CardMetrics {
  width: number
  height: number
  cornerRadius: number
  borderWidth: number
  /**
   * Every line on the card other than the outer frame — suit outlines, the
   * card-back frame, the hatch. One weight so a page of cards reads as one
   * deck instead of four stroke weights fighting each other.
   */
  lineWidth: number
  /** Inset from the card edge to the drawable interior. */
  inset: number
  indexFontSize: number
  indexWideFontSize: number
  indexSuitSize: number
  indexCenterX: number
  /** Half the width budgeted for the widest index ("10"), about `indexCenterX`. */
  indexColumnHalfWidth: number
  indexTopY: number
  pipField: CardBox
  courtLetterSize: number
}

/**
 * The corner index column that actually prints at this width.
 *
 * All ranks share one column axis — `centerX` is sized for "10", so an Ace has
 * air to its left rather than its own axis, which is what keeps a fanned row of
 * mixed ranks looking aligned.
 */
function indexColumn(width: number, borderWidth: number) {
  const fontSize = Math.max(MIN_INDEX_PX, width * INDEX_FONT_RATIO)
  const wideFontSize = Math.max(MIN_INDEX_PX, fontSize * WIDE_INDEX_SHRINK)
  const halfWidth = (wideFontSize * INDEX_GLYPH_EM * WIDE_INDEX_GLYPHS) / 2
  // The border is drawn centred on the card edge, so a hairline card still owes
  // the index half a stroke of clearance before its own margin starts.
  const margin = Math.max(
    width * INDEX_MARGIN_RATIO,
    borderWidth + width * INDEX_BORDER_CLEARANCE_RATIO,
  )
  return {
    fontSize,
    wideFontSize,
    suitSize: fontSize * INDEX_SUIT_RATIO,
    halfWidth,
    centerX: margin + halfWidth,
    right: margin + halfWidth * 2,
  }
}

/**
 * Pip field for a card of this width, derived from its index column.
 *
 * The pip columns sit as far apart as the card allows: the outer column's ink
 * starts one `INDEX_PIP_GAP` clear of the index, and everything left over is
 * the field. Solving that as a fixed point (the pip's own width depends on the
 * field it has to fit in) is what lets an L card spread its columns to 0.31/0.69
 * while an S card, whose 12pt index is proportionally twice as wide, closes to
 * 0.37/0.63 instead of colliding.
 */
export function pipFieldBox(width: number, borderWidth: number): CardBox {
  const height = cardHeightForWidth(width)
  const columnInk = indexColumn(width, borderWidth).right + width * INDEX_PIP_GAP
  // left = columnInk + pipWidth/2, with pipWidth = PIP_PACKING * (width - 2*left) / 2.
  // (The suit aspect cancels: the packing rule sizes the pip by the *scaled*
  // column gap, so its width is that gap times the packing share.)
  const left = (columnInk + (PIP_PACKING * width) / 4) / (1 + PIP_PACKING / 2)
  const top = height * PIP_FIELD_TOP
  return {
    left,
    top,
    width: width - left * 2,
    height: height * (PIP_FIELD_BOTTOM - PIP_FIELD_TOP),
  }
}

/** Card height from its width — poker standard 5:7. */
export function cardHeightForWidth(width: number): number {
  return width / CARD_ASPECT
}

/** Card width that fits a box of the given height. */
export function cardWidthForHeight(height: number): number {
  return height * CARD_ASPECT
}

/**
 * How much room the pip field has to spare. Negative means the card is too
 * small to print a face — what `MIN_CARD_WIDTH_PX` is derived from.
 *
 * Two rules, whichever bites first:
 *
 * 1. The field stays at least as wide as the corner index column that pushed
 *    it inwards. A 12pt index is a fixed physical size (§2.2), so it grows as a
 *    share of every smaller card until the pips are narrower than their own
 *    labels — past that what prints is an index with decoration on it, not a
 *    playing card.
 * 2. The pip itself stays above `PIP_MIN_RATIO` of the card width, below which
 *    it stops carrying the rank at POD grayscale.
 */
export function pipFieldSlack(width: number, borderWeightPt = 1): number {
  const borderWidth = Math.max(MIN_STROKE_PX, pt(borderWeightPt))
  const field = pipFieldBox(width, borderWidth)
  if (field.width <= 0) return -width
  return Math.min(
    field.width - indexColumn(width, borderWidth).halfWidth * 2,
    tightestPipSize(field) - width * PIP_MIN_RATIO,
  )
}

/**
 * Narrowest card the face still prints correctly.
 *
 * Derived rather than picked: both halves of `pipFieldSlack` are print
 * requirements from §2.2, and this is simply the width at which the tighter of
 * them runs out. It lands just under the S tier, which is what keeps layout
 * free to round a grid down a hair without dropping below a printable face.
 */
export const MIN_CARD_WIDTH_PX = (() => {
  for (let width = 40; width <= 200; width += 0.5) {
    if (pipFieldSlack(width) >= 0) return width
  }
  return 200
})()

/**
 * Resolve every derived measurement for a card of `width` pixels.
 * Border weight arrives in points and is floored at the print minimum (§2.2).
 */
export function cardMetrics(width: number, borderWeightPt: number): CardMetrics {
  const height = cardHeightForWidth(width)
  const borderWidth = Math.max(MIN_STROKE_PX, pt(borderWeightPt))
  const index = indexColumn(width, borderWidth)
  return {
    width,
    height,
    cornerRadius: width * CARD_CORNER_RADIUS_RATIO,
    borderWidth,
    lineWidth: borderWidth,
    inset: borderWidth,
    indexFontSize: index.fontSize,
    indexWideFontSize: index.wideFontSize,
    indexSuitSize: index.suitSize,
    indexCenterX: index.centerX,
    indexColumnHalfWidth: index.halfWidth,
    // Positioned by where the *ink* lands, not by where the textbox starts.
    indexTopY: Math.max(
      borderWidth,
      height * INDEX_TOP_RATIO - index.fontSize * RANK_CAP_TOP_RATIO,
    ),
    pipField: pipFieldBox(width, borderWidth),
    courtLetterSize: height * COURT_LETTER_RATIO,
  }
}

/**
 * Largest pip that keeps every pair of pips apart on *every* rank.
 *
 * Measured from the layout rather than tabled per rank, and taken across the
 * whole deck rather than per card: sizing each rank to its own tightest pair
 * gives a 4 pips a fifth larger than a 10's, and a spread of mixed ranks then
 * reads as cards from different decks. One size for 2 through 10 is what a real
 * deck does, and it is the 10 — a centre pip a third of a row from its diagonal
 * neighbours — that sets it.
 */
function tightestPipSize(field: CardBox): number {
  let smallestGap = Math.min(field.width / WIDEST_PIP_ASPECT, field.height)

  for (let rank = 2; rank <= 10; rank++) {
    const anchors = PIP_LAYOUT[rank]
    for (let i = 0; i < anchors.length; i++) {
      for (let j = i + 1; j < anchors.length; j++) {
        const dx = (Math.abs(anchors[i].x - anchors[j].x) * field.width) / WIDEST_PIP_ASPECT
        const dy = Math.abs(anchors[i].y - anchors[j].y) * field.height
        // Two pips clear each other as soon as EITHER axis separates them.
        const gap = Math.max(dx, dy)
        if (gap < smallestGap) smallestGap = gap
      }
    }
  }

  return smallestGap * PIP_PACKING
}

/** The one pip size every 2 through 10 on this card is drawn at. */
export function deckPipSize(metrics: CardMetrics): number {
  return Math.min(
    metrics.width * PIP_MAX_RATIO,
    Math.max(metrics.width * PIP_MIN_RATIO, tightestPipSize(metrics.pipField)),
  )
}

/** Pip size for a rank: one deck-wide size, with the Ace's display pip apart. */
export function pipSizeForRank(rank: Rank, metrics: CardMetrics): number {
  if (isCourtRank(rank)) return 0
  if (rank === 1) return metrics.width * ACE_PIP_RATIO
  return deckPipSize(metrics)
}

/** Absolute pip centres for a rank, in card-local coordinates. */
export function pipCenters(
  rank: Rank,
  metrics: CardMetrics,
): { x: number; y: number; rotated: boolean }[] {
  if (isCourtRank(rank)) return []
  const field = metrics.pipField
  return PIP_LAYOUT[rank].map((anchor) => ({
    x: field.left + anchor.x * field.width,
    y: field.top + anchor.y * field.height,
    rotated: anchor.y > 0.5,
  }))
}

/** The suit pip a court face prints above and below its rank letter. */
export function courtPipSize(metrics: CardMetrics): number {
  return metrics.width * COURT_PIP_RATIO
}

/**
 * Where a court card's two suit pips sit.
 *
 * Aligned by their outer *edge* to the numbered ranks' top and bottom pip rows,
 * not by their centres: the court pip is the larger mark, and centring both on
 * the same line would leave a J sitting a few points closer to the card edge
 * than the 4 beside it on the page.
 */
export function courtPipCenters(
  metrics: CardMetrics,
): { x: number; y: number; rotated: boolean }[] {
  const field = metrics.pipField
  const inset = (courtPipSize(metrics) - deckPipSize(metrics)) / 2
  const x = field.left + field.width / 2
  return [
    { x, y: field.top + inset, rotated: false },
    { x, y: field.top + field.height - inset, rotated: true },
  ]
}
