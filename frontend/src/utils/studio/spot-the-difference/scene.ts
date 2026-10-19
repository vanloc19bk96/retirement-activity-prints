import { DPI } from '@/types/canvas-settings.types'
import type { StudioRng } from '../studio-rng'
import type { SgKnobValues } from '../stained-glass/catalog'
import { pt, ringBounds, type Bounds, type Pt, type Ring } from '../stained-glass/geometry'
import { barSpine, rect, type SubjectDrawing, type SubjectStroke } from '../stained-glass/subject-kit'
import { sdProp, sdSize, type SdPropKind } from './props'

/**
 * A scene as data: the fixed backdrop (walls, floor, hills, sea) and the
 * parts placed on it (a chair, a clock, a cloud).
 *
 * Both pictures on a page are drawn from one scene. The second differs only
 * by the changes dealt for it — a part left out, a knob set otherwise, a part
 * turned round or swapped — so nothing else can drift between them: same
 * parts, same places, same scale, same lines.
 *
 * A part keeps its anchor across versions. It is placed by a reference point
 * taken from the version first dealt (its foot, or its top if it hangs), in
 * the drawing's own units, so a version with another knob keeps every
 * unchanged piece exactly where it was and only the changed piece differs.
 */

export interface SdPart {
  /** Unique within the scene: `p0`, `p1`… */
  id: string
  kind: string
  knobs: SgKnobValues
  mirrored: boolean
  /** Canvas point the reference point lands on. */
  ax: number
  ay: number
  /** Canvas px per drawing unit. */
  k: number
  /** Reference point, drawing units (the dealt version's foot centre, or top centre when it hangs). */
  rx: number
  ry: number
  depth: number
  /** What the reference point is: its foot, its top (it hangs) or its middle (it floats). */
  anchor: SdAnchor
  /** Packed closer than its plane's box spacing (things on a table or blanket); still overlaps nothing but what it stands on. */
  loose: boolean
  /** The part it stands on (a table, a counter, a rug), if any: the one thing it may overlap. */
  on?: string
  /** May be left out of one picture: nothing stands on it and the scene does not need it. */
  removable: boolean
  /** Where its foot is fixed (it stands on something): a knob that lifts the foot is not a fair change. */
  grounded: boolean
  /** Things of a similar size that could stand in its place. */
  swaps: readonly string[]
}

export interface SdStructure {
  ring: Ring
  depth: number
  /** An open line (a seam in the siding, a joint in the paving), not a shape. */
  line?: boolean
}

export interface SdScene {
  recipe: string
  /** The picture's panel (inside the frame), canvas px. */
  panel: Bounds
  structure: SdStructure[]
  parts: SdPart[]
}

const inch = (n: number) => n * DPI

/* ------------------------------------------------------------------ *
 * Drawings
 * ------------------------------------------------------------------ */

const DRAWINGS = new Map<string, { drawing: SubjectDrawing; bounds: Bounds }>()
const DRAWING_LIMIT = 600

/** A kind's drawing for these knobs (cached, bounded), with its bounds. */
export function kindDrawing(kind: SdPropKind, knobs: SgKnobValues): { drawing: SubjectDrawing; bounds: Bounds } {
  const key = `${kind.id}:${Object.keys(kind.subject.knobs)
    .map((n) => knobs[n] ?? 0)
    .join('.')}`
  const hit = DRAWINGS.get(key)
  if (hit) return hit
  const drawing = kind.subject.draw(knobs)
  const all = [...drawing.pieces.map((p) => p.ring), ...drawing.strokes.map((s) => s.pts)]
  const list = all.map((r) => ringBounds(r))
  const bounds = {
    minX: Math.min(...list.map((b) => b.minX)),
    minY: Math.min(...list.map((b) => b.minY)),
    maxX: Math.max(...list.map((b) => b.maxX)),
    maxY: Math.max(...list.map((b) => b.maxY)),
  }
  const out = { drawing, bounds }
  DRAWINGS.set(key, out)
  if (DRAWINGS.size > DRAWING_LIMIT) DRAWINGS.delete(DRAWINGS.keys().next().value!)
  return out
}

