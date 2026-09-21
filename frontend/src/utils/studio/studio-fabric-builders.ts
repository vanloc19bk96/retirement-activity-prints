import type { StudioFabricObject, StudioRole } from '@/types/studio-template.types'
import {
  STUDIO_INK,
  STUDIO_RULE,
  STUDIO_STROKE_HAIRLINE,
  STUDIO_BODY_SIZE,
  STUDIO_DEFAULT_FONT,
} from '@/constants/studio.constants'

export interface StudioTag {
  templateKey: string
  instanceId: string
  pageRole: StudioFabricObject['studioPageRole']
}

let objectCounter = 0

export function nextObjectId(instanceId: string): string {
  return `${instanceId}-${(objectCounter++).toString(36)}`
}

export function resetObjectCounter(): void {
  objectCounter = 0
}

function tagged(
  obj: StudioFabricObject,
  tag: StudioTag,
  role: StudioRole,
): StudioFabricObject {
  return {
    ...obj,
    objectId: nextObjectId(tag.instanceId),
    studioTemplateKey: tag.templateKey,
    studioInstanceId: tag.instanceId,
    studioPageRole: tag.pageRole,
    studioRole: role,
    // Answers stay hidden on the puzzle page; answer-key reveal sets visible.
    ...(role === 'answer' ? { visible: false } : {}),
  }
}

export interface RectSpec {
  left: number
  top: number
  width: number
  height: number
  fill?: string
  stroke?: string
  strokeWidth?: number
  strokeDashArray?: number[]
  rx?: number
  ry?: number
  angle?: number
  originX?: 'left' | 'center' | 'right'
  originY?: 'top' | 'center' | 'bottom'
}

export function buildRect(
  spec: RectSpec,
  tag: StudioTag,
  role: StudioRole = 'structure',
): StudioFabricObject {
  return tagged(
    {
      type: 'rect',
      // Fabric 7 defaults origin to center; generators use top-left coordinates.
      originX: 'left',
      originY: 'top',
      fill: 'transparent',
      stroke: STUDIO_RULE,
      strokeWidth: STUDIO_STROKE_HAIRLINE,
      ...spec,
    },
    tag,
    role,
  )
}

export interface LineSpec {
  x1: number
  y1: number
  x2: number
  y2: number
  stroke?: string
  strokeWidth?: number
  strokeUniform?: boolean
  strokeDashArray?: number[]
  strokeLineCap?: 'butt' | 'round' | 'square'
  strokeLineJoin?: 'miter' | 'round' | 'bevel'
}

export function buildLine(
  spec: LineSpec,
  tag: StudioTag,
  role: StudioRole = 'structure',
): StudioFabricObject {
  return tagged(
    {
      type: 'line',
      originX: 'left',
      originY: 'top',
      left: Math.min(spec.x1, spec.x2),
      top: Math.min(spec.y1, spec.y2),
      stroke: STUDIO_RULE,
      strokeWidth: STUDIO_STROKE_HAIRLINE,
      ...spec,
    },
    tag,
    role,
  )
}

/**
 * Fabric 7 native line: left/top at segment center, x1..y2 relative.
 * Use when the line must stay concentric with center-origin polygons/circles.
 */
export function buildCenteredLine(
  spec: LineSpec,
  tag: StudioTag,
  role: StudioRole = 'structure',
): StudioFabricObject {
  const left = (spec.x1 + spec.x2) / 2
  const top = (spec.y1 + spec.y2) / 2
  return tagged(
    {
      type: 'line',
      originX: 'center',
      originY: 'center',
      left,
      top,
      x1: spec.x1 - left,
      y1: spec.y1 - top,
      x2: spec.x2 - left,
      y2: spec.y2 - top,
      stroke: spec.stroke ?? STUDIO_RULE,
      strokeWidth: spec.strokeWidth ?? STUDIO_STROKE_HAIRLINE,
      strokeUniform: spec.strokeUniform,
      strokeDashArray: spec.strokeDashArray,
      strokeLineCap: spec.strokeLineCap,
      strokeLineJoin: spec.strokeLineJoin,
    },
    tag,
    role,
  )
}

export interface CircleSpec {
  left: number
  top: number
  radius: number
  fill?: string
  stroke?: string
  strokeWidth?: number
  strokeUniform?: boolean
}

export function buildCircle(
  spec: CircleSpec,
  tag: StudioTag,
  role: StudioRole = 'structure',
): StudioFabricObject {
  return tagged(
    {
      type: 'circle',
      fill: 'transparent',
      stroke: STUDIO_RULE,
      strokeWidth: STUDIO_STROKE_HAIRLINE,
      originX: 'center',
      originY: 'center',
      ...spec,
    },
    tag,
    role,
  )
}

export interface PolygonSpec {
  left: number
  top: number
  points: { x: number; y: number }[]
  fill?: string
  stroke?: string
  strokeWidth?: number
  strokeUniform?: boolean
  strokeLineCap?: 'butt' | 'round' | 'square'
  strokeLineJoin?: 'miter' | 'round' | 'bevel'
}

function polygonBounds(points: { x: number; y: number }[]): {
  width: number
  height: number
  centerX: number
  centerY: number
} {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  if (!Number.isFinite(minX)) {
    return { width: 0, height: 0, centerX: 0, centerY: 0 }
  }
  return {
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
    // Fabric pathOffset — AABB center, not the geometric origin of points.
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  }
}

