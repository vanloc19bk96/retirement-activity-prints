/**
 * Page furniture shared by the Card Games Pack.
 *
 * Six templates print the same handful of parts — figure captions, write-in
 * lines, dividers, section labels — and the §4.6 page-style pool exists to vary
 * them. Building them once here is what keeps that variation consistent, and
 * what stops six copies of the same layout code drifting apart.
 */

import type {
  StudioConfig,
  StudioFabricObject,
  StudioGenerateContext,
  StudioPageRole,
} from '@/types/studio-template.types'
import {
  STUDIO_BODY_SIZE,
  STUDIO_CONTENT_SAFE_INSET_X,
  STUDIO_INK,
  STUDIO_INK_MUTED,
  STUDIO_RULE,
  STUDIO_RULE_MEDIUM,
  STUDIO_STROKE_HAIRLINE,
  STUDIO_STROKE_NORMAL,
} from '@/constants/studio.constants'
import {
  buildGroup,
  buildLine,
  buildRect,
  buildText,
  type StudioTag,
} from '../studio-fabric-builders'
import {
  boxCenterX,
  columns as splitColumns,
  drawHeader,
  drawInstructionBand,
  insetHorizontal,
  estimateTextBoxWidth,
  fitFontSizeToWidth,
  splitTop,
  unionObjectBounds,
  type Box,
} from '../studio-layout'
import { MIN_STROKE_PX, pt } from './playing-card/types'
import { canonicalKeyData } from './uniqueness/hash'
import type {
  CardAnswerAffordance,
  CardDividerStyle,
  CardInstructionPlacement,
} from './uniqueness/page-style'

/** Hairline used across the pack, never below the 0.75pt print floor (§2.2). */
export const CARD_HAIRLINE = Math.max(MIN_STROKE_PX, STUDIO_STROKE_HAIRLINE)

/** §2.2 large-print body floor. Every label the pack prints clears it. */
export const CARD_LABEL_SIZE = Math.max(pt(16), STUDIO_BODY_SIZE * 0.75)

/**
 * Clear air under a caption / section label before the card figure.
 *
 * Labels used to leave only ~0.5× font size; bumping further than this starves
 * a 5×8 Cards Changed spread under the print floor, so keep the extra modest
 * and shared across the pack.
 */
export const CARD_LABEL_FIGURE_GAP = Math.ceil(CARD_LABEL_SIZE * 0.7)

export function cardTag(
  templateKey: string,
  ctx: StudioGenerateContext,
  pageRole: StudioPageRole = 'single',
): StudioTag {
  return { templateKey, instanceId: ctx.instanceId, pageRole }
}

/**
 * Wrap one puzzle figure in a group carrying its canonical hash.
 *
 * The hash is what the Studio's book-scoped ledger reads (§4.3): it speaks for
 * the whole subtree, so a figure that is a rotation of one already in the book
 * is recognised as a repeat instead of being transcribed vertex by vertex.
 */
export function wrapCardFigure(options: {
  objects: StudioFabricObject[]
  bounds?: Box
  templateKey: string
  canonicalHash: string
  tag: StudioTag
}): StudioFabricObject {
  const { objects, templateKey, canonicalHash, tag } = options
  const bounds = options.bounds ??
    unionObjectBounds(objects) ?? { left: 0, top: 0, width: 0, height: 0 }
  const group = buildGroup(objects, bounds, tag, 'decoration')
  return {
    ...group,
    data: { ...(group.data ?? {}), ...canonicalKeyData(templateKey, canonicalHash) },
  }
}

/**
 * Shrink-wrap drawn parts and re-center in `field` (integer snap, then recenter).
 *
 * Answer rings extend past card slots; when only some cells are ringed the
 * AABB drifts off the geometric center of the field. Call this after drawing
 * so the printed pack sits optically in the middle of the solution body.
 */
