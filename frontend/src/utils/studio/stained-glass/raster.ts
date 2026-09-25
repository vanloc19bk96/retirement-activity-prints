import { pt, type Bounds, type Pt } from './geometry'

/**
 * The page as a printer sees it: ink or paper, pixel by pixel.
 *
 * Geometry says where the lines are; this says what a reader gets to color.
 * Every stroke is stamped at its real print weight, and the paper left over
 * is split into the regions a pencil can fill. A region that is too small or
 * too narrow to color comfortably, a gap that lets two cells run together, or
 * ink where there should be none all show up here the way they would on the
 * printed page — which is why every page is checked this way before it is
 * accepted, whatever the geometry promised.
 */

export interface InkPolyline {
  pts: readonly Pt[]
  /** Print weight in canvas px. */
  width: number
  /**
   * A mosaic joint the page may take out to merge two cells (see
   * `RasterRegion.joints`); -1 or absent for fixed ink.
   */
  joint?: number
}

export interface RasterRegion {
  id: number
  /** Area in canvas px². */
  area: number
  /** Widest clear diameter: the biggest circle that fits, in canvas px. */
  width: number
  /** Its deepest point, in canvas px. */
  deepest: Pt
  /** Mosaic joints along its edge → how many pixels of edge each one makes. Only for regions `detail` asked about. */
  joints: Map<number, number>
}

export interface RasterReport {
  /** Every enclosed paper region; the paper outside the art is left out. */
  regions: RasterRegion[]
  /** Share of the art box covered by ink, 0..1. */
  inkShare: number
}

/**
 * Stamp the strokes onto a grid over `box` and measure the enclosed regions.
 *
 * `scale` is grid cells per canvas px (1 = 96 dpi). Strokes are stamped as
 * round-capped capsules, so a joint prints closed however two strokes meet.
 * Regions are 4-connected, so paper never leaks through a diagonal pinch.
 * Distances are chamfer (3-4) approximations of Euclidean, to within ~8%.
 */
