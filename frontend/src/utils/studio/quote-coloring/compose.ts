import type opentype from 'opentype.js'
import type { StudioRng } from '../studio-rng'
import { DPI } from '@/types/canvas-settings.types'
import {
  arcPoints,
  distToRing,
  pointInRing,
  pt,
  type Bounds,
  type Pt,
  type Ring,
} from '../stained-glass/geometry'
import { rasterCheck, type InkPolyline, type RasterRegion } from '../stained-glass/raster'
import type { QcDetailSpec } from './content'
import type { QcLetterStyle } from './fonts'
import { layoutLettering, letteredText, type QcLettering } from './lettering'
import { QC_FILLERS, placeMotif, qcMotif, type QcMotif, type QcMotifSet } from './motifs'

/**
 * One Quote Coloring page, composed and measured.
 *
 * The saying is the picture. It is lettered first, as big as its space
 * allows, and the page is built around it: a cartouche that keeps the
 * lettering clear, a frame, and a pattern that fills what is left without
 * ever entering the lettering's space. Every motif keeps a gap of clear paper
 * from everything else, so no two shapes can pinch off a sliver between them.
 *
 * Then the whole page is printed to a grid at its real line weights and
 * every enclosed region measured. A pattern region too small to color takes
 * its motif off the page; a lettering or frame region that fails refuses the
 * design, since nothing there can be removed without breaking the page.
 */

const inch = (n: number) => n * DPI

/** Print weights, canvas px (96 per inch). */
export const QC_INK = {
  frame: 3.5,
  band: 2.5,
  cartouche: 3,
  letter: 2.5,
  motif: 2.25,
} as const

export type QcInk = keyof typeof QC_INK

export const QC_ALL_INK_WEIGHTS: ReadonlySet<number> = new Set(Object.values(QC_INK))

/**
 * Lettering floors: a letter's inside and a counter stay open at least this
 * wide, and a punctuation mark at least `punct` — what every face is proven
 * to clear at and above its smallest size (see `fonts.ts`, and the lettering
 * tests). Each page is re-measured against them less `QC_RASTER_TOLERANCE`:
 * the print grid reads a width to within a pixel, depending on where the
 * letter falls between grid lines.
 */
export const QC_LETTER_FLOOR = { letter: 8.5, punct: 5.5, counter: 6.5, area: 30 } as const
export const QC_RASTER_TOLERANCE = 1

/** Paper pinched where two lines meet at a sharp angle: ink spread, not a region. */
const SPECK_AREA = 24

export type QcLayout = 'medallion' | 'band'
export type QcCartouche = 'rounded' | 'oval' | 'scalloped' | 'double' | 'pill'
export type QcFrame = 'single' | 'double' | 'tiled'
export type QcFill = 'pack' | 'lattice'
export type QcLattice = 'square' | 'hex' | 'diamond'

export const QC_LAYOUTS: readonly QcLayout[] = ['medallion', 'band']
export const QC_CARTOUCHES: readonly QcCartouche[] = ['rounded', 'oval', 'scalloped', 'double', 'pill']
export const QC_FRAMES: readonly QcFrame[] = ['single', 'double', 'tiled']
export const QC_FILLS: readonly QcFill[] = ['pack', 'lattice']
export const QC_LATTICES: readonly QcLattice[] = ['square', 'hex', 'diamond']

export interface QcDesign {
  style: QcLetterStyle
  layout: QcLayout
  cartouche: QcCartouche
  frame: QcFrame
  fill: QcFill
  lattice: QcLattice
  set: QcMotifSet
  /** The motifs this page draws from, in preference order. */
  motifs: readonly string[]
  /** Corner radius of the frame, inches. */
  corner: number
}

export interface QcInkRun {
  ink: QcInk
  width: number
  lines: Pt[][]
}

export interface QcPlacedMotif {
  id: string
  cx: number
  cy: number
  r: number
  lines: Pt[][]
}

export interface QcPage {
  runs: QcInkRun[]
  lettering: QcLettering
  /** The space the lettering sits in; no pattern ink enters it. */
  letterArea: Ring
  /** The outer edge of the lettering's space, cartouche lines included. */
  cartouche: Ring
  /** The frame's inner edge: every motif sits inside it. */
  fieldEdge: Ring
  motifs: QcPlacedMotif[]
  /** Measured on the printed grid. */
  report: {
    regions: number
    /** Narrowest and smallest pattern or frame region. */
    narrowest: number
    smallest: number
    /** Narrowest region inside a letter, and inside a counter. */
    letterNarrowest: number
    counterNarrowest: number
    inkShare: number
  }
}

