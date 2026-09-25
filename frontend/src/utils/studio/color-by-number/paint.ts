import {
  chainSegments,
  cutSegments,
  distToSegment,
  inRegion,
  polylineSegments,
  pt,
  ringSegments,
  toRegion,
  type Bounds,
  type Pt,
  type Region,
  type Seg,
} from '../stained-glass/geometry'
import { rasterCheck, type InkPolyline, type RasterRegion } from '../stained-glass/raster'
import { drawingBounds, placeDrawing, rect, type SubjectDrawing } from '../stained-glass/subject-kit'
import { colorUnits, type CbnColorId, type CbnPalette, type CbnUnit } from './palette'
import type { CbnComposition, CbnScene } from './scene'

/**
 * A scene → the finished Color by Number art: lines, numbers and key.
 *
 * 1. **Lines.** Each part prints only where nothing in front covers it, so
 *    a hill's outline stops at the tree standing on it. The subject's
 *    silhouette prints a little heavier than the scenery, so the picture
 *    reads first; the frame heaviest of all.
 * 2. **Spaces.** The lines are printed to a grid at 96 dpi at their real
 *    weights and every enclosed patch of paper is measured (`raster.ts`), the
 *    way a reader will meet it. A patch too small or too narrow to take a
 *    readable number loses the stretch of scenery line that pinched it off (a
 *    hill top grazing the subject), which merges it into its neighbour; a
 *    patch made by lines that must stay (the subject, a tree, the frame) is
 *    never forced: the design is refused and another is dealt.
 * 3. **Colors.** A space takes the color of whatever lies on top at its
 *    deepest point — sky, far hill, a piece of the teapot — so each part
 *    keeps one color wherever it shows, and the key is settled at six to
 *    eight colors (`palette.ts`).
 * 4. **Numbers.** Each space's number sits at its deepest point, the centre
 *    of the largest circle that fits inside it, so it is as far from every
 *    line as the space allows; the clearance is then re-measured exactly
 *    against every printed line, not taken from the grid.
 */

export type CbnInk = 'frame' | 'outline' | 'line'

/** Print weights, canvas px (96 per inch): 2.6 pt frame, 2.25 pt silhouette, 1.7 pt scenery. */
export const CBN_INK_WIDTH: Readonly<Record<CbnInk, number>> = {
  frame: 3.5,
  outline: 3,
  line: 2.25,
}

/** Paper pinched off where two lines meet at a sharp angle: ink spread, not a space. */
const SPECK_AREA = 24
const HAIRLINE = { width: 4, area: 64 } as const
const isSpeck = (r: RasterRegion) => r.area <= SPECK_AREA || (r.width <= HAIRLINE.width && r.area <= HAIRLINE.area)

/**
 * How much clear paper a number needs round its centre, canvas px: half its
 * ink (a single lining digit is about 0.6 em wide and 0.73 em tall, so its
 * corners reach about half an em from the centre), plus a margin so it never
 * sits against a line.
 */
export const cbnNumberRadius = (size: number) => size * 0.5 + Math.max(2, size * 0.12)
/** The grid's distance estimate is good to about 8%; the space must clear the number by that too. */
const GRID_SLACK = 1.08

export interface CbnSpaceRules {
  /** Preferred number size, canvas px. */
  numberSize: number
  /** Smallest number size a tight space may take, canvas px. */
  minNumberSize: number
  /** Smallest paper area a space may have, canvas px². */
  minArea: number
}

export interface CbnInkRun {
  ink: CbnInk
  width: number
  lines: Pt[][]
}

export interface CbnLabel {
  x: number
  y: number
  /** The key number, 1-based. */
  n: number
  size: number
  /** Exact clear distance from the label's centre to the nearest line's edge, canvas px. */
  clearance: number
}

export interface CbnArt {
  runs: CbnInkRun[]
  labels: CbnLabel[]
  /** Key colors: number n is `legend[n - 1]`. */
  legend: CbnColorId[]
  /** Spaces to color (one label each). */
  spaces: number
  narrowest: number
  smallest: number
  /** The biggest space's share of the panel, 0..1, and the part it belongs to. */
  largestShare: number
  largestUnit: string
  inkShare: number
  /** How many spaces each key color holds, by number. */
  perNumber: number[]
  /** Pairs of touching parts printed with the same number (must be none). */
  clashes: number
  subject: Bounds
  panel: Bounds
  repairs: number
  /** The scene as drawn (see `CbnScene.drawn`). */
  composition: CbnComposition
}