/**
 * A bar narrower than this in print (canvas px, about 1/16 in) is drawn as one
 * line: two outlines that close together read as one stroke twice as heavy.
 */
export const SD_THIN_BAR = 6

/** Drawing units → canvas px for a part (mirroring about its reference point). */
export function partMap(part: SdPart): (p: Pt) => Pt {
  const { ax, ay, k, rx, ry, mirrored } = part
  return (p) => pt(ax + k * ((mirrored ? 2 * rx - p.x : p.x) - rx), ay + k * (p.y - ry))
}

/** One placed piece: its outline, and its middle line and printed width when it is a bar. */
export interface SdPiece {
  ring: Ring
  bar?: { line: Pt[]; width: number }
}

export interface SdDrawing {
  pieces: SdPiece[]
  strokes: SubjectStroke[]
}

/** The part's drawing, placed on the canvas. */
export function placedDrawing(part: SdPart): SdDrawing {
  const kind = sdProp(part.kind)!
  const { drawing } = kindDrawing(kind, part.knobs)
  const map = partMap(part)
  const flip = part.mirrored
  return {
    pieces: drawing.pieces.map((piece) => {
      const ring = flip ? piece.ring.map(map).reverse() : piece.ring.map(map)
      const spine = barSpine(piece.ring)
      return spine ? { ring, bar: { line: spine.line.map(map), width: spine.width * part.k } } : { ring }
    }),
    strokes: drawing.strokes.map((s) => ({ ...s, pts: s.pts.map(map) })),
  }
}

/* ------------------------------------------------------------------ *
 * Silhouettes
 * ------------------------------------------------------------------ */

/** Where a drawing has ink or paper of its own, on a coarse grid in drawing units. */
interface SdMask {
  minX: number
  minY: number
  cell: number
  w: number
  h: number
  bits: Uint8Array
}

const MASKS = new Map<string, SdMask>()
/** Grid cells along a drawing's longer side: fine enough to tell a chair's legs from the gap between them. */
const MASK_CELLS = 40

function kindMask(kind: SdPropKind, knobs: SgKnobValues): SdMask {
  const key = `${kind.id}:${Object.keys(kind.subject.knobs)
    .map((n) => knobs[n] ?? 0)
    .join('.')}`
  const hit = MASKS.get(key)
  if (hit) return hit
  const { drawing, bounds: b } = kindDrawing(kind, knobs)
  const cell = Math.max(b.maxX - b.minX, b.maxY - b.minY) / MASK_CELLS
  const w = Math.ceil((b.maxX - b.minX) / cell) + 1
  const h = Math.ceil((b.maxY - b.minY) / cell) + 1
  const bits = new Uint8Array(w * h)
  const mark = (x: number, y: number) => {
    const i = Math.floor((x - b.minX) / cell)
    const j = Math.floor((y - b.minY) / cell)
    if (i >= 0 && j >= 0 && i < w && j < h) bits[j * w + i] = 1
  }
  const trace = (line: readonly Pt[], closed: boolean) => {
    const n = closed ? line.length : line.length - 1
    for (let s = 0; s < n; s++) {
      const a = line[s]!
      const c = line[(s + 1) % line.length]!
      const steps = Math.max(1, Math.ceil(Math.hypot(c.x - a.x, c.y - a.y) / (cell / 2)))
      for (let t = 0; t <= steps; t++) mark(a.x + ((c.x - a.x) * t) / steps, a.y + ((c.y - a.y) * t) / steps)
    }
  }
  for (const piece of drawing.pieces) {
    const ring = piece.ring
    // Fill each row between the ring's crossings (even-odd), then trace the edge so a sliver still counts.
    for (let j = 0; j < h; j++) {
      const y = b.minY + (j + 0.5) * cell
      const xs: number[] = []
      for (let s = 0; s < ring.length; s++) {
        const a = ring[s]!
        const c = ring[(s + 1) % ring.length]!
        if ((a.y <= y && c.y > y) || (c.y <= y && a.y > y)) xs.push(a.x + ((y - a.y) * (c.x - a.x)) / (c.y - a.y))
      }
      xs.sort((p, q) => p - q)
      for (let t = 0; t + 1 < xs.length; t += 2) {
        const i0 = Math.max(0, Math.floor((xs[t]! - b.minX) / cell))
        const i1 = Math.min(w - 1, Math.floor((xs[t + 1]! - b.minX) / cell))
        for (let i = i0; i <= i1; i++) bits[j * w + i] = 1
      }
    }
    trace(ring, true)
  }
  for (const s of drawing.strokes) trace(s.pts, false)
  const out = { minX: b.minX, minY: b.minY, cell, w, h, bits }
  MASKS.set(key, out)
  if (MASKS.size > DRAWING_LIMIT) MASKS.delete(MASKS.keys().next().value!)
  return out
}

