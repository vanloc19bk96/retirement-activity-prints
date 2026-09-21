import type { StudioFabricObject } from '@/types/studio-template.types'
import {
  STUDIO_BODY_SIZE,
  STUDIO_INK,
  STUDIO_INK_MUTED,
  STUDIO_STROKE_HAIRLINE,
} from '@/constants/studio.constants'
import { buildGroup, buildLine, buildText, type StudioTag } from '../studio-fabric-builders'
import {
  boxCenterX,
  estimateTextBoxWidth,
  fitFontSizeToWidth,
  insetBox,
  unionObjectBounds,
  type Box,
} from '../studio-layout'
import type { MathChain } from './chain'

const INDEX_W = 26
const COLUMN_GUTTER = 22
const ROW_GUTTER = 18
const MAX_RUNG_H = 38
const MAX_LADDER_W = 170
const LINE_GAP = 10
const LINE_W = 48
const MIN_FONT = 8
/** Hairline stroke + gap so writing lines clear the safe-area guide. */
const FIELD_INSET = 8
/** Dotted write-in blank — short dash + gap reads as dots when printed. */
const WRITE_LINE_DASH = [2, 3] as const

export interface LadderDrawOptions {
  field: Box
  chains: MathChain[]
  showRunningBoxes: boolean
  font: string
  digitFont: string
  tag: StudioTag
}

/** Vertical ladders read best in tall cells, so columns stay low as the count grows. */
export function ladderColumnCount(itemCount: number): number {
  if (itemCount <= 3) return 1
  if (itemCount <= 8) return 2
  return 3
}

interface RungGeometry {
  top: number
  rungH: number
  blockH: number
  ladder: Box
  lineLeft: number
  lineW: number
  fontSize: number
}

function chainLabels(chain: MathChain): string[] {
  return [String(chain.start), ...chain.steps.map((step) => step.label)]
}

function measureCell(options: {
  cell: Box
  chain: MathChain
  showRunningBoxes: boolean
  /** Shared page font — keeps every ladder on the same type size. */
  fontSize?: number
}): RungGeometry {
  const { cell, chain, showRunningBoxes } = options
  const rungCount = chain.steps.length + 2
  const rungH = Math.min(MAX_RUNG_H, Math.max(1, cell.height / rungCount))
  const blockH = rungH * rungCount

  const indexW = Math.min(INDEX_W, cell.width * 0.2)
  const available = cell.width - indexW
  const lineW = Math.max(20, Math.min(LINE_W, available * 0.34))
  const ladderW = Math.min(
    MAX_LADDER_W,
    available - (showRunningBoxes ? lineW + LINE_GAP : 0),
  )
  const assemblyW = ladderW + (showRunningBoxes ? LINE_GAP + lineW : 0)
  const assemblyLeft = cell.left + indexW + Math.max(0, (available - assemblyW) / 2)

  const preferred = Math.min(STUDIO_BODY_SIZE, Math.max(MIN_FONT, rungH * 0.62))
  const fontSize =
    options.fontSize ??
    chainLabels(chain).reduce(
      (size, label) => Math.min(size, fitFontSizeToWidth(label, ladderW - 6, size, MIN_FONT)),
      preferred,
    )

  return {
    top: cell.top + Math.max(0, (cell.height - blockH) / 2),
    rungH,
    blockH,
    ladder: { left: assemblyLeft, top: cell.top, width: ladderW, height: cell.height },
    lineLeft: assemblyLeft + ladderW + LINE_GAP,
    lineW,
    fontSize,
  }
}

