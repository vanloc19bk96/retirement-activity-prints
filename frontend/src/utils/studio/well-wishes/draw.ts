import type { StudioFabricObject } from '@/types/studio-template.types'
import {
  STUDIO_INK,
  STUDIO_PAPER,
  STUDIO_RULE,
  STUDIO_RULE_MEDIUM,
  STUDIO_STROKE_HAIRLINE,
} from '@/constants/studio.constants'
import {
  buildCircle,
  buildPolygon,
  buildPolyline,
  buildRect,
  buildText,
  type StudioTag,
} from '../studio-fabric-builders'
import { boxCenterX, boxRight, toNonBreakingSpaces, type Box } from '../studio-layout'
import { hugTextBoxWidth } from '../studio-text-metrics'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import type { WwMotif } from './content'
import {
  DOUBLE_INSET,
  ORNAMENT_SIZE,
  TAB_BREAK,
  italicSpec,
  labelHeight,
  plainSpec,
  promptRoom,
  signGap,
  type WwBox,
  type WwStyle,
} from './layout'

/** Frame weight: one hairline everywhere, so every box prints alike. */
const FRAME_STROKE = STUDIO_STROKE_HAIRLINE
const BRACKET_STROKE = 3
const BRACKET_LENGTH = 14
const CORNER = 10
const ROUND_RADIUS = 12
const MOTIF_STROKE = 1.4
/** Where a letter's baseline sits below the top of its line box. */
const BASELINE = 0.908

type Point = { x: number; y: number }

interface DrawContext {
  objects: StudioFabricObject[]
  tag: StudioTag
  font: string
}

const withLabel = (obj: StudioFabricObject, label?: string): StudioFabricObject =>
  label ? { ...obj, data: { ...obj.data, [STUDIO_CONTENT_LABEL_KEY]: label } } : obj

/** A hairline or writing line, drawn as a filled strip so it prints crisp at any zoom. */
function rule(ctx: DrawContext, left: number, top: number, width: number, fill: string, label?: string) {
  ctx.objects.push(
    withLabel(
      buildRect(
        {
          left: Math.round(left),
          top: Math.round(top),
          width: Math.max(1, Math.round(width)),
          height: 1,
          fill,
          stroke: 'transparent',
          strokeWidth: 0,
        },
        ctx.tag,
        'decoration',
      ),
      label,
    ),
  )
}

/** Quarter arc from `from` to `to` degrees around a centre, as polygon points. */
function arc(cx: number, cy: number, r: number, from: number, to: number, steps = 6): Point[] {
  const points: Point[] = []
  for (let i = 0; i <= steps; i++) {
    const a = ((from + ((to - from) * i) / steps) * Math.PI) / 180
    points.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) })
  }
  return points
}

/** The outline of a frame, relative to its own top-left, for the shaped styles. */
function frameOutline(style: WwStyle['frame'], w: number, h: number): Point[] | null {
  const c = CORNER
  if (style === 'notched') {
    return [
      { x: c, y: 0 },
      { x: w - c, y: 0 },
      { x: w, y: c },
      { x: w, y: h - c },
      { x: w - c, y: h },
      { x: c, y: h },
      { x: 0, y: h - c },
      { x: 0, y: c },
    ]
  }
  if (style === 'scalloped') {
    // Concave corners: each arc is centred on the corner it replaces.
    return [
      ...arc(w, 0, c, 180, 90),
      ...arc(w, h, c, 270, 180),
      ...arc(0, h, c, 0, -90),
      ...arc(0, 0, c, 90, 0),
    ]
  }
  return null
}