/** Does the part have ink or paper of its own within `r` canvas px of (x, y)? */
function partCovers(part: SdPart, mask: SdMask, x: number, y: number, r: number): boolean {
  const dx = (x - part.ax) / part.k
  const u = part.rx + (part.mirrored ? -dx : dx)
  const v = part.ry + (y - part.ay) / part.k
  const rr = r / part.k
  const i0 = Math.max(0, Math.floor((u - rr - mask.minX) / mask.cell))
  const i1 = Math.min(mask.w - 1, Math.floor((u + rr - mask.minX) / mask.cell))
  const j0 = Math.max(0, Math.floor((v - rr - mask.minY) / mask.cell))
  const j1 = Math.min(mask.h - 1, Math.floor((v + rr - mask.minY) / mask.cell))
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (mask.bits[j * mask.w + i]) return true
  return false
}

/** Do two parts' silhouettes come within `gap` canvas px of each other? */
export function partsTouch(a: SdPart, b: SdPart, gap: number): boolean {
  const ba = partBounds(a)
  const bb = partBounds(b)
  if (!overlaps(ba, bb, gap)) return false
  const box = {
    minX: Math.max(ba.minX, bb.minX) - gap,
    minY: Math.max(ba.minY, bb.minY) - gap,
    maxX: Math.min(ba.maxX, bb.maxX) + gap,
    maxY: Math.min(ba.maxY, bb.maxY) + gap,
  }
  const ma = kindMask(sdProp(a.kind)!, a.knobs)
  const mb = kindMask(sdProp(b.kind)!, b.knobs)
  const step = Math.max(1, Math.min(2, (ma.cell * a.k) / 2, (mb.cell * b.k) / 2))
  for (let y = box.minY; y <= box.maxY; y += step) {
    for (let x = box.minX; x <= box.maxX; x += step) {
      if (partCovers(a, ma, x, y, gap / 2) && partCovers(b, mb, x, y, gap / 2)) return true
    }
  }
  return false
}

/** Where the part prints, canvas px. */
export function partBounds(part: SdPart): Bounds {
  const kind = sdProp(part.kind)!
  const b = kindDrawing(kind, part.knobs).bounds
  const map = partMap(part)
  const a = map(pt(b.minX, b.minY))
  const c = map(pt(b.maxX, b.maxY))
  return { minX: Math.min(a.x, c.x), minY: Math.min(a.y, c.y), maxX: Math.max(a.x, c.x), maxY: Math.max(a.y, c.y) }
}

/** The surface a part offers (a table top), canvas px, or null. */
export function partSurface(part: SdPart): { y: number; x0: number; x1: number } | null {
  const surface = sdProp(part.kind)?.surface
  if (!surface) return null
  const map = partMap(part)
  const a = map(pt(surface.x0, surface.y))
  const b = map(pt(surface.x1, surface.y))
  return { y: a.y, x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x) }
}

export const overlaps = (a: Bounds, b: Bounds, gap = 0) =>
  a.minX < b.maxX + gap && b.minX < a.maxX + gap && a.minY < b.maxY + gap && b.minY < a.maxY + gap

export const growBounds = (b: Bounds, by: number): Bounds => ({ minX: b.minX - by, minY: b.minY - by, maxX: b.maxX + by, maxY: b.maxY + by })

