import { closedShapeParts } from './shape-closed'
import { openShapeParts } from './shape-open'
import { compositeShapeParts } from './shape-composite'
import { extraClosedShapeParts } from './shape-extra-closed'
import { extraOpenShapeParts } from './shape-extra-open'
import { extraCompositeShapeParts } from './shape-extra-composite'
import type { StudyRecallShapeId } from './shape-ids'
import type { ShapeParts } from './shape-parts-types'

export type { ShapeParts } from './shape-parts-types'

/** Resolve a shape id into circles / polygons / lines in local coords. */
export function shapePartsFor(id: StudyRecallShapeId, radius: number): ShapeParts {
  const parts =
    closedShapeParts(id, radius) ??
    openShapeParts(id, radius) ??
    compositeShapeParts(id, radius) ??
    extraClosedShapeParts(id, radius) ??
    extraOpenShapeParts(id, radius) ??
    extraCompositeShapeParts(id, radius)
  if (!parts) {
    throw new Error(`Unknown study-recall shape: ${id}`)
  }
  return parts
}
