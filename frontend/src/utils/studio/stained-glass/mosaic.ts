import { DPI } from '@/types/canvas-settings.types'
import type { StudioRng } from '../studio-rng'
import type { SgComposition } from './composition'
import { DEFAULT_FRAME_CORNER, buildFrame, frameTopRise } from './frame'
import {
  chainSegments,
  cutSegments,
  dist,
  distToRing,
  distToSegment,
  ellipseRing,
  inRegion,
  polylineSegments,
  pt,
  ringSegments,
  toRegion,
  voronoiEdges,
  type Bounds,
  type Pt,
  type Region,
  type Ring,
  type Seg,
} from './geometry'
import { rasterCheck, type InkPolyline, type RasterRegion } from './raster'
import { drawingBounds, placeDrawing, type SubjectDrawing } from './subject-kit'

/**
 * One stained-glass panel: frame, scenery, subject and the mosaic around it.
 *
 * The panel is built as layers of glass, bottom first — the background, then
 * scenery (sun, medallion, ground), then each piece of the subject — and each
 * layer can be cut into cells by the Voronoi diagram of its own seeds. A line
 * prints only where no higher layer covers it, so the background's cells stop
 * at the subject's outline instead of running through it, and the subject is
 * always drawn whole on top.
 *
 * The finished lines are then printed to a grid and every enclosed region is
 * measured (`raster.ts`). A region too small or too narrow to color loses the
 * mosaic joint it shares most edge with, which merges it into the cell next
 * door, and the page is measured again until every region passes. Outlines
 * of the drawing, the scenery and the frame are never removed, so a region
 * they alone make too small cannot be repaired: the panel is refused rather
 * than printed.
 */

export type SgInk = 'frame' | 'band' | 'silhouette' | 'part' | 'accent' | 'cell'

/** Print weights in canvas px (96 per inch): from 3 pt for the frame down to 1.5 pt for the glass joints. */
export const SG_INK_WIDTH: Readonly<Record<SgInk, number>> = {
  frame: 4,
  band: 2.75,
  silhouette: 3.5,
  part: 2.5,
  accent: 2.5,
  cell: 2,
}

export interface SgDetail {
  /** Target spacing of background cells, canvas px. */
  cell: number
  /** Target spacing of cells inside a subject piece. */
  subjectCell: number
  /** Narrowest region a mosaic cell may leave (clear diameter), canvas px. */
  minWidth: number
  /** Smallest region a mosaic cell may leave, canvas px². */
  minArea: number
}

/**
 * The floor under every level: what a drawn piece, a border tile or a scene
 * shape must clear, since those cannot be merged away. About an eighth of an
 * inch across — still a comfortable fill with a pencil or fine marker.
 */
export const SG_FLOOR = { minWidth: 10.5, minArea: 300 } as const

/**
 * Paper pinched off where two heavy lines meet at a sharp angle: a few
 * pixels, or a pinch under a millimetre across. It prints as ink
 * spread, not as a piece anyone would color, so it is not a region.
 */
export const SG_SPECK_AREA = 24
const SG_HAIRLINE = { width: 4, area: 64 } as const
const isSpeck = (r: RasterRegion) => r.area <= SG_SPECK_AREA || (r.width <= SG_HAIRLINE.width && r.area <= SG_HAIRLINE.area)

/**
 * Smallest the subject may print: its longer side at least this share of the
 * glass it sits in, and at least this many inches. Any smaller and it is a
 * detail in a pattern, not the picture on the page.
 */
export const SG_MIN_SUBJECT_SHARE = 0.42
export const SG_MIN_SUBJECT_INCHES = 1.9

/**
 * A style's fill (`SgMosaicStyle.fill`) may leave more glass round the
 * subject, but never takes its longer side below this. Every drawing is
 * proven colorable at a smaller size than this (the library tests), so a
 * smaller fill only ever shrinks subjects that have room to spare: on a small
 * trim the subject fills its stage as it always did.
 */
export const SG_FILL_FLOOR_INCHES = 2.6

/**
 * The book's pen and proportions (see `style.ts`). Every field is optional;
 * the defaults are the reference look.
 */
export interface SgMosaicStyle {
  /** Print weight of each kind of line, canvas px. */
  ink?: Readonly<Record<SgInk, number>>
  /** Width of the border band, inches. */
  bandInches?: number
  /** Length a border tile aims for, inches. */
  tileInches?: number
  /** Rounded windows: corner radius as a share of the shorter side. */
  corner?: number
  /** Share of the stage the subject fills, (0, 1]. Never below what the preflight accepts. */
  fill?: number
  /** Scales the cells inside the subject's pieces. */
  subjectCellScale?: number
}

