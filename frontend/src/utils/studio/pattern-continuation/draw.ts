import type { StudioFabricObject } from '@/types/studio-template.types'
import {
  STUDIO_BODY_SIZE,
  STUDIO_INK_MUTED,
  STUDIO_RULE_LIGHT,
  STUDIO_STROKE_HAIRLINE,
} from '@/constants/studio.constants'
import {
  buildGroup,
  buildRect,
  buildText,
  type StudioTag,
} from '../studio-fabric-builders'
import {
  boxCenterY,
  estimateTextBoxWidth,
  rows,
  unionObjectBounds,
  type Box,
} from '../studio-layout'
import type { PatternItem } from './types'

const LABEL_W = 44
const ROW_GUTTER = 8
const COL_PAD = 6
/** Prefer this row height when the field is tall enough; never force past the field. */
const PREFERRED_ROW_H = 72
const MIN_READABLE_ROW_H = 28
/** Example strip under the header — keep in sync with generate.ts layout. */
export const PATTERN_EXAMPLE_H = 32

function termFontSize(rowH: number, colW: number): number {
  const preferred = Math.min(STUDIO_BODY_SIZE, rowH * 0.45)
  return Math.max(12, Math.min(preferred, colW / 2.4))
}

function drawBlankCell(
  objects: StudioFabricObject[],
  box: Box,
  cx: number,
  colW: number,
  fontSize: number,
  answerText: string | undefined,
  font: string,
  tag: StudioTag,
): void {
  const blankW = Math.min(colW - COL_PAD * 2, 64)
  const blankH = box.height * 0.62
  const blankLeft = cx - blankW / 2
  const blankTop = box.top + (box.height - blankH) / 2
  objects.push(
    buildRect(
      {
        left: blankLeft,
        top: blankTop,
        width: blankW,
        height: blankH,
        stroke: STUDIO_RULE_LIGHT,
        strokeWidth: STUDIO_STROKE_HAIRLINE,
        fill: 'transparent',
      },
      tag,
      'structure',
    ),
  )
  if (answerText == null) return
  objects.push(
    buildText(
      {
        left: cx,
        top: boxCenterY(box),
        text: answerText,
        width: estimateTextBoxWidth(answerText, fontSize, blankW),
        fontFamily: font,
        fontSize,
        textAlign: 'center',
        originX: 'center',
        originY: 'center',
      },
      tag,
      'answer',
    ),
  )
}

function drawTermCell(
  objects: StudioFabricObject[],
  box: Box,
  cx: number,
  colW: number,
  text: string,
  fontSize: number,
  font: string,
  tag: StudioTag,
): void {
  objects.push(
    buildText(
      {
        left: cx,
        top: boxCenterY(box),
        text,
        width: estimateTextBoxWidth(text, fontSize, colW - COL_PAD),
        fontFamily: font,
        fontSize,
        textAlign: 'center',
        originX: 'center',
        originY: 'center',
      },
      tag,
      'prompt',
    ),
  )
}

/** Row height that always fits `itemCount` rows inside `fieldHeight`. */
export function fitRowHeight(fieldHeight: number, itemCount: number): number {
  if (itemCount <= 0) return PREFERRED_ROW_H
  const gutters = ROW_GUTTER * Math.max(0, itemCount - 1)
  const available = Math.max(1, fieldHeight - gutters)
  const byField = available / itemCount
  // Never use a floor that would push the stack past the field (title + instructions
  // shrink the body — a hard 36px min used to overflow the safe area).
  return Math.min(PREFERRED_ROW_H, Math.max(MIN_READABLE_ROW_H, byField))
}

/** Body under header (+ optional example) — shared sizing for question and solution. */
export function tableMetricsField(
  content: Box,
  headerHeight: number,
  showExample: boolean,
): Box {
  let field: Box = {
    left: content.left,
    top: content.top + headerHeight,
    width: content.width,
    height: Math.max(1, content.height - headerHeight),
  }
  if (showExample) {
    field = {
      ...field,
      top: field.top + PATTERN_EXAMPLE_H,
      height: Math.max(1, field.height - PATTERN_EXAMPLE_H),
    }
  }
  return field
}

