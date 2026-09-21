import type { StudioConfig, StudioFabricObject } from '@/types/studio-template.types'
import {
  boxCenterX,
  estimateTextBoxWidth,
  type Box,
} from '../studio-layout'
import {
  buildRect,
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
  COL_RULE_STROKE,
  HEADER_RULE_STROKE,
  ROW_RULE_STROKE,
  computeFamilyNamesLayout,
  type FamilyNamesLayout,
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

function pushColRule(
  objects: StudioFabricObject[],
  x: number,
  table: Box,
  headerH: number,
  tag: StudioTag,
): void {
  objects.push(
    buildRect(
      {
        left: Math.round(x - COL_RULE_STROKE / 2),
        top: table.top + headerH,
        width: COL_RULE_STROKE,
        height: table.height - headerH,
        fill: STUDIO_RULE_MEDIUM,
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
  layout: FamilyNamesLayout,
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

function pushRowRules(
  objects: StudioFabricObject[],
  layout: FamilyNamesLayout,
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

function pushColumnRules(
  objects: StudioFabricObject[],
  layout: FamilyNamesLayout,
  tag: StudioTag,
): void {
  const { table, columns, headerH } = layout
  for (let i = 1; i < columns.length; i++) {
    pushColRule(objects, columns[i]!.left, table, headerH, tag)
  }
}

/** Draw the family-names table as one movable group (headers + grid). */
export function drawFamilyNamesTable(
  objects: StudioFabricObject[],
  area: Box,
  config: StudioConfig,
  font: string,
  tag: StudioTag,
): FamilyNamesLayout {
  const requestedRows = Number(config.rowsPerPage ?? 10)
  const layout = computeFamilyNamesLayout({ area, requestedRows })

  const parts: StudioFabricObject[] = []
  pushColumnHeaders(parts, layout, font, tag)
  pushRowRules(parts, layout, tag)
  pushColumnRules(parts, layout, tag)

  // Nominal table box — not unionObjectBounds — so hairline strokes cannot
  // inflate the group past the safe area.
  objects.push(buildGroup(parts, layout.table, tag))
  return layout
}