/**
 * Where a failed page stopped: `lettering` when the saying cannot be set at
 * a colorable size in this face and layout (cheap, and worth another face or
 * layout), `design` for anything after it.
 */
export type QcComposeResult = ({ ok: true } & QcPage) | { ok: false; stage: 'lettering' | 'design'; reason: string }

/* ------------------------------------------------------------------ *
 * Shapes
 * ------------------------------------------------------------------ */

export function roundedRect(b: Bounds, radius: number): Ring {
  const w = b.maxX - b.minX
  const h = b.maxY - b.minY
  const r = Math.max(0, Math.min(radius, w / 2, h / 2))
  if (r < 0.5) return [pt(b.minX, b.minY), pt(b.maxX, b.minY), pt(b.maxX, b.maxY), pt(b.minX, b.maxY)]
  const steps = Math.max(6, Math.ceil(r / 2.5))
  const arc = (cx: number, cy: number, from: number) => arcPoints(cx, cy, r, from, from + 90, steps).slice(0, -1)
  return [
    ...arc(b.maxX - r, b.minY + r, 270),
    ...arc(b.maxX - r, b.maxY - r, 0),
    ...arc(b.minX + r, b.maxY - r, 90),
    ...arc(b.minX + r, b.minY + r, 180),
  ]
}

const inset = (b: Bounds, by: number): Bounds => ({ minX: b.minX + by, minY: b.minY + by, maxX: b.maxX - by, maxY: b.maxY - by })

/** A superellipse |x/a|^p + |y/b|^p = 1 about (cx, cy). */
function superellipse(cx: number, cy: number, a: number, b: number, p: number): Ring {
  const steps = Math.max(96, Math.ceil((a + b) / 3))
  return Array.from({ length: steps }, (_, i) => {
    const t = (i / steps) * Math.PI * 2
    const c = Math.cos(t)
    const s = Math.sin(t)
    return pt(cx + a * Math.sign(c) * Math.abs(c) ** (2 / p), cy + b * Math.sign(s) * Math.abs(s) ** (2 / p))
  })
}

/** Evenly spaced points round a closed ring, about `step` apart. */
function resample(ring: Ring, step: number): Ring {
  const out: Pt[] = []
  let carry = 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!
    const b = ring[(i + 1) % ring.length]!
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    let t = carry
    while (t < len) {
      out.push(pt(a.x + ((b.x - a.x) * t) / len, a.y + ((b.y - a.y) * t) / len))
      t += step
    }
    carry = t - len
  }
  return out
}

/** A rounded rectangle with a scalloped edge: bumps of `length` px bulging `amp` px outward. */
function scalloped(b: Bounds, radius: number, amp: number, length: number): Ring {
  const base = resample(roundedRect(b, radius), 1.5)
  const n = base.length
  let perimeter = 0
  for (let i = 0; i < n; i++) perimeter += Math.hypot(base[(i + 1) % n]!.x - base[i]!.x, base[(i + 1) % n]!.y - base[i]!.y)
  const bumps = Math.max(8, Math.round(perimeter / length))
  const each = perimeter / bumps
  const out: Pt[] = []
  let s = 0
  for (let i = 0; i < n; i++) {
    const prev = base[(i - 1 + n) % n]!
    const next = base[(i + 1) % n]!
    const dx = next.x - prev.x
    const dy = next.y - prev.y
    const len = Math.hypot(dx, dy) || 1
    // Clockwise ring on a y-down page: the outward normal is (dy, -dx).
    const nx = dy / len
    const ny = -dx / len
    const lift = amp * Math.sin(Math.PI * ((s % each) / each))
    out.push(pt(base[i]!.x + nx * lift, base[i]!.y + ny * lift))
    s += Math.hypot(next.x - base[i]!.x, next.y - base[i]!.y)
  }
  return out
}

const closed = (ring: Ring): Pt[] => [...ring, ring[0]!]