export type CbnArtResult =
  | ({ ok: true } & CbnArt)
  | {
      ok: false
      reason: string
      runs?: CbnInkRun[]
      at?: Pt
      /** The part the failing space belongs to: a role, or a subject piece (`s<index>`). */
      unit?: string
    }

interface Joint {
  pts: Pt[]
}

interface Composed {
  fixed: Record<CbnInk, Seg[]>
  joints: Joint[]
}

/** Topmost layer whose shape holds `p` (0, the sky or wall, when none does). */
function topLayerAt(p: Pt, regions: readonly Region[]): number {
  for (let i = regions.length - 1; i > 0; i--) if (inRegion(p, regions[i]!)) return i
  return 0
}

const keyOf = (p: Pt) => `${Math.round(p.x * 4)},${Math.round(p.y * 4)}`

/** Segments bucketed on a coarse grid, for "is any line near this point" questions. */
class SegmentIndex {
  private readonly cells = new Map<string, { seg: Seg; owner: number }[]>()
  private readonly size = 12
  add(seg: Seg, owner: number): void {
    const s = this.size
    for (let x = Math.floor(Math.min(seg.a.x, seg.b.x) / s); x <= Math.floor(Math.max(seg.a.x, seg.b.x) / s); x++) {
      for (let y = Math.floor(Math.min(seg.a.y, seg.b.y) / s); y <= Math.floor(Math.max(seg.a.y, seg.b.y) / s); y++) {
        const k = `${x},${y}`
        const list = this.cells.get(k)
        if (list) list.push({ seg, owner })
        else this.cells.set(k, [{ seg, owner }])
      }
    }
  }
  near(p: Pt, reach: number, skip: (owner: number) => boolean): boolean {
    const s = this.size
    for (let x = Math.floor((p.x - reach) / s); x <= Math.floor((p.x + reach) / s); x++) {
      for (let y = Math.floor((p.y - reach) / s); y <= Math.floor((p.y + reach) / s); y++) {
        for (const { seg, owner } of this.cells.get(`${x},${y}`) ?? []) {
          if (!skip(owner) && distToSegment(p, seg.a, seg.b) <= reach) return true
        }
      }
    }
    return false
  }
}

/** What the lines of a scene are made from. */
type SceneLines = Pick<CbnScene, 'frame' | 'panel' | 'layers' | 'strokes'>

