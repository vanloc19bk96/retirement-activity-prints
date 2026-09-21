import type { StudioFabricObject, StudioRole } from '@/types/studio-template.types'
import {
  buildCenteredLine,
  buildCircle,
  buildPolygon,
  type StudioTag,
} from '../studio-fabric-builders'
import {
  STUDIO_INK,
  STUDIO_RULE_MEDIUM,
  STUDIO_STROKE_NORMAL,
} from '@/constants/studio.constants'
import type { FillKind, MarkKind, ShapeKind, SizeKind } from './types'

const FILL_PAINT: Record<FillKind, string> = {
  hollow: 'transparent',
  // Mid gray reads as a distinct third state in B&W print without going muddy.
  shaded: STUDIO_RULE_MEDIUM,
  solid: STUDIO_INK,
}

/**
 * Side length as a share of the cell's unit slot. Gaps stay open at `large`.
 *
 * The steps are spread wide enough to survive the trim: an option box is around
 * 46pt across on a 6×9 page, and two figures closer than roughly a fifth in
 * width read as the same picture printed twice.
 */
export const SIZE_FACTOR: Record<SizeKind, number> = {
  small: 0.52,
  medium: 0.73,
  large: 0.95,
}

/**
 * Widest share of its slot one figure may span. Repeats must not touch: at
 * `large` a shape fills almost its whole slot, so three solid squares in a row
 * fused into one black bar and the reader could no longer count them — the very
 * thing the rule is about.
 */
export const PITCH_LIMIT = 0.84

/**
 * The unit a side is measured against once the pitch limit has had its say.
 *
 * The limit shrinks the unit every size is measured from rather than clipping
 * the finished side. Clipping held `large` at 0.84 of a slot while `medium` kept
 * its whole 0.75, so the two printed within a tenth of each other: the size
 * ladder — the rule the reader has to read off the page — vanished as soon as a
 * cell held more than one shape. Scaling the unit keeps every ratio intact at
 * any slot count, which is what lets `sizeContrast` ignore `slots` entirely.
 */
export function fitUnit(unit: number, slot: number, slots: number): number {
  if (slots <= 1) return unit
  return Math.min(unit, (slot * PITCH_LIMIT) / SIZE_FACTOR.large)
}

/** How alike two sizes print, 1 being indistinguishable. */
export function sizeContrast(a: SizeKind, b: SizeKind): number {
  return Math.min(SIZE_FACTOR[a], SIZE_FACTOR[b]) / Math.max(SIZE_FACTOR[a], SIZE_FACTOR[b])
}

interface Point {
  x: number
  y: number
}

/** `n` points on a circle of radius `radius`, first one straight up. */
function ring(n: number, radius: number, offset = 0): Point[] {
  return Array.from({ length: n }, (_, i) => {
    const angle = (-90 + offset + (360 / n) * i) * (Math.PI / 180)
    return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) }
  })
}

function starPoints(points: number, outer: number, inner: number): Point[] {
  const out: Point[] = []
  for (let i = 0; i < points * 2; i++) {
    const angle = (-90 + (180 / points) * i) * (Math.PI / 180)
    const radius = i % 2 === 0 ? outer : inner
    out.push({ x: radius * Math.cos(angle), y: radius * Math.sin(angle) })
  }
  return out
}

/** Outline centred on (0, 0). `null` for a circle, which Fabric draws natively. */
export function shapeOutline(shape: ShapeKind, side: number): Point[] | null {
  const half = side / 2
  switch (shape) {
    case 'circle':
      return null
    case 'square':
      return [
        { x: -half, y: -half },
        { x: half, y: -half },
        { x: half, y: half },
        { x: -half, y: half },
      ]
    case 'diamond':
      return [
        { x: 0, y: -half },
        { x: half, y: 0 },
        { x: 0, y: half },
        { x: -half, y: 0 },
      ]
    case 'triangle': {
      // Slightly shorter than wide so it does not tower over the other shapes.
      const height = side * 0.9
      return [
        { x: 0, y: -height / 2 },
        { x: half, y: height / 2 },
        { x: -half, y: height / 2 },
      ]
    }
    case 'pentagon':
      return ring(5, half)
    case 'hexagon':
      return ring(6, half)
    case 'star':
      return starPoints(5, half, half * 0.45)
  }
}