/* ------------------------------------------------------------------ *
 * The frame
 * ------------------------------------------------------------------ */

interface Frame {
  lines: { ink: QcInk; pts: Pt[] }[]
  /** The pattern's outer edge. */
  inner: Ring
  innerBounds: Bounds
}

function buildFrame(box: Bounds, design: QcDesign, detail: QcDetailSpec): Frame {
  const outerB = inset(box, QC_INK.frame / 2 + 0.5)
  const corner = inch(design.corner)
  const outer = roundedRect(outerB, corner)
  const lines: Frame['lines'] = [{ ink: 'frame', pts: closed(outer) }]
  if (design.frame === 'single') return { lines, inner: outer, innerBounds: outerB }

  const bandWidth = Math.max(inch(0.2), detail.floor.minWidth + QC_INK.band + 6)
  const innerB = inset(outerB, bandWidth)
  const inner = roundedRect(innerB, Math.max(4, corner - bandWidth))
  lines.push({ ink: 'band', pts: closed(inner) })
  if (design.frame === 'tiled') {
    // Cross-pieces along the straight runs only; each corner is one L-shaped
    // tile, long enough in both arms to color comfortably.
    const tile = inch(0.55)
    const clear = Math.max(corner, bandWidth) + tile * 0.4
    const across = (from: number, to: number, at: (v: number) => [Pt, Pt]) => {
      const len = to - from
      const count = Math.max(1, Math.round(len / tile))
      for (let i = 0; i <= count; i++) {
        const [a, b] = at(from + (len * i) / count)
        lines.push({ ink: 'band', pts: [a, b] })
      }
    }
    across(outerB.minX + clear, outerB.maxX - clear, (x) => [pt(x, outerB.minY), pt(x, innerB.minY)])
    across(outerB.minX + clear, outerB.maxX - clear, (x) => [pt(x, innerB.maxY), pt(x, outerB.maxY)])
    across(outerB.minY + clear, outerB.maxY - clear, (y) => [pt(outerB.minX, y), pt(innerB.minX, y)])
    across(outerB.minY + clear, outerB.maxY - clear, (y) => [pt(innerB.maxX, y), pt(outerB.maxX, y)])
  }
  return { lines, inner, innerBounds: innerB }
}

/* ------------------------------------------------------------------ *
 * The lettering and its cartouche
 * ------------------------------------------------------------------ */

/** Clear paper between the lettering and the line round it. */
const LETTER_PAD = inch(0.2)
/** Width of the band a double cartouche adds. */
const CARTOUCHE_BAND = inch(0.17)
const SCALLOP = { amp: inch(0.08), length: inch(0.34) }
/** A superellipse's corner sits this far out from the rectangle it holds. */
const OVAL_P = 3
const OVAL_K = 2 ** (1 / OVAL_P)
/** The biggest em the lettering is set at, however short the saying. */
export const QC_MAX_EM = inch(1.9)

interface Cartouche {
  lines: { ink: QcInk; pts: Pt[] }[]
  /** Pattern keeps out of this. */
  hole: Ring
  /** Lettering keeps inside this. */
  letterArea: Ring
}

/** Space the cartouche's own lines take between the lettering and the pattern. */
function cartoucheExtra(kind: QcCartouche): number {
  return LETTER_PAD + (kind === 'double' ? CARTOUCHE_BAND : 0) + (kind === 'scalloped' ? SCALLOP.amp : 0)
}