function composeLines(scene: SceneLines, regions: readonly Region[]): Composed {
  const { layers, panel, strokes, frame } = scene
  const inPanel = (p: Pt) => inRegion(p, panel)
  const coveredAbove = (p: Pt, index: number) => {
    for (let j = index + 1; j < regions.length; j++) if (inRegion(p, regions[j]!)) return true
    return false
  }
  const fixed: Record<CbnInk, Seg[]> = { frame: ringSegments(frame), outline: [], line: [] }
  /** Removable pieces with the layer that drew them. */
  const loose: { seg: Seg; layer: number }[] = []
  /** Where each layer's visible pieces end (the frame is layer -1, subject strokes -2). */
  const ends: { p: Pt; layer: number }[] = []
  const side = (piece: Seg) => {
    const dx = piece.b.x - piece.a.x
    const dy = piece.b.y - piece.a.y
    const len = Math.hypot(dx, dy) || 1
    const mid = pt((piece.a.x + piece.b.x) / 2, (piece.a.y + piece.b.y) / 2)
    const e = 1.5
    const left = topLayerAt(pt(mid.x - (dy / len) * e, mid.y + (dx / len) * e), regions)
    const right = topLayerAt(pt(mid.x + (dy / len) * e, mid.y - (dx / len) * e), regions)
    return layers[left]!.subject !== layers[right]!.subject ? 'outline' : 'line'
  }

  for (const s of fixed.frame) ends.push({ p: s.a, layer: -1 })
  layers.forEach((layer, index) => {
    if (index === 0) return
    const above = regions.slice(index + 1)
    for (const piece of cutSegments(ringSegments(layer.ring), [panel, ...above], (mid) => inPanel(mid) && !coveredAbove(mid, index))) {
      if (layer.removable) loose.push({ seg: piece, layer: index })
      else fixed[side(piece)].push(piece)
      ends.push({ p: piece.a, layer: index }, { p: piece.b, layer: index })
    }
  })
  for (const stroke of strokes) {
    const above = regions.slice(stroke.layer + 1)
    for (const piece of cutSegments(polylineSegments(stroke.pts), [panel, ...above], (mid) => inPanel(mid) && !coveredAbove(mid, stroke.layer))) {
      fixed[side(piece)].push(piece)
      ends.push({ p: piece.a, layer: -2 }, { p: piece.b, layer: -2 })
    }
  }

  // A removable line is taken out stretch by stretch, never a whole hill
  // top at once. It is cut wherever a line of another part ends on it, and
  // a stretch runs only between two such junctions, so removing one never
  // leaves a line ending in open paper.
  const endIndex = new Map<string, { p: Pt; layer: number }[]>()
  const cell = 16
  for (const e of ends) {
    const k = `${Math.floor(e.p.x / cell)},${Math.floor(e.p.y / cell)}`
    const list = endIndex.get(k)
    if (list) list.push(e)
    else endIndex.set(k, [e])
  }
  const endsNear = (s: Seg) => {
    const out: { p: Pt; layer: number }[] = []
    for (let x = Math.floor((Math.min(s.a.x, s.b.x) - 1) / cell); x <= Math.floor((Math.max(s.a.x, s.b.x) + 1) / cell); x++) {
      for (let y = Math.floor((Math.min(s.a.y, s.b.y) - 1) / cell); y <= Math.floor((Math.max(s.a.y, s.b.y) + 1) / cell); y++) {
        out.push(...(endIndex.get(`${x},${y}`) ?? []))
      }
    }
    return out
  }
  const stops = new Set<string>()
  const byLayer = new Map<number, Seg[]>()
  for (const { seg: s, layer } of loose) {
    const len2 = (s.b.x - s.a.x) ** 2 + (s.b.y - s.a.y) ** 2
    const cuts: { t: number; p: Pt }[] = []
    for (const e of endsNear(s)) {
      if (e.layer === layer || len2 === 0 || distToSegment(e.p, s.a, s.b) > 0.75) continue
      const t = ((e.p.x - s.a.x) * (s.b.x - s.a.x) + (e.p.y - s.a.y) * (s.b.y - s.a.y)) / len2
      if (t <= 0.02) stops.add(keyOf(s.a))
      else if (t >= 0.98) stops.add(keyOf(s.b))
      else cuts.push({ t, p: e.p })
    }
    cuts.sort((a, b) => a.t - b.t)
    const list = byLayer.get(layer) ?? []
    let prev = s.a
    for (const { p } of cuts) {
      list.push({ a: prev, b: p })
      stops.add(keyOf(p))
      prev = p
    }
    list.push({ a: prev, b: s.b })
    byLayer.set(layer, list)
  }
  const joints: Joint[] = []
  for (const pieces of byLayer.values()) {
    const degree = new Map<string, number>()
    for (const s of pieces) for (const p of [s.a, s.b]) degree.set(keyOf(p), (degree.get(keyOf(p)) ?? 0) + 1)
    for (const chain of chainSegments(pieces)) {
      let run: Pt[] = [chain[0]!]
      for (let i = 1; i < chain.length; i++) {
        run.push(chain[i]!)
        const k = keyOf(chain[i]!)
        if (i < chain.length - 1 && (stops.has(k) || degree.get(k) !== 2)) {
          joints.push({ pts: run })
          run = [chain[i]!]
        }
      }
      if (run.length >= 2) joints.push({ pts: run })
    }
  }
  return { fixed, joints }
}

/**
 * Lines left ending in open paper once repair took a stretch out: a
 * removable stretch whose end no other line holds is taken out too (it
 * bounds nothing); a fixed line left hanging means the repair broke the
 * picture, so the page is refused. Returns false in that case.
 */
