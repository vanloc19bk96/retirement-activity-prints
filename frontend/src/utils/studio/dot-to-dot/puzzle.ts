import type { StudioRng } from '../studio-rng'
import { distToSegment, pt, ringArea, ringBounds, type Bounds, type Pt } from '../stained-glass/geometry'
import type { Box } from '../studio-layout'
import { simplifyLoopIndices, type DtdOutline } from './outline'

/**
 * An outline → numbered dots, each with its number placed beside it.
 *
 * Corners come first: the points the outline cannot lose without changing
 * shape (a spout's tip, the corner of a roof) are found by simplifying the
 * outline to the level's fidelity, and every one becomes a dot. The rest are
 * spread along the curves between them, so a long gentle side gets a few
 * evenly spaced dots and a tight curve gets what it needs. Dots too close
 * together are thinned, weakest first.
 *
 * Then everything a reader could trip over is measured, not assumed: no two
 * dots crowd each other (neighbours or not), no dot sits on a line it is not
 * part of, the finished outline never crosses itself, and it stays within
 * the level's tolerance of the true silhouette. Each number then takes the
 * clearest spot round its dot, facing out of the picture where it can, never
 * touching a line the reader will draw, another dot, another number or a
 * pre-drawn detail, and always nearer its own dot than any other.
 */

export interface DtdRules {
  /** How many dots the level asks for. */
  dots: { min: number; target: number; max: number }
  /** Number size, canvas px. */
  numberSize: number
  /** Dot radius, canvas px. */
  dotRadius: number
  /** Closest two dots may sit, canvas px. */
  minGap: number
  /** Most the joined dots may stray from the true outline, as a share of the picture's longer side. */
  fidelity: number
}

export interface DtdLabel {
  /** Centre of the number, canvas px. */
  x: number
  y: number
  w: number
  h: number
}

export interface DtdDot {
  n: number
  x: number
  y: number
  label: DtdLabel
}

export interface DtdPuzzle {
  /** In number order: dots[i].n === i + 1. */
  dots: DtdDot[]
  /** Pre-drawn lines, canvas px. */
  details: Pt[][]
  /** The true silhouette, canvas px (for checks; never printed). */
  contour: Pt[]
  /** Bounds of the silhouette on the page. */
  shape: Bounds
  /** Furthest the joined dots stray from the silhouette, canvas px. */
  deviation: number
  /** Closest two dots sit, canvas px. */
  closest: number
}

/* ------------------------------------------------------------------ *
 * Label boxes
 * ------------------------------------------------------------------ */

/** Lining digits run ~0.58 em wide and ~0.73 em tall; the box keeps a hair of paper round them. */
export const labelWidth = (n: number, size: number) => String(n).length * size * 0.6 + 2
export const labelHeight = (size: number) => size * 0.8 + 2

/** Paper the numbers need round the picture, canvas px. */
export const labelRoom = (rules: DtdRules) => rules.dotRadius + 3 + labelWidth(99, rules.numberSize) * 0.75 + 2

/* ------------------------------------------------------------------ *
 * Placing the outline
 * ------------------------------------------------------------------ */

/** The outline scaled to fill `panel`, less the room the numbers need round it. */
export function placeOutline(outline: DtdOutline, panel: Box, rules: DtdRules, scale = 1) {
  const room = labelRoom(rules)
  // Everything printed is fitted, so a separate small part never leaves the panel.
  const cb = ringBounds([outline.contour, ...outline.details].flat())
  const bw = cb.maxX - cb.minX
  const bh = cb.maxY - cb.minY
  const k = Math.min((panel.width - room * 2) / bw, (panel.height - room * 2) / bh) * scale
  const ox = panel.left + (panel.width - bw * k) / 2 - cb.minX * k
  const oy = panel.top + (panel.height - bh * k) / 2 - cb.minY * k
  const map = (p: Pt) => pt(ox + p.x * k, oy + p.y * k)
  const contour = outline.contour.map(map)
  const sb = ringBounds(contour)
  return {
    contour,
    details: outline.details.map((line) => line.map(map)),
    size: Math.max(sb.maxX - sb.minX, sb.maxY - sb.minY),
  }
}

/* ------------------------------------------------------------------ *
 * Sampling
 * ------------------------------------------------------------------ */

const d2 = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)

/** Turning angle at b, radians (0 = straight on). */
function turn(a: Pt, b: Pt, c: Pt): number {
  const a1 = Math.atan2(b.y - a.y, b.x - a.x)
  const a2 = Math.atan2(c.y - b.y, c.x - b.x)
  let t = Math.abs(a2 - a1)
  if (t > Math.PI) t = Math.PI * 2 - t
  return t
}