export interface SgMosaicInput {
  /** Where the panel is drawn, canvas px. */
  box: Bounds
  drawing: SubjectDrawing
  /** The subject stands on the ground; otherwise it floats above any scenery (a balloon, a butterfly). */
  grounded?: boolean
  composition: SgComposition
  detail: SgDetail
  rng: StudioRng
  style?: SgMosaicStyle
}

export interface SgInkRun {
  ink: SgInk
  /** Print weight, canvas px. */
  width: number
  lines: Pt[][]
}

export interface SgMosaic {
  runs: SgInkRun[]
  /** Enclosed regions a reader colors. */
  regions: number
  /** Narrowest and smallest regions on the page, for the preflight. */
  narrowest: number
  smallest: number
  /** Where the subject landed, and the glass area it sits in. */
  subject: Bounds
  panel: Bounds
  /** How many repair passes the page needed. */
  repairs: number
  /** Share of the panel's box covered by ink, 0..1. */
  inkShare: number
  /** Mosaic joints dealt, and how many repair took out. */
  joints: { total: number; removed: number }
}

export type SgMosaicFailure = { ok: false; reason: string; runs?: SgInkRun[]; at?: Pt; region?: { width: number; area: number } }
export type SgMosaicResult = ({ ok: true } & SgMosaic) | SgMosaicFailure

type LayerKind = 'background' | 'accent' | 'subject'

interface Layer {
  kind: LayerKind
  /** The glass this layer occupies; the whole panel for the background. */
  region: Region
  seeds: Pt[]
}

const BAND_INCH = 0.26
const TILE_INCH = 0.95

/* ------------------------------------------------------------------ *
 * Seeds
 * ------------------------------------------------------------------ */

/** True when `p` is clear glass for a background seed: inside the panel, off every occluder, with room to spare. */
function freeFor(p: Pt, panel: Region, occluders: readonly Region[], clearance: number): boolean {
  if (!inRegion(p, panel) || distToRing(p, panel.ring) < clearance) return false
  for (const o of occluders) {
    if (p.x < o.bounds.minX - clearance || p.x > o.bounds.maxX + clearance) continue
    if (p.y < o.bounds.minY - clearance || p.y > o.bounds.maxY + clearance) continue
    if (inRegion(p, o) || distToRing(p, o.ring) < clearance) return false
  }
  return true
}

