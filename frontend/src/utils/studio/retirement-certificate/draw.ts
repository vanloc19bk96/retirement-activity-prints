import type { StudioFabricObject } from '@/types/studio-template.types'
import { STUDIO_INK, STUDIO_RULE } from '@/constants/studio.constants'
import {
  buildCircle,
  buildPolygon,
  buildPolyline,
  buildRect,
  buildText,
  type StudioTag,
} from '../studio-fabric-builders'
import { boxBottom, boxCenterX, boxRight, type Box } from '../studio-layout'
import { fabricTextHeight } from '../studio-text-metrics'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import type { CrEmblem, CrFrame, CrSeal } from './content'
import { lineWidth, boldSpec, type CrBlock, type CrPlan, type CrText } from './layout'

type Point = { x: number; y: number }

export interface DrawContext {
  objects: StudioFabricObject[]
  tag: StudioTag
  font: string
}

/** Every ornament is drawn in one fine line weight, so nothing prints heavy. */
const LINE = 1.4
const FINE = 1

const withLabel = (obj: StudioFabricObject, label?: string): StudioFabricObject =>
  label ? { ...obj, data: { ...obj.data, [STUDIO_CONTENT_LABEL_KEY]: label } } : obj

/** A hairline drawn as a filled strip, so it prints crisp at any zoom. */
function rule(ctx: DrawContext, left: number, top: number, width: number, height = 1) {
  ctx.objects.push(
    buildRect(
      {
        left: Math.round(left),
        top: Math.round(top),
        width: Math.max(1, Math.round(width)),
        height,
        fill: STUDIO_RULE,
        stroke: 'transparent',
        strokeWidth: 0,
      },
      ctx.tag,
      'decoration',
    ),
  )
}

function stroked(ctx: DrawContext, left: number, top: number, points: Point[], closed: boolean, width = LINE) {
  const spec = {
    left,
    top,
    points,
    stroke: STUDIO_INK,
    strokeWidth: width,
    strokeLineJoin: 'round' as const,
    strokeLineCap: 'round' as const,
  }
  ctx.objects.push(closed ? buildPolygon(spec, ctx.tag, 'decoration') : buildPolyline(spec, ctx.tag, 'decoration'))
}

function dot(ctx: DrawContext, x: number, y: number, radius: number, filled = true) {
  ctx.objects.push(
    buildCircle(
      {
        left: x,
        top: y,
        radius,
        fill: filled ? STUDIO_INK : 'transparent',
        stroke: STUDIO_INK,
        strokeWidth: filled ? 0 : LINE,
      },
      ctx.tag,
      'decoration',
    ),
  )
}

function arc(cx: number, cy: number, r: number, from: number, to: number, steps = 8): Point[] {
  const points: Point[] = []
  for (let i = 0; i <= steps; i++) {
    const a = ((from + ((to - from) * i) / steps) * Math.PI) / 180
    points.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) })
  }
  return points
}

function star(cx: number, cy: number, outer: number, inner: number, arms = 5): Point[] {
  const points: Point[] = []
  for (let i = 0; i < arms * 2; i++) {
    const r = i % 2 === 0 ? outer : inner
    const a = (i * Math.PI) / arms - Math.PI / 2
    points.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) })
  }
  return points
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
  return [base, along(0.3, 1, bulge * 0.85), along(0.65, 1, bulge * 0.8), tip, along(0.65, -1, bulge * 0.8), along(0.3, -1, bulge * 0.85)]
}

/* -------------------------------------------------------------- frames */

function frameRect(ctx: DrawContext, box: Box, stroke: number, extra: Partial<StudioFabricObject> = {}, label?: string) {
  ctx.objects.push(
    withLabel(
      {
        ...buildRect({ ...box, stroke: STUDIO_INK, strokeWidth: stroke }, ctx.tag, label ? 'structure' : 'decoration'),
        ...extra,
      },
      label,
    ),
  )
}