interface Sample {
  p: Pt
  /** Corners outrank the dots spread between them; sharper corners outrank gentle ones. */
  weight: number
}

/** How much a bend counts as extra length when spreading dots: a picture's size per ~10 radians of turning. */
const BEND_WEIGHT = 0.1

/**
 * About `count` points along the closed contour: every corner the fidelity
 * keeps, then fillers spread between them, thinned to `minGap`.
 *
 * Fillers are spread by length plus bend, so a curve (a handle, a wheel)
 * gets more dots than a straight side of the same length — a straight side
 * reads fine with few, a curve needs them to stay round.
 */
export function sampleContour(contour: readonly Pt[], count: number, maxTolerance: number, minGap: number): Pt[] | null {
  const n = contour.length
  const cb = ringBounds(contour)
  const bend = Math.max(cb.maxX - cb.minX, cb.maxY - cb.minY) * BEND_WEIGHT
  const cum = [0]
  const plain = [0]
  for (let i = 1; i <= n; i++) {
    const at = contour[(i - 1) % n]!
    const len = d2(at, contour[i % n]!)
    plain.push(plain[i - 1]! + len)
    cum.push(cum[i - 1]! + len + bend * turn(contour[(i - 2 + n) % n]!, at, contour[i % n]!))
  }
  const perimeter = cum[n]!
  // As faithful as the dot budget allows: corners take at most three quarters
  // of it, so the long sides still get dots of their own.
  let tolerance = maxTolerance * 0.3
  let cornerIdx = simplifyLoopIndices(contour, tolerance)
  while (cornerIdx.length > count * 0.75 && tolerance < maxTolerance) {
    tolerance = Math.min(maxTolerance, tolerance * 1.2)
    cornerIdx = simplifyLoopIndices(contour, tolerance)
  }
  if (cornerIdx.length < 3 || cornerIdx.length > count) return null
  const corners = cornerIdx.map((i, k) => {
    const prev = contour[cornerIdx[(k - 1 + cornerIdx.length) % cornerIdx.length]!]!
    const next = contour[cornerIdx[(k + 1) % cornerIdx.length]!]!
    return { i, weight: 1 + turn(prev, contour[i]!, next) }
  })

  const pointAt = (s: number): Pt => {
    const t = ((s % perimeter) + perimeter) % perimeter
    let lo = 0
    let hi = n
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (cum[mid]! <= t) lo = mid
      else hi = mid
    }
    const a = contour[lo]!
    const b = contour[(lo + 1) % n]!
    const seg = cum[lo + 1]! - cum[lo]!
    const f = seg > 0 ? (t - cum[lo]!) / seg : 0
    return pt(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f)
  }

  // Arc between consecutive corners, and how many fillers each gets at a given spacing.
  const arcs = corners.map((c, k) => {
    const next = corners[(k + 1) % corners.length]!
    let len = cum[next.i]! - cum[c.i]!
    if (len <= 0) len += perimeter
    let run = plain[next.i]! - plain[c.i]!
    if (run <= 0) run += plain[n]!
    // Never more fillers than the arc's real length holds at the minimum gap.
    return { from: cum[c.i]!, len, cap: Math.max(0, Math.floor(run / (minGap * 1.1)) - 1) }
  })
  const fillersAt = (spacing: number) => arcs.map((a) => Math.min(a.cap, Math.max(0, Math.round(a.len / spacing) - 1)))
  const total = (spacing: number) => corners.length + fillersAt(spacing).reduce((s, v) => s + v, 0)
  let lo = perimeter / (count * 6)
  let hi = perimeter
  for (let it = 0; it < 40; it++) {
    const mid = (lo + hi) / 2
    if (total(mid) > count) lo = mid
    else hi = mid
  }
  const fill = fillersAt(hi)

  let samples: Sample[] = []
  corners.forEach((c, k) => {
    samples.push({ p: contour[c.i]!, weight: c.weight })
    const m = fill[k]!
    for (let j = 1; j <= m; j++) samples.push({ p: pointAt(arcs[k]!.from + (arcs[k]!.len * j) / (m + 1)), weight: 0 })
  })

  // Thin: the closest pair under the gap (neighbours or not — the two sides
  // of a narrow tip crowd too) loses its weaker point, until none is left.
  const pairs: { i: number; j: number; g: number }[] = []
  for (let i = 0; i < samples.length; i++) {
    for (let j = i + 1; j < samples.length; j++) {
      const g = d2(samples[i]!.p, samples[j]!.p)
      if (g < minGap) pairs.push({ i, j, g })
    }
  }
  pairs.sort((a, b) => a.g - b.g || a.i - b.i || a.j - b.j)
  const gone = new Uint8Array(samples.length)
  for (const { i, j } of pairs) {
    if (gone[i] || gone[j]) continue
    gone[samples[i]!.weight <= samples[j]!.weight ? i : j] = 1
  }
  samples = samples.filter((_, i) => !gone[i])
  return samples.length >= 3 ? samples.map((s) => s.p) : null
}

