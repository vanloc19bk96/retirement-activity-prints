/**
 * The one card renderer. Six templates draw through this file.
 *
 * Every face is emitted as a Fabric group of polygons, rects and text, in pure
 * K black on white paper (§2.1/§2.2). No colour, no transparency, no raster
 * asset, nothing below the print-safety floors.
 */

import type { StudioFabricObject, StudioRole } from '@/types/studio-template.types'
import { STUDIO_DIGIT_FONT } from '@/constants/studio.constants'
import { DPI } from '@/types/canvas-settings.types'
import {
  buildGroup,
  buildLine,
  buildPolygon,
  buildRect,
  buildText,
  type StudioTag,
} from '../../studio-fabric-builders'
import { estimateTextBoxWidth, unionObjectBounds } from '../../studio-layout'
import { measureRunWidth } from '../../studio-text-metrics'
import {
  CARD_BACK_FRAME_INSET,
  CARD_BACK_HATCH_PITCH_IN,
  RANK_CAP_HEIGHT_RATIO,
  RANK_CAP_TOP_RATIO,
  cardMetrics,
  courtPipCenters,
  courtPipSize,
  pipCenters,
  pipSizeForRank,
  type CardMetrics,
} from './geometry'
import { suitPolygons, type Pt } from './suits'
import {
  CARD_INK,
  CARD_PAPER,
  CARD_TINT_35,
  DEFAULT_CARD_STYLE,
  MIN_INDEX_PX,
  MIN_STROKE_PX,
  RANK_LABELS,
  isCourtRank,
  isRedSuit,
  pt,
  type Card,
  type CardStyle,
  type Rank,
  type Suit,
} from './types'

/**
 * Rank glyphs render in the Studio's lining-figure face. It ships under the SIL
 * Open Font License, which permits embedding and commercial print output — the
 * licence audit §2.3 asks for. Converting these few glyphs to outlines at
 * export removes even that dependency.
 */
const CARD_TEXT_FONT = STUDIO_DIGIT_FONT

/** Compact-card proportions: rank letter and suit mark, as fractions of width. */
const COMPACT_RANK_RATIO = 0.4
const COMPACT_SUIT_RATIO = 0.26
/** Air between the compact card's rank ink and its suit mark, in card widths. */
const COMPACT_STACK_GAP = 0.07

/** Height a court face keeps clear around its rank letter, in card heights. */
const COURT_LETTER_RESERVE = 0.14

/**
 * Last-resort clearance between an overflowing corner index and the pip column,
 * in card widths. The geometry normally keeps them apart; this only bites when
 * a font measures wider than the em budget `indexColumn` reserved.
 */
const INDEX_PIP_GUARD = 0.02

/**
 * Vertical centre of a rank textbox whose *cap top* should land on `capTop`.
 * Rank glyphs are placed by their ink everywhere on the card, so a corner
 * index, a court letter and a compact rank all keep the same optical margin.
 */
function rankCenterYForCapTop(capTop: number, fontSize: number): number {
  return capTop + fontSize * (0.5 - RANK_CAP_TOP_RATIO)
}

/**
 * Narrowest compact card whose rank letter still clears the 12pt floor (§2.2).
 * Kept at the denser packing ratio so sequence rows still tile; the display
 * ratio above is smaller, so the font hits `MIN_INDEX_PX` until the card grows.
 */
export const MIN_COMPACT_CARD_WIDTH = MIN_INDEX_PX / 0.42

export interface CardRenderOptions {
  /** Card box top-left in canvas coordinates. */
  left: number
  top: number
  /** Card box width; height follows the 5:7 aspect. */
  width: number
  style?: Partial<CardStyle>
  tag: StudioTag
  role?: StudioRole
}

interface Paint {
  fill: string
  stroke: string
  strokeWidth: number
}

/**
 * Monochrome suit treatment (§2.1). Black suits fill solid; red suits print as
 * outlines by default, which survives cheap POD grayscale where a tint bands.
 */
function suitPaint(suit: Suit, style: CardStyle, lineWidth: number): Paint {
  if (!isRedSuit(suit)) {
    return { fill: CARD_INK, stroke: 'transparent', strokeWidth: 0 }
  }
  // Outlined suits carry the card's one line weight, so a heart never reads
  // lighter than the frame around it or heavier than the hatch behind it.
  const strokeWidth = Math.max(MIN_STROKE_PX, lineWidth)
  return style.redSuitStyle === 'gray35'
    ? { fill: CARD_TINT_35, stroke: CARD_INK, strokeWidth }
    : { fill: 'transparent', stroke: CARD_INK, strokeWidth }
}