/* ------------------------------------------------------------------ *
 * Building a scene
 * ------------------------------------------------------------------ */

/** Clear paper between a part and the picture's frame. */
export const SD_FRAME_CLEAR = inch(0.1)
/** No part prints smaller than this (its taller side). */
export const SD_MIN_PART = inch(0.36)
/** …nor with its shorter side under this, unless it is long and low by nature (a rug, a canoe). */
export const SD_MIN_SIDE = inch(0.2)

/** The scale a drawing prints at for a height (and at most a width), never under the print floors. */
export function printScale(b: Bounds, h: number, maxW?: number): number {
  const bw = b.maxX - b.minX
  const bh = b.maxY - b.minY
  let k = h / bh
  if (maxW !== undefined) k = Math.min(k, maxW / bw)
  const long = Math.max(bw, bh)
  const short = Math.min(bw, bh)
  if (long * k < SD_MIN_PART) k = SD_MIN_PART / long
  if (long <= short * 3 && short * k < SD_MIN_SIDE) k = SD_MIN_SIDE / short
  return k
}

/** Paper between two things that do not stand on each other, so each reads as itself. */
export const SD_PART_GAP = inch(0.05)

/** Things that lie flat on the floor or the grass: what stands on them may overlap them. */
export const SD_FLAT_KINDS: ReadonlySet<string> = new Set(['sd-rug', 'sd-doormat', 'sd-blanket'])

export type SdAnchor = 'foot' | 'top' | 'middle'

/** May these two overlap? Only a thing and what it stands on, or a flat rug or blanket and what is on it. */
export function partsMayOverlap(a: SdPart, b: SdPart): boolean {
  return a.on === b.id || b.on === a.id || SD_FLAT_KINDS.has(a.kind) || SD_FLAT_KINDS.has(b.kind)
}

/**
 * Wholly inside the frame (clear of it), and clear of every other part.
 *
 * Nothing overlaps anything else unless it stands on it (a cup on a table, a
 * cat on a rug): a lamp in front of a picture or a chair against a door
 * turns two simple things into one muddle, and hides half of each. Things in
 * one plane also keep their boxes apart, so a row never bunches up; a sun or
 * a cloud keeps its box clear of everything.
 */
export function partFits(part: SdPart, panel: Bounds, others: readonly SdPart[], options: { clearOfAll?: boolean } = {}): boolean {
  const b = partBounds(part)
  const clear = SD_FRAME_CLEAR
  if (b.minX < panel.minX + clear || b.maxX > panel.maxX - clear || b.minY < panel.minY + clear || b.maxY > panel.maxY - clear) return false
  const rest = others.filter((o) => o !== part && o.id !== part.id)
  if (options.clearOfAll) return !rest.some((o) => overlaps(partBounds(o), b, 6))
  return !rest.some((o) => {
    if (partsMayOverlap(part, o)) return false
    if (!part.loose && !o.loose && Math.abs(o.depth - part.depth) < 5 && overlaps(partBounds(o), b, 2)) return true
    return partsTouch(part, o, SD_PART_GAP)
  })
}

export interface SdPlace {
  kind: string
  /** Canvas x of the part's centre. */
  cx: number
  /** Canvas y of its anchor: the foot it stands on, its top if it hangs, its middle if it floats. */
  y: number
  /** Printed height, canvas px (the larger side is also capped by `maxW`). */
  h: number
  maxW?: number
  depth: number
  anchor?: SdAnchor
  knobs?: SgKnobValues
  mirrored?: boolean
  removable?: boolean
  swaps?: readonly string[]
  /** Packed closer than its plane's box spacing (things standing on a table or blanket). */
  overlap?: boolean
  /** The part it stands on: the one thing it may overlap. */
  on?: string
  /** Must stay clear of every part, whatever its plane (a sun is never half behind a tree). */
  clear?: boolean
}