/**
 * `count` dots after thinning, or as near under it as the outline allows:
 * thinning takes dots out of tight curves, so the request is raised until
 * what survives reaches the count.
 */
export function sampleDots(contour: readonly Pt[], count: number, maxTolerance: number, minGap: number): Pt[] | null {
  let best: Pt[] | null = null
  let lo = count
  let hi = count * 3
  for (let round = 0; round < 8 && lo <= hi; round++) {
    const request = round === 0 ? count : Math.floor((lo + hi) / 2)
    const pts = sampleContour(contour, request, maxTolerance, minGap)
    if (!pts) {
      hi = request - 1
      continue
    }
    if (pts.length <= count && (!best || pts.length > best.length)) best = pts
    if (pts.length === count) break
    if (pts.length < count) lo = request + 1
    else hi = request - 1
  }
  return best
}

/* ------------------------------------------------------------------ *
 * Measuring a dot sequence
 * ------------------------------------------------------------------ */

function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o = (p: Pt, q: Pt, r: Pt) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)
  const o1 = o(a, b, c)
  const o2 = o(a, b, d)
  const o3 = o(c, d, a)
  const o4 = o(c, d, b)
  if (((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))) return true
  // Touching counts as crossing: a reader cannot tell the two apart.
  const on = (p: Pt, q: Pt, r: Pt) => Math.abs(o(p, q, r)) < 1e-9 && Math.min(p.x, q.x) - 1e-9 <= r.x && r.x <= Math.max(p.x, q.x) + 1e-9 && Math.min(p.y, q.y) - 1e-9 <= r.y && r.y <= Math.max(p.y, q.y) + 1e-9
  return on(a, b, c) || on(a, b, d) || on(c, d, a) || on(c, d, b)
}

/** True when the closed path through `pts` never crosses or touches itself. */
export function isSimpleLoop(pts: readonly Pt[]): boolean {
  const n = pts.length
  for (let i = 0; i < n; i++) {
    const a = pts[i]!
    const b = pts[(i + 1) % n]!
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue
      if (segmentsCross(a, b, pts[j]!, pts[(j + 1) % n]!)) return false
    }
  }
  return true
}

/** Closest pair of dots, canvas px. */
export function closestPair(pts: readonly Pt[]): number {
  let best = Infinity
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) best = Math.min(best, d2(pts[i]!, pts[j]!))
  return best
}

/** Closest a dot comes to a line of the path it is not an end of, canvas px. */
export function closestDotToLine(pts: readonly Pt[]): number {
  const n = pts.length
  let best = Infinity
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const k = (j + 1) % n
      if (j === i || k === i) continue
      best = Math.min(best, distToSegment(pts[i]!, pts[j]!, pts[k]!))
    }
  }
  return best
}

/** Furthest the true silhouette strays from the joined dots, canvas px. */
export function deviationFrom(contour: readonly Pt[], pts: readonly Pt[]): number {
  let worst = 0
  for (const p of contour) {
    let best = Infinity
    for (let j = 0; j < pts.length; j++) best = Math.min(best, distToSegment(p, pts[j]!, pts[(j + 1) % pts.length]!))
    worst = Math.max(worst, best)
  }
  return worst
}

/** Why a dot sequence cannot print, or null when it can. */
export function dotSequenceProblem(pts: readonly Pt[], contour: readonly Pt[], size: number, rules: DtdRules): string | null {
  if (pts.length < rules.dots.min) return 'too few dots'
  if (pts.length > rules.dots.max) return 'too many dots'
  if (closestPair(pts) < rules.minGap - 1e-6) return 'two dots crowd each other'
  if (closestDotToLine(pts) < rules.minGap * 0.6 - 1e-6) return 'a dot sits on another line'
  if (!isSimpleLoop(pts)) return 'the outline crosses itself'
  if (deviationFrom(contour, pts) > rules.fidelity * size + 1e-6) return 'the dots stray from the picture'
  const a = Math.abs(ringArea([...pts]))
  const c = Math.abs(ringArea([...contour]))
  if (Math.abs(a - c) / c > 0.08) return 'the dots change the picture'
  return null
}