function resolveStyle(style?: Partial<CardStyle>): CardStyle {
  return { ...DEFAULT_CARD_STYLE, ...style }
}

/** Turn a polygon 180 degrees about a point, rather than leaning on Fabric angle. */
function rotatePoints(points: readonly Pt[], cx: number, cy: number): Pt[] {
  return points.map((p) => ({
    x: Math.round((2 * cx - p.x) * 100) / 100,
    y: Math.round((2 * cy - p.y) * 100) / 100,
  }))
}

function polygonObject(
  points: Pt[],
  paint: Paint,
  tag: StudioTag,
  role: StudioRole,
): StudioFabricObject {
  let minX = Infinity
  let minY = Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
  }
  return buildPolygon(
    {
      left: minX,
      top: minY,
      points: points.map((p) => ({ x: p.x - minX, y: p.y - minY })),
      fill: paint.fill,
      stroke: paint.stroke,
      strokeWidth: paint.strokeWidth,
      strokeUniform: true,
      strokeLineJoin: 'round',
    },
    tag,
    role,
  )
}

/** One suit mark (one polygon for hearts/diamonds, two for spades/clubs). */
function drawSuitMark(options: {
  suit: Suit
  cx: number
  cy: number
  size: number
  rotated?: boolean
  style: CardStyle
  /** The card's one line weight; outlined suits are drawn at it. */
  lineWidth: number
  tag: StudioTag
  role: StudioRole
}): StudioFabricObject[] {
  const { suit, cx, cy, size, rotated, style, lineWidth, tag, role } = options
  const paint = suitPaint(suit, style, lineWidth)
  return suitPolygons(suit, cx, cy, size).map((points) =>
    polygonObject(rotated ? rotatePoints(points, cx, cy) : points, paint, tag, role),
  )
}

function drawCardBorder(
  box: { left: number; top: number },
  metrics: CardMetrics,
  tag: StudioTag,
  role: StudioRole,
): StudioFabricObject {
  return buildRect(
    {
      left: box.left,
      top: box.top,
      width: metrics.width,
      height: metrics.height,
      rx: metrics.cornerRadius,
      ry: metrics.cornerRadius,
      fill: CARD_PAPER,
      stroke: CARD_INK,
      strokeWidth: metrics.borderWidth,
    },
    tag,
    role,
  )
}

/**
 * Corner index: rank character over a small suit glyph, top-left, repeated
 * bottom-right rotated 180 degrees. Either half can be omitted, which is what
 * a partial clue prints (§3.2).
 */