export function centerObjectsInBox(
  objects: StudioFabricObject[],
  field: Box,
): StudioFabricObject[] {
  const bounds = unionObjectBounds(objects)
  if (!bounds) return objects
  const dx = Math.round(field.left + (field.width - bounds.width) / 2 - bounds.left)
  const dy = Math.round(field.top + (field.height - bounds.height) / 2 - bounds.top)
  if (dx === 0 && dy === 0) return objects
  return objects.map((obj) => {
    const next: StudioFabricObject = { ...obj }
    if (typeof next.left === 'number') next.left += dx
    if (typeof next.top === 'number') next.top += dy
    // Center-origin lines keep x1/y1 relative to left/top — do not shift again.
    if (obj.type === 'line' && obj.originX === 'center') return next
    if (typeof next.x1 === 'number') next.x1 += dx
    if (typeof next.x2 === 'number') next.x2 += dx
    if (typeof next.y1 === 'number') next.y1 += dy
    if (typeof next.y2 === 'number') next.y2 += dy
    return next
  })
}

/**
 * Side inset for the card figure relative to the safe-area edge.
 *
 * Header copy uses the full `STUDIO_CONTENT_SAFE_INSET_X` rail (28px). Figures
 * reclaim most of that band so a 5x8 trim can still print a legible compact
 * row (Next Card multiple-choice needs ~353px of body width). Sitting at 6–12px
 * made full-width packs (Card Sums ladders, What Changed, Next Card rows) read
 * flush with the margin guide on bulk books. Twenty-two pixels is the shared
 * pack clearance — every card template gets the same air from `drawCardPageHeader`
 * without stacking a second per-game pad.
 */
export const CARD_FIGURE_EDGE_INSET = 22
/** Extra air under the figure so the last row does not sit on the bottom guide. */
const CARD_FIGURE_BOTTOM_INSET = 18

/**
 * Title plus instruction, honouring the page style's instruction placement.
 *
 * `underTitle` is the Studio's standard header. `aboveFigure` drops the
 * instruction out of the header band and prints it as its own strip over the
 * puzzle — the same words in a visibly different page, which is the whole
 * point of the F3 variety axes (§4.6).
 *
 * `content` is the full safe area. Header text sits on the shared Studio side
 * rail; the figure body is only lightly inset from the safe edge so cards
 * never print flush against the margin guide.
 */
export function drawCardPageHeader(options: {
  content: Box
  config: StudioConfig
  tag: StudioTag
  instruction: string
  placement: CardInstructionPlacement
  font: string
}): { objects: StudioFabricObject[]; body: Box } {
  const { content, config, tag, instruction, placement, font } = options
  const showInstructions = config.showInstructions !== false && Boolean(instruction)
  const textColumn = insetHorizontal(content, STUDIO_CONTENT_SAFE_INSET_X)
  const figureColumn = insetHorizontal(content, CARD_FIGURE_EDGE_INSET)
  const toFigureColumn = (box: Box): Box => ({
    left: figureColumn.left,
    width: figureColumn.width,
    top: box.top,
    height: Math.max(0, box.height - CARD_FIGURE_BOTTOM_INSET),
  })

  if (placement === 'underTitle') {
    const header = drawHeader(textColumn, config, tag, instruction)
    return { objects: header.objects, body: toFigureColumn(header.body) }
  }

  const header = drawHeader(textColumn, config, tag, '')
  if (!showInstructions) return { objects: header.objects, body: toFigureColumn(header.body) }

  const band = drawInstructionBand(header.body, instruction, font, tag)
  return {
    objects: [...header.objects, ...band.objects],
    body: toFigureColumn(band.body),
  }
}

/** Caption strip above a figure ("A", "3", "Puzzle 2"). Empty text draws nothing. */
export function drawFigureCaption(
  box: Box,
  text: string,
  font: string,
  tag: StudioTag,
): { objects: StudioFabricObject[]; body: Box } {
  if (!text) return { objects: [], body: box }
  const size = CARD_LABEL_SIZE
  const stripHeight = Math.ceil(size + CARD_LABEL_FIGURE_GAP)
  const [strip, rest] = splitTop(box, stripHeight)
  return {
    objects: [
      buildText(
        {
          left: strip.left,
          top: strip.top,
          text,
          width: estimateTextBoxWidth(text, size, strip.width),
          fontSize: size,
          fontFamily: font,
          fontWeight: 700,
          textAlign: 'left',
          fill: STUDIO_INK,
        },
        tag,
        'decoration',
      ),
    ],
    body: rest,
  }
}

