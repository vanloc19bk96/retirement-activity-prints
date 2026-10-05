import type { StudioFabricObject, StudioRole } from '@/types/studio-template.types'
import { STUDIO_DIGIT_FONT, STUDIO_INK } from '@/constants/studio.constants'
import { STUDIO_CANONICAL_KEY } from '../_shared/uniqueness'
import { buildCircle, buildGroup, buildText, nextObjectId, type StudioTag } from '../studio-fabric-builders'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import { estimateTextBoxWidth, type Box } from '../studio-layout'
import type { Pt } from '../stained-glass/geometry'
import { DTD_TEMPLATE_KEY } from './content'
import type { DtdPuzzle, DtdRules } from './puzzle'

/**
 * A finished puzzle → one Fabric group: the pre-drawn details, the dots, the
 * numbers, and the completed outline hidden for the answer page.
 *
 * Black on white and nothing filled but the dots themselves. Dot 1 wears a
 * ring and a bold number, so the start is the first thing a reader finds.
 * Details print lighter than the line the reader will draw, so the picture
 * they reveal is theirs. Strokes are uniform, so scaling the group in the
 * editor keeps the print weights.
 */

/** Marks the objects a Dot to Dot page draws, for checks and the editor. */
export const DTD_PART_KEY = 'dtdPart'

/** Print weights, canvas px (1 px = 0.75 pt). */
export const DTD_INK_WIDTH = {
  /** Pre-drawn details: 1.1 pt. */
  detail: 1.5,
  /** The ring round dot 1. */
  start: 1.5,
  /** The completed outline on the answer page: 1.7 pt. */
  answer: 2.25,
} as const

/** Radius of the ring round dot 1, beyond the dot. */
export const DTD_START_RING = 3.5

const r2 = (n: number) => Math.round(n * 100) / 100

type Cmd = (string | number)[]

interface PathBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/* ------------------------------------------------------------------ *
 * The finished outline
 * ------------------------------------------------------------------ */

/** Closest two points of the answer line may sit, canvas px; nearer than this a curve kinks. */
const ANSWER_MIN_STEP = 0.75

/**
 * The answer line: the picture's true silhouette, run from dot 1 round
 * through every dot in order. The dots were all taken from the silhouette,
 * so it passes through each one; the reader joins them with straight lines,
 * and the answer shows the picture those lines were standing in for.
 *
 * Each dot is a vertex of the result. Falls back to the dots themselves (the
 * straight-line join) should they not run in the silhouette's own order.
 */
export function dtdAnswerLoop(contour: readonly Pt[], dots: readonly Pt[]): Pt[] {
  const n = contour.length
  if (n < 3 || dots.length < 3) return [...dots]
  // How far round the silhouette each dot sits, in segments (3.5 = halfway along the fourth).
  const along = dots.map((d) => {
    let best = Infinity
    let at = 0
    for (let i = 0; i < n; i++) {
      const a = contour[i]!
      const b = contour[(i + 1) % n]!
      const dx = b.x - a.x
      const dy = b.y - a.y
      const l2 = dx * dx + dy * dy
      const f = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((d.x - a.x) * dx + (d.y - a.y) * dy) / l2))
      const dist = Math.hypot(d.x - (a.x + f * dx), d.y - (a.y + f * dy))
      if (dist < best) (best = dist), (at = i + f)
    }
    return at
  })
  // Measured from dot 1, so the line starts there.
  const from = (s: number) => (((s - along[0]!) % n) + n) % n
  for (let k = 1; k < dots.length; k++) if (!(from(along[k]!) > from(along[k - 1]!))) return [...dots]

  const items = [
    ...dots.map((p, k) => ({ u: k === 0 ? 0 : from(along[k]!), p, dot: true })),
    ...contour.map((p, i) => ({ u: from(i), p, dot: false })).filter((v) => v.u > 0),
  ].sort((a, b) => a.u - b.u || Number(b.dot) - Number(a.dot))
  const near = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y) < ANSWER_MIN_STEP
  const out: { p: Pt; dot: boolean }[] = []
  for (const item of items) {
    const last = out[out.length - 1]
    if (last && near(last.p, item.p)) {
      if (!item.dot) continue
      if (!last.dot) out.pop()
    }
    out.push(item)
  }
  while (out.length > 1 && !out[out.length - 1]!.dot && near(out[out.length - 1]!.p, out[0]!.p)) out.pop()
  return out.map((v) => v.p)
}

/** A bend sharper than this stays a corner (a spout's tip, a roof's eave); gentler ones flow. */
const CORNER_TURN = (60 * Math.PI) / 180