function medallionCartouche(kind: QcCartouche, letters: Bounds): Cartouche {
  const pad = LETTER_PAD
  const around = { minX: letters.minX - pad, minY: letters.minY - pad, maxX: letters.maxX + pad, maxY: letters.maxY + pad }
  const w = around.maxX - around.minX
  const h = around.maxY - around.minY
  const radius = Math.min(inch(0.35), h / 3)
  switch (kind) {
    case 'oval': {
      const ring = superellipse((around.minX + around.maxX) / 2, (around.minY + around.maxY) / 2, (w / 2) * OVAL_K, (h / 2) * OVAL_K, OVAL_P)
      return { lines: [{ ink: 'cartouche', pts: closed(ring) }], hole: ring, letterArea: ring }
    }
    case 'pill': {
      const ring = roundedRect(around, w >= h * 1.6 ? h / 2 : radius * 1.5)
      return { lines: [{ ink: 'cartouche', pts: closed(ring) }], hole: ring, letterArea: ring }
    }
    case 'scalloped': {
      const ring = scalloped(around, radius, SCALLOP.amp, SCALLOP.length)
      return { lines: [{ ink: 'cartouche', pts: closed(ring) }], hole: ring, letterArea: roundedRect(around, radius) }
    }
    case 'double': {
      const innerRing = roundedRect(around, radius)
      const outer = roundedRect(inset(around, -CARTOUCHE_BAND), radius + CARTOUCHE_BAND)
      return {
        lines: [
          { ink: 'cartouche', pts: closed(outer) },
          { ink: 'band', pts: closed(innerRing) },
        ],
        hole: outer,
        letterArea: innerRing,
      }
    }
    default: {
      const ring = roundedRect(around, radius)
      return { lines: [{ ink: 'cartouche', pts: closed(ring) }], hole: ring, letterArea: ring }
    }
  }
}

/** A band right across the frame, its edges straight, doubled or gently waved. */
function bandCartouche(kind: QcCartouche, letters: Bounds, field: Bounds): Cartouche {
  const top = letters.minY - LETTER_PAD
  const bottom = letters.maxY + LETTER_PAD
  const x0 = field.minX
  const x1 = field.maxX
  const wave = kind === 'scalloped'
  const doubled = kind === 'double'
  const edge = (y: number, dir: -1 | 1): Pt[] => {
    if (!wave) return [pt(x0, y), pt(x1, y)]
    const span = x1 - x0
    const lambda = span / Math.max(3, Math.round(span / inch(0.8)))
    const out: Pt[] = []
    for (let x = x0; x <= x1 + 0.01; x += 2) {
      const lift = SCALLOP.amp * (0.5 - 0.5 * Math.cos((2 * Math.PI * (x - x0)) / lambda))
      out.push(pt(Math.min(x, x1), y + dir * lift))
    }
    return out
  }
  const lines: Cartouche['lines'] = [
    { ink: 'cartouche', pts: edge(top - (doubled ? CARTOUCHE_BAND : 0), -1) },
    { ink: 'cartouche', pts: edge(bottom + (doubled ? CARTOUCHE_BAND : 0), 1) },
  ]
  if (doubled) lines.push({ ink: 'band', pts: edge(top, -1) }, { ink: 'band', pts: edge(bottom, 1) })
  const reach = 60
  const outerTop = top - (doubled ? CARTOUCHE_BAND : 0) - (wave ? SCALLOP.amp : 0)
  const outerBottom = bottom + (doubled ? CARTOUCHE_BAND : 0) + (wave ? SCALLOP.amp : 0)
  const hole = [pt(x0 - reach, outerTop), pt(x1 + reach, outerTop), pt(x1 + reach, outerBottom), pt(x0 - reach, outerBottom)]
  const letterArea = [pt(x0 - reach, top), pt(x1 + reach, top), pt(x1 + reach, bottom), pt(x0 - reach, bottom)]
  return { lines, hole, letterArea }
}

/* ------------------------------------------------------------------ *
 * The pattern
 * ------------------------------------------------------------------ */

/** How much bigger a motif must be at this level's floor than at Classic's. */
export function motifScale(detail: QcDetailSpec): number {
  return (detail.floor.minWidth + QC_INK.motif) / (10.5 + QC_INK.motif)
}

/**
 * The smallest radius a motif is drawn at on this level: its proven Classic
 * size scaled to the level's floor, plus a little for the print grid, which
 * reads a width to within a pixel.
 */
export function motifMinRadius(motif: QcMotif, detail: QcDetailSpec): number {
  return motif.minR * motifScale(detail) + 2
}

interface Field {
  inner: Ring
  hole: Ring
}

/** Clear distance from `p` to the field's edges, or -1 outside the field. */
function clearance(p: Pt, field: Field): number {
  if (!pointInRing(p, field.inner) || pointInRing(p, field.hole)) return -1
  return Math.min(distToRing(p, field.inner), distToRing(p, field.hole))
}

interface Picker {
  /**
   * A motif for a space of radius `room`, drawn about `target` if it can be:
   * the least-used main motif that fits the room (at its own smallest size
   * or more), else a filler. Null when nothing fits.
   */
  pick(room: number, target: number, fillersOnly?: boolean): { motif: QcMotif; r: number } | null
}

