import type {
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
  StudioFabricObject,
} from '@/types/studio-template.types'
import type { StudioRng } from '../studio-rng'
import {
  contentBox,
  columns,
  insetHorizontal,
  drawHeader,
  boxCenterY,
  boxBottom,
  estimateTextBoxWidth,
  fitFontSizeToWidth,
  type Box,
} from '../studio-layout'
import {
  buildGroup,
  buildRect,
  buildText,
  buildLine,
  type StudioTag,
} from '../studio-fabric-builders'
import { buildCheckMark } from '../studio-check-mark'
import {
  STUDIO_INK,
  STUDIO_INK_MUTED,
  STUDIO_RULE_LIGHT,
  STUDIO_BODY_SIZE,
  STUDIO_CONTENT_SAFE_INSET_X,
  STUDIO_SECTION_GAP,
  STUDIO_STROKE_HAIRLINE,
} from '@/constants/studio.constants'
import { TARGET_RATE, buildNBackSequence } from './sequence'
import { drawNBackSymbol } from './draw-symbol'
import { isNBackIconSymbol } from './shapes'

const NUM_COL_W = 48
const PREFERRED_ROW_H = 48
const LEGEND_H = 28
/** Space between legend and the top of the grid. */
const LEGEND_GAP = STUDIO_SECTION_GAP / 2
/** Fixed column width so the grid can be centered (not stretched full-bleed). */
const COL_W = 260
const COL_GUTTER = 40
/**
 * Keep the last rule / bold glyph metrics inside the safe area.
 * Packing flush to body bottom lets stroke + textbox line-height spill past the margin guide.
 */
const BODY_BOTTOM_CLEARANCE = Math.max(8, STUDIO_STROKE_HAIRLINE * 3)

function fitJudgementGrid(body: Box, rowCount: number): {
  colCount: number
  rowsPerCol: number
  rowH: number
  gridBounds: Box
  legendTop: number
} {
  const reservedAbove = LEGEND_H + LEGEND_GAP
  // Pack inside a field that leaves bottom clearance; center within that field.
  const fieldH = Math.max(1, body.height - BODY_BOTTOM_CLEARANCE)
  const packH = Math.max(1, fieldH - reservedAbove)
  const maxRowsAtPreferred = Math.max(1, Math.floor(packH / PREFERRED_ROW_H))
  const colCount = rowCount > maxRowsAtPreferred ? 2 : 1
  const rowsPerCol = Math.ceil(rowCount / colCount)
  const rowH = Math.min(PREFERRED_ROW_H, packH / rowsPerCol)
  const gridH = rowsPerCol * rowH
  const gridW = Math.min(body.width, colCount === 2 ? COL_W * 2 + COL_GUTTER : COL_W)
  const blockH = reservedAbove + gridH
  const blockTop = body.top + Math.max(0, fieldH - blockH) / 2
  return {
    colCount,
    rowsPerCol,
    rowH,
    legendTop: blockTop,
    gridBounds: {
      left: body.left + (body.width - gridW) / 2,
      top: blockTop + reservedAbove,
      width: gridW,
      height: gridH,
    },
  }
}

export function generateJudgement(
  config: StudioConfig,
  ctx: StudioGenerateContext,
  tag: StudioTag,
  symbols: readonly string[],
  n: number,
  font: string,
  rng: StudioRng,
  options?: { digitFont?: string },
): StudioPageOutput {
  const rowCount = Math.min(30, Math.max(10, Number(config.rowCount ?? 20)))
  const { seq, isMatch } = buildNBackSequence(symbols, rowCount, n, TARGET_RATE, rng)
  const digitFont = options?.digitFont
  const symbolFont = digitFont ?? font
  const indexFont = digitFont ?? font

  const objects: StudioFabricObject[] = []
  const instruction =
    `Cover the rows below with a card. Reveal one row at a time. ` +
    `Mark a row only if it matches the row exactly ${n} above it - not just any row you've seen before`
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const header = drawHeader(content, config, tag, instruction)
  objects.push(...header.objects)

  const { colCount, rowsPerCol, rowH, gridBounds, legendTop } = fitJudgementGrid(
    header.body,
    rowCount,
  )
  const colBoxes = colCount === 2 ? columns(gridBounds, 2, COL_GUTTER) : [gridBounds]

  const legendText = `N = ${n}   ·   check = matches ${n} above`
  const legendFontSize = fitFontSizeToWidth(
    legendText,
    gridBounds.width,
    STUDIO_BODY_SIZE * 0.75,
    11,
  )
  objects.push(
    buildText(
      {
        left: gridBounds.left + gridBounds.width / 2,
        top: legendTop + LEGEND_H / 2,
        text: legendText,
        fontFamily: font,
        fill: STUDIO_INK_MUTED,
        fontSize: legendFontSize,
        textAlign: 'center',
        originX: 'center',
        originY: 'center',
        width: estimateTextBoxWidth(legendText, legendFontSize, gridBounds.width),
      },
      tag,
      'decoration',
    ),
  )

  const gridObjects: StudioFabricObject[] = []
  seq.forEach((sym, i) => {
    const colIdx = Math.min(Math.floor(i / rowsPerCol), colBoxes.length - 1)
    const rowInCol = i % rowsPerCol
    const colBox = colBoxes[colIdx]
    const rowBox: Box = {
      left: colBox.left,
      top: colBox.top + rowInCol * rowH,
      width: colBox.width,
      height: rowH,
    }
    drawJudgementRow(
      gridObjects,
      rowBox,
      i,
      sym,
      isMatch[i],
      i < n,
      font,
      tag,
      { symbolFont, indexFont },
    )
  })
  // Nominal grid box — not unionObjectBounds — so hairline strokes cannot inflate past safe area.
  objects.push(buildGroup(gridObjects, gridBounds, tag))

  return { pageRole: 'single', objects }
}