function turnAt(a: Pt, b: Pt, c: Pt): number {
  const t = Math.abs(Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(b.y - a.y, b.x - a.x))
  return t > Math.PI ? Math.PI * 2 - t : t
}

/**
 * A closed loop through every point as one smooth line: centripetal
 * Catmull-Rom, as cubic Béziers. Centripetal spacing never loops or
 * overshoots where points bunch up, and straight runs stay straight;
 * sharp corners keep their point.
 */
export function smoothLoopCommands(pts: readonly Pt[]): Cmd[] {
  const n = pts.length
  if (n < 3) return pts.map((p, i) => [i === 0 ? 'M' : 'L', r2(p.x), r2(p.y)])
  const at = (i: number) => pts[((i % n) + n) % n]!
  const corner = pts.map((p, i) => turnAt(at(i - 1), p, at(i + 1)) > CORNER_TURN)
  const out: Cmd[] = [['M', r2(pts[0]!.x), r2(pts[0]!.y)]]
  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1)
    const p1 = at(i)
    const p2 = at(i + 1)
    const p3 = at(i + 2)
    // Square roots of the chord lengths (alpha = 1/2).
    const d1 = Math.sqrt(Math.hypot(p1.x - p0.x, p1.y - p0.y))
    const d2 = Math.sqrt(Math.hypot(p2.x - p1.x, p2.y - p1.y))
    const d3 = Math.sqrt(Math.hypot(p3.x - p2.x, p3.y - p2.y))
    const c1 =
      corner[i] || d1 === 0 || d2 === 0
        ? p1
        : {
            x: (d1 * d1 * p2.x - d2 * d2 * p0.x + (2 * d1 * d1 + 3 * d1 * d2 + d2 * d2) * p1.x) / (3 * d1 * (d1 + d2)),
            y: (d1 * d1 * p2.y - d2 * d2 * p0.y + (2 * d1 * d1 + 3 * d1 * d2 + d2 * d2) * p1.y) / (3 * d1 * (d1 + d2)),
          }
    const c2 =
      corner[(i + 1) % n] || d3 === 0 || d2 === 0
        ? p2
        : {
            x: (d3 * d3 * p1.x - d2 * d2 * p3.x + (2 * d3 * d3 + 3 * d3 * d2 + d2 * d2) * p2.x) / (3 * d3 * (d3 + d2)),
            y: (d3 * d3 * p1.y - d2 * d2 * p3.y + (2 * d3 * d3 + 3 * d3 * d2 + d2 * d2) * p2.y) / (3 * d3 * (d3 + d2)),
          }
    out.push(['C', r2(c1.x), r2(c1.y), r2(c2.x), r2(c2.y), r2(p2.x), r2(p2.y)])
  }
  out.push(['Z'])
  return out
}

/** Where a cubic's coordinate turns back, 0 < t < 1. */
function cubicTurns(p0: number, p1: number, p2: number, p3: number): number[] {
  const a = p3 - 3 * p2 + 3 * p1 - p0
  const b = 2 * (p2 - 2 * p1 + p0)
  const c = p1 - p0
  const roots: number[] = []
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) > 1e-12) roots.push(-c / b)
  } else {
    const disc = b * b - 4 * a * c
    if (disc >= 0) {
      const s = Math.sqrt(disc)
      roots.push((-b + s) / (2 * a), (-b - s) / (2 * a))
    }
  }
  return roots.filter((t) => t > 0 && t < 1)
}

const cubicAt = (p0: number, p1: number, p2: number, p3: number, t: number) => {
  const u = 1 - t
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3
}

/** The ink's true extent, curves included: Fabric centres a path on exactly this. */
export function commandBounds(commands: readonly Cmd[]): PathBounds | null {
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  const add = (x: number, y: number) => {
    b.minX = Math.min(b.minX, x)
    b.minY = Math.min(b.minY, y)
    b.maxX = Math.max(b.maxX, x)
    b.maxY = Math.max(b.maxY, y)
  }
  let x = 0
  let y = 0
  for (const c of commands) {
    if (c[0] === 'M' || c[0] === 'L') {
      x = Number(c[1])
      y = Number(c[2])
      add(x, y)
    } else if (c[0] === 'C') {
      const [x1, y1, x2, y2, x3, y3] = c.slice(1).map(Number) as [number, number, number, number, number, number]
      for (const t of cubicTurns(x, x1, x2, x3)) add(cubicAt(x, x1, x2, x3, t), y)
      for (const t of cubicTurns(y, y1, y2, y3)) add(x, cubicAt(y, y1, y2, y3, t))
      x = x3
      y = y3
      add(x, y)
    }
  }
  return b.minX <= b.maxX ? b : null
}