export interface SdRowItem {
  /** Kinds to choose from. */
  kinds: readonly string[]
  /**
   * Printed height, canvas px, whichever kind is dealt. Leave it out to size
   * each kind by how big it really is, from the row's `unit`, so a teacup is
   * never as tall as the teapot beside it.
   */
  h?: number
  /** Chance it is included at all (1 = always); dropped first when the row is short of room. */
  chance?: number
  /** Extra depth, e.g. so a table's items paint after it. */
  depth?: number
  anchor?: SdAnchor
  /** Its own y (e.g. a raised item); defaults to the row's. */
  y?: number
  removable?: boolean
  /** Swaps other than the rest of `kinds`. */
  swaps?: readonly string[]
  maxW?: number
  /** Which way it faces (a chair turned to the table); dealt at random when left out. */
  mirrored?: boolean
}

export interface SdRowOptions {
  x0: number
  x1: number
  y: number
  depth: number
  /** Printed height of a thing one unit big (`sdSize`), canvas px: the row's scale, for items without an `h`. */
  unit?: number
  /** No item prints taller than this, canvas px. */
  maxH?: number
  gap?: number
  overlap?: boolean
  minScale?: number
  /** The part every item stands on. */
  on?: string
}

/**
 * A scene being dealt. Recipes place parts through it; it keeps every part
 * inside the frame, keeps parts in one plane from overlapping, and deals each
 * part's knobs and facing.
 */
export class SdStage {
  readonly structure: SdStructure[] = []
  readonly parts: SdPart[] = []
  readonly W: number
  readonly H: number
  readonly panel: Bounds
  readonly rng: StudioRng
  readonly fullness: 0 | 1 | 2

  constructor(panel: Bounds, rng: StudioRng, fullness: 0 | 1 | 2) {
    this.panel = panel
    this.rng = rng
    this.fullness = fullness
    this.W = panel.maxX - panel.minX
    this.H = panel.maxY - panel.minY
  }

  x(u: number) {
    return this.panel.minX + u * this.W
  }

  y(v: number) {
    return this.panel.minY + v * this.H
  }

  /** A size as a share of the picture's height, with a print floor. */
  size(share: number) {
    return Math.max(SD_MIN_PART, share * this.H)
  }

  /** A kind's printed height at a scale (`unit`: the height of a thing one unit big), never over `max`. */
  sized(kind: string, unit: number, max = Infinity) {
    return Math.min(max, unit * sdSize(kind))
  }

  /** Chance scaled by how full this level deals scenes. */
  chance(base: number) {
    return this.rng.chance(Math.min(1, base * [0.9, 1.05, 1.25][this.fullness]!))
  }

  ring(ring: Ring, depth: number) {
    this.structure.push({ ring, depth })
  }

  /**
   * A band across the whole picture from `top` down to `bottom` (canvas px),
   * reaching past the frame. One too thin for two edges (a seam, a joint)
   * is drawn as one line along its middle, at the picture's one weight.
   */
  band(top: number, bottom: number, depth: number) {
    const p = this.panel
    if (bottom - top < SD_THIN_BAR) {
      const y = (top + bottom) / 2
      this.structure.push({ ring: [pt(p.minX - 40, y), pt(p.maxX + 40, y)], depth, line: true })
      return
    }
    this.ring(rect(p.minX - 40, top, this.W + 80, bottom - top), depth)
  }

  /** A band whose top edge is a gentle wave. */
  wave(top: number, amp: number, wavelength: number, depth: number, bottom = this.panel.maxY + 40) {
    const p = this.panel
    const phase = this.rng.next() * Math.PI * 2
    const out: Pt[] = []
    const n = Math.max(32, Math.ceil((this.W + 80) / 6))
    for (let i = 0; i <= n; i++) {
      const x = p.minX - 40 + ((this.W + 80) * i) / n
      out.push(pt(x, top + amp * Math.sin((2 * Math.PI * x) / wavelength + phase)))
    }
    out.push(pt(p.maxX + 40, bottom), pt(p.minX - 40, bottom))
    this.ring(out, depth)
    return (x: number) => top + amp * Math.sin((2 * Math.PI * x) / wavelength + phase)
  }

