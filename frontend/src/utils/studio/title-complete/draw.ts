import type { StudioFabricObject, StudioConfig } from '@/types/studio-template.types'
import type { TitleItem } from '@/types/studio-title-complete.types'
import {
  boxCenterX,
  boxCenterY,
  estimateTextBoxWidth,
  toNonBreakingSpaces,
  type Box,
} from '../studio-layout'
import { buildText, buildLine, buildGroup, type StudioTag } from '../studio-fabric-builders'
import { drawGridLines } from '../studio-grid-rules'
import { STUDIO_INK, STUDIO_INK_MUTED, STUDIO_RULE_LIGHT } from '@/constants/studio.constants'
import { BLANK_TOKEN, answerParts, letterHintCount } from './validate'
import {
  AFTER_BLANK_GAP,
  BLANK_STROKE,
  CELL_PAD,
  INDEX_GAP,
  INDEX_W,
  blankWidthFor,
  measureGlyphRun,
  packTitleGrid,
  resolveBlankPlacement,
  type BlankPlacement,
} from './layout'
import { drawRemainingBlanks } from './remaining-blanks'

export {
  LARGE_PRINT,
  MIN_BLANK_W,
  MIN_WRITING_BLANK,
  NUMBER_GUTTER,
  blankWidthFor,
  itemBlockHeight,
  packTitleGrid,
  fitTitleTable,
  COLUMN_COUNT,
  resolveBlankPlacement,
} from './layout'

const LINE_LEADING = 1.35

function splitAtBlank(displayTitle: string): { before: string; after: string } {
  const idx = displayTitle.indexOf(BLANK_TOKEN)
  if (idx < 0) return { before: displayTitle, after: '' }
  return {
    before: displayTitle.slice(0, idx),
    after: displayTitle.slice(idx + BLANK_TOKEN.length),
  }
}

function noWrap(text: string): string {
  return toNonBreakingSpaces(text)
}

interface TitleRunLayout {
  before: string
  afterTrim: string
  hintText: string
  hintSize: number
  beforeW: number
  afterW: number
  hintW: number
  placement: BlankPlacement
  /** Width of the title run (blank + words + hint), not including the index. */
  runWidth: number
  lineCount: number
}

function layoutTitleRun(
  item: TitleItem,
  maxW: number,
  fontSize: number,
  showHint: boolean,
  allowWrap: boolean,
): TitleRunLayout {
  const { before, after } = splitAtBlank(item.displayTitle)
  const parts = answerParts(item.answer)
  const firstAnswer = parts[0] ?? item.answer
  const preferredBlank = blankWidthFor(firstAnswer, fontSize, maxW)
  const beforeW = measureGlyphRun(before, fontSize)
  const afterTrim = after.trimStart()
  const hintText = showHint ? `(${letterHintCount(item.answer)})` : ''
  const hintSize = fontSize * 0.7
  const hintW = hintText ? measureGlyphRun(hintText, hintSize) + AFTER_BLANK_GAP : 0
  const afterW = afterTrim && !after.includes(BLANK_TOKEN) ? measureGlyphRun(afterTrim, fontSize) : 0

  const placement = resolveBlankPlacement({
    beforeW,
    afterW,
    hintW,
    preferredBlankW: preferredBlank,
    maxW,
    allowWrap,
  })

  const lineCount = placement.wrapBlank || placement.afterOnLine2 ? 2 : 1
  let runWidth = 0
  if (placement.wrapBlank) {
    runWidth = Math.max(beforeW, placement.blankW + (afterW > 0 ? AFTER_BLANK_GAP + afterW : 0) + hintW)
  } else if (placement.afterOnLine2) {
    runWidth = Math.max(beforeW + placement.blankW + hintW, afterW)
  } else {
    runWidth =
      beforeW +
      placement.blankW +
      (afterW > 0 ? AFTER_BLANK_GAP + afterW : 0) +
      hintW
  }

  return {
    before,
    afterTrim,
    hintText,
    hintSize,
    beforeW,
    afterW,
    hintW,
    placement,
    runWidth: Math.min(maxW, Math.max(placement.blankW, runWidth)),
    lineCount,
  }
}

/**
 * Draw title + baseline-aligned hairline blank inside a cell band.
 * After-text uses NBSP so Fabric never soft-wraps mid-phrase.
 */