/** Dart throwing with a spacing that may vary over the panel. */
function poisson(rng: StudioRng, b: Bounds, spacing: (p: Pt) => number, accept: (p: Pt) => boolean, tries = 30): Pt[] {
  const out: Pt[] = []
  const area = (b.maxX - b.minX) * (b.maxY - b.minY)
  const base = spacing(pt((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2))
  const attempts = Math.ceil((area / (base * base)) * tries)
  for (let i = 0; i < attempts; i++) {
    const p = pt(b.minX + rng.next() * (b.maxX - b.minX), b.minY + rng.next() * (b.maxY - b.minY))
    const r = spacing(p)
    if (out.some((q) => dist(p, q) < Math.max(r, spacing(q)) * 0.92)) continue
    if (accept(p)) out.push(p)
  }
  return out
}

/**
 * Lloyd relaxation on a sample grid: each seed moves to the mean of the glass
 * nearest it. Evens out cell sizes, and with them the slivers.
 */
function relax(seeds: Pt[], samples: readonly Pt[], rounds: number, stillValid: (p: Pt) => boolean): Pt[] {
  let current = seeds
  for (let r = 0; r < rounds && current.length > 1; r++) {
    const sx = new Float64Array(current.length)
    const sy = new Float64Array(current.length)
    const n = new Int32Array(current.length)
    for (const s of samples) {
      let best = 0
      let bestD = Infinity
      for (let i = 0; i < current.length; i++) {
        const d = (current[i]!.x - s.x) ** 2 + (current[i]!.y - s.y) ** 2
        if (d < bestD) (bestD = d), (best = i)
      }
      sx[best] += s.x
      sy[best] += s.y
      n[best]++
    }
    current = current.map((p, i) => {
      if (n[i] === 0) return p
      const q = pt(sx[i]! / n[i]!, sy[i]! / n[i]!)
      return stillValid(q) ? q : p
    })
  }
  return current
}

function gridSamples(b: Bounds, step: number, keep: (p: Pt) => boolean): Pt[] {
  const out: Pt[] = []
  for (let y = b.minY + step / 2; y < b.maxY; y += step) {
    for (let x = b.minX + step / 2; x < b.maxX; x += step) {
      const p = pt(x, y)
      if (keep(p)) out.push(p)
    }
  }
  return out
}

function backgroundSeeds(options: {
  pattern: SgComposition['pattern']
  rng: StudioRng
  panel: Region
  occluders: readonly Region[]
  cell: number
  focus: Pt
  rayOrigin: Pt
}): Pt[] {
  const { pattern, rng, panel, occluders, cell, focus, rayOrigin } = options
  const b = panel.bounds
  const clearance = cell * 0.34
  const free = (p: Pt) => freeFor(p, panel, occluders, clearance)
  const reach = Math.max(
    ...[pt(b.minX, b.minY), pt(b.maxX, b.minY), pt(b.minX, b.maxY), pt(b.maxX, b.maxY)].map((c) => dist(c, focus)),
  )

  // Concentric courses round the subject, like a rose window.
  const ringsPattern = (): Pt[] => {
    const out: Pt[] = []
    for (let r = cell * 0.9; r < reach + cell; r += cell * 0.92) {
      const count = Math.max(6, Math.round((2 * Math.PI * r) / cell))
      const offset = rng.next() * Math.PI * 2
      for (let i = 0; i < count; i++) {
        const a = offset + ((i + (rng.next() - 0.5) * 0.3) / count) * Math.PI * 2
        const rr = r + (rng.next() - 0.5) * cell * 0.2
        const p = pt(focus.x + rr * Math.cos(a), focus.y + rr * Math.sin(a))
        if (free(p)) out.push(p)
      }
    }
    return out
  }

  // Long cells fanning from the sun, or from below like a sunrise.
  const raysPattern = (): Pt[] => {
    const out: Pt[] = []
    const far = Math.max(
      ...[pt(b.minX, b.minY), pt(b.maxX, b.minY), pt(b.minX, b.maxY), pt(b.maxX, b.maxY)].map((c) => dist(c, rayOrigin)),
    )
    // Rays spaced so cells stay about a cell wide halfway out.
    const count = Math.max(10, Math.round((Math.PI * far) / (cell * 1.1)))
    const offset = rng.next()
    for (let i = 0; i < count; i++) {
      const a = ((i + offset) / count) * Math.PI * 2
      for (let d = cell * 0.8; d < far + cell; d *= 1.32) {
        const dd = d + (rng.next() - 0.5) * cell * 0.3
        const p = pt(rayOrigin.x + dd * Math.cos(a), rayOrigin.y + dd * Math.sin(a))
        if (free(p) && d > cell * 0.6) out.push(p)
      }
    }
    return out.filter((p, i) => out.findIndex((q) => dist(p, q) < cell * 0.45) === i)
  }

  // Regular quarries: diamonds on the diagonal, or six-sided cells in courses.
  // The grid's origin is dealt, so no two pages share their joints.
  const latticePattern = (kind: 'lattice' | 'honeycomb'): Pt[] => {
    const out: Pt[] = []
    const honey = kind === 'honeycomb'
    const s = cell * (honey ? 0.97 : 0.9)
    const rowStep = honey ? (s * Math.sqrt(3)) / 2 : s
    const angle = honey ? (rng.chance(0.5) ? 0 : Math.PI / 2) : Math.PI / 4
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const cx = (b.minX + b.maxX) / 2
    const cy = (b.minY + b.maxY) / 2
    const ox = rng.next() * s
    const oy = rng.next() * rowStep
    const span = Math.hypot(b.maxX - b.minX, b.maxY - b.minY) / 2 + s
    const rows = Math.ceil(span / rowStep)
    const cols = Math.ceil(span / s)
    for (let j = -rows; j <= rows; j++) {
      for (let i = -cols; i <= cols; i++) {
        const u = (i + (honey && j & 1 ? 0.5 : 0)) * s + ox + (rng.next() - 0.5) * s * 0.06
        const v = j * rowStep + oy + (rng.next() - 0.5) * s * 0.06
        const p = pt(cx + u * cos - v * sin, cy + u * sin + v * cos)
        if (free(p)) out.push(p)
      }
    }
    return out
  }

  if (pattern === 'lattice' || pattern === 'honeycomb') return fillGaps(rng, latticePattern(pattern), b, cell, free)
  if (pattern === 'rings') return fillGaps(rng, ringsPattern(), b, cell, free)
  if (pattern === 'rays') return fillGaps(rng, raysPattern(), b, cell, free)
  const spacing =
    pattern === 'graded'
      ? (p: Pt) => cell * (0.72 + 0.62 * Math.min(1, dist(p, focus) / reach))
      : () => cell * 0.9
  const seeds = poisson(rng, b, spacing, free)
  const samples = gridSamples(b, cell / 5, (p) => freeFor(p, panel, occluders, 0))
  return fillGaps(rng, relax(seeds, samples, pattern === 'graded' ? 1 : 2, free), b, cell, free)
}

/**
 * Seeds for any open glass a pattern left bare — beside a subject, in a
 * corner the rings never reached — so no background cell grows to a size
 * that reads as a hole in the design.
 */
function fillGaps(rng: StudioRng, seeds: Pt[], b: Bounds, cell: number, free: (p: Pt) => boolean): Pt[] {
  const out = [...seeds]
  const area = (b.maxX - b.minX) * (b.maxY - b.minY)
  const attempts = Math.ceil((area / (cell * cell)) * 40)
  for (let i = 0; i < attempts; i++) {
    const p = pt(b.minX + rng.next() * (b.maxX - b.minX), b.minY + rng.next() * (b.maxY - b.minY))
    if (out.every((q) => dist(p, q) >= cell * 0.95) && free(p)) out.push(p)
  }
  return out
}

/**
 * Seeds along the middle of a ground band, about a cell and a half apart, so
 * the band is cut across into tiles rather than into a jumble.
 */
function bandSeeds(rng: StudioRng, region: Region, covers: readonly Region[], panel: Region, cell: number): Pt[] {
  const b = panel.bounds
  const visible = (p: Pt) => inRegion(p, region) && inRegion(p, panel) && !covers.some((c) => inRegion(p, c))
  const out: Pt[] = []
  const step = cell * 1.45
  const start = b.minX + rng.next() * step * 0.5
  for (let x = start; x < b.maxX; x += step * (0.85 + rng.next() * 0.3)) {
    let best: [number, number] | null = null
    let runStart: number | null = null
    for (let y = b.minY; y <= b.maxY + 3; y += 3) {
      const inside = y <= b.maxY && visible(pt(x, y))
      if (inside && runStart === null) runStart = y
      if (!inside && runStart !== null) {
        if (!best || y - runStart > best[1] - best[0]) best = [runStart, y]
        runStart = null
      }
    }
    if (!best || best[1] - best[0] < cell * 0.35) continue
    const p = pt(x, (best[0] + best[1]) / 2)
    if (distToRing(p, panel.ring) > cell * 0.3) out.push(p)
  }
  return out.length >= 2 ? out : []
}

/** Seeds for a layer's own visible glass (a subject piece, a hill), relaxed. */
function layerSeeds(rng: StudioRng, region: Region, covers: readonly Region[], cell: number, max: number): Pt[] {
  const visible = (p: Pt) => inRegion(p, region) && !covers.some((c) => inRegion(p, c))
  const samples = gridSamples(region.bounds, cell / 6, visible)
  const area = samples.length * (cell / 6) ** 2
  const count = Math.min(max, Math.floor(area / (cell * cell)))
  if (count < 2) return []
  const clear = (p: Pt) => visible(p) && distToRing(p, region.ring) > cell * 0.3 && !covers.some((c) => distToRing(p, c.ring) < cell * 0.3)
  const pool = rng.shuffle(samples.filter(clear))
  const seeds: Pt[] = []
  for (const p of pool) {
    if (seeds.length >= count) break
    if (seeds.every((q) => dist(p, q) > cell * 0.8)) seeds.push(p)
  }
  return seeds.length < 2 ? [] : relax(seeds, samples, 3, clear)
}

/** Seeds evenly round an ellipse, so the cells between them are wedges: rays, or a medallion. */
function ringSeeds(rng: StudioRng, cx: number, cy: number, rx: number, ry: number, count: number): Pt[] {
  const offset = rng.next()
  return Array.from({ length: count }, (_, i) => {
    const a = ((i + offset) / count) * Math.PI * 2
    return pt(cx + rx * Math.cos(a), cy + ry * Math.sin(a))
  })
}

/* ------------------------------------------------------------------ *
 * Scenery
 * ------------------------------------------------------------------ */

function wave(b: Bounds, top: number, amplitude: number, wavelength: number, phase: number): Ring {
  const pad = 30
  const out: Pt[] = []
  const stepsN = Math.max(24, Math.ceil((b.maxX - b.minX + pad * 2) / 8))
  for (let i = 0; i <= stepsN; i++) {
    const x = b.minX - pad + ((b.maxX - b.minX + pad * 2) * i) / stepsN
    out.push(pt(x, top + amplitude * Math.sin((2 * Math.PI * x) / wavelength + phase)))
  }
  out.push(pt(b.maxX + pad, b.maxY + pad), pt(b.minX - pad, b.maxY + pad))
  return out
}

/** Ground bands, back first. `top` is where the subject stands. */
function sceneryRings(kind: NonNullable<SgComposition['scenery']>, b: Bounds, top: number, rng: StudioRng): Ring[] {
  const w = b.maxX - b.minX
  const h = b.maxY - b.minY
  const phase = () => rng.next() * Math.PI * 2
  switch (kind) {
    case 'hills':
      return [wave(b, top - h * 0.05, h * 0.035, w * 0.95, phase()), wave(b, top + h * 0.095, h * 0.025, w * 1.3, phase())]
    case 'dunes':
      return [wave(b, top - h * 0.03, h * 0.025, w * 1.4, phase()), wave(b, top + h * 0.08, h * 0.02, w * 0.9, phase())]
    case 'waves': {
      const len = w / 3.2
      return [-0.01, 0.095, 0.17].map((at, i) => wave(b, top + h * at, h * 0.016, len * (1 + i * 0.15), phase()))
    }
  }
}

/* ------------------------------------------------------------------ *
 * Lines
 * ------------------------------------------------------------------ */

interface Built {
  layers: Layer[]
  subjectStart: number
  strokes: { pts: Pt[]; layer: number }[]
  panel: Region
  frameSegs: { outer: Seg[]; band: Seg[] }
}

/**
 * A line repair may take out: one mosaic joint, or a stretch of scenery line
 * (a hill top, a medallion ring) that runs from the subject to the subject —
 * through the gap under a handle, between a stem and a leaf. Without that
 * stretch the scenery simply passes behind the subject, which is how it reads
 * anyway; with it, the line can pinch a sliver against the subject that no
 * one could color.
 */
interface Joint {
  pts: Pt[]
  ink: 'cell' | 'accent'
}

/** A page's lines before repair: fixed ink by weight, and every removable line on its own. */
interface Composed {
  fixed: Record<SgInk, Seg[]>
  joints: Joint[]
}

function composeLines(built: Built): Composed {
  const { layers, subjectStart, strokes, panel, frameSegs } = built
  const regions = layers.map((l) => l.region)
  const subjectRegions = regions.slice(subjectStart)
  const coveredAbove = (p: Pt, index: number) => {
    for (let j = index + 1; j < layers.length; j++) if (inRegion(p, regions[j]!)) return true
    return false
  }
  const inSubject = (p: Pt) => subjectRegions.some((r) => inRegion(p, r))
  const inPanel = (p: Pt) => inRegion(p, panel)
  const fixed: Record<SgInk, Seg[]> = { frame: [], band: [], silhouette: [], part: [], accent: [], cell: [] }
  const joints: Joint[] = []

  layers.forEach((layer, index) => {
    const above = regions.slice(index + 1)
    if (layer.kind !== 'background') {
      const cutters = layer.kind === 'subject' ? [panel, ...subjectRegions] : [panel, ...above]
      for (const piece of cutSegments(ringSegments(layer.region.ring), cutters, (mid) => inPanel(mid) && !coveredAbove(mid, index))) {
        if (layer.kind === 'accent') {
          fixed.accent.push(piece)
          continue
        }
        // Heavy where the subject meets anything else, lighter between its own pieces.
        const dx = piece.b.x - piece.a.x
        const dy = piece.b.y - piece.a.y
        const len = Math.hypot(dx, dy) || 1
        const mid = pt((piece.a.x + piece.b.x) / 2, (piece.a.y + piece.b.y) / 2)
        const e = 1.5
        const left = pt(mid.x - (dy / len) * e, mid.y + (dx / len) * e)
        const right = pt(mid.x + (dy / len) * e, mid.y - (dx / len) * e)
        fixed[inSubject(left) && inSubject(right) ? 'part' : 'silhouette'].push(piece)
      }
    }
    if (layer.seeds.length >= 2) {
      const b = layer.region.bounds
      const box = { minX: b.minX - 2, minY: b.minY - 2, maxX: b.maxX + 2, maxY: b.maxY + 2 }
      const inside = (p: Pt) => inRegion(p, layer.region) && inPanel(p) && !coveredAbove(p, index)
      for (const s of cutSegments(voronoiEdges(layer.seeds, box), [panel, layer.region, ...above], inside)) {
        joints.push({ pts: [s.a, s.b], ink: 'cell' })
      }
    }
  })

  for (const stroke of strokes) {
    const segs = cutSegments(polylineSegments(stroke.pts), [panel, ...regions], (mid) => inPanel(mid) && !coveredAbove(mid, stroke.layer))
    for (const s of segs) fixed[inSubject(pt((s.a.x + s.b.x) / 2, (s.a.y + s.b.y) / 2)) ? 'part' : 'silhouette'].push(s)
  }

  // Scenery stretches that start and end on the subject's outline are removable.
  const outline = [...fixed.silhouette, ...fixed.part]
  const onOutline = (p: Pt) => outline.some((s) => distToSegment(p, s.a, s.b) < 1.2)
  const keptAccent: Seg[] = []
  for (const chain of chainSegments(fixed.accent)) {
    if (chain.length >= 2 && onOutline(chain[0]!) && onOutline(chain[chain.length - 1]!)) joints.push({ pts: chain, ink: 'accent' })
    else keptAccent.push(...polylineSegments(chain))
  }
  fixed.accent = keptAccent

  fixed.frame.push(...frameSegs.outer)
  fixed.band.push(...frameSegs.band)
  return { fixed, joints }
}

/** The runs a page prints: fixed ink chained per weight, and the joints still standing. */
function toRuns(composed: Composed, removed: ReadonlySet<number>, ink: Readonly<Record<SgInk, number>>): SgInkRun[] {
  const standing = (ink: Joint['ink']) =>
    composed.joints.flatMap((j, i) => (j.ink === ink && !removed.has(i) ? polylineSegments(j.pts) : []))
  const segs = { ...composed.fixed, cell: standing('cell'), accent: [...composed.fixed.accent, ...standing('accent')] }
  return (Object.keys(segs) as SgInk[])
    .filter((kind) => segs[kind].length > 0)
    .map((kind) => ({ ink: kind, width: ink[kind], lines: chainSegments(segs[kind]) }))
}

/**
 * Take out joints left hanging by repair. Removing two of the three joints
 * that meet at a corner leaves the third ending in open glass — a stray line
 * that bounds nothing and reads as a mistake. A joint end is held when another
 * standing joint shares it or it lands on fixed ink (an outline or the frame).
 */
function pruneDangling(composed: Composed, removed: Set<number>): void {
  const key = (p: Pt) => `${Math.round(p.x * 4)},${Math.round(p.y * 4)}`
  const fixedSegs = [
    ...Object.values(composed.fixed).flat(),
    ...composed.joints.flatMap((j, i) => (j.ink === 'accent' && !removed.has(i) ? polylineSegments(j.pts) : [])),
  ]
  const onFixed = new Map<string, boolean>()
  const landsOnFixed = (p: Pt) => {
    const k = key(p)
    let hit = onFixed.get(k)
    if (hit === undefined) {
      hit = fixedSegs.some((s) => distToSegment(p, s.a, s.b) < 0.75)
      onFixed.set(k, hit)
    }
    return hit
  }
  for (let changed = true; changed; ) {
    changed = false
    const degree = new Map<string, number>()
    composed.joints.forEach((j, i) => {
      if (removed.has(i) || j.ink !== 'cell') return
      for (const p of j.pts) degree.set(key(p), (degree.get(key(p)) ?? 0) + 1)
    })
    composed.joints.forEach((j, i) => {
      if (removed.has(i) || j.ink !== 'cell') return
      const loose = j.pts.some((p) => degree.get(key(p)) === 1 && !landsOnFixed(p))
      if (loose) {
        removed.add(i)
        changed = true
      }
    })
  }
}

function rasterLines(composed: Composed, removed: ReadonlySet<number>, ink: Readonly<Record<SgInk, number>>): InkPolyline[] {
  const out: InkPolyline[] = []
  for (const kind of Object.keys(composed.fixed) as SgInk[]) {
    for (const pts of chainSegments(composed.fixed[kind])) out.push({ pts, width: ink[kind] })
  }
  composed.joints.forEach((j, i) => {
    if (!removed.has(i)) out.push({ pts: j.pts, width: ink[j.ink], joint: i })
  })
  return out
}

/* ------------------------------------------------------------------ *
 * The panel
 * ------------------------------------------------------------------ */

const MAX_REPAIRS = 24

export function buildMosaic(input: SgMosaicInput): SgMosaicResult {
  const { box, drawing, composition, detail, rng, grounded = true, style = {} } = input
  const ink = style.ink ?? SG_INK_WIDTH
  const inset = ink.frame / 2 + 1
  const frameBounds = { minX: box.minX + inset, minY: box.minY + inset, maxX: box.maxX - inset, maxY: box.maxY - inset }
  const fw = frameBounds.maxX - frameBounds.minX
  const fh = frameBounds.maxY - frameBounds.minY
  if (fw <= 0 || fh <= 0) return { ok: false, reason: 'The page has no room for the panel.' }

  const band = composition.border === 'none' ? 0 : (style.bandInches ?? BAND_INCH) * DPI
  const frame = buildFrame({
    kind: composition.frame,
    border: composition.border,
    bounds: frameBounds,
    band,
    tile: (style.tileInches ?? TILE_INCH) * DPI,
    corner: style.corner ?? DEFAULT_FRAME_CORNER,
  })
  const panel = toRegion(frame.inner)
  const pb = panel.bounds
  const W = pb.maxX - pb.minX
  const H = pb.maxY - pb.minY
  const rise = frameTopRise(composition.frame, W)

  // Stage: where the subject may stand.
  const groundTop = composition.scenery ? pb.maxY - H * (composition.scenery === 'waves' ? 0.24 : 0.2) : null
  const sideMargin = W * (composition.halo ? 0.16 : 0.1)
  const stageTop = pb.minY + Math.max(H * (composition.halo ? 0.12 : 0.08), rise * 0.42) + (composition.sun ? H * 0.04 : 0)
  // A grounded subject stands between the ground lines, clear of both; a
  // floating one hovers over the scenery.
  const standsOn = groundTop !== null && grounded
  const stageBottom =
    groundTop === null
      ? pb.maxY - H * (composition.halo ? 0.1 : 0.07)
      : grounded
        ? groundTop + H * (composition.scenery === 'waves' ? 0.045 : 0.035)
        : groundTop - H * 0.1
  const stage = { minX: pb.minX + sideMargin, maxX: pb.maxX - sideMargin, minY: stageTop, maxY: stageBottom }

  // Place the subject: as much of the stage as the style fills, clear of the frame.
  const raw = drawingBounds(drawing)
  const sw = raw.maxX - raw.minX
  const sh = raw.maxY - raw.minY
  const fullStage = Math.min((stage.maxX - stage.minX) / sw, (stage.maxY - stage.minY) / sh)
  const clearance = Math.max(detail.minWidth * 1.4, 0.22 * DPI)
  // The medallion's band and air are sized by the glass, but capped: with big pieces they would crowd the subject out.
  const ringWidth = Math.min(detail.cell * 0.62, 0.52 * DPI)
  const haloAir = Math.min(detail.cell * 0.55, 0.42 * DPI)
  // A medallion: an ellipse through the subject's farthest point plus a
  // margin, ringed by a band of radiating tiles. It must sit wholly inside the
  // window, clear of the frame, or its ring would pinch slivers against it.
  const haloFor = (d: SubjectDrawing) => {
    const b = drawingBounds(d)
    const c = pt((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2)
    const hx = (b.maxX - b.minX) / 2
    const hy = (b.maxY - b.minY) / 2
    let reach = 0
    for (const piece of d.pieces) for (const p of piece.ring) reach = Math.max(reach, ((p.x - c.x) / hx) ** 2 + ((p.y - c.y) / hy) ** 2)
    const grow = Math.sqrt(reach)
    const rx = hx * grow + haloAir + ringWidth
    const ry = hy * grow + haloAir + ringWidth
    const outer = ellipseRing(c.x, c.y, rx, ry, 120)
    // Below the ground line the scenery covers the medallion, so only what shows must clear the frame.
    const hidden = (p: Pt) => groundTop !== null && p.y > groundTop + H * 0.02
    const fits = outer.every((p) => hidden(p) || (inRegion(p, panel) && distToRing(p, panel.ring) >= clearance))
    return { c, rx, ry, outer, fits }
  }
  // Never smaller than the preflight accepts as the page's picture.
  const smallest = Math.max(SG_MIN_SUBJECT_SHARE / Math.max(sw / W, sh / H), (SG_MIN_SUBJECT_INCHES * DPI) / Math.max(sw, sh))
  const fill = Math.min(1, Math.max(0, style.fill ?? 1))
  const fillFloor = Math.max(smallest, (SG_FILL_FLOOR_INCHES * DPI) / Math.max(sw, sh))
  let k = Math.min(fullStage, Math.max(fullStage * fill, fillFloor))
  let placed: SubjectDrawing | null = null
  for (let tries = 0; tries < 14 && k >= smallest; tries++) {
    const x = (stage.minX + stage.maxX) / 2 - (sw * k) / 2
    const y = standsOn ? stage.maxY - sh * k : (stage.minY + stage.maxY) / 2 - (sh * k) / 2
    const candidate = placeDrawing(drawing, k, x, y)
    const fits =
      candidate.pieces.every((piece) => piece.ring.every((p) => inRegion(p, panel) && distToRing(p, panel.ring) >= clearance)) &&
      (!composition.halo || haloFor(candidate).fits)
    if (fits) {
      placed = candidate
      break
    }
    k *= 0.93
  }
  if (!placed) return { ok: false, reason: 'The subject does not fit inside this window.' }
  const sb = drawingBounds(placed)
  const subjectRegions = placed.pieces.map((piece) => toRegion(piece.ring))
  const center = pt((sb.minX + sb.maxX) / 2, (sb.minY + sb.maxY) / 2)

  // Scenery layers, back to front.
  const accents: Layer[] = []
  let rayOrigin = pt(center.x, pb.maxY + H * 0.15)
  if (composition.sun) {
    const r = Math.min(W, H) * 0.085
    const R = r * 2.05
    // In the top corner, but with its rays wholly clear of the frame: a ray
    // ring grazing a rounded corner would pinch off slivers against it.
    const gap = Math.max(detail.minWidth * 1.5, 0.2 * DPI)
    let cx = composition.sun === 'left' ? pb.minX + W * 0.17 : pb.maxX - W * 0.17
    let cy = pb.minY + H * 0.13
    const mid = pt((pb.minX + pb.maxX) / 2, (pb.minY + pb.maxY) / 2)
    for (let i = 0; i < 80 && (!inRegion(pt(cx, cy), panel) || distToRing(pt(cx, cy), panel.ring) < R + gap); i++) {
      const d = dist(pt(cx, cy), mid) || 1
      cx += ((mid.x - cx) / d) * 3
      cy += ((mid.y - cy) / d) * 3
    }
    const rays = Math.max(8, Math.min(16, Math.floor((2 * Math.PI * r) / (detail.minWidth * 1.8))))
    accents.push({ kind: 'accent', region: toRegion(ellipseRing(cx, cy, R, R, 64)), seeds: ringSeeds(rng, cx, cy, (r + R) / 2, (r + R) / 2, rays) })
    accents.push({ kind: 'accent', region: toRegion(ellipseRing(cx, cy, r, r, 40)), seeds: [] })
    rayOrigin = pt(cx, cy)
  }
  if (composition.halo) {
    const { c, rx, ry, outer } = haloFor(placed)
    const count = Math.max(12, Math.round((Math.PI * (rx + ry)) / (detail.cell * 0.9)))
    const inner = toRegion(ellipseRing(c.x, c.y, rx - ringWidth, ry - ringWidth, 120))
    accents.push({ kind: 'accent', region: toRegion(outer), seeds: ringSeeds(rng, c.x, c.y, rx - ringWidth / 2, ry - ringWidth / 2, count) })
    accents.push({ kind: 'accent', region: inner, seeds: layerSeeds(rng, inner, subjectRegions, detail.cell, 40) })
  }
  if (composition.scenery && groundTop !== null) {
    const rings = sceneryRings(composition.scenery, pb, groundTop, rng)
    rings.forEach((ring, i) => {
      const region = toRegion(ring)
      const covers = [...rings.slice(i + 1).map(toRegion), ...subjectRegions]
      accents.push({ kind: 'accent', region, seeds: bandSeeds(rng, region, covers, panel, detail.cell) })
    })
  }

  const occluders = [...accents.map((a) => a.region), ...subjectRegions]
  const background: Layer = {
    kind: 'background',
    region: panel,
    seeds: backgroundSeeds({
      pattern: composition.pattern,
      rng,
      panel,
      occluders,
      cell: detail.cell,
      focus: composition.pattern === 'rays' ? rayOrigin : center,
      rayOrigin,
    }),
  }

  const subjectLayers: Layer[] = placed.pieces.map((piece, i) => ({
    kind: 'subject',
    region: subjectRegions[i]!,
    seeds: piece.whole ? [] : layerSeeds(rng, subjectRegions[i]!, subjectRegions.slice(i + 1), detail.subjectCell * (style.subjectCellScale ?? 1), 6),
  }))

  const layers = [background, ...accents, ...subjectLayers]
  const subjectStart = 1 + accents.length
  const built: Built = {
    layers,
    subjectStart,
    strokes: placed.strokes.map((s) => ({ pts: s.pts, layer: subjectStart + s.under - 1 })),
    panel,
    frameSegs: {
      outer: ringSegments(frame.outer),
      band: composition.border === 'none' ? [] : [...ringSegments(frame.inner), ...frame.dividers],
    },
  }

  const bad = (r: RasterRegion, floor: boolean) =>
    !isSpeck(r) &&
    (floor ? r.width < SG_FLOOR.minWidth || r.area < SG_FLOOR.minArea : r.width < detail.minWidth || r.area < detail.minArea)

  // Repair: a region too small to color loses the joint it shares most edge
  // with, which merges it into the cell next door. Seeds never move, so the
  // rest of the mosaic stays exactly as it was dealt.
  const composed = composeLines(built)
  const removed = new Set<number>()
  for (let repairs = 0; repairs <= MAX_REPAIRS; repairs++) {
    const report = rasterCheck(rasterLines(composed, removed, ink), box, { detail: (r) => bad(r, false) })
    let fixedAny = false
    let stuck: RasterRegion | null = null
    for (const region of report.regions) {
      if (!bad(region, false)) continue
      // A mosaic joint if one borders the region, else a scenery stretch.
      let best = -1
      let bestScore = 0
      for (const [joint, count] of region.joints) {
        const score = count * (composed.joints[joint]!.ink === 'cell' ? 1000 : 1)
        if (!removed.has(joint) && score > bestScore) (best = joint), (bestScore = score)
      }
      if (best >= 0) {
        removed.add(best)
        fixedAny = true
      } else if (bad(region, true)) {
        stuck = region
      }
    }
    if (!fixedAny) {
      pruneDangling(composed, removed)
      const runs = toRuns(composed, removed, ink)
      if (stuck) return { ok: false, reason: 'A piece of the drawing is too small to color at this size.', runs, at: stuck.deepest, region: { width: stuck.width, area: stuck.area } }
      const regions = report.regions.filter((r) => !isSpeck(r))
      return {
        ok: true,
        runs,
        regions: regions.length,
        narrowest: Math.min(...regions.map((r) => r.width)),
        smallest: Math.min(...regions.map((r) => r.area)),
        subject: sb,
        panel: pb,
        repairs,
        inkShare: report.inkShare,
        joints: { total: composed.joints.length, removed: removed.size },
      }
    }
  }
  return { ok: false, reason: 'The mosaic could not be made colorable.' }
}