/** Dotted writing line + answer digit centered on the line (same size as ladder numbers). */
function pushAnswerOnLine(
  objects: StudioFabricObject[],
  options: {
    left: number
    centerY: number
    width: number
    value: number
    /** Same size as start / step labels. */
    fontSize: number
    digitFont: string
    tag: StudioTag
  },
): void {
  const { left, centerY, width, value, fontSize, digitFont, tag } = options
  const text = String(value)
  // Baseline just under the digit so the key sits on the write-in line.
  const lineY = Math.round(centerY + fontSize * 0.42)
  objects.push(
    buildLine(
      {
        x1: left,
        y1: lineY,
        x2: left + width,
        y2: lineY,
        stroke: STUDIO_INK,
        strokeWidth: STUDIO_STROKE_HAIRLINE,
        strokeDashArray: [...WRITE_LINE_DASH],
      },
      tag,
      'structure',
    ),
  )
  objects.push(
    buildText(
      {
        left: left + width / 2,
        top: centerY,
        text,
        width: estimateTextBoxWidth(text, fontSize, width),
        fontFamily: digitFont,
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

function buildLadderCell(
  options: LadderDrawOptions & {
    cell: Box
    chain: MathChain
    index: number
    fontSize: number
    /** Shared across the page so same-column ladders share one center axis. */
    maxLabelW: number
  },
): StudioFabricObject {
  const {
    cell,
    chain,
    index,
    showRunningBoxes,
    font,
    digitFont,
    tag,
    fontSize,
    maxLabelW,
  } = options
  const parts: StudioFabricObject[] = []
  const geo = measureCell({ cell, chain, showRunningBoxes, fontSize })
  const centerOf = (rung: number) => geo.top + geo.rungH * rung + geo.rungH / 2
  const columnCenterX = boxCenterX(geo.ladder)

  const indexLabel = `${index})`
  const indexSize = Math.max(MIN_FONT, Math.min(geo.fontSize, INDEX_W * 0.55))
  parts.push(
    buildText(
      {
        left: cell.left,
        top: centerOf(0),
        text: indexLabel,
        width: estimateTextBoxWidth(indexLabel, indexSize, INDEX_W),
        fontFamily: font,
        fontSize: indexSize,
        fill: STUDIO_INK_MUTED,
        originY: 'center',
      },
      tag,
      'decoration',
    ),
  )

  const startText = String(chain.start)
  const startW = estimateTextBoxWidth(startText, geo.fontSize, geo.ladder.width)
  const stepWidths = chain.steps.map((step) =>
    estimateTextBoxWidth(step.label, geo.fontSize, geo.ladder.width),
  )
  // Local content width — right-align digits inside this band, then center the
  // band over the page-shared write-in lines (maxLabelW can be wider).
  const localMaxLabelW = Math.max(startW, ...stepWidths, 1)
  const columnRightX = Math.round(columnCenterX + localMaxLabelW / 2)

  parts.push(
    buildText(
      {
        left: columnRightX,
        top: centerOf(0),
        text: startText,
        width: startW,
        // Same lining-figure face as steps — PT Serif oldstyle digits sit unevenly.
        fontFamily: digitFont,
        fontSize: geo.fontSize,
        textAlign: 'right',
        originX: 'right',
        originY: 'center',
      },
      tag,
      'prompt',
    ),
  )

  chain.steps.forEach((step, i) => {
    const centerY = centerOf(i + 1)
    parts.push(
      buildText(
        {
          left: columnRightX,
          top: centerY,
          text: step.label,
          width: stepWidths[i]!,
          fontFamily: digitFont,
          fontSize: geo.fontSize,
          textAlign: 'right',
          originX: 'right',
          originY: 'center',
        },
        tag,
        'prompt',
      ),
    )
    if (!showRunningBoxes) return
    pushAnswerOnLine(parts, {
      left: geo.lineLeft,
      centerY,
      width: geo.lineW,
      value: step.value,
      fontSize: geo.fontSize,
      digitFont,
      tag,
    })
  })

  const answerCenterY = centerOf(chain.steps.length + 1)
  // Lines stay page-wide for even columns; calc band is centered on them.
  const finalLineW = showRunningBoxes ? geo.lineW : maxLabelW
  const finalLineLeft = showRunningBoxes
    ? geo.lineLeft
    : Math.round(columnCenterX - finalLineW / 2)
  // Solid rule between the last operation and the answer write-in.
  const separatorY = Math.round(geo.top + geo.rungH * (chain.steps.length + 1))
  const separatorW = showRunningBoxes
    ? geo.ladder.width + LINE_GAP + geo.lineW
    : finalLineW
  const separatorLeft = showRunningBoxes ? geo.ladder.left : finalLineLeft
  parts.push(
    buildLine(
      {
        x1: separatorLeft,
        y1: separatorY,
        x2: separatorLeft + separatorW,
        y2: separatorY,
        stroke: STUDIO_INK,
        strokeWidth: STUDIO_STROKE_HAIRLINE,
      },
      tag,
      'structure',
    ),
  )
  pushAnswerOnLine(parts, {
    left: finalLineLeft,
    centerY: answerCenterY,
    width: finalLineW,
    value: chain.answer,
    fontSize: geo.fontSize,
    digitFont,
    tag,
  })

  return buildGroup(parts, unionObjectBounds(parts) ?? cell, tag, 'structure')
}

/** Preferred ladder height at MAX_RUNG_H — used to shrink-wrap before centering. */
function preferredBlockHeight(chain: MathChain, cellWidth: number, showRunningBoxes: boolean): number {
  return measureCell({
    cell: { left: 0, top: 0, width: cellWidth, height: 10_000 },
    chain,
    showRunningBoxes,
  }).blockH
}

/** One type size + label width for the whole page so columns share even line widths. */
function sharedRungMetrics(
  chains: MathChain[],
  cell: Box,
  showRunningBoxes: boolean,
): { fontSize: number; maxLabelW: number } {
  const sample = measureCell({ cell, chain: chains[0]!, showRunningBoxes })
  const ladderBudget = sample.ladder.width - 6
  const preferred = Math.min(STUDIO_BODY_SIZE, Math.max(MIN_FONT, sample.rungH * 0.62))
  let fontSize = preferred
  for (const chain of chains) {
    for (const label of chainLabels(chain)) {
      fontSize = Math.min(
        fontSize,
        fitFontSizeToWidth(label, ladderBudget, fontSize, MIN_FONT),
      )
    }
  }
  let maxLabelW = 0
  for (const chain of chains) {
    for (const label of chainLabels(chain)) {
      maxLabelW = Math.max(
        maxLabelW,
        estimateTextBoxWidth(label, fontSize, sample.ladder.width),
      )
    }
  }
  return { fontSize, maxLabelW }
}

/** Centered grid of ladders; each ladder is a group, then one parent group. */
export function drawLadderGrid(
  objects: StudioFabricObject[],
  options: LadderDrawOptions,
): void {
  const { chains, showRunningBoxes, tag } = options
  if (chains.length === 0) return

  const field = insetBox(options.field, FIELD_INSET)
  const cols = Math.min(ladderColumnCount(chains.length), chains.length)
  const rowCount = Math.ceil(chains.length / cols)
  const colW = (field.width - COLUMN_GUTTER * (cols - 1)) / cols

  let cellH = 0
  for (const chain of chains) {
    cellH = Math.max(cellH, preferredBlockHeight(chain, colW, showRunningBoxes))
  }
  const maxCellH = (field.height - ROW_GUTTER * (rowCount - 1)) / rowCount
  cellH = Math.min(cellH, maxCellH)

  const gridH = cellH * rowCount + ROW_GUTTER * Math.max(0, rowCount - 1)
  const gridTop = field.top + Math.max(0, (field.height - gridH) / 2)
  const gridW = cols * colW + COLUMN_GUTTER * Math.max(0, cols - 1)
  const gridLeft = field.left + Math.max(0, (field.width - gridW) / 2)

  const { fontSize, maxLabelW } = sharedRungMetrics(
    chains,
    { left: 0, top: 0, width: colW, height: cellH },
    showRunningBoxes,
  )

  const ladderGroups: StudioFabricObject[] = []
  chains.forEach((chain, i) => {
    const row = Math.floor(i / cols)
    const col = i % cols
    const cell: Box = {
      left: gridLeft + col * (colW + COLUMN_GUTTER),
      top: gridTop + row * (cellH + ROW_GUTTER),
      width: colW,
      height: cellH,
    }
    ladderGroups.push(
      buildLadderCell({
        ...options,
        cell,
        chain,
        index: i + 1,
        fontSize,
        maxLabelW,
      }),
    )
  })

  const bounds = unionObjectBounds(ladderGroups)
  if (!bounds) return
  // Shrink-wrap then re-center — content is narrower than the cell grid.
  const centeredLeft = field.left + Math.max(0, (field.width - bounds.width) / 2)
  const centeredTop = field.top + Math.max(0, (field.height - bounds.height) / 2)
  const dx = centeredLeft - bounds.left
  const dy = centeredTop - bounds.top
  const shifted = ladderGroups.map((group) => ({
    ...group,
    left: (group.left ?? 0) + dx,
    top: (group.top ?? 0) + dy,
  }))
  objects.push(
    buildGroup(
      shifted,
      { ...bounds, left: centeredLeft, top: centeredTop },
      tag,
      'structure',
    ),
  )
}
