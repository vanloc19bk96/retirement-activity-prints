import type { StudioFabricObject } from '@/types/studio-template.types'
import {
  boxCenterX,
  boxCenterY,
  estimateTextBoxWidth,
  unionObjectBounds,
  type Box,
} from '../studio-layout'
import {
  buildGroup,
  buildImage,
  buildText,
  type StudioTag,
} from '../studio-fabric-builders'
import {
  STUDIO_INK_MUTED,
  STUDIO_STROKE_NORMAL,
  STUDIO_BODY_SIZE,
} from '@/constants/studio.constants'
import {
  drawGridLines as drawSharedGridLines,
  snapGridInField,
} from '../studio-grid-rules'
import { STUDIO_SHAPE_GROUP_SOURCE } from '@/utils/studio-shape-group'
import {
  buildStudyRecallShape,
  type StudyRecallShapeId,
} from './shapes'

export { snapGridInField }

/** Cell content — stroked geometric shape or a custom uploaded SVG. */
export type StudyRecallCellItem =
  | { kind: 'shape'; id: StudyRecallShapeId }
  | { kind: 'svg'; src: string }

/** Fit SVG inside the cell with a small inset (matches shape optical margin). */
const CELL_SVG_FIT = 0.62
const CELL_SVG_NATURAL = 256

export { drawInstructionBand } from '../studio-layout'

export const PAGE_TURN_LABEL = 'Turn the page to continue'
/** Shape size as a fraction of cell — leaves margin for the cell stroke. */
const CELL_SYMBOL_SCALE = 0.48
const CELL_SYMBOL_MIN_SIZE = 18

function cellSymbolSize(cellSize: number): number {
  return Math.max(CELL_SYMBOL_MIN_SIZE, Math.round(cellSize * CELL_SYMBOL_SCALE))
}

/** Shift absolute geometry by dx/dy (center-origin lines keep relative x1..y2). */
function translateObjects(
  objects: StudioFabricObject[],
  dx: number,
  dy: number,
): StudioFabricObject[] {
  return objects.map((obj) => {
    const next: StudioFabricObject = { ...obj }
    if (typeof next.left === 'number') next.left += dx
    if (typeof next.top === 'number') next.top += dy
    if (obj.type === 'line' && obj.originX === 'center') {
      return next
    }
    if (typeof next.x1 === 'number') next.x1 += dx
    if (typeof next.x2 === 'number') next.x2 += dx
    if (typeof next.y1 === 'number') next.y1 += dy
    if (typeof next.y2 === 'number') next.y2 += dy
    return next
  })
}

/** Move ink so its bounding-box center lands on the cell center. */
function centerPartsInCell(
  parts: StudioFabricObject[],
  cell: Box,
): { parts: StudioFabricObject[]; bounds: Box } {
  const cellCenterX = boxCenterX(cell)
  const cellCenterY = boxCenterY(cell)
  const rawBounds = unionObjectBounds(parts) ?? cell
  const dx = cellCenterX - (rawBounds.left + rawBounds.width / 2)
  const dy = cellCenterY - (rawBounds.top + rawBounds.height / 2)
  const centered = translateObjects(parts, dx, dy)
  return { parts: centered, bounds: unionObjectBounds(centered) ?? cell }
}

/** Study/recall grids use a slightly heavier rule than the hairline default. */
export function drawGridLines(
  bounds: Box,
  cell: number,
  cols: number,
  rows: number,
  tag: StudioTag,
): StudioFabricObject[] {
  return drawSharedGridLines(bounds, cell, cols, rows, tag, {
    thickness: STUDIO_STROKE_NORMAL,
  })
}

export function buildCellContent(options: {
  item: StudyRecallCellItem
  cell: Box
  cellSize: number
  tag: StudioTag
  role: 'prompt' | 'answer'
}): StudioFabricObject[] {
  const { item, cell, cellSize, tag, role } = options
  if (item.kind === 'svg') {
    const size = Math.max(16, Math.round(cellSize * CELL_SVG_FIT))
    const scale = size / CELL_SVG_NATURAL
    return [
      buildImage(
        {
          src: item.src,
          left: boxCenterX(cell),
          top: boxCenterY(cell),
          originX: 'center',
          originY: 'center',
          width: CELL_SVG_NATURAL,
          height: CELL_SVG_NATURAL,
          scaleX: scale,
          scaleY: scale,
        },
        tag,
        role,
      ),
    ]
  }

  // One group per symbol so ungrouping the grid keeps each glyph intact.
  // Recenter by ink bounds — brackets / L / U are asymmetric around origin.
  // Tag as studio-shape-group so the toolbar shows shape controls after ungroup.
  const rawParts = buildStudyRecallShape(
    item.id,
    { left: boxCenterX(cell), top: boxCenterY(cell) },
    cellSymbolSize(cellSize),
    tag,
    'decoration',
  )
  const { parts, bounds } = centerPartsInCell(rawParts, cell)
  const group = buildGroup(parts, bounds, tag, role)
  return [
    {
      ...group,
      data: {
        ...(group.data ?? {}),
        source: STUDIO_SHAPE_GROUP_SOURCE,
      },
    },
  ]
}

/** Centered page-turn label at the bottom of the study page. */
export function drawPageTurnCue(
  footer: Box,
  font: string,
  tag: StudioTag,
): StudioFabricObject[] {
  const labelSize = Math.round(STUDIO_BODY_SIZE * 0.75)
  return [
    buildText(
      {
        left: boxCenterX(footer),
        top: boxCenterY(footer),
        text: PAGE_TURN_LABEL,
        width: estimateTextBoxWidth(PAGE_TURN_LABEL, labelSize, footer.width),
        fontSize: labelSize,
        fontFamily: font,
        fill: STUDIO_INK_MUTED,
        textAlign: 'center',
        originX: 'center',
        originY: 'center',
      },
      tag,
      'decoration',
    ),
  ]
}