const inset = (box: Box, by: number): Box => ({
  left: box.left + by,
  top: box.top + by,
  width: box.width - 2 * by,
  height: box.height - 2 * by,
})

/** The four corners of a box, each with the inward x/y directions. */
const corners = (b: Box) => [
  { x: b.left, y: b.top, dx: 1, dy: 1 },
  { x: boxRight(b), y: b.top, dx: -1, dy: 1 },
  { x: boxRight(b), y: boxBottom(b), dx: -1, dy: -1 },
  { x: b.left, y: boxBottom(b), dx: 1, dy: -1 },
]

/**
 * The certificate frame: an outer rule at the safe area and a finer inner
 * rule, dressed at the corners in one of seven quiet styles. Everything stays
 * within `FRAME_DEPTH` of the outer edge, well clear of the text.
 */
export function drawFrame(ctx: DrawContext, frame: Box, style: CrFrame, label: string) {
  const inner = inset(frame, 6)
  switch (style) {
    case 'double':
      frameRect(ctx, frame, 3, {}, label)
      frameRect(ctx, inner, FINE)
      return
    case 'rounded':
      frameRect(ctx, frame, 2, { rx: 16, ry: 16 }, label)
      frameRect(ctx, inner, FINE, { rx: 11, ry: 11 })
      return
    case 'dotted':
      frameRect(ctx, frame, 2, {}, label)
      frameRect(ctx, inset(frame, 7), 1.6, { strokeDashArray: [1.5, 5], strokeLineCap: 'round' })
      return
    case 'deco': {
      frameRect(ctx, frame, 1.5, {}, label)
      frameRect(ctx, inner, FINE)
      // Nested steps tucked into each inner corner.
      for (const c of corners(inner)) {
        for (const [near, far] of [
          [6, 22],
          [12, 17],
        ] as const) {
          stroked(
            ctx,
            0,
            0,
            [
              { x: c.x + c.dx * near, y: c.y + c.dy * far },
              { x: c.x + c.dx * near, y: c.y + c.dy * near },
              { x: c.x + c.dx * far, y: c.y + c.dy * near },
            ],
            false,
            FINE,
          )
        }
      }
      return
    }
    case 'brackets': {
      frameRect(ctx, frame, FINE, {}, label)
      for (const c of corners(inner)) {
        stroked(
          ctx,
          0,
          0,
          [
            { x: c.x, y: c.y + c.dy * 34 },
            { x: c.x, y: c.y },
            { x: c.x + c.dx * 34, y: c.y },
          ],
          false,
          3,
        )
      }
      return
    }
    case 'diamonds': {
      frameRect(ctx, frame, 1.5, {}, label)
      frameRect(ctx, inner, FINE)
      const d = 5
      for (const c of corners(inner)) {
        stroked(
          ctx,
          0,
          0,
          [
            { x: c.x, y: c.y - d },
            { x: c.x + d, y: c.y },
            { x: c.x, y: c.y + d },
            { x: c.x - d, y: c.y },
          ],
          true,
          FINE,
        )
        dot(ctx, c.x + c.dx * 14, c.y + c.dy * 14, 1.8)
      }
      // A wider diamond at the middle of the top and bottom rules.
      const x = boxCenterX(inner)
      for (const y of [inner.top, boxBottom(inner)]) {
        stroked(
          ctx,
          0,
          0,
          [
            { x, y: y - d },
            { x: x + d * 1.6, y },
            { x, y: y + d },
            { x: x - d * 1.6, y },
          ],
          true,
          FINE,
        )
      }
      return
    }
    case 'scalloped': {
      frameRect(ctx, frame, 1.5, {}, label)
      // Inner rule with concave quarter-circle corners.
      const r = 18
      const { left: l, top: t } = inner
      const w = inner.width
      const h = inner.height
      stroked(
        ctx,
        l,
        t,
        [...arc(w, 0, r, 180, 90), ...arc(w, h, r, 270, 180), ...arc(0, h, r, 0, -90), ...arc(0, 0, r, 90, 0)],
        true,
        FINE,
      )
      for (const c of corners(inner)) dot(ctx, c.x + c.dx * 4, c.y + c.dy * 4, 1.6)
      return
    }
  }
}