/** Ink weight that stays hairline-thin on a small glyph and never gets heavy. */
function outlineWeight(side: number): number {
  return Math.max(1.2, Math.min(STUDIO_STROKE_NORMAL, side * 0.09))
}

export interface FigureSpec {
  centerX: number
  centerY: number
  side: number
  shape: ShapeKind
  fill: FillKind
  mark: MarkKind
}

function buildOutline(spec: FigureSpec, tag: StudioTag, role: StudioRole): StudioFabricObject {
  const { centerX, centerY, side, shape, fill } = spec
  const paint = FILL_PAINT[fill]
  const strokeWidth = outlineWeight(side)

  if (shape === 'circle') {
    return buildCircle(
      {
        left: centerX,
        top: centerY,
        radius: side / 2,
        fill: paint,
        stroke: STUDIO_INK,
        strokeWidth,
        strokeUniform: true,
      },
      tag,
      role,
    )
  }

  return buildPolygon(
    {
      // buildPolygon re-anchors on the point cloud's own centre, so a cloud
      // centred on the origin lands its middle exactly here.
      left: centerX,
      top: centerY,
      points: shapeOutline(shape, side)!,
      fill: paint,
      stroke: STUDIO_INK,
      strokeWidth,
      strokeUniform: true,
      strokeLineJoin: 'round',
    },
    tag,
    role,
  )
}

/**
 * The glyph struck inside the outline.
 *
 * Kept well inside the widest inscribed square of the roomiest shapes (see
 * `ROOMY_SHAPES`) so a pentagon's sloping walls never clip it, and drawn in
 * full ink so it survives a gray-shaded body at 300 DPI.
 */
function buildMark(spec: FigureSpec, tag: StudioTag, role: StudioRole): StudioFabricObject[] {
  const { centerX, centerY, side, mark } = spec
  if (mark === 'none') return []
  const reach = side * 0.19
  const weight = Math.max(1.2, Math.min(STUDIO_STROKE_NORMAL, side * 0.1))

  if (mark === 'dot') {
    return [
      buildCircle(
        {
          left: centerX,
          top: centerY,
          radius: Math.max(1.4, side * 0.11),
          fill: STUDIO_INK,
          stroke: STUDIO_INK,
          strokeWidth: 0,
        },
        tag,
        role,
      ),
    ]
  }

  if (mark === 'bar') {
    return [
      buildCenteredLine(
        {
          x1: centerX - reach,
          y1: centerY,
          x2: centerX + reach,
          y2: centerY,
          stroke: STUDIO_INK,
          strokeWidth: weight,
          strokeUniform: true,
          strokeLineCap: 'round',
        },
        tag,
        role,
      ),
    ]
  }

  return [
    buildCenteredLine(
      {
        x1: centerX - reach,
        y1: centerY - reach,
        x2: centerX + reach,
        y2: centerY + reach,
        stroke: STUDIO_INK,
        strokeWidth: weight,
        strokeUniform: true,
        strokeLineCap: 'round',
      },
      tag,
      role,
    ),
    buildCenteredLine(
      {
        x1: centerX + reach,
        y1: centerY - reach,
        x2: centerX - reach,
        y2: centerY + reach,
        stroke: STUDIO_INK,
        strokeWidth: weight,
        strokeUniform: true,
        strokeLineCap: 'round',
      },
      tag,
      role,
    ),
  ]
}

/** One drawn figure: its outline, plus the inner mark when it carries one. */
export function buildShape(
  spec: FigureSpec,
  tag: StudioTag,
  role: StudioRole = 'prompt',
): StudioFabricObject[] {
  return [buildOutline(spec, tag, role), ...buildMark(spec, tag, role)]
}