function drawFrame(ctx: DrawContext, box: WwBox, style: WwStyle, label?: string) {
  const { frame } = box
  const shape = frameOutline(style.frame, frame.width, frame.height)
  if (shape) {
    ctx.objects.push(
      withLabel(
        buildPolygon(
          {
            left: frame.left,
            top: frame.top,
            points: shape,
            stroke: STUDIO_RULE,
            strokeWidth: FRAME_STROKE,
            strokeLineJoin: 'miter',
          },
          ctx.tag,
          'structure',
        ),
        label,
      ),
    )
    return
  }
  const round = style.frame === 'rounded' ? ROUND_RADIUS : 0
  ctx.objects.push(
    withLabel(
      buildRect(
        {
          ...frame,
          rx: round,
          ry: round,
          stroke: STUDIO_RULE,
          strokeWidth: style.frame === 'brackets' ? 1 : FRAME_STROKE,
        },
        ctx.tag,
        'structure',
      ),
      label,
    ),
  )
  if (style.frame === 'double') {
    ctx.objects.push(
      buildRect(
        {
          left: frame.left + DOUBLE_INSET,
          top: frame.top + DOUBLE_INSET,
          width: frame.width - 2 * DOUBLE_INSET,
          height: frame.height - 2 * DOUBLE_INSET,
          stroke: STUDIO_RULE,
          strokeWidth: 1,
        },
        ctx.tag,
        'decoration',
      ),
    )
  }
  if (style.frame === 'brackets') {
    const l = frame.left
    const t = frame.top
    const r = boxRight(frame)
    const b = t + frame.height
    const n = BRACKET_LENGTH
    const corners: Point[][] = [
      [{ x: l, y: t + n }, { x: l, y: t }, { x: l + n, y: t }],
      [{ x: r - n, y: t }, { x: r, y: t }, { x: r, y: t + n }],
      [{ x: r, y: b - n }, { x: r, y: b }, { x: r - n, y: b }],
      [{ x: l + n, y: b }, { x: l, y: b }, { x: l, y: b - n }],
    ]
    for (const points of corners) {
      ctx.objects.push(
        buildPolyline(
          {
            left: 0,
            top: 0,
            points,
            stroke: STUDIO_INK,
            strokeWidth: BRACKET_STROKE,
            strokeLineCap: 'butt',
            strokeLineJoin: 'miter',
          },
          ctx.tag,
          'decoration',
        ),
      )
    }
  }
}

/**
 * One box: frame, prompt (inside, or set into the top edge with a white break
 * behind it), writing lines, then the sign-off and its line on the same rhythm.
 */
export function drawBox(
  ctx: DrawContext,
  options: {
    box: WwBox
    style: WwStyle
    labelFont: number
    prompt: string
    signoff: string
    /** Book label for the set's look, stamped on the first frame only. */
    designLabel?: string
    promptLabel: string
  },
) {
  const { box, style, labelFont, prompt, signoff, designLabel, promptLabel } = options
  drawFrame(ctx, box, style, designLabel)

  const room = promptRoom(box.innerWidth, style)
  const text = toNonBreakingSpaces(prompt)
  const width = hugTextBoxWidth(text, labelFont, room, italicSpec(ctx.font))
  const textLeft = style.placement === 'tab' ? box.innerLeft + TAB_BREAK : box.innerLeft
  if (style.placement === 'tab') {
    ctx.objects.push(
      buildRect(
        {
          left: box.innerLeft,
          top: box.promptTop,
          width: width + 2 * TAB_BREAK,
          height: Math.ceil(labelHeight(labelFont)),
          fill: STUDIO_PAPER,
          stroke: 'transparent',
          strokeWidth: 0,
        },
        ctx.tag,
        'decoration',
      ),
    )
  }
  ctx.objects.push(
    withLabel(
      buildText(
        {
          left: textLeft,
          top: box.promptTop,
          text,
          width,
          fontFamily: ctx.font,
          fontSize: labelFont,
          fontStyle: 'italic',
          lineHeight: 1,
        },
        ctx.tag,
        'prompt',
      ),
      promptLabel,
    ),
  )

  for (const y of box.lines) rule(ctx, box.innerLeft, y, box.innerWidth, STUDIO_RULE_MEDIUM)

  const sign = toNonBreakingSpaces(signoff)
  const signWidth = hugTextBoxWidth(sign, labelFont, box.innerWidth, plainSpec(ctx.font))
  const baseline = box.signY - Math.round(labelFont * 0.14)
  ctx.objects.push(
    buildText(
      {
        left: box.innerLeft,
        top: Math.round(baseline - labelFont * BASELINE),
        text: sign,
        width: signWidth,
        fontFamily: ctx.font,
        fontSize: labelFont,
        lineHeight: 1,
      },
      ctx.tag,
      'decoration',
    ),
  )
  const lineLeft = box.innerLeft + signWidth + signGap
  rule(ctx, lineLeft, box.signY, box.innerLeft + box.innerWidth - lineLeft, STUDIO_RULE)
}