function motifPicker(ids: readonly string[], set: QcMotifSet, detail: QcDetailSpec, rng: StudioRng): Picker {
  const main = ids.map((id) => qcMotif(id)).filter((m): m is QcMotif => Boolean(m))
  const fillers = QC_FILLERS[set]
  const used = new Map<string, number>()
  return {
    pick(room, target, fillersOnly = false) {
      let eligible = fillersOnly ? [] : main.filter((m) => motifMinRadius(m, detail) <= room)
      if (eligible.length === 0) eligible = fillers.filter((m) => motifMinRadius(m, detail) <= room)
      if (eligible.length === 0) return null
      const least = Math.min(...eligible.map((m) => used.get(m.id) ?? 0))
      const motif = rng.pick(eligible.filter((m) => (used.get(m.id) ?? 0) === least))
      used.set(motif.id, (used.get(motif.id) ?? 0) + 1)
      return { motif, r: Math.min(room, Math.max(target, motifMinRadius(motif, detail))) }
    },
  }
}

function place(motif: QcMotif, cx: number, cy: number, r: number, rng: StudioRng): QcPlacedMotif {
  const deg = motif.upright ? rng.int(-10, 10) : rng.int(0, 359)
  return { id: motif.id, cx, cy, r, lines: placeMotif(motif.build(rng), cx, cy, r, deg) }
}

/** Smallest radius a filler is drawn at, as a share of the level's smallest motif. */
const FILLER_SHARE = 0.55

/**
 * Packed: the biggest open space first, each motif a little smaller than
 * the space it gets, until nothing larger than the smallest motif fits; then
 * small, plain shapes settle into the gaps that are left. Big flowers go in
 * first and smaller ones fill round them, the way a hand-drawn doodle page
 * fills up — full, but never touching.
 */
function packPattern(
  field: Field,
  bounds: Bounds,
  detail: QcDetailSpec,
  picker: Picker,
  rng: StudioRng,
  options: { cap?: number; around?: readonly QcPlacedMotif[] } = {},
): QcPlacedMotif[] {
  const { cap = Infinity, around = [] } = options
  const [rMin, rMax] = detail.pack
  const rFill = rMin * FILLER_SHARE
  const gap = detail.gap
  const step = Math.max(5, rFill * 0.6)
  const cands: { p: Pt; free: number }[] = []
  for (let y = bounds.minY + step / 2; y < bounds.maxY; y += step) {
    for (let x = bounds.minX + step / 2; x < bounds.maxX; x += step) {
      const p = pt(x + (rng.next() - 0.5) * step * 0.6, y + (rng.next() - 0.5) * step * 0.6)
      let free = clearance(p, field) - gap
      for (const m of around) free = Math.min(free, Math.hypot(p.x - m.cx, p.y - m.cy) - m.r - gap)
      if (free >= rFill) cands.push({ p, free })
    }
  }
  const placed: QcPlacedMotif[] = []
  while (cands.length > 0 && placed.length < 400) {
    let best = 0
    for (let i = 1; i < cands.length; i++) if (cands[i]!.free > cands[best]!.free) best = i
    const c = cands[best]!
    const filling = c.free < rMin
    const room = filling ? c.free : Math.min(c.free, Math.max(cap, rMin))
    const target = filling ? Math.min(c.free, rMin) : Math.min(cap, rMax) * (0.72 + 0.28 * rng.next())
    const choice = picker.pick(room, target, filling)
    if (!choice) {
      cands.splice(best, 1)
      continue
    }
    const m = place(choice.motif, c.p.x, c.p.y, choice.r, rng)
    placed.push(m)
    for (let i = cands.length - 1; i >= 0; i--) {
      const q = cands[i]!
      q.free = Math.min(q.free, Math.hypot(q.p.x - m.cx, q.p.y - m.cy) - m.r - gap)
      if (q.free < rFill) cands.splice(i, 1)
    }
  }
  return placed
}

/**
 * A lattice: one motif size on a regular grid centred on the page, two
 * motifs alternating, and a smaller shape wherever the edge leaves room for
 * less than a whole one. Reads as a designed tile, not a scatter.
 */