function drawJudgementRow(
  objects: StudioFabricObject[],
  rowBox: Box,
  index: number,
  sym: string,
  matches: boolean,
  nonAnswerable: boolean,
  font: string,
  tag: StudioTag,
  fonts?: { symbolFont: string; indexFont: string },
): void {
  const indexText = String(index + 1)
  const indexSize = STUDIO_BODY_SIZE * 0.75
  const symbolFont = fonts?.symbolFont ?? font
  const indexFont = fonts?.indexFont ?? font
  objects.push(
    buildText(
      {
        left: rowBox.left,
        top: boxCenterY(rowBox),
        text: indexText,
        fontFamily: indexFont,
        fill: STUDIO_INK_MUTED,
        fontSize: indexSize,
        originY: 'center',
        width: estimateTextBoxWidth(indexText, indexSize, NUM_COL_W),
      },
      tag,
      'decoration',
    ),
  )
  // Keep bold glyphs / icons inside the row (not flush to the rule).
  const symSize = Math.min(STUDIO_BODY_SIZE * 1.15, rowBox.height * 0.68)
  const symLeft = isNBackIconSymbol(sym)
    ? rowBox.left + NUM_COL_W + symSize / 2
    : rowBox.left + NUM_COL_W
  objects.push(
    drawNBackSymbol(
      sym,
      {
        left: symLeft,
        top: boxCenterY(rowBox),
        size: symSize,
        fontFamily: symbolFont,
        textWidth: 80,
        originX: isNBackIconSymbol(sym) ? 'center' : 'left',
      },
      tag,
      'prompt',
    ),
  )
  // Inset by half stroke so the hairline stays inside the row box / safe area.
  const ruleY = boxBottom(rowBox) - STUDIO_STROKE_HAIRLINE / 2
  objects.push(
    buildLine(
      {
        x1: rowBox.left,
        y1: ruleY,
        x2: rowBox.left + rowBox.width,
        y2: ruleY,
        stroke: STUDIO_RULE_LIGHT,
      },
      tag,
      'structure',
    ),
  )

  const boxSize = Math.min(rowBox.height * 0.4, 20)
  const boxLeft = rowBox.left + rowBox.width - boxSize - 8
  const boxTop = boxCenterY(rowBox) - boxSize / 2
  // Cap at the box so the glyph's em square never exceeds the tick box.
  const dashSize = Math.max(8, Math.min(STUDIO_BODY_SIZE, Math.floor(boxSize)))

  if (nonAnswerable) {
    objects.push(
      buildText(
        {
          left: boxLeft + boxSize / 2,
          top: boxCenterY(rowBox),
          text: '–',
          fontFamily: font,
          fill: STUDIO_INK_MUTED,
          fontSize: dashSize,
          textAlign: 'center',
          originX: 'center',
          originY: 'center',
          width: estimateTextBoxWidth('–', dashSize, boxSize),
        },
        tag,
        'decoration',
      ),
    )
    return
  }

  objects.push(
    buildRect(
      { left: boxLeft, top: boxTop, width: boxSize, height: boxSize, stroke: STUDIO_INK },
      tag,
      'structure',
    ),
  )
  if (matches) {
    objects.push(
      buildCheckMark(
        { left: boxLeft, top: boxTop, size: boxSize },
        tag,
        'answer',
      ),
    )
  }
}
