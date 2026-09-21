import type { StudioFabricObject } from '@/types/studio-template.types'
import {
  boxCenterY,
  estimateTextBoxWidth,
  fitFontSizeToWidth,
  toNonBreakingSpaces,
  type Box,
} from '../studio-layout'
import {
  buildText,
  buildRect,
  buildGroup,
  type StudioTag,
} from '../studio-fabric-builders'
import { drawGridLines } from '../studio-grid-rules'
import {
  STUDIO_RULE_MEDIUM,
  STUDIO_STROKE_HAIRLINE,
  STUDIO_BODY_SIZE,
} from '@/constants/studio.constants'
import type { StroopItem, StroopVariant } from './items'
import type { StroopTable } from './table'
import {
  buildDirectionArrow,
  directionArrowSlot,
  isStroopDirection,
} from './direction-arrow'

/** Clear of cell stroke so glyphs never kiss the grid bars. */
const CELL_PAD = 12
/** Prompt band vs writing-line band inside each cell. */
const PROMPT_RATIO = 0.55
/** Direction needs a wider prompt band for word + path arrow. */
const DIRECTION_PROMPT_RATIO = 0.62
/** Count-word runs are long — give the prompt most of the cell. */
const COUNT_WORD_PROMPT_RATIO = 0.72
const LINE_GAP = 10
const WORD_ARROW_GAP = 8
const MIN_PROMPT_SIZE = 9

export const STROOP_BLANK_SOURCE = 'stroop-blank'
export const STROOP_DIRECTION_ARROW_SOURCE = 'stroop-direction-arrow'

function promptRatioFor(variant: StroopVariant): number {
  if (variant === 'direction') return DIRECTION_PROMPT_RATIO
  if (variant === 'count-word') return COUNT_WORD_PROMPT_RATIO
  return PROMPT_RATIO
}

function stimulusFor(item: StroopItem, variant: StroopVariant): string {
  // Direction: word only — arrow is a path (PDF/SVG-safe). NBSP for other variants.
  if (variant === 'direction') return item.display
  return toNonBreakingSpaces(item.display)
}

function wordMaxWidth(
  variant: StroopVariant,
  promptMaxW: number,
  promptSize: number,
): number {
  if (variant !== 'direction') return promptMaxW
  return Math.max(
    24,
    promptMaxW - directionArrowSlot(promptSize) - WORD_ARROW_GAP,
  )
}

/** One size for every prompt in the grid so short/long digit runs match. */
function sharedPromptSize(
  items: StroopItem[],
  variant: StroopVariant,
  promptMaxW: number,
  cellH: number,
): number {
  // Count-word 2-col cells have width to spare — don't clamp to BODY*1.1 (reads tiny).
  const bodyCap =
    variant === 'count-word' ? STUDIO_BODY_SIZE * 1.85 : STUDIO_BODY_SIZE * 1.1
  const heightRatio = variant === 'count-word' ? 0.62 : 0.55
  const preferred = Math.min(bodyCap, Math.floor(cellH * heightRatio))
  let size = preferred
  for (const item of items) {
    const maxW = wordMaxWidth(variant, promptMaxW, size)
    size = Math.min(
      size,
      fitFontSizeToWidth(stimulusFor(item, variant), maxW, size, MIN_PROMPT_SIZE),
    )
  }
  return Math.max(MIN_PROMPT_SIZE, size)
}

function drawItem(
  objects: StudioFabricObject[],
  box: Box,
  item: StroopItem,
  variant: StroopVariant,
  font: string,
  tag: StudioTag,
  promptSize: number,
): void {
  const stimulus = stimulusFor(item, variant)
  const ratio = promptRatioFor(variant)
  const promptMaxW = Math.max(24, box.width * ratio - CELL_PAD)
  const wordMaxW = wordMaxWidth(variant, promptMaxW, promptSize)
  // Writing line sits on the text baseline (bottom of the glyph box).
  const baselineY = Math.round(boxCenterY(box) + promptSize / 2)
  const wordW = estimateTextBoxWidth(stimulus, promptSize, wordMaxW)

  objects.push(
    buildText(
      {
        left: box.left + CELL_PAD,
        top: baselineY,
        text: stimulus,
        width: wordW,
        fontFamily: font,
        fontSize: promptSize,
        fontWeight: 600,
        originY: 'bottom',
      },
      tag,
      'prompt',
    ),
  )

  if (variant === 'direction' && isStroopDirection(item.answer)) {
    const arrowSize = directionArrowSlot(promptSize)
    const arrowLeft = box.left + CELL_PAD + wordW + WORD_ARROW_GAP + arrowSize / 2
    const arrowTop = boxCenterY(box)
    objects.push({
      ...buildDirectionArrow(arrowLeft, arrowTop, promptSize, item.answer, tag),
      data: { source: STROOP_DIRECTION_ARROW_SOURCE },
    })
  }

  const lineX = box.left + box.width * ratio + LINE_GAP
  const lineEnd = box.left + box.width - CELL_PAD
  const lineW = Math.max(1, lineEnd - lineX)
  const thickness = STUDIO_STROKE_HAIRLINE
  // Filled bar — same weight/color as grid-copy cell rules.
  objects.push({
    ...buildRect(
      {
        left: lineX,
        top: baselineY - thickness,
        width: lineW,
        height: thickness,
        fill: STUDIO_RULE_MEDIUM,
        stroke: 'transparent',
        strokeWidth: 0,
      },
      tag,
      'structure',
    ),
    data: { source: STROOP_BLANK_SOURCE },
  })
}

/**
 * Item cells in an n-col × m-row table with grid-copy style bars
 * (filled RULE_MEDIUM hairlines — not per-cell stroked rects).
 */
export function drawStroopGrid(
  objects: StudioFabricObject[],
  table: StroopTable,
  items: StroopItem[],
  variant: StroopVariant,
  font: string,
  tag: StudioTag,
): void {
  const promptMaxW = Math.max(24, table.cellW * promptRatioFor(variant) - CELL_PAD)
  const promptSize = sharedPromptSize(items, variant, promptMaxW, table.cellH)
  const gridObjects: StudioFabricObject[] = []

  items.forEach((item, i) => {
    const row = Math.floor(i / table.cols)
    const col = i % table.cols
    if (row >= table.rows || col >= table.cols) return
    drawItem(
      gridObjects,
      table.cellBox(row, col),
      item,
      variant,
      font,
      tag,
      promptSize,
    )
  })

  gridObjects.push(
    ...drawGridLines(table.bounds, table.cellW, table.cols, table.rows, tag, {
      rowPitch: table.cellH,
    }),
  )
  objects.push(buildGroup(gridObjects, table.bounds, tag))
}