function latticePattern(field: Field, bounds: Bounds, center: Pt, kind: QcLattice, detail: QcDetailSpec, ids: readonly string[], set: QcMotifSet, rng: StudioRng): QcPlacedMotif[] {
  const R = detail.lattice
  const gap = detail.gap
  const main = ids.map((id) => qcMotif(id)).filter((m): m is QcMotif => m !== undefined && motifMinRadius(m, detail) <= R)
  const fillers = QC_FILLERS[set]
  if (main.length === 0) return []
  const a = main[0]!
  const b = main[1] ?? a
  const s = 2 * R + gap * 1.4
  // Every neighbour exactly `s` away: square rows, offset hex rows, or the
  // square turned 45 degrees (rows s/√2 apart, every other one shifted).
  const rowStep = kind === 'hex' ? (s * Math.sqrt(3)) / 2 : kind === 'diamond' ? s / Math.SQRT2 : s
  const colStep = kind === 'diamond' ? s * Math.SQRT2 : s
  const rows = Math.ceil((bounds.maxY - bounds.minY) / rowStep / 2) + 1
  const cols = Math.ceil((bounds.maxX - bounds.minX) / colStep / 2) + 1
  const placed: QcPlacedMotif[] = []
  for (let j = -rows; j <= rows; j++) {
    const shift = kind === 'square' ? 0 : Math.abs(j) % 2 === 1 ? colStep / 2 : 0
    for (let i = -cols; i <= cols; i++) {
      const p = pt(center.x + i * colStep + shift, center.y + j * rowStep)
      const free = clearance(p, field) - gap
      if (free <= 0) continue
      const motif = (i + j) % 2 === 0 ? a : b
      const r = Math.min(R, free)
      if (r >= R * 0.82 && r >= motifMinRadius(motif, detail)) {
        placed.push(place(motif, p.x, p.y, r, rng))
        continue
      }
      const filler = fillers.filter((m) => motifMinRadius(m, detail) <= Math.min(free, R * 0.6))
      if (filler.length > 0) placed.push(place(filler[(i + j + 8) % filler.length]!, p.x, p.y, Math.min(free, R * 0.6), rng))
    }
  }
  if (kind === 'square') {
    // The square grid's open diamonds each take a small shape at their centre.
    const small = fillers[0]!
    const room = (s * Math.SQRT2) / 2 - R - gap
    const r = Math.min(room, R * 0.45)
    if (motifMinRadius(small, detail) <= r) {
      for (let j = -rows; j < rows; j++) {
        for (let i = -cols; i < cols; i++) {
          const p = pt(center.x + (i + 0.5) * colStep, center.y + (j + 0.5) * rowStep)
          const free = clearance(p, field) - gap
          if (free < r || placed.some((m) => Math.hypot(m.cx - p.x, m.cy - p.y) < m.r + r + gap)) continue
          placed.push(place(small, p.x, p.y, r, rng))
        }
      }
    }
  }
  return placed
}

/* ------------------------------------------------------------------ *
 * The page
 * ------------------------------------------------------------------ */

/** Whole grid tiles a lattice needs to read as a lattice. */
const LATTICE_MIN_TILES = 4

/** Fewest motifs a page's pattern may hold; any fewer and it is a label, not a coloring page. */
export const QC_MIN_MOTIFS = 5

export interface QcComposeInput {
  /** The panel the page is drawn in. */
  box: Bounds
  font: opentype.Font
  saying: string
  design: QcDesign
  detail: QcDetailSpec
  rng: StudioRng
}