export function buildPolygon(
  spec: PolygonSpec,
  tag: StudioTag,
  role: StudioRole = 'structure',
): StudioFabricObject {
  const { width, height, centerX, centerY } = polygonBounds(spec.points)
  return tagged(
    {
      type: 'polygon',
      fill: 'transparent',
      stroke: STUDIO_RULE,
      strokeWidth: STUDIO_STROKE_HAIRLINE,
      originX: 'center',
      originY: 'center',
      ...spec,
      // Keep geometric origin of `points` at the caller's left/top (Fabric
      // anchors originX/Y center on the AABB / pathOffset, not the centroid).
      left: spec.left + centerX,
      top: spec.top + centerY,
      width,
      height,
    },
    tag,
    role,
  )
}

export interface PolylineSpec {
  left: number
  top: number
  points: { x: number; y: number }[]
  fill?: string
  stroke?: string
  strokeWidth?: number
  strokeUniform?: boolean
  strokeLineCap?: 'butt' | 'round' | 'square'
  strokeLineJoin?: 'miter' | 'round' | 'bevel'
}

/** Open stroked polyline — same origin/bounds convention as `buildPolygon`. */
export function buildPolyline(
  spec: PolylineSpec,
  tag: StudioTag,
  role: StudioRole = 'structure',
): StudioFabricObject {
  const { width, height, centerX, centerY } = polygonBounds(spec.points)
  return tagged(
    {
      type: 'polyline',
      fill: 'transparent',
      stroke: STUDIO_RULE,
      strokeWidth: STUDIO_STROKE_HAIRLINE,
      originX: 'center',
      originY: 'center',
      ...spec,
      left: spec.left + centerX,
      top: spec.top + centerY,
      width,
      height,
    },
    tag,
    role,
  )
}

export interface TextSpec {
  left: number
  top: number
  text: string
  width?: number
  height?: number
  fontSize?: number
  fontFamily?: string
  fontWeight?: string | number
  fontStyle?: 'normal' | 'italic' | 'oblique'
  /** Fabric line height multiplier — 1 locks single-glyph vertical metrics. */
  lineHeight?: number
  textAlign?: 'left' | 'center' | 'right' | 'justify'
  /** Fabric textbox character spacing (1/1000 em). */
  charSpacing?: number
  fill?: string
  editable?: boolean
  originX?: 'left' | 'center' | 'right'
  originY?: 'top' | 'center' | 'bottom'
}

export function buildText(
  spec: TextSpec,
  tag: StudioTag,
  role: StudioRole = 'prompt',
): StudioFabricObject {
  // Drop undefined keys so callers cannot wipe defaults (Fabric Textbox
  // crashes when textAlign is undefined during enliven → blank canvas).
  const definedSpec = Object.fromEntries(
    Object.entries(spec).filter(([, value]) => value !== undefined),
  ) as TextSpec
  return tagged(
    {
      type: 'textbox',
      // Fabric 7 defaults origin to center; override unless caller passes center.
      originX: 'left',
      originY: 'top',
      fontSize: STUDIO_BODY_SIZE,
      fontFamily: STUDIO_DEFAULT_FONT,
      fill: STUDIO_INK,
      textAlign: 'left',
      editable: true,
      ...definedSpec,
    },
    tag,
    role,
  )
}

export interface ImageSpec {
  left: number
  top: number
  width: number
  height: number
  src: string
  /** Display scale — required when width/height are natural image pixels. */
  scaleX?: number
  scaleY?: number
  originX?: 'left' | 'center' | 'right'
  originY?: 'top' | 'center' | 'bottom'
  /** Required for canvas export with externally hosted images. */
  crossOrigin?: 'anonymous' | 'use-credentials' | ''
}

export function buildImage(
  spec: ImageSpec,
  tag: StudioTag,
  role: StudioRole = 'prompt',
): StudioFabricObject {
  return tagged(
    {
      type: 'image',
      originX: 'left',
      originY: 'top',
      selectable: true,
      hasControls: true,
      ...spec,
    },
    tag,
    role,
  )
}

/** Fabric groups store children relative to the group center. */
function toGroupRelative(
  obj: StudioFabricObject,
  centerX: number,
  centerY: number,
): StudioFabricObject {
  const next: StudioFabricObject = { ...obj }
  if (typeof next.left === 'number') next.left -= centerX
  if (typeof next.top === 'number') next.top -= centerY
  // Center-origin lines store x1/y1 relative to left/top — do not shift them again.
  if (obj.type === 'line' && obj.originX === 'center') {
    return next
  }
  if (typeof next.x1 === 'number') next.x1 -= centerX
  if (typeof next.x2 === 'number') next.x2 -= centerX
  if (typeof next.y1 === 'number') next.y1 -= centerY
  if (typeof next.y2 === 'number') next.y2 -= centerY
  return next
}

export function buildGroup(
  objects: StudioFabricObject[],
  bounds: { left: number; top: number; width: number; height: number },
  tag: StudioTag,
  role: StudioRole = 'decoration',
): StudioFabricObject {
  const centerX = bounds.left + bounds.width / 2
  const centerY = bounds.top + bounds.height / 2
  return tagged(
    {
      type: 'group',
      originX: 'left',
      originY: 'top',
      ...bounds,
      // Fabric rasterises a cached group into a canvas sized from these very
      // bounds, so a child whose ink reaches the edge is cut mid-glyph — that
      // is what shaved the tails off descenders in the bottom row of every
      // generated grid. Group bounds are a layout rect here (callers centre
      // and margin-check against them), so they cannot simply be inflated;
      // drawing the group live is what keeps every child whole. Children keep
      // their own caches, so the cost is one composite pass, not re-rasterising
      // the glyphs.
      objectCaching: false,
      objects: objects.map((obj) => toGroupRelative(obj, centerX, centerY)),
    },
    tag,
    role,
  )
}
