import type { StudioFabricObject, StudioRole } from '@/types/studio-template.types'
import type { StudioTag } from '../studio-fabric-builders'
import { buildPhosphorIconPath } from '../studio-phosphor-icon'
import type { Box } from '../studio-layout'
import { boxCenterX, boxCenterY } from '../studio-layout'
import type { CellState } from './trials'

/** Phosphor duotone glyph — light gray fill + dark outline. */
export function drawGlyph(
  cell: CellState,
  cellBox: Box,
  cellSize: number,
  tag: StudioTag,
  role: StudioRole,
): StudioFabricObject[] {
  const size = cellSize * 0.55
  const center = { left: boxCenterX(cellBox), top: boxCenterY(cellBox) }

  return [
    buildPhosphorIconPath(
      cell.glyph,
      {
        left: center.left,
        top: center.top,
        size,
        angle: cell.rotationDeg,
      },
      tag,
      role,
    ),
  ]
}