/* ---------------------------------------------------------------- motifs */

interface MotifDraw {
  width: number
  draw: (ctx: DrawContext, left: number, top: number) => void
}

const S = ORNAMENT_SIZE

function strokePolygon(ctx: DrawContext, left: number, top: number, points: Point[]) {
  ctx.objects.push(
    buildPolygon(
      { left, top, points, stroke: STUDIO_INK, strokeWidth: MOTIF_STROKE, strokeLineJoin: 'round' },
      ctx.tag,
      'decoration',
    ),
  )
}

function strokePolyline(ctx: DrawContext, left: number, top: number, points: Point[]) {
  ctx.objects.push(
    buildPolyline(
      {
        left,
        top,
        points,
        stroke: STUDIO_INK,
        strokeWidth: MOTIF_STROKE,
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
      },
      ctx.tag,
      'decoration',
    ),
  )
}

function ring(ctx: DrawContext, x: number, y: number, radius: number, filled = false) {
  ctx.objects.push(
    buildCircle(
      {
        left: x,
        top: y,
        radius,
        fill: filled ? STUDIO_INK : 'transparent',
        stroke: STUDIO_INK,
        strokeWidth: filled ? 0 : MOTIF_STROKE,
      },
      ctx.tag,
      'decoration',
    ),
  )
}

/** A leaf as a pointed lens from `base` towards `tip`. */
function leaf(base: Point, tip: Point, bulge: number): Point[] {
  const dx = tip.x - base.x
  const dy = tip.y - base.y
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  const along = (t: number, side: number, k: number) => ({
    x: base.x + dx * t + nx * side * k,
    y: base.y + dy * t + ny * side * k,
  })
  return [
    base,
    along(0.3, 1, bulge * 0.85),
    along(0.65, 1, bulge * 0.8),
    tip,
    along(0.65, -1, bulge * 0.8),
    along(0.3, -1, bulge * 0.85),
  ]
}