export interface DrawItemTableOptions {
  /**
   * Field used to size rows/columns. Defaults to `field`. Pass the puzzle-page
   * body when drawing the answer key so both grids share the same dimensions.
   */
  metricsField?: Box
}

/**
 * Draw all items as one table: shared column width, each row centered. Rules
 * produce sequences of different lengths, so centering keeps short rows balanced
 * under the longest ones without a ragged left or right edge.
 *
 * Each sequence is its own group; the full table is one parent group.
 */
export function drawItemTable(
  objects: StudioFabricObject[],
  field: Box,
  items: PatternItem[],
  font: string,
  tag: StudioTag,
  options?: DrawItemTableOptions,
): void {
  const itemCount = items.length
  if (itemCount === 0) return

  const metrics = options?.metricsField ?? field
  const maxSlots = Math.max(1, ...items.map((item) => item.terms.length))
  // Leave room for originY-centered glyphs past the row box.
  const glyphPad = 10
  const rowH = fitRowHeight(Math.max(1, metrics.height - glyphPad * 2), itemCount)
  const stackH = itemCount * rowH + ROW_GUTTER * Math.max(0, itemCount - 1)
  // Size from metrics, place centered in the (possibly taller) place field.
  const stackTop = field.top + Math.max(0, (field.height - stackH) / 2)
  const stackBox: Box = {
    left: field.left,
    top: stackTop,
    width: field.width,
    height: Math.min(stackH, field.height),
  }
  const rowBoxes = rows(stackBox, itemCount, ROW_GUTTER)

  const tableLeft = field.left + LABEL_W
  const tableW = Math.max(1, metrics.width - LABEL_W)
  const colW = tableW / maxSlots
  const fontSize = termFontSize(rowH, colW)

  const sequenceGroups: StudioFabricObject[] = []

  items.forEach((item, rowIndex) => {
    const box = rowBoxes[rowIndex]
    if (!box) return

    const parts: StudioFabricObject[] = []
    const label = `${rowIndex + 1})`
    const labelSize = Math.min(STUDIO_BODY_SIZE * 0.85, box.height * 0.4)
    parts.push(
      buildText(
        {
          left: field.left,
          top: boxCenterY(box),
          text: label,
          width: estimateTextBoxWidth(label, labelSize, LABEL_W - 4),
          fontFamily: font,
          fontSize: labelSize,
          fill: STUDIO_INK_MUTED,
          originY: 'center',
        },
        tag,
        'decoration',
      ),
    )

    // Center short sequences in the shared column grid (half-slots allowed).
    const colOffset = (maxSlots - item.terms.length) / 2

    for (let slot = 0; slot < item.terms.length; slot++) {
      const cx = tableLeft + (colOffset + slot) * colW + colW / 2
      if (slot === item.blankIndex) {
        drawBlankCell(parts, box, cx, colW, fontSize, item.answerText, font, tag)
      } else {
        drawTermCell(parts, box, cx, colW, item.terms[slot]!, fontSize, font, tag)
      }
    }

    const rowBounds = unionObjectBounds(parts) ?? box
    // ruleId lets tests (and analytics) verify the Pattern types picker matched output.
    sequenceGroups.push({
      ...buildGroup(parts, rowBounds, tag, 'structure'),
      data: { ruleId: item.ruleId },
    })
  })

  const gridBounds = unionObjectBounds(sequenceGroups)
  if (!gridBounds) return
  // Shrink-wrap then re-center so the movable unit sits in the field, not flush-left.
  let left = field.left + (field.width - gridBounds.width) / 2
  let top = field.top + (field.height - gridBounds.height) / 2
  left = Math.min(Math.max(left, field.left), field.left + Math.max(0, field.width - gridBounds.width))
  top = Math.min(Math.max(top, field.top), field.top + Math.max(0, field.height - gridBounds.height))
  const centered: Box = {
    left,
    top,
    width: gridBounds.width,
    height: gridBounds.height,
  }
  const dx = centered.left - gridBounds.left
  const dy = centered.top - gridBounds.top
  const placed =
    dx === 0 && dy === 0
      ? sequenceGroups
      : sequenceGroups.map((group) => ({
          ...group,
          left: (group.left ?? 0) + dx,
          top: (group.top ?? 0) + dy,
        }))
  objects.push(buildGroup(placed, centered, tag, 'structure'))
}