function drawCornerIndices(options: {
  left: number
  top: number
  metrics: CardMetrics
  rank: Rank | null
  suit: Suit | null
  style: CardStyle
  tag: StudioTag
  role: StudioRole
}): StudioFabricObject[] {
  const { left, top, metrics, rank, suit, style, tag, role } = options
  const objects: StudioFabricObject[] = []
  const label = rank == null ? '' : RANK_LABELS[rank]
  const isWide = label.length > 1
  let fontSize = isWide ? metrics.indexWideFontSize : metrics.indexFontSize
  const corners = style.cornerIndices === 'both' ? [false, true] : [false]

  const measureLabel = (size: number): number =>
    label === ''
      ? 0
      : measureRunWidth(label, size, {
          fontFamily: CARD_TEXT_FONT,
          fontWeight: 600,
        })

  // Every rank shares one column axis, and the pip field was derived to clear
  // it (see `pipFieldBox`), so the only thing left to do here is keep the real
  // glyph run inside the column the geometry budgeted. "10" is the one label
  // that can overflow it: it gives width back until it fits, never below the
  // 12pt floor.
  const columnWidth = metrics.indexColumnHalfWidth * 2
  while (fontSize > MIN_INDEX_PX && measureLabel(fontSize) > columnWidth) {
    fontSize -= 0.5
  }

  const runWidth = measureLabel(fontSize)
  const halfRun = runWidth / 2
  // A face whose digits are wider than the em budget still cannot be allowed
  // onto the pips: pull the whole column back towards the card edge instead.
  const minCenterX = metrics.borderWidth + halfRun
  const maxCenterX = metrics.pipField.left - metrics.width * INDEX_PIP_GUARD - halfRun
  const indexCenterX = Math.min(
    Math.max(metrics.indexCenterX, minCenterX),
    Math.max(minCenterX, maxCenterX),
  )
  const boxWidth =
    label === ''
      ? 0
      : Math.min(metrics.width, Math.max(runWidth + fontSize * 0.08, fontSize))
  // The suit mark tracks whatever size the rank settled at, so a "10" index and
  // an "A" index read as the same mark at the same distance below the rank.
  const indexSuitSize = metrics.indexSuitSize * (fontSize / metrics.indexFontSize)
  const capTop = metrics.indexTopY + fontSize * RANK_CAP_TOP_RATIO
  const rankCenterY = rankCenterYForCapTop(capTop, fontSize)
  const suitCenterY =
    capTop + fontSize * RANK_CAP_HEIGHT_RATIO + fontSize * 0.2 + indexSuitSize / 2

  for (const flip of corners) {
    const x = flip
      ? left + metrics.width - indexCenterX
      : left + indexCenterX
    const rankY = flip ? top + metrics.height - rankCenterY : top + rankCenterY
    const suitY = flip ? top + metrics.height - suitCenterY : top + suitCenterY

    if (label) {
      objects.push(
        buildText(
          {
            left: x,
            top: rankY,
            text: label,
            width: boxWidth,
            fontSize,
            fontFamily: CARD_TEXT_FONT,
            fontWeight: 600,
            lineHeight: 1,
            textAlign: 'center',
            originX: 'center',
            originY: 'center',
            fill: CARD_INK,
            editable: false,
          },
          tag,
          role,
        ),
      )
      if (flip) objects[objects.length - 1].angle = 180
    }
    if (suit != null) {
      objects.push(
        ...drawSuitMark({
          suit,
          cx: x,
          cy: suitY,
          size: indexSuitSize,
          rotated: flip,
          style,
          lineWidth: metrics.lineWidth,
          tag,
          role,
        }),
      )
    }
  }
  return objects
}

/**
 * Court face: one large rank letter between two suit pips.
 *
 * A J, Q and K carry no figure (§2.3 — every commercial court illustration is
 * that publisher's artwork), so the letter has to do the work. The suit pips
 * are not decoration: without them a Queen of Hearts and a Queen of Diamonds
 * differ only in two corner marks a few millimetres tall, which is not a
 * distinction a memory puzzle can be built on. They sit at the top and bottom
 * of the same pip field the numbered ranks use, so a J and a 4 on the same page
 * share one optical margin, and the bottom one is turned so the face reads the
 * same either way up.
 */
function drawCourtFace(options: {
  left: number
  top: number
  metrics: CardMetrics
  card: Card
  style: CardStyle
  tag: StudioTag
  role: StudioRole
}): StudioFabricObject[] {
  const { left, top, metrics, card, style, tag, role } = options
  const cx = left + metrics.width / 2
  const cy = top + metrics.height / 2
  const pipSize = courtPipSize(metrics)
  // Air between the two pips the letter is allowed to fill. The reserve covers
  // both the gap either side and the Q's descending tail, which sits below the
  // cap height every other rank is measured by.
  const band = metrics.pipField.height - pipSize - metrics.height * COURT_LETTER_RESERVE
  const fontSize = Math.min(metrics.courtLetterSize, band / RANK_CAP_HEIGHT_RATIO)
  const label = RANK_LABELS[card.rank]

  return [
    ...courtPipCenters(metrics).flatMap((pip) =>
      drawSuitMark({
        suit: card.suit,
        cx: left + pip.x,
        cy: top + pip.y,
        size: pipSize,
        rotated: pip.rotated,
        style,
        lineWidth: metrics.lineWidth,
        tag,
        role,
      }),
    ),
    buildText(
      {
        left: cx,
        // Centre the cap, not the em box, or the letter reads low on the face.
        top: rankCenterYForCapTop(cy - (fontSize * RANK_CAP_HEIGHT_RATIO) / 2, fontSize),
        text: label,
        width: estimateTextBoxWidth(label, fontSize, metrics.width),
        fontSize,
        fontFamily: CARD_TEXT_FONT,
        fontWeight: 600,
        lineHeight: 1,
        textAlign: 'center',
        originX: 'center',
        originY: 'center',
        fill: CARD_INK,
        editable: false,
      },
      tag,
      role,
    ),
  ]
}