/* ------------------------------------------------------------- emblems */

interface EmblemDraw {
  /** Width as a multiple of the emblem's height. */
  aspect: number
  /** Wide emblems carry their own arms; the rest get hairlines either side. */
  arms: boolean
  draw: (ctx: DrawContext, left: number, top: number, h: number) => void
}

const EMBLEMS: Record<CrEmblem, EmblemDraw> = {
  sunrise: {
    aspect: 1.5,
    arms: true,
    draw: (ctx, left, top, h) => {
      const w = h * 1.5
      const horizon = h * 0.82
      const r = h * 0.3
      stroked(ctx, left, top, arc(w / 2, horizon, r, 180, 360, 12), false)
      stroked(ctx, left, top, [{ x: 0, y: horizon }, { x: w, y: horizon }], false)
      for (const deg of [200, 235, 270, 305, 340]) {
        const a = (deg * Math.PI) / 180
        stroked(
          ctx,
          left,
          top,
          [
            { x: w / 2 + r * 1.45 * Math.cos(a), y: horizon + r * 1.45 * Math.sin(a) },
            { x: w / 2 + r * 2.3 * Math.cos(a), y: horizon + r * 2.3 * Math.sin(a) },
          ],
          false,
        )
      }
    },
  },
  star: {
    aspect: 1,
    arms: true,
    draw: (ctx, left, top, h) => {
      stroked(ctx, left, top, star(h / 2, h / 2 + h * 0.04, h * 0.5, h * 0.21), true)
    },
  },
  compass: {
    aspect: 1,
    arms: true,
    draw: (ctx, left, top, h) => {
      const c = h / 2
      dot(ctx, left + c, top + c, h * 0.46, false)
      stroked(ctx, left, top, star(c, c, h * 0.4, h * 0.1, 4), true, FINE)
      dot(ctx, left + c, top + c, 1.6)
    },
  },
  sailboat: {
    aspect: 1.4,
    arms: true,
    draw: (ctx, left, top, h) => {
      const w = h * 1.4
      const mast = w * 0.52
      stroked(ctx, left, top, [{ x: mast, y: h * 0.04 }, { x: mast, y: h * 0.68 }, { x: w * 0.14, y: h * 0.68 }], true)
      stroked(ctx, left, top, [{ x: mast + 3, y: h * 0.14 }, { x: w * 0.84, y: h * 0.68 }, { x: mast + 3, y: h * 0.68 }], true)
      stroked(
        ctx,
        left,
        top,
        [
          { x: w * 0.06, y: h * 0.74 },
          { x: w * 0.94, y: h * 0.74 },
          { x: w * 0.8, y: h * 0.9 },
          { x: w * 0.2, y: h * 0.9 },
        ],
        true,
      )
    },
  },
  laurel: {
    aspect: 2.6,
    arms: false,
    draw: (ctx, left, top, h) => {
      const w = h * 2.6
      const cx = w / 2
      for (const side of [-1, 1]) {
        // A sprig sweeping out and up from the centre, leaves along its length.
        const stem: Point[] = []
        for (let i = 0; i <= 10; i++) {
          const t = i / 10
          stem.push({ x: cx + side * (6 + t * (w / 2 - 10)), y: h * (0.86 - 0.52 * t * t) })
        }
        stroked(ctx, left, top, stem, false, FINE)
        for (const at of [2, 4, 6, 8, 10]) {
          const base = stem[at]!
          const prev = stem[at - 1]!
          const dx = base.x - prev.x
          const dy = base.y - prev.y
          const size = h * 0.3
          for (const turn of at === 10 ? [0] : [-1, 1]) {
            const angle = Math.atan2(dy, dx) + turn * side * -0.75
            const tip = { x: base.x + Math.cos(angle) * size, y: base.y + Math.sin(angle) * size }
            stroked(ctx, left, top, leaf(base, tip, size * 0.28), true, FINE)
          }
        }
      }
      dot(ctx, left + cx, top + h * 0.86, 2.2)
    },
  },
  flourish: {
    aspect: 3.4,
    arms: false,
    draw: (ctx, left, top, h) => {
      const w = h * 3.4
      const cx = w / 2
      const mid = h / 2
      for (const side of [-1, 1]) {
        const points: Point[] = []
        for (let i = 0; i <= 24; i++) {
          const t = i / 24
          points.push({ x: cx + side * (h * 0.32 + t * (w / 2 - h * 0.34)), y: mid - Math.sin(t * Math.PI * 2) * h * 0.22 * (1 - t * 0.6) })
        }
        stroked(ctx, left, top, points, false, FINE)
        dot(ctx, left + cx + side * (w / 2 - 2), top + mid, 1.8)
      }
      const d = h * 0.2
      stroked(
        ctx,
        left,
        top,
        [
          { x: cx, y: mid - d },
          { x: cx + d, y: mid },
          { x: cx, y: mid + d },
          { x: cx - d, y: mid },
        ],
        true,
      )
    },
  },
}