/** Where the lettering may go, before it is set: the frame's inside less the pattern's share. */
export function letteringBox(frameInner: Bounds, design: QcDesign, detail: QcDetailSpec): Bounds {
  // Above and below the lettering the pattern always keeps a real share of
  // the page: at least a row of its smallest motifs, and a seventh of the
  // frame's height, so a long saying cannot squeeze it down to a border.
  const band = Math.max((detail.pack[0] + detail.gap) * 2.3, inch(0.9), (frameInner.maxY - frameInner.minY) * 0.13)
  // The sides need room for a row of small motifs only; the pattern's weight sits above and below.
  const side = design.layout === 'band' ? detail.gap + 4 : Math.max(detail.pack[0] * 1.3 + detail.gap * 2, inch(0.5))
  const extra = cartoucheExtra(design.cartouche)
  let box = {
    minX: frameInner.minX + side + extra,
    minY: frameInner.minY + band + extra,
    maxX: frameInner.maxX - side - extra,
    maxY: frameInner.maxY - band - extra,
  }
  if (design.layout === 'medallion' && design.cartouche === 'oval') {
    const cx = (box.minX + box.maxX) / 2
    const cy = (box.minY + box.maxY) / 2
    const w = (box.maxX - box.minX + 2 * extra) / OVAL_K - 2 * extra
    const h = (box.maxY - box.minY + 2 * extra) / OVAL_K - 2 * extra
    box = { minX: cx - w / 2, minY: cy - h / 2, maxX: cx + w / 2, maxY: cy + h / 2 }
  }
  return box
}

function classify(region: RasterRegion, lettering: QcLettering): 'letter' | 'punct' | 'counter' | 'other' {
  for (const line of lettering.lines) {
    for (const g of line.glyphs) {
      const b = g.bounds
      if (region.deepest.x < b.minX - 1 || region.deepest.x > b.maxX + 1 || region.deepest.y < b.minY - 1 || region.deepest.y > b.maxY + 1) continue
      let winding = 0
      for (const ring of g.rings) if (pointInRing(region.deepest, ring)) winding++
      if (winding % 2 === 1) return /[A-Za-z]/.test(g.char) ? 'letter' : 'punct'
      return 'counter'
    }
  }
  return 'other'
}

/** The saying lettered in the space this design leaves it, or null when it cannot fit at a colorable size. */
function fitLettering(frame: Frame, font: opentype.Font, saying: string, design: QcDesign, detail: QcDetailSpec): QcLettering | null {
  const room = letteringBox(frame.innerBounds, design, detail)
  if (room.maxX - room.minX < design.style.minEm * 2 || room.maxY - room.minY < design.style.minEm * 0.8) return null
  return layoutLettering(font, letteredText(saying, design.style.caps), room, {
    minSize: design.style.minEm,
    maxSize: QC_MAX_EM,
    minGapPx: 6,
    minLineGapPx: inch(0.13),
  })
}

/**
 * Whether the saying can be lettered at a colorable size in this face at
 * all — in the design that leaves it the most room (right across the page,
 * a single-line frame, a plain cartouche). Cheap: no pattern is drawn.
 */
export function canLetter(box: Bounds, font: opentype.Font, saying: string, style: QcLetterStyle, detail: QcDetailSpec): boolean {
  const plain: QcDesign = {
    style,
    layout: 'band',
    cartouche: 'rounded',
    frame: 'single',
    fill: 'pack',
    lattice: 'square',
    set: 'geometric',
    motifs: [],
    corner: 0.08,
  }
  return fitLettering(buildFrame(box, plain, detail), font, saying, plain, detail) !== null
}