function drawTitleRun(
  objects: StudioFabricObject[],
  item: TitleItem,
  run: TitleRunLayout,
  textX: number,
  y: number,
  maxW: number,
  font: string,
  tag: StudioTag,
  fontSize: number,
): void {
  const { before, afterTrim, hintText, hintSize, beforeW, placement } = run
  const { blankW, wrapBlank, afterOnLine2 } = placement
  const line1Y = y
  const line2Y = y + fontSize * LINE_LEADING
  const after = item.displayTitle.includes(BLANK_TOKEN)
    ? item.displayTitle.slice(item.displayTitle.indexOf(BLANK_TOKEN) + BLANK_TOKEN.length)
    : ''

  let blankX = textX + beforeW
  let blankTop = line1Y
  let afterX = blankX + blankW + AFTER_BLANK_GAP
  let afterTop = line1Y

  if (before) {
    const beforeText = noWrap(wrapBlank ? before.trimEnd() : before)
    objects.push(
      buildText(
        {
          left: textX,
          top: line1Y,
          text: beforeText,
          fontFamily: font,
          fontSize,
          width: estimateTextBoxWidth(beforeText, fontSize, maxW),
          fill: STUDIO_INK,
          lineHeight: 1,
        },
        tag,
        'prompt',
      ),
    )
  }

  if (wrapBlank) {
    blankX = textX
    blankTop = line2Y
    afterX = blankX + blankW + AFTER_BLANK_GAP
    afterTop = line2Y
  } else if (afterOnLine2) {
    afterX = textX
    afterTop = line2Y
  }

  const baselineY = blankTop + fontSize
  const blankEnd = Math.min(blankX + blankW, textX + maxW)
  objects.push(
    buildLine(
      {
        x1: blankX,
        y1: baselineY,
        x2: blankEnd,
        y2: baselineY,
        stroke: STUDIO_RULE_LIGHT,
        strokeWidth: BLANK_STROKE,
      },
      tag,
      'structure',
    ),
  )

  drawRemainingBlanks(
    objects,
    after,
    afterX,
    afterTop,
    textX + maxW,
    font,
    tag,
    fontSize,
    item.answer,
  )

  if (afterTrim && !after.includes(BLANK_TOKEN)) {
    const afterText = noWrap(afterTrim)
    objects.push(
      buildText(
        {
          left: afterX,
          top: afterTop,
          text: afterText,
          fontFamily: font,
          fontSize,
          // Full glyph width — NBSP + no narrow cap prevents mid-phrase wrap.
          width: estimateTextBoxWidth(afterText, fontSize, Number.POSITIVE_INFINITY),
          fill: STUDIO_INK,
          lineHeight: 1,
        },
        tag,
        'prompt',
      ),
    )
  }

  if (hintText) {
    const hintX =
      afterTrim && !afterOnLine2
        ? afterX + measureGlyphRun(afterTrim, fontSize) + AFTER_BLANK_GAP
        : afterOnLine2
          ? blankX + blankW + AFTER_BLANK_GAP
          : afterX
    const hintTop = afterOnLine2 ? blankTop : afterTop
    objects.push(
      buildText(
        {
          left: hintX,
          top: hintTop + (fontSize - hintSize) * 0.75,
          text: hintText,
          fontFamily: font,
          fontSize: hintSize,
          fill: STUDIO_INK_MUTED,
          width: estimateTextBoxWidth(hintText, hintSize, 80),
          lineHeight: 1,
        },
        tag,
        'decoration',
      ),
    )
  }
}

function pushHiddenAnswer(
  objects: StudioFabricObject[],
  cell: Box,
  answer: string,
  font: string,
  fontSize: number,
  tag: StudioTag,
): void {
  const width = Math.min(
    Math.max(24, cell.width - CELL_PAD * 2),
    estimateTextBoxWidth(answer, fontSize, cell.width),
  )
  objects.push(
    buildText(
      {
        left: boxCenterX(cell),
        top: boxCenterY(cell),
        text: noWrap(answer),
        fontFamily: font,
        fontSize,
        textAlign: 'center',
        originX: 'center',
        originY: 'center',
        width,
        fill: STUDIO_INK,
        lineHeight: 1,
      },
      tag,
      'answer',
    ),
  )
}

