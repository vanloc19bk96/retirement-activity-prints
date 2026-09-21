import type { StudioFabricObject, StudioRole } from '@/types/studio-template.types'
import {
  STUDIO_INK,
  STUDIO_STROKE_HAIRLINE,
  STUDIO_STROKE_NORMAL,
} from '@/constants/studio.constants'
import {
  buildCircle,
  buildGroup,
  buildLine,
  buildRect,
  buildText,
  type StudioTag,
} from '../studio-fabric-builders'
import { drawGridLines } from '../studio-grid-rules'
import { hugTextBoxWidth } from '../studio-text-metrics'
import type { Box } from '../studio-layout'
import { columnLetter, delta } from './route'
import type { Cell, Dir, Route, RouteSettings } from './types'

/**
 * Width of the coordinate-label band, in squares. Expressing it as a share of a
 * square (rather than a font size) is what lets the fitter solve the grid size
 * in one step: a labelled R x C grid simply occupies (C + f) x (R + f) squares.
 */
export const COORD_BAND_RATIO = 0.6

interface Point {
  x: number
  y: number
}

export function cellCenter(bounds: Box, cell: number, at: Cell): Point {
  return {
    x: bounds.left + (at.col - 1) * cell + cell / 2,
    y: bounds.top + (at.row - 1) * cell + cell / 2,
  }
}

/** Kept intact in PPT so round-cap shaft+barbs rasterize like the editor. */
export const FOLLOW_THE_ROUTE_ARROW_SOURCE = 'follow-the-route-arrow'

/**
 * Arrow as line art (shaft + two head strokes), never a glyph.
 *
 * The catalog fonts carry no arrow characters, so a text arrow survives on
 * screen only to come out as a missing-glyph box once the interior is exported
 * with outlined text. Diagonals are the same three strokes on a normalised
 * vector, so `UR` prints at exactly the length `R` does.
 *
 * Emitted as one tagged group (not three leaf Lines): PPT flattens leaf Lines
 * to native strokes with butt caps, so the tip reads broken vs the editor.
 */
export function buildArrowGlyph(options: {
  center: Point
  size: number
  dir: Dir
  tag: StudioTag
  role?: StudioRole
}): StudioFabricObject {
  const { center, size, dir, tag, role = 'prompt' } = options
  const { dr, dc } = delta(dir)
  const length = Math.hypot(dc, dr) || 1
  const ux = dc / length
  const uy = dr / length
  const half = size / 2
  const head = size * 0.38
  const tip = { x: center.x + ux * half, y: center.y + uy * half }
  const tail = { x: center.x - ux * half, y: center.y - uy * half }
  const strokeWidth = Math.max(STUDIO_STROKE_HAIRLINE, size * 0.13)

  // Structure children — answer visibility lives on the group (checkmark pattern).
  const stroke = (from: Point, to: Point) =>
    buildLine(
      {
        x1: from.x,
        y1: from.y,
        x2: to.x,
        y2: to.y,
        stroke: STUDIO_INK,
        strokeWidth,
        strokeUniform: true,
        strokeLineCap: 'round',
      },
      tag,
      'structure',
    )

  // Barbs sit a head-length back down the shaft, mirrored across it.
  const barb = (sign: number): Point => ({
    x: tip.x - ux * head - uy * sign * head * 0.55,
    y: tip.y - uy * head + ux * sign * head * 0.55,
  })

  // Pad for round caps so PPT/toDataURL AABB does not clip the tips.
  const pad = strokeWidth
  const group = buildGroup(
    [stroke(tail, tip), stroke(tip, barb(1)), stroke(tip, barb(-1))],
    {
      left: center.x - half - pad,
      top: center.y - half - pad,
      width: size + pad * 2,
      height: size + pad * 2,
    },
    tag,
    role,
  )

  return {
    ...group,
    data: {
      ...(group.data ?? {}),
      source: FOLLOW_THE_ROUTE_ARROW_SOURCE,
    },
  }
}

/** Filled disc — the start marker (and its stand-in in the move list). */
export function buildDotMarker(options: {
  center: Point
  radius: number
  tag: StudioTag
  role?: StudioRole
}): StudioFabricObject {
  const { center, radius, tag, role = 'prompt' } = options
  return buildCircle(
    {
      left: center.x,
      top: center.y,
      radius,
      fill: STUDIO_INK,
      stroke: 'transparent',
      strokeWidth: 0,
    },
    tag,
    role,
  )
}

/** Filled square — the Mode C end marker (distinct from the shaded answer cell). */
export function buildSquareMarker(options: {
  center: Point
  size: number
  tag: StudioTag
  role?: StudioRole
}): StudioFabricObject {
  const { center, size, tag, role = 'prompt' } = options
  return buildRect(
    {
      left: center.x - size / 2,
      top: center.y - size / 2,
      width: size,
      height: size,
      fill: STUDIO_INK,
      stroke: 'transparent',
      strokeWidth: 0,
    },
    tag,
    role,
  )
}