/** The small line-art emblem over the heading, with hairlines either side where it is narrow. */
export function drawEmblem(ctx: DrawContext, block: CrBlock, area: Box, emblem: CrEmblem, label: string) {
  const spec = EMBLEMS[emblem]
  const h = block.box.height
  const w = Math.round(h * spec.aspect)
  const cx = boxCenterX(area)
  const left = Math.round(cx - w / 2)
  const before = ctx.objects.length
  spec.draw(ctx, left, block.box.top, h)
  ctx.objects[before] = withLabel(ctx.objects[before]!, label)
  if (spec.arms) {
    const gap = 10
    const arm = Math.min(Math.round(area.width * 0.2), 96)
    const y = block.box.top + Math.round(h * (emblem === 'sunrise' || emblem === 'sailboat' ? 0.8 : 0.5))
    rule(ctx, left - gap - arm, y, arm)
    rule(ctx, left + w + gap, y, arm)
  }
}

/** Width an emblem takes, for the preflight. */
export const emblemWidth = (emblem: CrEmblem, h: number) => Math.round(h * EMBLEMS[emblem].aspect)

/* ---------------------------------------------------------------- seal */

/**
 * A line-art seal between the signature lines: a shaped edge, an inner ring
 * and the retirement year (or a star when the year is not known). No fill,
 * no tiny lettering — it stays crisp in black and white.
 */
export function drawSeal(
  ctx: DrawContext,
  seal: { cx: number; cy: number; radius: number },
  style: Exclude<CrSeal, 'none'>,
  year: string,
) {
  const { cx, cy, radius: r } = seal
  const edge: Point[] = []
  if (style === 'scalloped') {
    for (let i = 0; i < 240; i++) {
      const a = (i / 240) * Math.PI * 2
      const rr = r * (0.92 + 0.08 * Math.abs(Math.cos(a * 12)))
      edge.push({ x: r + rr * Math.cos(a), y: r + rr * Math.sin(a) })
    }
    stroked(ctx, cx - r, cy - r, edge, true)
  } else if (style === 'starburst') {
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2
      const rr = i % 2 === 0 ? r : r * 0.88
      edge.push({ x: r + rr * Math.cos(a), y: r + rr * Math.sin(a) })
    }
    stroked(ctx, cx - r, cy - r, edge, true, FINE)
  } else {
    dot(ctx, cx, cy, r - 1, false)
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2
      dot(ctx, cx + r * 0.86 * Math.cos(a), cy + r * 0.86 * Math.sin(a), 1.7)
    }
  }
  dot(ctx, cx, cy, r * 0.72, false)

  if (year) {
    const size = Math.round(r * 0.4)
    const spec = boldSpec(ctx.font)
    const height = fabricTextHeight(1, size)
    ctx.objects.push(
      buildText(
        {
          left: cx,
          top: Math.round(cy - height / 2),
          text: year,
          width: lineWidth(year, size, spec),
          fontSize: size,
          fontFamily: ctx.font,
          fontWeight: 700,
          lineHeight: 1,
          textAlign: 'center',
          originX: 'center',
          editable: false,
        },
        ctx.tag,
        'decoration',
      ),
    )
    for (const side of [-1, 1]) {
      stroked(ctx, 0, 0, star(cx, cy + side * r * 0.45, r * 0.1, r * 0.04), true, FINE)
    }
  } else {
    stroked(ctx, 0, 0, star(cx, cy + r * 0.03, r * 0.42, r * 0.17), true)
  }
}