/* ------------------------------------------------------------------ *
 * Numbers
 * ------------------------------------------------------------------ */

interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}

const rectOf = (l: DtdLabel, pad: number): Rect => ({ x0: l.x - l.w / 2 - pad, y0: l.y - l.h / 2 - pad, x1: l.x + l.w / 2 + pad, y1: l.y + l.h / 2 + pad })

const rectsOverlap = (a: Rect, b: Rect) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1

function rectHitsSegment(r: Rect, a: Pt, b: Pt): boolean {
  if (Math.max(a.x, b.x) < r.x0 || Math.min(a.x, b.x) > r.x1 || Math.max(a.y, b.y) < r.y0 || Math.min(a.y, b.y) > r.y1) return false
  const inside = (p: Pt) => p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1
  if (inside(a) || inside(b)) return true
  const c = [pt(r.x0, r.y0), pt(r.x1, r.y0), pt(r.x1, r.y1), pt(r.x0, r.y1)]
  for (let i = 0; i < 4; i++) if (segmentsCross(a, b, c[i]!, c[(i + 1) % 4]!)) return true
  return false
}

function rectDist(r: Rect, p: Pt): number {
  const dx = Math.max(r.x0 - p.x, 0, p.x - r.x1)
  const dy = Math.max(r.y0 - p.y, 0, p.y - r.y1)
  return Math.hypot(dx, dy)
}

/** Air kept between a number and anything else, canvas px. */
export const LABEL_AIR = 1.5

/**
 * A spot for every number, or null when some number has nowhere clear to go.
 * Most-constrained dots choose first.
 */
export function placeLabels(pts: readonly Pt[], details: readonly (readonly Pt[])[], bounds: Box, rules: DtdRules): DtdLabel[] | null {
  const n = pts.length
  const size = rules.numberSize
  const h = labelHeight(size)
  const air = LABEL_AIR
  const reach = rules.dotRadius + 2.5
  const detailSegs: [Pt, Pt][] = []
  for (const line of details) for (let i = 1; i < line.length; i++) detailSegs.push([line[i - 1]!, line[i]!])

  const candidates: { label: DtdLabel; cost: number }[][] = pts.map((p, i) => {
    const w = labelWidth(i + 1, size)
    const prev = pts[(i - 1 + n) % n]!
    const next = pts[(i + 1) % n]!
    // Outward: the path runs clockwise, so the picture lies to its right.
    const n1 = { x: p.y - prev.y, y: -(p.x - prev.x) }
    const n2 = { x: next.y - p.y, y: -(next.x - p.x) }
    const l1 = Math.hypot(n1.x, n1.y) || 1
    const l2 = Math.hypot(n2.x, n2.y) || 1
    let ox = n1.x / l1 + n2.x / l2
    let oy = n1.y / l1 + n2.y / l2
    const lo = Math.hypot(ox, oy)
    if (lo < 1e-6) (ox = n1.x / l1), (oy = n1.y / l1)
    else (ox /= lo), (oy /= lo)
    const out: { label: DtdLabel; cost: number }[] = []
    for (let ring = 0; ring < 3; ring++) {
      for (let k = 0; k < 24; k++) {
        const a = (k * Math.PI) / 12
        const ux = Math.cos(a)
        const uy = Math.sin(a)
        const t = reach + ring * 3.5 + (w / 2) * Math.abs(ux) + (h / 2) * Math.abs(uy)
        const label = { x: p.x + ux * t, y: p.y + uy * t, w, h }
        const r = rectOf(label, air)
        if (r.x0 < bounds.left || r.y0 < bounds.top || r.x1 > bounds.left + bounds.width || r.y1 > bounds.top + bounds.height) continue
        let blocked = false
        for (let j = 0; j < n && !blocked; j++) {
          if (rectHitsSegment(r, pts[j]!, pts[(j + 1) % n]!)) blocked = true
          else if (j !== i && rectDist(r, pts[j]!) < rules.dotRadius + air) blocked = true
        }
        for (const [s, e] of detailSegs) if (!blocked && rectHitsSegment(r, s, e)) blocked = true
        if (blocked) continue
        // Unmistakably this dot's number: clearly nearer to it than to any other dot.
        const own = rectDist(r, p)
        let ok = true
        for (let j = 0; j < n && ok; j++) if (j !== i && rectDist(r, pts[j]!) < own + Math.max(4, size * 0.45)) ok = false
        if (!ok) continue
        const facing = Math.acos(Math.max(-1, Math.min(1, ux * ox + uy * oy)))
        out.push({ label, cost: facing * 4 + ring * 1.5 })
      }
    }
    return out.sort((x, y) => x.cost - y.cost)
  })

  const order = pts.map((_, i) => i).sort((a, b) => candidates[a]!.length - candidates[b]!.length || a - b)
  const placed: (DtdLabel | null)[] = pts.map(() => null)
  const rects: Rect[] = []
  for (const i of order) {
    const pick = candidates[i]!.find((c) => {
      const r = rectOf(c.label, air)
      return !rects.some((o) => rectsOverlap(r, o))
    })
    if (!pick) return null
    placed[i] = pick.label
    rects.push(rectOf(pick.label, air / 2))
  }
  return placed as DtdLabel[]
}

