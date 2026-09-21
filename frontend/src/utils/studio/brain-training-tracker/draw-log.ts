import type { StudioConfig, StudioFabricObject } from '@/types/studio-template.types'
import {
  boxCenterX,
  estimateTextBoxWidth,
  type Box,
} from '../studio-layout'
import {
  buildRect,
  buildCircle,
  buildText,
  buildGroup,
  type StudioTag,
} from '../studio-fabric-builders'
import {
  STUDIO_INK,
  STUDIO_INK_MUTED,
  STUDIO_RULE_MEDIUM,
} from '@/constants/studio.constants'
import {
  COL_HEADER_SIZE,
  ENJOYED_SCALE_MARKS,
  HEADER_RULE_STROKE,
  ROW_RULE_STROKE,
  TICK_STROKE,
  columnByKey,
  computePuzzleLogLayout,
  type PuzzleLogLayout,
} from './layout'

function pushRuleBar(
  objects: StudioFabricObject[],
  y: number,
  table: Box,
  stroke: number,
  fill: string,
  tag: StudioTag,
): void {
  objects.push(
    buildRect(
      {
        left: table.left,
        top: Math.round(y - stroke / 2),
        width: table.width,
        height: stroke,
        fill,
        strokeWidth: 0,
      },
      tag,
      'structure',
    ),
  )
}

function pushCenteredLabel(
  objects: StudioFabricObject[],
  cell: Box,
  text: string,
  fontSize: number,
  font: string,
  tag: StudioTag,
): void {
  const maxW = Math.max(4, cell.width - 4)
  // Non-breaking spaces keep headers on one line (column mins already fit the label).
  const oneLine = text.replace(/ /g, '\u00a0')
  objects.push(
    buildText(
      {
        left: boxCenterX(cell),
        top: cell.top + cell.height * 0.28,
        text: oneLine,
        width: estimateTextBoxWidth(oneLine, fontSize, maxW),
        fontSize,
        fontFamily: font,
        fill: STUDIO_INK_MUTED,
        textAlign: 'center',
        originX: 'center',
      },
      tag,
      'decoration',
    ),
  )
}

function pushColumnHeaders(
  objects: StudioFabricObject[],
  layout: PuzzleLogLayout,
  font: string,
  tag: StudioTag,
): void {
  const { table, columns, headerH } = layout
  for (const col of columns) {
    const cell: Box = {
      left: col.left,
      top: table.top,
      width: col.width,
      height: headerH,
    }
    pushCenteredLabel(objects, cell, col.label, COL_HEADER_SIZE, font, tag)
  }
}

function enjoyedCircleCenters(
  enjoyed: { left: number; width: number },
  circleDiameter: number,
): number[] {
  const gap = (enjoyed.width - 3 * circleDiameter) / 4
  const rad = circleDiameter / 2
  return ENJOYED_SCALE_MARKS.map(
    (_, i) => enjoyed.left + gap + rad + i * (circleDiameter + gap),
  )
}

function pushInteractiveMarks(
  objects: StudioFabricObject[],
  layout: PuzzleLogLayout,
  showEnjoy: boolean,
  font: string,
  tag: StudioTag,
): void {
  const { table, columns, rows, rowH, headerH, tickSize, circleDiameter } = layout
  const done = columnByKey(columns, 'done')
  const enjoyed = showEnjoy ? columnByKey(columns, 'enjoyed') : null
  const markSize = Math.max(8, Math.min(COL_HEADER_SIZE, Math.floor(circleDiameter * 0.55)))

  for (let r = 0; r < rows; r++) {
    const rowTop = table.top + headerH + r * rowH
    const tickLeft = Math.round(done.centre - tickSize / 2)
    const tickTop = Math.round(rowTop + (rowH - tickSize) / 2)
    objects.push(
      buildRect(
        {
          left: tickLeft,
          top: tickTop,
          width: tickSize,
          height: tickSize,
          fill: 'transparent',
          stroke: STUDIO_INK,
          strokeWidth: TICK_STROKE,
        },
        tag,
        'structure',
      ),
    )

    if (!enjoyed) continue
    const rad = circleDiameter / 2
    const centers = enjoyedCircleCenters(enjoyed, circleDiameter)
    for (let i = 0; i < centers.length; i++) {
      const cx = centers[i]!
      const cy = rowTop + rowH / 2
      objects.push(
        buildCircle(
          {
            left: cx,
            top: cy,
            radius: rad,
            fill: 'transparent',
            stroke: STUDIO_INK,
            strokeWidth: TICK_STROKE,
          },
          tag,
          'structure',
        ),
      )
      const mark = ENJOYED_SCALE_MARKS[i]!
      objects.push(
        buildText(
          {
            left: cx,
            top: cy - markSize * 0.55,
            text: mark,
            width: estimateTextBoxWidth(mark, markSize, circleDiameter),
            fontSize: markSize,
            fontFamily: font,
            fill: STUDIO_INK_MUTED,
            textAlign: 'center',
            originX: 'center',
          },
          tag,
          'decoration',
        ),
      )
    }
  }
}

function pushRowRules(
  objects: StudioFabricObject[],
  layout: PuzzleLogLayout,
  tag: StudioTag,
): void {
  const { table, rows, rowH, headerH } = layout
  pushRuleBar(objects, table.top + headerH, table, HEADER_RULE_STROKE, STUDIO_INK, tag)
  for (let r = 1; r <= rows; r++) {
    const y = table.top + headerH + r * rowH
    // Last rule sits on the group bottom — inset so the full bar stays inside
    // (a centered bar would clip and look thinner than the others).
    const ruleY = r === rows ? y - ROW_RULE_STROKE / 2 : y
    pushRuleBar(objects, ruleY, table, ROW_RULE_STROKE, STUDIO_RULE_MEDIUM, tag)
  }
}

/** Draw the puzzle log table as one movable group (headers + grid + marks). */
export function drawPuzzleLog(
  objects: StudioFabricObject[],
  area: Box,
  config: StudioConfig,
  font: string,
  tag: StudioTag,
): PuzzleLogLayout {
  const showTime = config.showTimeTaken === true
  const showEnjoy = config.showEnjoyment !== false
  const wideNotes = config.notesWidth !== 'standard'
  const requestedRows = Number(config.rowsPerPage ?? 10)

  const layout = computePuzzleLogLayout({
    area,
    requestedRows,
    showTime,
    showEnjoy,
    wideNotes,
  })

  const parts: StudioFabricObject[] = []
  pushColumnHeaders(parts, layout, font, tag)
  pushRowRules(parts, layout, tag)
  pushInteractiveMarks(parts, layout, showEnjoy, font, tag)

  // Nominal table box — not unionObjectBounds — so hairline strokes cannot
  // inflate the group past the safe area.
  objects.push(buildGroup(parts, layout.table, tag))
  return layout
}