/** Centred section label, e.g. "Ranks in use" or "Target". */
export function drawSectionLabel(
  box: Box,
  text: string,
  font: string,
  tag: StudioTag,
): { objects: StudioFabricObject[]; body: Box } {
  if (!text) return { objects: [], body: box }
  const size = CARD_LABEL_SIZE
  const stripHeight = Math.ceil(size + CARD_LABEL_FIGURE_GAP)
  const [strip, rest] = splitTop(box, stripHeight)
  return {
    objects: [
      buildText(
        {
          left: boxCenterX(strip),
          top: strip.top,
          text,
          width: estimateTextBoxWidth(text, size, strip.width),
          fontSize: size,
          fontFamily: font,
          textAlign: 'center',
          originX: 'center',
          fill: STUDIO_INK_MUTED,
        },
        tag,
        'decoration',
      ),
    ],
    body: rest,
  }
}

/** Rule between figures, per the page style's divider axis (§4.6). */
export function drawDivider(
  box: Box,
  style: CardDividerStyle,
  tag: StudioTag,
): StudioFabricObject[] {
  if (style === 'none') return []
  const y = Math.round(box.top + box.height / 2)
  const width = style === 'centeredRule' ? box.width * 0.32 : box.width
  const left = Math.round(box.left + (box.width - width) / 2)
  return [
    buildLine(
      { x1: left, y1: y, x2: left + width, y2: y, stroke: STUDIO_RULE_MEDIUM, strokeWidth: CARD_HAIRLINE },
      tag,
      'decoration',
    ),
  ]
}

/**
 * Ring padding around a circled card, as a fraction of card width.
 *
 * The ring is ink like any other: a field sized for the cards alone pushes it
 * past the safe margin, which is a §5.5 print rejection, not a cosmetic issue.
 * Callers inset their field by `ringInset` before arranging.
 */
export const CARD_RING_PAD_RATIO = 0.06

/**
 * Extra air between adjacent ring strokes, as a fraction of card width.
 * Keeps two circled neighbours reading as separate marks in print.
 */
const CARD_RING_AIR_RATIO = 0.04

/**
 * Minimum inter-card gap so answer rings never merge.
 *
 * Each ring extends `pad` past the card edge; Fabric centers the stroke on that
 * path, so half a stroke sticks out further. Two neighbouring rings therefore
 * need `2 * pad + stroke + air` of gutter — otherwise the key looks like one
 * continuous blob when changes sit side by side.
 */
export function ringClearanceGapRatio(cardWidth: number): number {
  const strokeFraction = STUDIO_STROKE_NORMAL / Math.max(1, cardWidth)
  return CARD_RING_PAD_RATIO * 2 + strokeFraction + CARD_RING_AIR_RATIO
}

/** Arrange knobs for any spread that draws `drawAnswerRing` on some slots. */
export function ringArrangeGaps(cardWidth: number): {
  gapRatio: number
  rowGapRatio: number
  minGapRatio: number
} {
  const clearance = ringClearanceGapRatio(cardWidth)
  return {
    gapRatio: clearance,
    rowGapRatio: clearance,
    minGapRatio: clearance,
  }
}

export function ringInset(cardWidth: number): number {
  return Math.ceil(cardWidth * CARD_RING_PAD_RATIO + STUDIO_STROKE_NORMAL)
}

/** Hidden ring marking one card as part of the answer. */
export function drawAnswerRing(
  slot: { left: number; top: number; width: number; height: number },
  tag: StudioTag,
  padRatio = CARD_RING_PAD_RATIO,
): StudioFabricObject {
  // A rounded rect rather than a circle: a 5:7 card inside a circle needs a
  // ring wider than the gap between columns, which then overlaps its
  // neighbours and stops reading as a mark on one card.
  const pad = slot.width * padRatio
  return buildRect(
    {
      left: slot.left - pad,
      top: slot.top - pad,
      width: slot.width + pad * 2,
      height: slot.height + pad * 2,
      rx: slot.width * 0.14,
      ry: slot.width * 0.14,
      fill: 'transparent',
      stroke: STUDIO_INK,
      strokeWidth: STUDIO_STROKE_NORMAL,
    },
    tag,
    'answer',
  )
}

export interface WriteInSlot {
  /** Printed on the solution page; hidden on the puzzle page. */
  answer: string
  /** Optional prefix always visible, e.g. "1." */
  prefix?: string
}

/**
 * Write-in answers, drawn as ruled lines or boxed fields per the page style.
 *
 * Each slot carries a hidden `answer` object, so the solution page is built by
 * the Studio's own answer-key pass rather than by a second layout routine that
 * could disagree with this one.
 */