const MOTIFS: Record<WwMotif, MotifDraw> = {
  sparkle: {
    width: S,
    draw: (ctx, left, top) => {
      const c = S / 2
      const points: Point[] = []
      for (let i = 0; i < 8; i++) {
        const r = i % 2 === 0 ? S / 2 : S * 0.13
        const a = (i * Math.PI) / 4 - Math.PI / 2
        points.push({ x: c + r * Math.cos(a), y: c + r * Math.sin(a) })
      }
      strokePolygon(ctx, left, top, points)
    },
  },
  diamond: {
    width: S,
    draw: (ctx, left, top) => {
      const c = S / 2
      strokePolygon(ctx, left, top, [
        { x: c, y: 0 },
        { x: S * 0.85, y: c },
        { x: c, y: S },
        { x: S * 0.15, y: c },
      ])
      ring(ctx, left + c, top + c, 1.8, true)
    },
  },
  sunrise: {
    width: Math.round(S * 1.4),
    draw: (ctx, left, top) => {
      const w = Math.round(S * 1.4)
      const cx = w / 2
      const horizon = S * 0.82
      const r = S * 0.3
      strokePolyline(ctx, left, top, arc(cx, horizon, r, 180, 360, 10))
      strokePolyline(ctx, left, top, [
        { x: 0, y: horizon },
        { x: w, y: horizon },
      ])
      for (const deg of [210, 270, 330]) {
        const a = (deg * Math.PI) / 180
        strokePolyline(ctx, left, top, [
          { x: cx + r * 1.45 * Math.cos(a), y: horizon + r * 1.45 * Math.sin(a) },
          { x: cx + r * 2.1 * Math.cos(a), y: horizon + r * 2.1 * Math.sin(a) },
        ])
      }
    },
  },
  wave: {
    width: Math.round(S * 1.6),
    draw: (ctx, left, top) => {
      const w = Math.round(S * 1.6)
      for (const y0 of [S * 0.35, S * 0.68]) {
        const points: Point[] = []
        for (let i = 0; i <= 16; i++) {
          const x = (w * i) / 16
          points.push({ x, y: y0 + Math.sin((i / 16) * Math.PI * 4) * S * 0.14 })
        }
        strokePolyline(ctx, left, top, points)
      }
    },
  },
  bloom: {
    width: S,
    draw: (ctx, left, top) => {
      const c = S / 2
      for (let i = 0; i < 5; i++) {
        const a = (i * 2 * Math.PI) / 5 - Math.PI / 2
        ring(ctx, left + c + S * 0.3 * Math.cos(a), top + c + S * 0.3 * Math.sin(a), S * 0.19)
      }
      ring(ctx, left + c, top + c, S * 0.1, true)
    },
  },
  sprig: {
    width: Math.round(S * 1.9),
    draw: (ctx, left, top) => {
      const w = Math.round(S * 1.9)
      const mid = S / 2
      strokePolyline(ctx, left, top, [
        { x: 0, y: mid },
        { x: w * 0.72, y: mid },
      ])
      // Leaf pairs swept towards the tip, then one leaf closing the stem.
      for (const t of [0.12, 0.36, 0.6]) {
        const base = { x: w * t, y: mid }
        for (const side of [-1, 1]) {
          strokePolygon(ctx, left, top, leaf(base, { x: base.x + S * 0.34, y: mid + side * S * 0.36 }, S * 0.1))
        }
      }
      strokePolygon(ctx, left, top, leaf({ x: w * 0.72, y: mid }, { x: w, y: mid }, S * 0.12))
    },
  },
  plane: {
    width: Math.round(S * 1.35),
    draw: (ctx, left, top) => {
      const nose = { x: S * 1.35, y: S * 0.1 }
      const tail = { x: 0, y: S * 0.45 }
      const fold = { x: S * 0.45, y: S * 0.6 }
      const keel = { x: S * 0.62, y: S * 0.95 }
      strokePolygon(ctx, left, top, [nose, tail, fold])
      strokePolygon(ctx, left, top, [nose, fold, keel])
    },
  },
}

export const motifWidth = (motif: WwMotif) => MOTIFS[motif].width

/**
 * The quiet rule under the heading: a hairline either side of a small
 * line-art motif. It separates the header from the boxes without taking
 * writing room — its height is reserved by the layout.
 */
export function drawOrnament(
  ctx: DrawContext,
  options: { column: Box; top: number; motif: WwMotif; label?: string },
) {
  const { column, top, motif, label } = options
  const spec = MOTIFS[motif]
  const cx = boxCenterX(column)
  const gap = 10
  const arm = Math.min(Math.round(column.width * 0.22), 110)
  const y = top + S / 2
  const motifLeft = Math.round(cx - spec.width / 2)
  rule(ctx, motifLeft - gap - arm, y, arm, STUDIO_RULE, label)
  spec.draw(ctx, motifLeft, top)
  rule(ctx, motifLeft + spec.width + gap, y, arm, STUDIO_RULE)
}

export type { DrawContext }
