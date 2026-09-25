import { arcPoints, dist, lerp, pt, type Bounds, type Pt, type Ring, type Seg } from './geometry'

/**
 * The window a stained-glass page is set in.
 *
 * A frame is a closed outline made of straight runs and circular arcs, and
 * every run can be asked for at any inset. Because a run at inset 0 and the
 * same run at inset `band` share their parameters, a point one third of the
 * way along the outer run faces the point one third of the way along the inner
 * one, so the border band is cut into tiles by joining the two: radial on an
 * arch, mitred at a square corner. That is how real border glass is leaded.
 */

export type FrameKind = 'rect' | 'rounded' | 'arch' | 'gothic'
/** `tiles` mitres the corners; `blocks` sets a square block in each square corner; `plain` is one unbroken band. */
export type BorderKind = 'tiles' | 'blocks' | 'plain' | 'none'

export const FRAME_KINDS: readonly FrameKind[] = ['rect', 'rounded', 'arch', 'gothic']
export const BORDER_KINDS: readonly BorderKind[] = ['tiles', 'blocks', 'plain', 'none']

type Run =
  | { kind: 'line'; at: (inset: number) => [Pt, Pt] }
  | { kind: 'arc'; at: (inset: number) => { c: Pt; r: number; from: number; to: number } }

const runLength = (run: Run, inset: number) => {
  if (run.kind === 'line') {
    const [a, b] = run.at(inset)
    return dist(a, b)
  }
  const { r, from, to } = run.at(inset)
  return (Math.abs(to - from) * Math.PI * r) / 180
}

const runPoint = (run: Run, inset: number, u: number): Pt => {
  if (run.kind === 'line') {
    const [a, b] = run.at(inset)
    return lerp(a, b, u)
  }
  const { c, r, from, to } = run.at(inset)
  const deg = ((from + (to - from) * u) * Math.PI) / 180
  return pt(c.x + r * Math.cos(deg), c.y + r * Math.sin(deg))
}

const runPoints = (run: Run, inset: number): Pt[] => {
  if (run.kind === 'line') return run.at(inset)
  const { c, r, from, to } = run.at(inset)
  return arcPoints(c.x, c.y, r, from, to, Math.max(4, Math.ceil(Math.abs(to - from) / 4)))
}

/** Corner radius of a rounded window, as a share of its shorter side. */
export const DEFAULT_FRAME_CORNER = 0.14

/** Runs clockwise from the bottom-left corner. */
function frameRuns(kind: FrameKind, b: Bounds, corner: number): Run[] {
  const w = b.maxX - b.minX
  const h = b.maxY - b.minY
  const line = (f: (i: number) => [Pt, Pt]): Run => ({ kind: 'line', at: f })
  switch (kind) {
    case 'rect':
      return [
        line((i) => [pt(b.minX + i, b.maxY - i), pt(b.minX + i, b.minY + i)]),
        line((i) => [pt(b.minX + i, b.minY + i), pt(b.maxX - i, b.minY + i)]),
        line((i) => [pt(b.maxX - i, b.minY + i), pt(b.maxX - i, b.maxY - i)]),
        line((i) => [pt(b.maxX - i, b.maxY - i), pt(b.minX + i, b.maxY - i)]),
      ]
    case 'rounded': {
      const rc = Math.min(w, h) * corner
      const arc = (cx: number, cy: number, from: number): Run => ({
        kind: 'arc',
        at: (i) => ({ c: pt(cx, cy), r: rc - i, from, to: from + 90 }),
      })
      return [
        line((i) => [pt(b.minX + i, b.maxY - rc), pt(b.minX + i, b.minY + rc)]),
        arc(b.minX + rc, b.minY + rc, 180),
        line((i) => [pt(b.minX + rc, b.minY + i), pt(b.maxX - rc, b.minY + i)]),
        arc(b.maxX - rc, b.minY + rc, 270),
        line((i) => [pt(b.maxX - i, b.minY + rc), pt(b.maxX - i, b.maxY - rc)]),
        arc(b.maxX - rc, b.maxY - rc, 0),
        line((i) => [pt(b.maxX - rc, b.maxY - i), pt(b.minX + rc, b.maxY - i)]),
        arc(b.minX + rc, b.maxY - rc, 90),
      ]
    }
    case 'arch': {
      const r = w / 2
      const spring = b.minY + r
      return [
        line((i) => [pt(b.minX + i, b.maxY - i), pt(b.minX + i, spring)]),
        { kind: 'arc', at: (i) => ({ c: pt(b.minX + r, spring), r: r - i, from: 180, to: 360 }) },
        line((i) => [pt(b.maxX - i, spring), pt(b.maxX - i, b.maxY - i)]),
        line((i) => [pt(b.maxX - i, b.maxY - i), pt(b.minX + i, b.maxY - i)]),
      ]
    }
    case 'gothic': {
      const rho = w * 0.62
      const rise = Math.sqrt(rho * rho - (rho - w / 2) ** 2)
      const spring = b.minY + rise
      const cx = b.minX + w / 2
      const apexY = (i: number) => spring - Math.sqrt((rho - i) ** 2 - (rho - w / 2) ** 2)
      const deg = (c: Pt, p: Pt) => {
        const a = (Math.atan2(p.y - c.y, p.x - c.x) * 180) / Math.PI
        return a < 0 ? a + 360 : a
      }
      const left = pt(b.minX + rho, spring)
      const right = pt(b.maxX - rho, spring)
      return [
        line((i) => [pt(b.minX + i, b.maxY - i), pt(b.minX + i, spring)]),
        { kind: 'arc', at: (i) => ({ c: left, r: rho - i, from: 180, to: deg(left, pt(cx, apexY(i))) }) },
        { kind: 'arc', at: (i) => ({ c: right, r: rho - i, from: deg(right, pt(cx, apexY(i))), to: 360 }) },
        line((i) => [pt(b.maxX - i, spring), pt(b.maxX - i, b.maxY - i)]),
        line((i) => [pt(b.maxX - i, b.maxY - i), pt(b.minX + i, b.maxY - i)]),
      ]
    }
  }
}