  /** Random knobs for a kind. */
  dealKnobs(kind: SdPropKind): SgKnobValues {
    const out: Record<string, number> = {}
    for (const [name, count] of Object.entries(kind.subject.knobs)) out[name] = this.rng.int(0, count - 1)
    return out
  }

  /** Place one part, or null when it will not fit inside the frame or clear of its plane. */
  put(place: SdPlace): SdPart | null {
    const kind = sdProp(place.kind)
    if (!kind) return null
    const knobs = place.knobs ?? this.dealKnobs(kind)
    const mirrored = place.mirrored ?? (kind.mirror && this.rng.chance(0.5))
    const b = kindDrawing(kind, knobs).bounds
    const k = printScale(b, place.h, place.maxW)
    const anchor = place.anchor ?? 'foot'
    const part: SdPart = {
      id: `p${this.parts.length}`,
      kind: kind.id,
      knobs,
      mirrored,
      ax: place.cx,
      ay: place.y,
      k,
      rx: (b.minX + b.maxX) / 2,
      ry: anchor === 'foot' ? b.maxY : anchor === 'top' ? b.minY : (b.minY + b.maxY) / 2,
      depth: place.depth,
      anchor,
      loose: place.overlap === true,
      ...(place.on ? { on: place.on } : {}),
      removable: place.removable ?? true,
      grounded: anchor === 'foot',
      swaps: place.swaps ?? [],
    }
    if (!partFits(part, this.panel, this.parts, { clearOfAll: place.clear === true })) return null
    this.parts.push(part)
    return part
  }