/** Full card face: border, corner indices, and pips or a court device. */
export function renderCard(card: Card, options: CardRenderOptions): StudioFabricObject {
  const style = resolveStyle(options.style)
  const role = options.role ?? 'prompt'
  const metrics = cardMetrics(options.width, style.borderWeight)
  const { left, top, tag } = options

  const parts: StudioFabricObject[] = [drawCardBorder({ left, top }, metrics, tag, role)]

  if (isCourtRank(card.rank)) {
    parts.push(...drawCourtFace({ left, top, metrics, card, style, tag, role }))
  } else {
    const pipSize = pipSizeForRank(card.rank, metrics)
    for (const pip of pipCenters(card.rank, metrics)) {
      parts.push(
        ...drawSuitMark({
          suit: card.suit,
          cx: left + pip.x,
          cy: top + pip.y,
          size: pipSize,
          rotated: pip.rotated,
          style,
          lineWidth: metrics.lineWidth,
          tag,
          role,
        }),
      )
    }
  }

  parts.push(
    ...drawCornerIndices({
      left,
      top,
      metrics,
      rank: card.rank,
      suit: card.suit,
      style,
      tag,
      role,
    }),
  )

  return groupCard(parts, { left, top, metrics, tag, role })
}

/**
 * Partial card — rank without suit, or suit without rank.
 * Shared renderer helper for templates that show incomplete clues (§3.2).
 */
export function renderPartialCard(
  partial: { rank?: Rank | null; suit?: Suit | null },
  options: CardRenderOptions,
): StudioFabricObject {
  const style = resolveStyle(options.style)
  const role = options.role ?? 'prompt'
  const metrics = cardMetrics(options.width, style.borderWeight)
  const { left, top, tag } = options
  const rank = partial.rank ?? null
  const suit = partial.suit ?? null

  const parts: StudioFabricObject[] = [drawCardBorder({ left, top }, metrics, tag, role)]
  const cx = left + metrics.width / 2
  const cy = top + metrics.height / 2

  if (rank != null) {
    // Same letter a court card prints, so a rank-only clue and a K sit at the
    // same size on the same page.
    const fontSize = metrics.courtLetterSize
    parts.push(
      buildText(
        {
          left: cx,
          top: rankCenterYForCapTop(cy - (fontSize * RANK_CAP_HEIGHT_RATIO) / 2, fontSize),
          text: RANK_LABELS[rank],
          width: estimateTextBoxWidth(RANK_LABELS[rank], fontSize, metrics.width),
          fontSize,
          fontFamily: CARD_TEXT_FONT,
          fontWeight: 600,
          lineHeight: 1,
          textAlign: 'center',
          originX: 'center',
          originY: 'center',
          fill: CARD_INK,
          editable: false,
        },
        tag,
        role,
      ),
    )
  } else if (suit != null) {
    parts.push(
      // The Ace's display pip — the largest single suit mark the face carries.
      ...drawSuitMark({
        suit,
        cx,
        cy,
        size: pipSizeForRank(1, metrics),
        style,
        lineWidth: metrics.lineWidth,
        tag,
        role,
      }),
    )
  }

  parts.push(...drawCornerIndices({ left, top, metrics, rank, suit, style, tag, role }))

  return groupCard(parts, { left, top, metrics, tag, role })
}

/**
 * Compact card: border, a large rank letter and one suit mark, no pip field.
 *
 * Sequence puzzles need six or more figures on a page to clear the §4.5
 * entropy floor, and a full pip face at the 0.9" floor simply does not tile
 * that densely on a KDP trim. Dropping the pips removes the constraint that
 * sets that floor — the corner index colliding with the pip column — so a
 * compact card stays legible down to `MIN_COMPACT_CARD_WIDTH`, where its rank
 * letter is still 12pt. The rank and suit are what a sequence puzzle is about;
 * the pip count is not.
 */
