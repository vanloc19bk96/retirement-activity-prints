import type {
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
  StudioFabricObject,
} from '@/types/studio-template.types'
import type { ListItem } from '@/types/studio-list.types'
import {
  contentBox,
  drawHeader,
  boxCenterX,
  boxCenterY,
  insetBox,
  insetHorizontal,
  estimateTextBoxWidth,
  toNonBreakingSpaces,
  type Box,
} from '../studio-layout'
import {
  buildText,
  buildRect,
  buildGroup,
  type StudioTag,
} from '../studio-fabric-builders'
import { buildCheckMark } from '../studio-check-mark'
import { drawGridLines } from '../studio-grid-rules'
import {
  STUDIO_INK,
  STUDIO_INK_MUTED,
  STUDIO_BODY_SIZE,
  STUDIO_CONTENT_SAFE_INSET_X,
} from '@/constants/studio.constants'
import { recallColumnCount } from './fallback'
import {
  fitListTable,
  fitSharedLabelSize,
  resolveStudyColumns,
  type ListTable,
} from './table'

export const STUDY_INSTRUCTION =
  'Memorize this shopping list. On the next page you will pick these items ' +
  'out from a longer list. Then turn the page'

export const RECALL_INSTRUCTION =
  'Check only the items that were on your shopping list. Do not look back'

const CHECKBOX_SIZE = 22
const CHECKBOX_LABEL_GAP = 12
const CELL_PAD_X = 16
const LEGEND_H = 34
const LEGEND_GAP = 24
const STUDY_CELL_H = STUDIO_BODY_SIZE * 2.4
const RECALL_CELL_H = STUDIO_BODY_SIZE * 2.6
/**
 * Breathing room from safe edges (esp. right/bottom) + hairline clearance.
 * Matches grid-copy FIELD_INSET so outer bars never sit flush on the margin.
 */
const STROKE_INSET = 16
const MIN_LABEL_SIZE = 10

/** Same even-weight bars as grid-copy (not per-cell stroked rects). */
function listGridLines(table: ListTable, tag: StudioTag): StudioFabricObject[] {
  return drawGridLines(table.bounds, table.cellW, table.cols, table.rows, tag, {
    rowPitch: table.cellH,
  })
}

