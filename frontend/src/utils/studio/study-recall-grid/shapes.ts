import {
  STUDIO_INK_MUTED,
  STUDIO_STROKE_NORMAL,
} from '@/constants/studio.constants'
import type { StudioFabricObject, StudioRole } from '@/types/studio-template.types'
import {
  buildCenteredLine,
  buildCircle,
  buildPolygon,
  type StudioTag,
} from '../studio-fabric-builders'
import { STUDY_RECALL_SHAPE_IDS, type StudyRecallShapeId } from './shape-ids'
import { shapePartsFor } from './shape-parts'
import { fitStrokeSegments } from './shape-stroke'

export { STUDY_RECALL_SHAPE_IDS, type StudyRecallShapeId }

/** Floor — readable single pen stroke, not bold bars. */
export const STUDY_RECALL_SYMBOL_STROKE = STUDIO_STROKE_NORMAL

/**
 * Light drawn-line ink; scales gently with glyph size
 * (~2px at 6×9, ~3px at 8.5×11).
 */
const STUDY_RECALL_STROKE_RATIO = 0.01

export function studyRecallSymbolStroke(size: number): number {
  if (!Number.isFinite(size) || size <= 0) return STUDY_RECALL_SYMBOL_STROKE
  return Math.max(
    STUDY_RECALL_SYMBOL_STROKE,
    Math.round(size * STUDY_RECALL_STROKE_RATIO),
  )
}

export function buildStudyRecallShape(
  id: StudyRecallShapeId,
  center: { left: number; top: number },
  size: number,
  tag: StudioTag,
  role: StudioRole,
): StudioFabricObject[] {
  const radius = size / 2
  const parts = shapePartsFor(id, radius)
  const stroke = STUDIO_INK_MUTED
  const strokeWidth = studyRecallSymbolStroke(size)
  const objects: StudioFabricObject[] = []
  const hasOutline =
    (parts.circles?.length ?? 0) > 0 || (parts.polygons?.length ?? 0) > 0

  for (const circle of parts.circles ?? []) {
    objects.push(
      buildCircle(
        {
          left: center.left + (circle.x ?? 0),
          top: center.top + (circle.y ?? 0),
          radius: circle.r,
          stroke,
          strokeWidth,
          fill: 'transparent',
        },
        tag,
        role,
      ),
    )
  }

  for (const points of parts.polygons ?? []) {
    objects.push(
      buildPolygon(
        {
          left: center.left,
          top: center.top,
          points,
          stroke,
          strokeWidth,
          strokeLineCap: 'butt',
          strokeLineJoin: 'miter',
          fill: 'transparent',
        },
        tag,
        role,
      ),
    )
  }

  const fittedLines = fitStrokeSegments(
    parts.lines ?? [],
    strokeWidth,
    hasOutline,
  )
  for (const [a, b] of fittedLines) {
    objects.push(
      buildCenteredLine(
        {
          x1: center.left + a.x,
          y1: center.top + a.y,
          x2: center.left + b.x,
          y2: center.top + b.y,
          stroke,
          strokeWidth,
          strokeLineCap: 'butt',
        },
        tag,
        role,
      ),
    )
  }

  if (objects.length === 0) {
    throw new Error(`Study-recall shape produced no geometry: ${id}`)
  }
  return objects
}