function drawCoordLabels(options: {
  bounds: Box
  cell: number
  route: Route
  font: string
  tag: StudioTag
}): StudioFabricObject[] {
  const { bounds, cell, route, font, tag } = options
  const band = cell * COORD_BAND_RATIO
  const size = Math.max(7, Math.min(18, Math.round(cell * 0.42)))
  const spec = { fontFamily: font }
  const label = (text: string, x: number, y: number): StudioFabricObject =>
    buildText(
      {
        left: x,
        top: y,
        text,
        width: hugTextBoxWidth(text, size, band * 2, spec),
        fontSize: size,
        fontFamily: font,
        lineHeight: 1,
        textAlign: 'center',
        originX: 'center',
        originY: 'center',
      },
      tag,
      // Coordinates are read to answer Mode B, so they are prompt content and
      // must survive onto the solution page.
      'prompt',
    )

  const out: StudioFabricObject[] = []
  for (let col = 1; col <= route.gridCols; col++) {
    out.push(
      label(columnLetter(col), bounds.left + (col - 0.5) * cell, bounds.top - band / 2),
    )
  }
  for (let row = 1; row <= route.gridRows; row++) {
    out.push(label(String(row), bounds.left - band / 2, bounds.top + (row - 0.5) * cell))
  }
  return out
}

/** The traced route, hidden on the puzzle page and revealed on the key. */
function drawTracedPath(options: {
  bounds: Box
  cell: number
  route: Route
  tag: StudioTag
}): StudioFabricObject[] {
  const { bounds, cell, route, tag } = options
  const strokeWidth = Math.max(
    STUDIO_STROKE_HAIRLINE,
    Math.min(STUDIO_STROKE_NORMAL, cell * 0.1),
  )
  const out: StudioFabricObject[] = []
  // One segment per step: the cells inside a step are collinear, so a segment
  // per visited cell would stack identical ink on the same line.
  let at = 0
  for (const step of route.steps) {
    const from = route.path[at]
    const to = route.path[at + step.count]
    at += step.count
    if (!from || !to) continue
    const a = cellCenter(bounds, cell, from)
    const b = cellCenter(bounds, cell, to)
    out.push(
      buildLine(
        {
          x1: a.x,
          y1: a.y,
          x2: b.x,
          y2: b.y,
          stroke: STUDIO_INK,
          strokeWidth,
          strokeUniform: true,
          strokeLineCap: 'round',
        },
        tag,
        'answer',
      ),
    )
  }
  return out
}

/** The shaded end square — the answer in Modes A and B. */
function drawEndShade(options: {
  bounds: Box
  cell: number
  route: Route
  tag: StudioTag
}): StudioFabricObject {
  const { bounds, cell, route, tag } = options
  // Inset so the grid rules stay visible around the shaded square.
  const inset = Math.max(1.5, cell * 0.1)
  return buildRect(
    {
      left: bounds.left + (route.end.col - 1) * cell + inset,
      top: bounds.top + (route.end.row - 1) * cell + inset,
      width: cell - inset * 2,
      height: cell - inset * 2,
      fill: STUDIO_INK,
      stroke: 'transparent',
      strokeWidth: 0,
    },
    tag,
    'answer',
  )
}

/**
 * One grid: rules, optional coordinate labels, the start dot, and the end
 * marker — a printed square in Mode C, a hidden shaded cell everywhere else.
 * `bounds` covers the squares only; labels are drawn into the band around it.
 */
export function drawGridFigure(options: {
  bounds: Box
  cell: number
  route: Route
  settings: RouteSettings
  font: string
  tag: StudioTag
}): StudioFabricObject[] {
  const { bounds, cell, route, settings, font, tag } = options
  const out: StudioFabricObject[] = [
    ...drawGridLines(bounds, cell, route.gridCols, route.gridRows, tag),
  ]
  if (settings.showCoordLabels) {
    out.push(...drawCoordLabels({ bounds, cell, route, font, tag }))
  }
  if (settings.showPathOnKey) {
    out.push(...drawTracedPath({ bounds, cell, route, tag }))
  }

  if (settings.mode === 'route') {
    out.push(
      buildSquareMarker({
        center: cellCenter(bounds, cell, route.end),
        size: cell * 0.5,
        tag,
      }),
    )
  } else {
    out.push(drawEndShade({ bounds, cell, route, tag }))
  }

  out.push(
    buildDotMarker({
      center: cellCenter(bounds, cell, route.start),
      radius: cell * 0.2,
      tag,
    }),
  )
  return out
}