/* ------------------------------------------------------------------ *
 * Paths
 * ------------------------------------------------------------------ */

function linePath(lines: readonly (readonly Pt[])[], closed: boolean, width: number, tag: StudioTag, role: StudioRole, part: string): StudioFabricObject | null {
  const path: Cmd[] = []
  for (const line of lines) {
    line.forEach((p, i) => path.push([i === 0 ? 'M' : 'L', r2(p.x), r2(p.y)]))
    if (closed && line.length > 0) path.push(['Z'])
  }
  return pathObject(path, width, tag, role, part)
}

function pathObject(path: Cmd[], width: number, tag: StudioTag, role: StudioRole, part: string): StudioFabricObject | null {
  const bounds = commandBounds(path)
  if (!bounds) return null
  const { minX, minY, maxX, maxY } = bounds
  return {
    type: 'path',
    path,
    // A path is placed by the centre of its own geometry (Fabric's pathOffset).
    left: r2((minX + maxX) / 2),
    top: r2((minY + maxY) / 2),
    width: r2(maxX - minX),
    height: r2(maxY - minY),
    originX: 'center',
    originY: 'center',
    fill: 'transparent',
    stroke: STUDIO_INK,
    strokeWidth: width,
    strokeUniform: true,
    strokeLineCap: 'round',
    strokeLineJoin: 'round',
    objectId: nextObjectId(tag.instanceId),
    studioTemplateKey: tag.templateKey,
    studioInstanceId: tag.instanceId,
    studioPageRole: tag.pageRole,
    studioRole: role,
    // The answer stays hidden on the puzzle page; the answer key reveals it.
    ...(role === 'answer' ? { visible: false } : {}),
    data: { [DTD_PART_KEY]: part },
  }
}

export function buildDtdPicture(options: {
  puzzle: DtdPuzzle
  rules: DtdRules
  box: Box
  tag: StudioTag
  /** The page's book label (`subject|shape|version`). */
  label: string
  /** Stands in for the whole subtree when the page is fingerprinted. */
  canonical: string
  /** What the picture is, for the editor's layer name and the answer page. */
  name: string
}): StudioFabricObject {
  const { puzzle, rules, box, tag, label, canonical, name } = options
  const parts: StudioFabricObject[] = []
  const details = linePath(puzzle.details, false, DTD_INK_WIDTH.detail, tag, 'prompt', 'details')
  if (details) parts.push(details)
  const answer = pathObject(smoothLoopCommands(dtdAnswerLoop(puzzle.contour, puzzle.dots)), DTD_INK_WIDTH.answer, tag, 'answer', 'outline')
  if (answer) parts.push(answer)
  for (const dot of puzzle.dots) {
    if (dot.n === 1) {
      parts.push({
        ...buildCircle({ left: r2(dot.x), top: r2(dot.y), radius: rules.dotRadius + DTD_START_RING, stroke: STUDIO_INK, strokeWidth: DTD_INK_WIDTH.start, strokeUniform: true }, tag, 'prompt'),
        data: { [DTD_PART_KEY]: 'start' },
      })
    }
    parts.push({
      ...buildCircle({ left: r2(dot.x), top: r2(dot.y), radius: rules.dotRadius, fill: STUDIO_INK, stroke: STUDIO_INK, strokeWidth: 0 }, tag, 'prompt'),
      data: { [DTD_PART_KEY]: 'dot', n: dot.n },
    })
  }
  for (const dot of puzzle.dots) {
    const text = String(dot.n)
    parts.push({
      ...buildText(
        {
          left: r2(dot.label.x),
          top: r2(dot.label.y),
          text,
          fontFamily: STUDIO_DIGIT_FONT,
          fontSize: rules.numberSize,
          fontWeight: dot.n === 1 ? 700 : 'normal',
          width: estimateTextBoxWidth(text, rules.numberSize, rules.numberSize * 3),
          textAlign: 'center',
          originX: 'center',
          originY: 'center',
          // Fabric's default multiplier centres a lone glyph off its axis.
          lineHeight: 1,
          editable: false,
        },
        tag,
        'prompt',
      ),
      data: { [DTD_PART_KEY]: 'number', n: dot.n },
    })
  }
  const group = buildGroup(parts, box, tag, 'prompt')
  return {
    ...group,
    data: {
      source: DTD_TEMPLATE_KEY,
      [DTD_PART_KEY]: 'picture',
      subject: name,
      dots: puzzle.dots.length,
      [STUDIO_CONTENT_LABEL_KEY]: label,
      [STUDIO_CANONICAL_KEY]: `${DTD_TEMPLATE_KEY}:${canonical}`,
    },
  }
}