export function renderCompactCard(
  card: Card,
  options: CardRenderOptions,
): StudioFabricObject {
  const style = resolveStyle(options.style)
  const role = options.role ?? 'prompt'
  const metrics = cardMetrics(options.width, style.borderWeight)
  const { left, top, tag } = options
  const label = RANK_LABELS[card.rank]
  const fontSize = Math.max(
    MIN_INDEX_PX,
    metrics.width * (label.length > 1 ? COMPACT_RANK_RATIO * 0.78 : COMPACT_RANK_RATIO),
  )
  const suitSize = metrics.width * COMPACT_SUIT_RATIO
  // Centre the rank-over-suit stack by its ink, not by two tabled fractions:
  // a "10" sets a shorter letter than a "K", and a stack pinned to fixed
  // heights then sits visibly high on one card and low on the next.
  const gap = metrics.width * COMPACT_STACK_GAP
  const capHeight = fontSize * RANK_CAP_HEIGHT_RATIO
  const capTop = top + (metrics.height - (capHeight + gap + suitSize)) / 2

  const parts: StudioFabricObject[] = [
    drawCardBorder({ left, top }, metrics, tag, role),
    buildText(
      {
        left: left + metrics.width / 2,
        top: rankCenterYForCapTop(capTop, fontSize),
        text: label,
        width: estimateTextBoxWidth(label, fontSize, metrics.width),
        fontSize,
        fontFamily: CARD_TEXT_FONT,
        fontWeight: 600,
        lineHeight: 1,
        textAlign: 'center',
        originX: 'center',
        originY: 'center',
        fill: CARD_INK,
        editable: false,
      },
      tag,
      role,
    ),
    ...drawSuitMark({
      suit: card.suit,
      cx: left + metrics.width / 2,
      cy: capTop + capHeight + gap + suitSize / 2,
      size: suitSize,
      style,
      lineWidth: metrics.lineWidth,
      tag,
      role,
    }),
  ]

  return groupCard(parts, { left, top, metrics, tag, role })
}

export interface CardWriteLabelOptions {
  /** Slot left edge — label is centred in `width`. */
  left: number
  width: number
  /** Write-in line y; rank and suit sit on this baseline. */
  baseline: number
  fontSize: number
  tag: StudioTag
  role?: StudioRole
  style?: Partial<CardStyle>
}

/**
 * Rank letter + vector suit for write-in answer keys.
 *
 * Never put ♠♥♦♣ in a textbox — Inter (and most catalog faces) lack those
 * glyphs. Canvas font-fallback looks fine in the editor; PDF/SVG outline
 * export substitutes "?" and the download diverges from the editor.
 */
export function renderCardWriteLabel(
  card: Card,
  options: CardWriteLabelOptions,
): StudioFabricObject[] {
  const style = resolveStyle(options.style)
  const role = options.role ?? 'answer'
  const { left, width, baseline, fontSize, tag } = options
  const label = RANK_LABELS[card.rank]
  const suitSize = fontSize * 0.92
  const rankWidth = measureRunWidth(label, fontSize, {
    fontFamily: CARD_TEXT_FONT,
    fontWeight: 600,
  })
  const gap = fontSize * 0.14
  const totalWidth = rankWidth + gap + suitSize
  const originX = left + (width - totalWidth) / 2
  const suitCx = originX + rankWidth + gap + suitSize / 2
  const suitCy = baseline - suitSize / 2

  return [
    buildText(
      {
        left: originX,
        top: baseline,
        text: label,
        width: estimateTextBoxWidth(label, fontSize, width),
        fontSize,
        fontFamily: CARD_TEXT_FONT,
        fontWeight: 600,
        lineHeight: 1,
        textAlign: 'left',
        originX: 'left',
        originY: 'bottom',
        fill: CARD_INK,
        editable: false,
      },
      tag,
      role,
    ),
    ...drawSuitMark({
      suit: card.suit,
      cx: suitCx,
      cy: suitCy,
      size: suitSize,
      // No card box here, so the weight comes off the label itself — an
      // answer-key suit still has to match the rule it sits on.
      lineWidth: Math.max(MIN_STROKE_PX, pt(1)),
      style,
      tag,
      role,
    }),
  ]
}

/** Border only — the write-in slot on a free-recall page (§3.2). */
export function renderBlankCard(options: CardRenderOptions): StudioFabricObject {
  const style = resolveStyle(options.style)
  const role = options.role ?? 'structure'
  const metrics = cardMetrics(options.width, style.borderWeight)
  const { left, top, tag } = options
  return groupCard([drawCardBorder({ left, top }, metrics, tag, role)], {
    left,
    top,
    metrics,
    tag,
    role,
  })
}