export function rasterCheck(
  lines: readonly InkPolyline[],
  box: Bounds,
  options: { scale?: number; detail?: (region: RasterRegion) => boolean } = {},
): RasterReport {
  const scale = options.scale ?? 1
  const pad = 2
  const w = Math.ceil((box.maxX - box.minX) * scale) + pad * 2
  const h = Math.ceil((box.maxY - box.minY) * scale) + pad * 2
  const ink = new Uint8Array(w * h)
  const joint = new Int32Array(w * h).fill(-1)
  const ox = box.minX - pad / scale
  const oy = box.minY - pad / scale

  // Fixed ink first, then mosaic joints only where the paper is still clear,
  // so a joint is only blamed for the edge it alone makes.
  const isJoint = (line: InkPolyline) => (line.joint ?? -1) >= 0
  const ordered = [...lines].sort((a, b) => Number(isJoint(a)) - Number(isJoint(b)))
  for (const line of ordered) {
    const id = line.joint ?? -1
    const half = Math.max(0.75, (line.width * scale) / 2)
    const half2 = half * half
    for (let i = 1; i < line.pts.length; i++) {
      const ax = (line.pts[i - 1]!.x - ox) * scale
      const ay = (line.pts[i - 1]!.y - oy) * scale
      const bx = (line.pts[i]!.x - ox) * scale
      const by = (line.pts[i]!.y - oy) * scale
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - half))
      const x1 = Math.min(w - 1, Math.ceil(Math.max(ax, bx) + half))
      const y0 = Math.max(0, Math.floor(Math.min(ay, by) - half))
      const y1 = Math.min(h - 1, Math.ceil(Math.max(ay, by) + half))
      const dx = bx - ax
      const dy = by - ay
      const len2 = dx * dx + dy * dy
      for (let y = y0; y <= y1; y++) {
        const py = y + 0.5
        for (let x = x0; x <= x1; x++) {
          const px = x + 0.5
          let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2
          t = t < 0 ? 0 : t > 1 ? 1 : t
          const ex = px - (ax + t * dx)
          const ey = py - (ay + t * dy)
          if (ex * ex + ey * ey <= half2 && ink[y * w + x] === 0) {
            ink[y * w + x] = 1
            joint[y * w + x] = id
          }
        }
      }
    }
  }

  // Label paper regions (4-connected).
  const label = new Int32Array(w * h).fill(-1)
  const stack = new Int32Array(w * h)
  const areas: number[] = []
  let inkCount = 0
  const outside = new Set<number>()
  for (let i = 0; i < w * h; i++) {
    if (ink[i]) {
      inkCount++
      continue
    }
    if (label[i] !== -1) continue
    const id = areas.length
    let top = 0
    stack[top++] = i
    label[i] = id
    let area = 0
    let touches = false
    while (top > 0) {
      const c = stack[--top]!
      area++
      const cx = c % w
      const cy = (c - cx) / w
      if (cx === 0 || cy === 0 || cx === w - 1 || cy === h - 1) touches = true
      if (cx > 0 && !ink[c - 1] && label[c - 1] === -1) (label[c - 1] = id), (stack[top++] = c - 1)
      if (cx < w - 1 && !ink[c + 1] && label[c + 1] === -1) (label[c + 1] = id), (stack[top++] = c + 1)
      if (cy > 0 && !ink[c - w] && label[c - w] === -1) (label[c - w] = id), (stack[top++] = c - w)
      if (cy < h - 1 && !ink[c + w] && label[c + w] === -1) (label[c + w] = id), (stack[top++] = c + w)
    }
    areas.push(area)
    if (touches) outside.add(id)
  }

  // Chamfer distance to the nearest ink (the grid edge counts as ink).
  const BIG = 1 << 28
  const d = new Int32Array(w * h)
  for (let i = 0; i < w * h; i++) d[i] = ink[i] ? 0 : BIG
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (d[i] === 0) continue
      let v = d[i]!
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) v = Math.min(v, 3)
      if (x > 0) v = Math.min(v, d[i - 1]! + 3)
      if (y > 0) {
        v = Math.min(v, d[i - w]! + 3)
        if (x > 0) v = Math.min(v, d[i - w - 1]! + 4)
        if (x < w - 1) v = Math.min(v, d[i - w + 1]! + 4)
      }
      d[i] = v
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x
      if (d[i] === 0) continue
      let v = d[i]!
      if (x < w - 1) v = Math.min(v, d[i + 1]! + 3)
      if (y < h - 1) {
        v = Math.min(v, d[i + w]! + 3)
        if (x < w - 1) v = Math.min(v, d[i + w + 1]! + 4)
        if (x > 0) v = Math.min(v, d[i + w - 1]! + 4)
      }
      d[i] = v
    }
  }

  const deepest = new Int32Array(areas.length).fill(-1)
  const depth = new Int32Array(areas.length)
  for (let i = 0; i < w * h; i++) {
    const id = label[i]!
    if (id < 0) continue
    if (d[i]! > depth[id]!) {
      depth[id] = d[i]!
      deepest[id] = i
    }
  }

  const regions: RasterRegion[] = []
  areas.forEach((area, id) => {
    if (outside.has(id)) return
    const i = deepest[id]!
    const x = i % w
    const y = (i - x) / w
    regions.push({
      id,
      area: area / (scale * scale),
      // Distance to the nearest ink cell's centre, less half a cell, both sides.
      width: (2 * (depth[id]! / 3 - 0.5)) / scale,
      deepest: pt(ox + (x + 0.5) / scale, oy + (y + 0.5) / scale),
      joints: new Map(),
    })
  })

  // Which joints border the regions the caller cares about, and by how much.
  const detail = options.detail
  if (detail) {
    const wanted = new Map<number, RasterRegion>()
    for (const r of regions) if (detail(r)) wanted.set(r.id, r)
    if (wanted.size > 0) {
      for (let i = 0; i < w * h; i++) {
        const region = wanted.get(label[i]!)
        if (!region) continue
        const x = i % w
        for (const n of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
          if (n < 0 || n >= w * h) continue
          const j = joint[n]!
          if (j >= 0) region.joints.set(j, (region.joints.get(j) ?? 0) + 1)
        }
      }
    }
  }
  return { regions, inkShare: inkCount / (w * h) }
}