/** Where two runs meet at an angle (not a smooth join), so a square block fits there. */
function isSharpJoin(kind: FrameKind, runIndex: number): boolean {
  switch (kind) {
    case 'rect':
      return true
    case 'rounded':
      return false
    case 'arch':
      return runIndex === 0 || runIndex === 3
    case 'gothic':
      return runIndex === 0 || runIndex === 2 || runIndex === 4
  }
}

/** A frame's rise over its width, so a layout can tell whether a kind suits its box. */
export function frameTopRise(kind: FrameKind, width: number): number {
  if (kind === 'arch') return width / 2
  if (kind === 'gothic') {
    const rho = width * 0.62
    return Math.sqrt(rho * rho - (rho - width / 2) ** 2)
  }
  return 0
}

export interface FrameArt {
  outer: Ring
  /** The glass area the mosaic fills. The same as `outer` when there is no band. */
  inner: Ring
  /** Tile joints across the band. */
  dividers: Seg[]
}

/**
 * The frame's outline, its inner line and the joints that tile the band.
 *
 * `tile` is the length a border tile aims for; each run gets a whole number
 * of equal tiles, so no run ends in a sliver.
 */
export function buildFrame(options: {
  kind: FrameKind
  border: BorderKind
  bounds: Bounds
  band: number
  tile: number
  /** Rounded windows only: corner radius as a share of the shorter side. */
  corner?: number
}): FrameArt {
  const { kind, border, bounds, band, tile, corner = DEFAULT_FRAME_CORNER } = options
  const runs = frameRuns(kind, bounds, corner)
  const ringAt = (inset: number): Ring => {
    const out: Pt[] = []
    for (const run of runs) {
      const pts = runPoints(run, inset)
      for (const p of pts) {
        const last = out[out.length - 1]
        if (!last || dist(last, p) > 0.01) out.push(p)
      }
    }
    if (out.length > 1 && dist(out[0]!, out[out.length - 1]!) < 0.01) out.pop()
    return out
  }
  const outer = ringAt(0)
  if (border === 'none') return { outer, inner: outer, dividers: [] }
  const inner = ringAt(band)
  const dividers: Seg[] = []
  if (border === 'plain') return { outer, inner, dividers }

  runs.forEach((run, index) => {
    const len = runLength(run, 0)
    const count = Math.max(1, Math.round(len / tile))
    const sharp = isSharpJoin(kind, index)
    for (let j = 0; j < count; j++) {
      const u = j / count
      if (j === 0 && sharp && border === 'blocks') {
        // A square block: the outer corner's two neighbours both run to the inner corner.
        const prev = runs[(index - 1 + runs.length) % runs.length]!
        const innerCorner = runPoint(run, band, 0)
        const along = Math.min(0.45, band / Math.max(1, len))
        const alongPrev = Math.min(0.45, band / Math.max(1, runLength(prev, 0)))
        dividers.push({ a: runPoint(run, 0, along), b: innerCorner })
        dividers.push({ a: runPoint(prev, 0, 1 - alongPrev), b: innerCorner })
        continue
      }
      const outerPoint = runPoint(run, 0, u)
      if (j > 0 && run.kind === 'line') {
        // Square across a straight run: the inner run is shorter, so matching
        // parameters would lean every joint toward the middle.
        const [a, b] = run.at(band)
        const dx = b.x - a.x
        const dy = b.y - a.y
        const t = Math.max(0, Math.min(1, ((outerPoint.x - a.x) * dx + (outerPoint.y - a.y) * dy) / (dx * dx + dy * dy || 1)))
        dividers.push({ a: outerPoint, b: lerp(a, b, t) })
      } else {
        dividers.push({ a: outerPoint, b: runPoint(run, band, u) })
      }
    }
  })
  return { outer, inner, dividers }
}
