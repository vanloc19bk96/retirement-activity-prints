import type { Group } from 'fabric'

/** Marks a multi-path studio glyph so the toolbar treats it as an editable shape. */
export const STUDIO_SHAPE_GROUP_SOURCE = 'studio-shape-group'

/** True for tagged studio glyphs — not the outer grid group. */
export function isStudioShapeGroup(target: unknown): target is Group {
  const obj = target as {
    data?: { source?: unknown }
  } | null
  if (!obj) return false
  return obj.data?.source === STUDIO_SHAPE_GROUP_SOURCE
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