function pruneDangling(composed: Composed, removed: Set<number>): boolean {
  const fixedSegs = (Object.keys(composed.fixed) as CbnInk[]).flatMap((ink) => composed.fixed[ink])
  for (let changed = true; changed; ) {
    changed = false
    // Every standing segment, with an id; joints remember which ids are theirs.
    const segs: Seg[] = [...fixedSegs]
    const jointSegs = new Map<number, [number, number]>()
    composed.joints.forEach((j, i) => {
      if (removed.has(i)) return
      const first = segs.length
      segs.push(...polylineSegments(j.pts))
      jointSegs.set(i, [first, segs.length - 1])
    })
    const index = new SegmentIndex()
    const degree = new Map<string, number>()
    segs.forEach((s, id) => {
      index.add(s, id)
      for (const p of [s.a, s.b]) degree.set(keyOf(p), (degree.get(keyOf(p)) ?? 0) + 1)
    })
    // An end is held when another segment ends there too, or passes through it.
    const held = (p: Pt, own: number) => (degree.get(keyOf(p)) ?? 0) >= 2 || index.near(p, 0.9, (o) => o === own)
    for (const [i, [first, last]] of jointSegs) {
      if (!held(segs[first]!.a, first) || !held(segs[last]!.b, last)) {
        removed.add(i)
        changed = true
      }
    }
    if (changed) continue
    // Only where a stretch was taken out can a fixed line have lost its hold.
    const gone = new SegmentIndex()
    composed.joints.forEach((j, i) => {
      if (removed.has(i)) polylineSegments(j.pts).forEach((s) => gone.add(s, i))
    })
    for (let id = 0; id < fixedSegs.length; id++) {
      const s = fixedSegs[id]!
      for (const p of [s.a, s.b]) if (gone.near(p, 0.9, () => false) && !held(p, id)) return false
    }
  }
  return true
}

function rasterLines(composed: Composed, removed: ReadonlySet<number>): InkPolyline[] {
  const out: InkPolyline[] = []
  for (const ink of Object.keys(composed.fixed) as CbnInk[]) {
    for (const pts of chainSegments(composed.fixed[ink])) out.push({ pts, width: CBN_INK_WIDTH[ink] })
  }
  composed.joints.forEach((j, i) => {
    if (!removed.has(i)) out.push({ pts: j.pts, width: CBN_INK_WIDTH.line, joint: i })
  })
  return out
}

function toRuns(composed: Composed, removed: ReadonlySet<number>): CbnInkRun[] {
  const line = [...composed.fixed.line, ...composed.joints.flatMap((j, i) => (removed.has(i) ? [] : polylineSegments(j.pts)))]
  const segs: Record<CbnInk, Seg[]> = { frame: composed.fixed.frame, outline: composed.fixed.outline, line }
  return (Object.keys(segs) as CbnInk[])
    .filter((ink) => segs[ink].length > 0)
    .map((ink) => ({ ink, width: CBN_INK_WIDTH[ink], lines: chainSegments(segs[ink]) }))
}

/** Exact clear distance from `p` to the nearest printed line's edge. */
export function clearanceAt(p: Pt, runs: readonly CbnInkRun[], limit = Infinity): number {
  let best = limit
  for (const run of runs) {
    const half = run.width / 2
    for (const line of run.lines) {
      for (let i = 1; i < line.length; i++) {
        const a = line[i - 1]!
        const b = line[i]!
        if (Math.min(a.x, b.x) - best - half > p.x || Math.max(a.x, b.x) + best + half < p.x) continue
        if (Math.min(a.y, b.y) - best - half > p.y || Math.max(a.y, b.y) + best + half < p.y) continue
        best = Math.min(best, distToSegment(p, a, b) - half)
      }
    }
  }
  return best
}

const MAX_REPAIRS = 40
/** Spacing of the probes that find which parts touch, canvas px. */
const PROBE_STEP = 4

/** Measured drawings: `key|rules` → smallest scale. Bounded by the library (722 versions × 3 levels). */
const scaleFloors = new Map<string, number>()
/** Size a drawing is measured at, canvas px along its longer side. */
const MEASURE_PX = 3 * 96
/** Clear width a space loses to the lines round it, canvas px (about one line weight). */
const INK_LOSS = 2.6

/**
 * The smallest scale (drawing units → canvas px) at which every space of
 * this drawing holds a number of `rules.minNumberSize` and clears
 * `rules.minArea`. The drawing is printed alone to a grid at a reference
 * size and each of its spaces measured — pieces, and the gaps it encloses
 * (the inside of a handle); a space's clear width grows with the scale less
 * the ink round it, its area with the square. The page then never prints the
 * subject smaller than this, so its spaces are never the ones that fail.
 */