export function buildStudyPage(
  config: StudioConfig,
  ctx: StudioGenerateContext,
  tag: StudioTag,
  targets: string[],
  font: string,
): StudioPageOutput {
  const objects: StudioFabricObject[] = []
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const header = drawHeader(content, config, tag, STUDY_INSTRUCTION)
  objects.push(...header.objects)

  const field = insetBox(header.body, STROKE_INSET)
  // Balanced multi-col grid like grid-copy — fill the field, not a skinny stack.
  const cols = resolveStudyColumns(field, targets.length)
  const rows = Math.max(1, Math.ceil(targets.length / cols))
  const table = fitListTable(
    field,
    targets.length,
    cols,
    field.width / cols,
    Math.max(STUDY_CELL_H, field.height / rows),
  )
  const labelMaxW = Math.max(40, table.cellW - CELL_PAD_X * 2)
  const preferredSize = Math.min(
    STUDIO_BODY_SIZE * 1.4,
    Math.max(STUDIO_BODY_SIZE, Math.floor(table.cellH * 0.4)),
  )
  const fontSize = fitSharedLabelSize(
    targets,
    labelMaxW,
    preferredSize,
    table.cellH,
    MIN_LABEL_SIZE,
  )

  const gridObjects: StudioFabricObject[] = []
  for (let r = 0; r < table.rows; r++) {
    for (let c = 0; c < table.cols; c++) {
      const cell = table.cellBox(r, c)
      const label = targets[r * table.cols + c]
      if (!label) continue
      const oneLine = toNonBreakingSpaces(label)
      gridObjects.push(
        buildText(
          {
            left: boxCenterX(cell),
            top: boxCenterY(cell),
            text: oneLine,
            width: estimateTextBoxWidth(oneLine, fontSize, labelMaxW),
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
  }
  gridObjects.push(...listGridLines(table, tag))
  objects.push(buildGroup(gridObjects, table.bounds, tag))

  return { pageRole: 'study', objects }
}

export function buildRecallPage(
  config: StudioConfig,
  ctx: StudioGenerateContext,
  tag: StudioTag,
  options: ListItem[],
  targetCount: number,
  font: string,
): StudioPageOutput {
  const objects: StudioFabricObject[] = []
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const header = drawHeader(content, config, tag, RECALL_INSTRUCTION)
  objects.push(...header.objects)

  const field = insetBox(header.body, STROKE_INSET)
  const cols = recallColumnCount(options.length)
  const checkGap = CHECKBOX_SIZE + CHECKBOX_LABEL_GAP
  const labelBudget = Math.max(40, field.width / cols - CELL_PAD_X * 2 - checkGap)
  const maxLabelW = Math.max(
    ...options.map((item) =>
      estimateTextBoxWidth(item.label, STUDIO_BODY_SIZE, labelBudget),
    ),
  )
  const preferredCellW = CELL_PAD_X * 2 + checkGap + maxLabelW

  // Size the grid in the space under the legend, then center legend+grid as one block.
  const stackExtra = LEGEND_H + LEGEND_GAP
  const probe = fitListTable(
    { ...field, height: Math.max(1, field.height - stackExtra) },
    options.length,
    cols,
    preferredCellW,
    RECALL_CELL_H,
  )
  const blockH = stackExtra + probe.bounds.height
  const tableBody: Box = {
    left: field.left,
    top: field.top + (field.height - blockH) / 2 + stackExtra,
    width: field.width,
    height: probe.bounds.height,
  }
  const table = fitListTable(
    tableBody,
    options.length,
    cols,
    preferredCellW,
    RECALL_CELL_H,
  )

  const legendText = `${targetCount} were on the list.`
  objects.push(
    buildText(
      {
        left: boxCenterX(table.bounds),
        top: table.bounds.top - LEGEND_GAP - LEGEND_H / 2,
        text: legendText,
        width: estimateTextBoxWidth(legendText, STUDIO_BODY_SIZE, table.bounds.width),
        fontFamily: font,
        fill: STUDIO_INK_MUTED,
        textAlign: 'center',
        originX: 'center',
        originY: 'center',
      },
      tag,
      'decoration',
    ),
  )

  const checkSize = Math.min(CHECKBOX_SIZE, Math.max(12, table.cellH - 8))
  const labelMaxW = Math.max(
    40,
    table.cellW - CELL_PAD_X * 2 - checkSize - CHECKBOX_LABEL_GAP,
  )
  const fontSize = fitSharedLabelSize(
    options.map((item) => item.label),
    labelMaxW,
    STUDIO_BODY_SIZE,
    table.cellH,
    MIN_LABEL_SIZE,
  )

  const gridObjects: StudioFabricObject[] = []
  for (let r = 0; r < table.rows; r++) {
    for (let c = 0; c < table.cols; c++) {
      const cell = table.cellBox(r, c)
      const item = options[r * table.cols + c]
      if (!item) continue

      const boxTop = boxCenterY(cell) - checkSize / 2
      const boxLeft = cell.left + CELL_PAD_X
      gridObjects.push(
        buildRect(
          {
            left: boxLeft,
            top: boxTop,
            width: checkSize,
            height: checkSize,
            stroke: STUDIO_INK,
          },
          tag,
          'structure',
        ),
      )

      const oneLine = toNonBreakingSpaces(item.label)
      gridObjects.push(
        buildText(
          {
            left: boxLeft + checkSize + CHECKBOX_LABEL_GAP,
            top: boxCenterY(cell),
            text: oneLine,
            width: estimateTextBoxWidth(oneLine, fontSize, labelMaxW),
            fontFamily: font,
            fontSize,
            originY: 'center',
          },
          tag,
          'prompt',
        ),
      )

      if (item.isTarget) {
        gridObjects.push(
          buildCheckMark(
            { left: boxLeft, top: boxTop, size: checkSize },
            tag,
            'answer',
          ),
        )
      }
    }
  }
  gridObjects.push(...listGridLines(table, tag))
  objects.push(buildGroup(gridObjects, table.bounds, tag))

  return { pageRole: 'recall', objects }
}