  /**
   * Parts in a row along one line (a floor, a table top, the ground),
   * left to right in the order given, spread with random gaps. When the row
   * is short of room, optional items go first, then everything shrinks a
   * little (never below 80%). A thing that would overlap something already
   * in the picture slides along the row to the nearest clear spot, and is
   * left out only when there is none.
   */
  row(items: readonly SdRowItem[], options: SdRowOptions): SdPart[] {
    const { x0, x1, y, depth, overlap, unit, maxH, on } = options
    const minScale = options.minScale ?? 0.8
    const gap = options.gap ?? inch(0.12)
    type Plan = { item: SdRowItem; kind: SdPropKind; knobs: SgKnobValues; mirrored: boolean; h: number; w: number; optional: boolean }
    let plans: Plan[] = []
    for (const item of items) {
      const chance = item.chance ?? 1
      if (chance < 1 && !this.chance(chance)) continue
      // A row prefers things it does not hold yet: three clocks on one wall is a muddle, not a room.
      // An optional choice with nothing new to offer is left out; a single kind asked twice (a pair
      // of hanging baskets, two deck chairs) is meant as a pair.
      const fresh = item.kinds.filter((id) => !plans.some((p) => p.kind.id === id))
      if (fresh.length === 0 && chance < 1 && item.kinds.length > 1) continue
      const kind = sdProp(this.rng.pick(fresh.length > 0 ? fresh : item.kinds))
      if (!kind) continue
      const knobs = this.dealKnobs(kind)
      const b = kindDrawing(kind, knobs).bounds
      const tall = Math.min(maxH ?? Infinity, item.h ?? (unit ?? 0) * sdSize(kind.id))
      if (!(tall > 0)) continue
      const k = printScale(b, tall, item.maxW)
      const mirrored = kind.mirror && (item.mirrored ?? this.rng.chance(0.5))
      plans.push({ item, kind, knobs, mirrored, h: (b.maxY - b.minY) * k, w: (b.maxX - b.minX) * k, optional: chance < 1 })
    }
    const room = x1 - x0
    const need = () => plans.reduce((s, p) => s + p.w, 0) + gap * Math.max(0, plans.length - 1)
    while (need() > room && plans.some((p) => p.optional)) {
      const drop = [...plans].reverse().find((p) => p.optional)!
      plans = plans.filter((p) => p !== drop)
    }
    // Shrink to fit, but never below the print floor: an item that would is left out.
    const fitScale = () => Math.min(1, Math.max(minScale, (room - gap * Math.max(0, plans.length - 1)) / plans.reduce((s, p) => s + p.w, 0)))
    let scale = plans.length > 0 ? fitScale() : 1
    for (;;) {
      const tooSmall = plans.find((p) => Math.max(p.w, p.h) * scale < SD_MIN_PART - 0.5)
      const over = plans.reduce((s, p) => s + p.w * scale, 0) + gap * Math.max(0, plans.length - 1) > room + 0.5
      if (!tooSmall && !over) break
      plans = plans.filter((p) => p !== (tooSmall ?? plans[plans.length - 1]))
      if (plans.length === 0) break
      scale = fitScale()
    }
    const widths = plans.map((p) => p.w * scale)
    const total = widths.reduce((s, w) => s + w, 0)
    const free = Math.max(0, room - total - gap * Math.max(0, plans.length - 1))
    const weights = Array.from({ length: plans.length + 1 }, () => 0.35 + this.rng.next())
    const sum = weights.reduce((s, w) => s + w, 0)
    // Each item's dealt spot along the row: left to right, random gaps between.
    const dealt: number[] = []
    let cursor = x0 + (free * weights[0]!) / sum
    widths.forEach((w, i) => {
      dealt.push(cursor)
      cursor += w + gap + (free * weights[i + 1]!) / sum
    })
    // The things the scene must have are placed first, then the optional ones. Each takes its
    // dealt spot if that is clear of everything already in the picture, or else the nearest clear
    // spot along the row (a chair that will not fit under a window goes where the wall is bare),
    // and is left out only when there is none.
    const order = plans.map((_, i) => i).sort((a, b) => Number(plans[a]!.optional) - Number(plans[b]!.optional) || a - b)
    const placed: { i: number; part: SdPart }[] = []
    for (const i of order) {
      const plan = plans[i]!
      const w = widths[i]!
      const at = dealt[i]!
      const step = Math.max(inch(0.05), w * 0.1)
      const spots = [at]
      for (let left = x0; left <= x1 - w + 0.5; left += step) if (Math.abs(left - at) > 0.5) spots.push(Math.min(left, x1 - w))
      spots.sort((a, b) => Math.abs(a - at) - Math.abs(b - at))
      for (const left of spots) {
        const part = this.put({
          kind: plan.kind.id,
          cx: left + w / 2,
          y: plan.item.y ?? y,
          h: plan.h * scale,
          depth: depth + (plan.item.depth ?? 0) + i * 0.01,
          anchor: plan.item.anchor,
          knobs: plan.knobs,
          mirrored: plan.mirrored,
          removable: plan.item.removable,
          swaps: plan.item.swaps ?? plan.item.kinds.filter((id) => id !== plan.kind.id),
          overlap,
          on,
        })
        if (!part) continue
        placed.push({ i, part })
        break
      }
    }
    return placed.sort((a, b) => a.i - b.i).map((p) => p.part)
  }

  /** A row standing on a part's surface; the part then holds them up and cannot be taken away. */
  onTop(base: SdPart | null, items: readonly SdRowItem[], options: { unit?: number; maxH?: number; pad?: number } = {}): SdPart[] {
    if (!base) return []
    const surface = partSurface(base)
    if (!surface) return []
    const pad = options.pad ?? inch(0.06)
    const placed = this.row(items, {
      x0: surface.x0 + pad,
      x1: surface.x1 - pad,
      y: surface.y,
      depth: base.depth + 1,
      gap: inch(0.06),
      overlap: true,
      minScale: 0.55,
      unit: options.unit,
      maxH: options.maxH,
      on: base.id,
    })
    if (placed.length > 0) base.removable = false
    return placed
  }

  done(recipe: string): SdScene {
    // Ids follow the final order, so a scene reads the same however it was dealt.
    const ids = new Map(this.parts.map((p, i) => [p.id, `p${i}`]))
    const parts = this.parts.map((p, i) => ({ ...p, id: `p${i}`, ...(p.on ? { on: ids.get(p.on) } : {}) }))
    return { recipe, panel: this.panel, structure: [...this.structure], parts }
  }
}