export function cbnDrawingScaleFloor(drawing: SubjectDrawing, rules: CbnSpaceRules, cacheKey?: string): number {
  const key = cacheKey ? `${cacheKey}|${rules.minNumberSize}|${Math.round(rules.minArea)}` : null
  const hit = key ? scaleFloors.get(key) : undefined
  if (hit !== undefined) return hit
  const raw = drawingBounds(drawing)
  const kRef = MEASURE_PX / Math.max(raw.maxX - raw.minX, raw.maxY - raw.minY)
  const placed = placeDrawing(drawing, kRef, 80, 80)
  const b = drawingBounds(placed)
  const outer = { minX: b.minX - 60, minY: b.minY - 60, maxX: b.maxX + 60, maxY: b.maxY + 60 }
  const frame = rect(outer.minX, outer.minY, outer.maxX - outer.minX, outer.maxY - outer.minY)
  const panel = toRegion(frame)
  const layers = [
    { ring: frame, unit: 'sky', subject: false },
    ...placed.pieces.map((piece, i) => ({ ring: piece.ring, unit: `s${i}`, subject: true })),
  ]
  const scene: SceneLines = {
    frame,
    panel,
    layers,
    strokes: placed.strokes.map((s) => ({ pts: s.pts, layer: s.under })),
  }
  const regions = layers.map((l, i) => (i === 0 ? panel : toRegion(l.ring)))
  const report = rasterCheck(rasterLines(composeLines(scene, regions), new Set()), { ...outer, minX: outer.minX - 4, minY: outer.minY - 4, maxX: outer.maxX + 4, maxY: outer.maxY + 4 })
  const minWidth = 2 * cbnNumberRadius(rules.minNumberSize) * GRID_SLACK
  let need = 0
  for (const r of report.regions) {
    // The paper round the drawing is the scene's, not the drawing's.
    const inside = r.deepest.x > b.minX && r.deepest.x < b.maxX && r.deepest.y > b.minY && r.deepest.y < b.maxY
    if (!inside || isSpeck(r)) continue
    const byWidth = (kRef * (minWidth + INK_LOSS)) / Math.max(1e-6, r.width + INK_LOSS)
    const byArea = kRef * Math.sqrt(rules.minArea / Math.max(1e-6, r.area))
    need = Math.max(need, byWidth, byArea)
  }
  const floor = need * 1.04
  if (key) scaleFloors.set(key, floor)
  return floor
}

/**
 * Paint a scene: lines, spaces, colors and numbers, or the reason it cannot
 * be printed as a clean Color by Number page.
 */
