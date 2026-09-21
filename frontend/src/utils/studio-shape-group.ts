import type { Group } from 'fabric'

/** Marks a multi-path studio glyph so the toolbar treats it as an editable shape. */
export const STUDIO_SHAPE_GROUP_SOURCE = 'studio-shape-group'

const SHAPE_PRIMITIVE_TYPES = new Set([
  'circle',
  'ellipse',
  'polygon',
  'polyline',
  'line',
  'path',
  'rect',
])

function isShapePrimitiveChild(child: { type?: unknown }): boolean {
  return SHAPE_PRIMITIVE_TYPES.has(String(child?.type ?? '').toLowerCase())
}

/**
 * True for tagged studio glyphs, and for legacy Study & Recall cell groups
 * (pre-tag) that are pure stroked primitives — not the outer grid group.
 */
export function isStudioShapeGroup(target: unknown): target is Group {
  const obj = target as {
    data?: { source?: unknown }
    studioTemplateKey?: unknown
    getObjects?: () => Array<{ type?: unknown }>
  } | null
  if (!obj) return false
  if (obj.data?.source === STUDIO_SHAPE_GROUP_SOURCE) return true

  if (obj.studioTemplateKey !== 'study-recall-grid') return false
  const children = obj.getObjects?.() ?? []
  if (children.length === 0) return false
  return children.every(isShapePrimitiveChild)
}

/** First ink child used to read stroke/fill for the toolbar. */
export function readStudioShapeGroupInkChild(group: {
  getObjects?: () => unknown[]
}): unknown | null {
  const children = group.getObjects?.() ?? []
  if (children.length === 0) return null
  return (
    children.find((child) => {
      const stroke = (child as { stroke?: unknown })?.stroke
      return typeof stroke === 'string' && stroke.length > 0
    }) ?? children[0]
  )
}