export function drawWriteInSlots(options: {
  field: Box
  slots: readonly WriteInSlot[]
  affordance: CardAnswerAffordance
  cols?: number
  font: string
  tag: StudioTag
}): StudioFabricObject[] {
  const { field, slots, affordance, font, tag } = options
  if (slots.length === 0) return []

  const cols = Math.max(1, Math.min(options.cols ?? slots.length, slots.length))
  const rows = Math.ceil(slots.length / cols)

  // A lone write-in (e.g. "Final total = __") should sit centered under the
  // cards — stretching the rule edge-to-edge reads as left-stuck furniture.
  let layoutField = field
  if (slots.length === 1 && cols === 1) {
    const slot = slots[0]
    const size = fitFontSizeToWidth(
      slot.answer,
      field.width * 0.5,
      CARD_LABEL_SIZE,
      pt(12),
    )
    const prefixWidth = slot.prefix
      ? estimateTextBoxWidth(slot.prefix, size, field.width * 0.55)
      : 0
    const ruleWidth = Math.max(
      size * 4,
      estimateTextBoxWidth(slot.answer, size, field.width * 0.4) + size,
    )
    const contentWidth = Math.min(
      field.width,
      Math.max(prefixWidth + ruleWidth, field.width * 0.4),
    )
    layoutField = {
      left: field.left + (field.width - contentWidth) / 2,
      top: field.top,
      width: contentWidth,
      height: field.height,
    }
  }

  const cells = splitColumns(layoutField, cols, layoutField.width * 0.04)
  const rowHeight = layoutField.height / rows
  const objects: StudioFabricObject[] = []

  slots.forEach((slot, index) => {
    const col = index % cols
    const row = Math.floor(index / cols)
    const cell = cells[col]
    const top = layoutField.top + row * rowHeight
    const inner: Box = {
      left: cell.left,
      top,
      width: cell.width,
      height: rowHeight,
    }
    const size = fitFontSizeToWidth(
      slot.answer,
      inner.width * 0.9,
      CARD_LABEL_SIZE,
      pt(12),
    )
    const baseline = Math.round(inner.top + inner.height * 0.66)
    let textLeft = inner.left
    let textWidth = inner.width

    if (slot.prefix) {
      const prefixWidth = estimateTextBoxWidth(slot.prefix, size, inner.width * 0.55)
      objects.push(
        buildText(
          {
            left: inner.left,
            top: baseline - size,
            text: slot.prefix,
            width: prefixWidth,
            fontSize: size,
            fontFamily: font,
            fill: STUDIO_INK_MUTED,
          },
          tag,
          'decoration',
        ),
      )
      textLeft += prefixWidth
      textWidth -= prefixWidth
    }

    if (affordance === 'boxedField') {
      objects.push(
        buildRect(
          {
            left: textLeft,
            top: baseline - Math.round(size * 1.5),
            width: textWidth,
            height: Math.round(size * 1.7),
            fill: 'transparent',
            stroke: STUDIO_RULE,
            strokeWidth: CARD_HAIRLINE,
            rx: 4,
            ry: 4,
          },
          tag,
          'structure',
        ),
      )
    } else {
      objects.push(
        buildLine(
          {
            x1: textLeft,
            y1: baseline,
            x2: textLeft + textWidth,
            y2: baseline,
            stroke: STUDIO_RULE_MEDIUM,
            strokeWidth: CARD_HAIRLINE,
          },
          tag,
          'structure',
        ),
      )
    }

    objects.push(
      buildText(
        {
          left: textLeft + textWidth / 2,
          top: baseline - Math.round(size * 1.15),
          text: slot.answer,
          width: estimateTextBoxWidth(slot.answer, size, textWidth),
          fontSize: size,
          fontFamily: font,
          textAlign: 'center',
          originX: 'center',
          fill: STUDIO_INK,
        },
        tag,
        'answer',
      ),
    )
  })

  return objects
}

/** Height `drawWriteInSlots` needs for `count` slots in `cols` columns. */
export function writeInSlotsHeight(count: number, cols: number): number {
  const rows = Math.ceil(count / Math.max(1, cols))
  return rows * Math.ceil(CARD_LABEL_SIZE * 2.2)
}