/* ------------------------------------------------------------------ *
 * The whole puzzle
 * ------------------------------------------------------------------ */

/** Where dot 1 goes: near the top left of the picture, the way a reader looks first. Dealt from the few best. */
function startIndex(pts: readonly Pt[], rng: StudioRng): number {
  const b = ringBounds(pts)
  const span = Math.max(b.maxX - b.minX, b.maxY - b.minY) || 1
  const ranked = pts
    .map((p, i) => ({ i, score: (p.y - b.minY) / span + 0.45 * ((p.x - b.minX) / span) }))
    .sort((a, c) => a.score - c.score)
  return rng.pick(ranked.slice(0, Math.min(3, ranked.length))).i
}

/** Outline length each dot needs, in minimum gaps: dots sit a little over the gap apart on average. */
export const DOT_ROOM = 1.6

export type DtdBuild = { ok: true; puzzle: DtdPuzzle } | { ok: false; reason: string }

/**
 * Dots and numbers for an outline in `panel`. Tries the level's target
 * count, then fewer dots (down to the level's floor) while the numbers will
 * not all find a clear spot or the dots will not keep their distance.
 */
export function buildPuzzle(outline: DtdOutline, panel: Box, rules: DtdRules, rng: StudioRng): DtdBuild {
  const placed = placeOutline(outline, panel, rules)
  const { contour, details, size } = placed
  const tolerance = rules.fidelity * size * 0.8
  let reason = ''
  // The outline holds only so many dots at the minimum gap; aim within that.
  let perimeter = 0
  for (let i = 0; i < contour.length; i++) perimeter += d2(contour[i]!, contour[(i + 1) % contour.length]!)
  // And a simple outline (a radio, a suitcase) is not padded out with dots
  // along its straight sides: the count follows how much shape there is.
  const need = Math.round(simplifyLoopIndices(contour, size * 0.012).length * 2)
  const { min } = rules.dots
  const target = Math.max(min, Math.min(rules.dots.target, need, Math.floor(perimeter / (rules.minGap * DOT_ROOM))))
  const counts: number[] = []
  for (let c = target; c >= min; c -= Math.max(1, Math.round(target * 0.08))) counts.push(c)
  if (counts[counts.length - 1] !== min) counts.push(min)
  for (const count of counts) {
    const raw = sampleDots(contour, count, tolerance, rules.minGap)
    if (!raw) {
      reason ||= 'the outline is too detailed for this level'
      continue
    }
    const problem = dotSequenceProblem(raw, contour, size, rules)
    if (problem) {
      reason ||= problem
      continue
    }
    const start = startIndex(raw, rng)
    const pts = [...raw.slice(start), ...raw.slice(0, start)]
    // A detail the joined dots would crowd (where a chord cuts a curve short) is left out.
    const air = Math.max(4, rules.minGap * 0.3)
    const kept = details.filter((line) =>
      line.every((p) => pts.every((q, j) => distToSegment(p, q, pts[(j + 1) % pts.length]!) >= air)),
    )
    const labels = placeLabels(pts, kept, panel, rules)
    if (!labels) {
      reason ||= 'a number has nowhere clear to go'
      continue
    }
    const dots = pts.map((p, i) => ({ n: i + 1, x: p.x, y: p.y, label: labels[i]! }))
    return {
      ok: true,
      puzzle: {
        dots,
        details: kept,
        contour,
        shape: ringBounds(contour),
        deviation: deviationFrom(contour, pts),
        closest: closestPair(pts),
      },
    }
  }
  return { ok: false, reason: reason || 'no dots placed' }
}