export function paintScene(options: {
  scene: CbnScene
  /** Raster box, canvas px (the panel's box). */
  box: Bounds
  rules: CbnSpaceRules
  palette: CbnPalette
  subjectId: string
  /** Preferred colors for subject piece i (see `CBN_PIECE_HINTS`). */
  pieceHint?: (index: number) => readonly CbnColorId[] | undefined
  /** Spaces allowed on the page. */
  spaces: { min: number; max: number }
}): CbnArtResult {
  const { scene, box, rules, palette, subjectId } = options
  const regions = scene.layers.map((l, i) => (i === 0 ? scene.panel : toRegion(l.ring)))
  const composed = composeLines(scene, regions)
  const minWidth = 2 * cbnNumberRadius(rules.minNumberSize) * GRID_SLACK
  const bad = (r: RasterRegion) => !isSpeck(r) && (r.width < minWidth || r.area < rules.minArea)

  const removed = new Set<number>()
  let report = rasterCheck(rasterLines(composed, removed), box, { detail: bad })
  let repairs = 0
  for (; repairs <= MAX_REPAIRS; repairs++) {
    let fixedAny = false
    let stuck: RasterRegion | null = null
    for (const region of report.regions) {
      if (!bad(region)) continue
      let best = -1
      let bestCount = 0
      for (const [joint, count] of region.joints) {
        if (!removed.has(joint) && count > bestCount) (best = joint), (bestCount = count)
      }
      if (best >= 0) {
        removed.add(best)
        fixedAny = true
      } else stuck = stuck ?? region
    }
    if (stuck) {
      const unit = scene.layers[topLayerAt(stuck.deepest, regions)]!.unit
      return { ok: false, reason: 'A space is too small to hold a readable number.', runs: toRuns(composed, removed), at: stuck.deepest, unit }
    }
    if (!fixedAny) break
    report = rasterCheck(rasterLines(composed, removed), box, { detail: bad })
  }
  if (repairs > MAX_REPAIRS) return { ok: false, reason: 'The scene could not be made colorable.' }
  if (removed.size > 0) {
    const before = removed.size
    if (!pruneDangling(composed, removed)) return { ok: false, reason: 'Repairing a sliver would leave a line hanging.' }
    // Pruning only ever merges spaces, so nothing it leaves can be too small.
    if (removed.size !== before) report = rasterCheck(rasterLines(composed, removed), box)
  }

  const runs = toRuns(composed, removed)
  const spaces = report.regions.filter((r) => !isSpeck(r))
  if (spaces.length < options.spaces.min) return { ok: false, reason: 'The scene has too few spaces to be a Color by Number page.' }
  if (spaces.length > options.spaces.max) return { ok: false, reason: 'The scene has too many spaces to color comfortably.' }

  // Which part each space belongs to, and which parts touch.
  const unitOf = (p: Pt) => scene.layers[topLayerAt(p, regions)]!.unit
  const spaceUnits = spaces.map((r) => unitOf(r.deepest))
  const touching = new Map<string, Set<string>>()
  const link = (a: string, b: string) => {
    if (a === b) return
    if (!touching.has(a)) touching.set(a, new Set())
    if (!touching.has(b)) touching.set(b, new Set())
    touching.get(a)!.add(b)
    touching.get(b)!.add(a)
  }
  for (const run of runs) {
    if (run.ink === 'frame') continue
    const e = run.width / 2 + 1.5
    for (const line of run.lines) {
      // Probe both sides of every edge every few pixels: a long straight edge
      // may be hidden in the middle and touch a different neighbour at each end.
      let carry = 0
      for (let i = 1; i < line.length; i++) {
        const a = line[i - 1]!
        const b = line[i]!
        const len = Math.hypot(b.x - a.x, b.y - a.y)
        if (len === 0) continue
        const nx = -(b.y - a.y) / len
        const ny = (b.x - a.x) / len
        let at = carry
        for (; at < len; at += PROBE_STEP) {
          const m = pt(a.x + ((b.x - a.x) * at) / len, a.y + ((b.y - a.y) * at) / len)
          const p = pt(m.x + nx * e, m.y + ny * e)
          const q = pt(m.x - nx * e, m.y - ny * e)
          if (inRegion(p, scene.panel) && inRegion(q, scene.panel)) link(unitOf(p), unitOf(q))
        }
        carry = at - len
      }
    }
  }

  const unitMap = new Map<string, CbnUnit>()
  spaces.forEach((r, i) => {
    const id = spaceUnits[i]!
    const layer = scene.layers.find((l) => l.unit === id)!
    const unit = unitMap.get(id) ?? { id, ...(layer.role ? { role: layer.role } : {}), area: 0, spaces: 0 }
    unit.area += r.area
    unit.spaces += 1
    unitMap.set(id, unit)
  })
  const coloring = colorUnits({ units: [...unitMap.values()], touching, palette, subjectId, pieceHint: options.pieceHint })
  if (!coloring.ok) return { ok: false, reason: coloring.reason }
  const { colors, legend } = coloring.coloring
  let clashes = 0
  for (const [a, set] of touching) for (const b of set) if (a < b && colors.has(a) && colors.get(a) === colors.get(b)) clashes++

  const labels: CbnLabel[] = []
  const perNumber = legend.map(() => 0)
  for (let i = 0; i < spaces.length; i++) {
    const region = spaces[i]!
    const color = colors.get(spaceUnits[i]!)
    const n = color ? legend.indexOf(color) + 1 : 0
    if (n <= 0) return { ok: false, reason: 'A space has no color on the key.' }
    const clearance = clearanceAt(region.deepest, runs, cbnNumberRadius(rules.numberSize) * 2)
    const size = clearance >= cbnNumberRadius(rules.numberSize) ? rules.numberSize : clearance >= cbnNumberRadius(rules.minNumberSize) ? rules.minNumberSize : 0
    if (size === 0) return { ok: false, reason: 'A number would sit against a line.', runs, at: region.deepest }
    labels.push({ x: region.deepest.x, y: region.deepest.y, n, size, clearance })
    perNumber[n - 1]! += 1
  }

  const largest = spaces.reduce((a, b) => (b.area > a.area ? b : a))
  const pb = scene.panel.bounds
  const panelArea = (pb.maxX - pb.minX) * (pb.maxY - pb.minY)
  return {
    ok: true,
    runs,
    labels,
    legend,
    spaces: spaces.length,
    narrowest: Math.min(...spaces.map((r) => r.width)),
    smallest: Math.min(...spaces.map((r) => r.area)),
    largestShare: largest.area / panelArea,
    largestUnit: spaceUnits[spaces.indexOf(largest)]!,
    inkShare: report.inkShare,
    perNumber,
    clashes,
    subject: scene.subject,
    panel: pb,
    repairs,
    composition: scene.drawn,
  }
}