/** Index + answer on a shared gutter band, centered as a unit (solution page). */
function pushIndexedAnswer(
  objects: StudioFabricObject[],
  cell: Box,
  index: number,
  answer: string,
  style: {
    font: string
    textSize: number
    labelSize: number
    labelW: number
    bandW: number
    tag: StudioTag
  },
): void {
  const { font, textSize, labelSize, labelW, bandW, tag } = style
  const midY = boxCenterY(cell)
  const label = `${index}.`
  const display = noWrap(answer)
  const textMaxW = Math.max(24, bandW - labelW - INDEX_GAP)
  const textW = Math.min(textMaxW, estimateTextBoxWidth(display, textSize, textMaxW))
  const bandLeft = boxCenterX(cell) - bandW / 2

  objects.push(
    buildText(
      {
        left: bandLeft,
        top: midY,
        text: label,
        width: labelW,
        fontFamily: font,
        fontSize: labelSize,
        fill: STUDIO_INK_MUTED,
        textAlign: 'right',
        originY: 'center',
        lineHeight: 1,
      },
      tag,
      'decoration',
    ),
  )
  objects.push(
    buildText(
      {
        left: bandLeft + labelW + INDEX_GAP,
        top: midY,
        text: display,
        width: textW,
        fontFamily: font,
        fontSize: textSize,
        originY: 'center',
        lineHeight: 1,
      },
      tag,
      'answer',
    ),
  )
}

/**
 * Stroked equal-cell grid — puzzle prompts or centered solution answers.
 */
export function drawTitleCompleteItems(
  objects: StudioFabricObject[],
  field: Box,
  items: TitleItem[],
  font: string,
  tag: StudioTag,
  config: StudioConfig,
  options?: { forAnswerKey?: boolean },
): void {
  if (items.length === 0) return

  const forAnswerKey = options?.forAnswerKey === true
  const showHint = !forAnswerKey && config.showLengthHint === true
  const { table, fontSize, labelSize, contentMaxW, allowWrap } = packTitleGrid(
    field,
    items,
    showHint,
  )
  const gridObjects: StudioFabricObject[] = []
  const lineH = fontSize * LINE_LEADING
  // Shared index gutter + max content band so ordinals stay column-aligned.
  const labelW = estimateTextBoxWidth(`${items.length}.`, labelSize, INDEX_W)
  const runs = forAnswerKey
    ? null
    : items.map((item) => layoutTitleRun(item, contentMaxW, fontSize, showHint, allowWrap))
  let maxContentW = 0
  if (runs) {
    for (const run of runs) {
      maxContentW = Math.max(maxContentW, run.runWidth)
    }
  } else {
    for (const item of items) {
      maxContentW = Math.max(
        maxContentW,
        Math.min(contentMaxW, estimateTextBoxWidth(noWrap(item.answer), fontSize, contentMaxW)),
      )
    }
  }
  const bandW = labelW + INDEX_GAP + maxContentW

  items.forEach((item, i) => {
    const row = Math.floor(i / table.cols)
    const col = i % table.cols
    if (row >= table.rows || col >= table.cols) return
    const cell = table.cellBox(row, col)
    const bandLeft = boxCenterX(cell) - bandW / 2
    const textX = bandLeft + labelW + INDEX_GAP

    if (forAnswerKey) {
      pushIndexedAnswer(gridObjects, cell, i + 1, item.answer, {
        font,
        textSize: fontSize,
        labelSize,
        labelW,
        bandW,
        tag,
      })
      return
    }

    const run = runs![i]!
    const blockH = run.lineCount * lineH
    const blockTop = boxCenterY(cell) - blockH / 2
    const indexTop = blockTop + Math.max(0, (fontSize - labelSize) * 0.35)

    gridObjects.push(
      buildText(
        {
          left: bandLeft,
          top: indexTop,
          text: `${i + 1}.`,
          fontFamily: font,
          fontSize: labelSize,
          fill: STUDIO_INK_MUTED,
          width: labelW,
          textAlign: 'right',
          lineHeight: 1,
        },
        tag,
        'decoration',
      ),
    )

    drawTitleRun(gridObjects, item, run, textX, blockTop, contentMaxW, font, tag, fontSize)
    pushHiddenAnswer(gridObjects, cell, item.answer, font, fontSize, tag)
  })

  gridObjects.push(
    ...drawGridLines(table.bounds, table.cellW, table.cols, table.rows, tag, {
      rowPitch: table.cellH,
    }),
  )
  objects.push(buildGroup(gridObjects, table.bounds, tag))
}