/**
 * 45-degree hatch segments clipped to `box`, one family per direction.
 * Computed analytically because Fabric JSON carries no clip path we can
 * serialise, and an unclipped hatch would run across the whole page.
 */
function hatchSegments(
  box: { left: number; top: number; width: number; height: number },
  pitch: number,
): { x1: number; y1: number; x2: number; y2: number }[] {
  const segments: { x1: number; y1: number; x2: number; y2: number }[] = []
  const { left, top, width, height } = box
  const right = left + width
  const bottom = top + height
  const step = pitch * Math.SQRT2

  for (const slope of [1, -1] as const) {
    // Line y = slope*x + c. Sweep c over every value that crosses the box.
    const cAtCorners = [
      top - slope * left,
      top - slope * right,
      bottom - slope * left,
      bottom - slope * right,
    ]
    const first = Math.ceil(Math.min(...cAtCorners) / step) * step
    const last = Math.max(...cAtCorners)
    for (let c = first; c <= last; c += step) {
      const yAt = (x: number) => slope * x + c
      const xAt = (y: number) => (y - c) / slope
      const xForTop = xAt(top)
      const xForBottom = xAt(bottom)
      const xMin = Math.max(left, Math.min(xForTop, xForBottom))
      const xMax = Math.min(right, Math.max(xForTop, xForBottom))
      if (xMax - xMin < 0.5) continue
      segments.push({ x1: xMin, y1: yAt(xMin), x2: xMax, y2: yAt(xMax) })
    }
  }
  return segments
}

/** Face-down back: double border plus a 45-degree cross-hatch (§3.2). */
export function renderCardBack(options: CardRenderOptions): StudioFabricObject {
  const style = resolveStyle(options.style)
  const role = options.role ?? 'prompt'
  const metrics = cardMetrics(options.width, style.borderWeight)
  const { left, top, tag } = options
  const gap = metrics.width * CARD_BACK_FRAME_INSET
  const inner = {
    left: left + gap,
    top: top + gap,
    width: metrics.width - gap * 2,
    height: metrics.height - gap * 2,
  }

  const parts: StudioFabricObject[] = [
    drawCardBorder({ left, top }, metrics, tag, role),
    buildRect(
      {
        ...inner,
        // Concentric with the outer frame: an inner radius that is not the
        // outer radius less the inset reads as two unrelated rectangles.
        rx: Math.max(0, metrics.cornerRadius - gap),
        ry: Math.max(0, metrics.cornerRadius - gap),
        fill: 'transparent',
        stroke: CARD_INK,
        strokeWidth: metrics.lineWidth,
      },
      tag,
      role,
    ),
  ]

  // Hatch inside the inner border, held off it by a full stroke so the two
  // never double up and plug at POD resolution.
  const hatchInset = metrics.lineWidth * 1.5
  const field = {
    left: inner.left + hatchInset,
    top: inner.top + hatchInset,
    width: inner.width - hatchInset * 2,
    height: inner.height - hatchInset * 2,
  }
  for (const segment of hatchSegments(field, CARD_BACK_HATCH_PITCH_IN * DPI)) {
    parts.push(
      buildLine(
        {
          x1: Math.round(segment.x1 * 100) / 100,
          y1: Math.round(segment.y1 * 100) / 100,
          x2: Math.round(segment.x2 * 100) / 100,
          y2: Math.round(segment.y2 * 100) / 100,
          stroke: CARD_INK,
          strokeWidth: metrics.lineWidth,
          strokeUniform: true,
        },
        tag,
        role,
      ),
    )
  }

  return groupCard(parts, { left, top, metrics, tag, role })
}

function groupCard(
  parts: StudioFabricObject[],
  options: {
    left: number
    top: number
    metrics: CardMetrics
    tag: StudioTag
    role: StudioRole
  },
): StudioFabricObject {
  const { left, top, metrics, tag, role } = options
  const bounds = unionObjectBounds(parts) ?? {
    left,
    top,
    width: metrics.width,
    height: metrics.height,
  }
  // A hidden answer card must stay hidden as a whole: tagging the group
  // `answer` is what makes buildAnswerPage reveal it atomically. `source` tells
  // the answer key the card already paints itself in print-safe ink, so it is
  // not flattened to a black rectangle on the solution page.
  const group = buildGroup(parts, bounds, tag, role === 'answer' ? 'answer' : 'decoration')
  return { ...group, data: { ...(group.data ?? {}), source: 'playing-card' } }
}