export function composeQuotePage(input: QcComposeInput): QcComposeResult {
  const { box, font, saying, design, detail, rng } = input
  const frame = buildFrame(box, design, detail)
  const lettering = fitLettering(frame, font, saying, design, detail)
  if (!lettering) return { ok: false, stage: 'lettering', reason: 'the saying does not fit at a colorable size' }

  const cartouche =
    design.layout === 'band' ? bandCartouche(design.cartouche, lettering.bounds, frame.innerBounds) : medallionCartouche(design.cartouche, lettering.bounds)

  const field: Field = { inner: frame.inner, hole: cartouche.hole }
  const center = pt((frame.innerBounds.minX + frame.innerBounds.maxX) / 2, (frame.innerBounds.minY + frame.innerBounds.maxY) / 2)
  const picker = motifPicker(design.motifs, design.set, detail, rng)
  let motifs: QcPlacedMotif[]
  if (design.fill === 'lattice') {
    // The grid holds the middle of each field; where the field's edge cuts
    // it off, the same motifs pack in at no more than the grid's size.
    const grid = latticePattern(field, frame.innerBounds, center, design.lattice, detail, design.motifs, design.set, rng)
    // A field too thin for a few whole tiles of the grid packs instead: a
    // "grid" of edge fillers is not a pattern.
    const tiles = grid.filter((m) => design.motifs.includes(m.id)).length
    motifs =
      tiles >= LATTICE_MIN_TILES
        ? [...grid, ...packPattern(field, frame.innerBounds, detail, picker, rng, { cap: detail.lattice, around: grid })]
        : packPattern(field, frame.innerBounds, detail, picker, rng)
  } else {
    motifs = packPattern(field, frame.innerBounds, detail, picker, rng)
  }
  if (motifs.length < QC_MIN_MOTIFS) return { ok: false, stage: 'design', reason: 'too little room for a pattern' }

  const fixed: { ink: QcInk; pts: Pt[] }[] = [
    ...frame.lines,
    ...cartouche.lines,
    ...lettering.lines.flatMap((line) => line.glyphs.flatMap((g) => g.outline.map((pts) => ({ ink: 'letter' as const, pts })))),
  ]
  const rasterBox = inset(box, -2)

  for (let repair = 0; repair < 24; repair++) {
    const lines: InkPolyline[] = [
      ...fixed.map((l) => ({ pts: l.pts, width: QC_INK[l.ink] })),
      ...motifs.flatMap((m) => m.lines.map((pts) => ({ pts, width: QC_INK.motif }))),
    ]
    const report = rasterCheck(lines, rasterBox)
    let narrowest = Infinity
    let smallest = Infinity
    let letterNarrowest = Infinity
    let counterNarrowest = Infinity
    const failing: RasterRegion[] = []
    let letteringFails = false
    let counted = 0
    for (const region of report.regions) {
      if (region.area <= SPECK_AREA) continue
      counted++
      const kind = pointInRing(region.deepest, cartouche.letterArea) ? classify(region, lettering) : 'other'
      if (kind === 'letter' || kind === 'punct') {
        letterNarrowest = Math.min(letterNarrowest, region.width)
        const floor = (kind === 'letter' ? QC_LETTER_FLOOR.letter : QC_LETTER_FLOOR.punct) - QC_RASTER_TOLERANCE
        if (region.width < floor || region.area < QC_LETTER_FLOOR.area) letteringFails = true
      } else if (kind === 'counter') {
        counterNarrowest = Math.min(counterNarrowest, region.width)
        if (region.width < QC_LETTER_FLOOR.counter - QC_RASTER_TOLERANCE || region.area < QC_LETTER_FLOOR.area) letteringFails = true
      } else {
        narrowest = Math.min(narrowest, region.width)
        smallest = Math.min(smallest, region.area)
        if (region.width < detail.floor.minWidth || region.area < detail.floor.minArea) failing.push(region)
      }
    }
    if (letteringFails) return { ok: false, stage: 'design', reason: 'a letter prints too small to color' }
    if (failing.length === 0) {
      if (motifs.length < QC_MIN_MOTIFS) return { ok: false, stage: 'design', reason: 'too little room for a pattern' }
      const runs = (Object.keys(QC_INK) as QcInk[])
        .map((ink) => ({
          ink,
          width: QC_INK[ink],
          lines: ink === 'motif' ? motifs.flatMap((m) => m.lines) : fixed.filter((l) => l.ink === ink).map((l) => l.pts),
        }))
        .filter((run) => run.lines.length > 0)
      return {
        ok: true,
        runs,
        lettering,
        letterArea: cartouche.letterArea,
        cartouche: cartouche.hole,
        fieldEdge: frame.inner,
        motifs,
        report: { regions: counted, narrowest, smallest, letterNarrowest, counterNarrowest, inkShare: report.inkShare },
      }
    }
    // A region too small to color: take away the motif it belongs to.
    const doomed = new Set<QcPlacedMotif>()
    for (const region of failing) {
      let nearest: QcPlacedMotif | null = null
      let nearestD = Infinity
      for (const m of motifs) {
        const d = Math.hypot(region.deepest.x - m.cx, region.deepest.y - m.cy) - m.r
        if (d < nearestD) {
          nearestD = d
          nearest = m
        }
      }
      if (!nearest || nearestD > detail.gap * 2) return { ok: false, stage: 'design', reason: 'the frame leaves a space too small to color' }
      doomed.add(nearest)
    }
    motifs = motifs.filter((m) => !doomed.has(m))
  }
  return { ok: false, stage: 'design', reason: 'the pattern could not be made colorable' }
}