/* ---------------------------------------------------------------- text */

/** One fitted text block, centred on the column. */
export function drawText(ctx: DrawContext, text: CrText, centerX: number, top: number, label?: string, fill = STUDIO_INK) {
  ctx.objects.push(
    withLabel(
      buildText(
        {
          left: Math.round(centerX),
          top: Math.round(top),
          text: text.text,
          width: text.width,
          fontSize: text.fontSize,
          fontFamily: ctx.font,
          fontWeight: text.spec.fontWeight,
          fontStyle: text.spec.fontStyle,
          charSpacing: text.spec.charSpacing,
          lineHeight: text.lineHeight,
          textAlign: 'center',
          originX: 'center',
          fill,
        },
        ctx.tag,
        'prompt',
      ),
      label,
    ),
  )
}

/** Hairline, small diamond, hairline — under a printed name. */
export function drawDivider(ctx: DrawContext, block: CrBlock) {
  const { box } = block
  const cx = boxCenterX(box)
  const mid = box.top + box.height / 2
  const d = box.height / 2
  const gap = 6
  const arm = (box.width - 2 * d - 2 * gap) / 2
  rule(ctx, box.left, mid, arm)
  rule(ctx, cx + d + gap, mid, arm)
  stroked(
    ctx,
    0,
    0,
    [
      { x: cx, y: mid - d },
      { x: cx + d, y: mid },
      { x: cx, y: mid + d },
      { x: cx - d, y: mid },
    ],
    true,
    FINE,
  )
}

/** A blank name: one long line to write on, at the foot of a tall writing room. */
export function drawNameLine(ctx: DrawContext, block: CrBlock) {
  rule(ctx, block.box.left, boxBottom(block.box) - 2, block.box.width, 2)
}

/** Short hairlines either side of the promotion line, when the column has room. */
export function drawPromotionArms(ctx: DrawContext, block: CrBlock, area: Box) {
  const gap = 12
  const room = (area.width - block.box.width) / 2 - gap
  const arm = Math.min(48, Math.floor(room))
  if (arm < 18) return
  const y = block.box.top + Math.round(block.box.height * 0.5)
  rule(ctx, block.box.left - gap - arm, y, arm)
  rule(ctx, boxRight(block.box) + gap, y, arm)
}

/** Signature and date lines, their labels, a printed date and the seal. */
export function drawSignRow(ctx: DrawContext, plan: CrPlan, seal: CrSeal, year: string) {
  for (const slot of plan.sign.slots) {
    rule(ctx, slot.left, slot.lineY, slot.width)
    drawText(ctx, slot.label, slot.left + slot.width / 2, slot.labelTop)
    if (slot.date && slot.dateTop != null) drawText(ctx, slot.date, slot.left + slot.width / 2, slot.dateTop)
  }
  if (plan.sign.seal && seal !== 'none') drawSeal(ctx, plan.sign.seal, seal, year)
}
