import { DPI } from '@/types/canvas-settings.types'
import type { StudioRng } from '../studio-rng'
import type { SgKnobValues } from '../stained-glass/catalog'
import { pt, ringBounds, type Bounds, type Pt, type Ring } from '../stained-glass/geometry'
import { rect, type SubjectDrawing } from '../stained-glass/subject-kit'
import { sdProp, type SdPropKind } from './props'

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
  /** May overlap its neighbours in the same plane (things standing on a table or blanket). */
  loose: boolean
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

/** Drawing units → canvas px for a part (mirroring about its reference point). */
export function partMap(part: SdPart): (p: Pt) => Pt {
  const { ax, ay, k, rx, ry, mirrored } = part
  return (p) => pt(ax + k * ((mirrored ? 2 * rx - p.x : p.x) - rx), ay + k * (p.y - ry))
}

/** The part's drawing, placed on the canvas. */
export function placedDrawing(part: SdPart): SubjectDrawing {
  const kind = sdProp(part.kind)!
  const { drawing } = kindDrawing(kind, part.knobs)
  const map = partMap(part)
  const flip = part.mirrored
  return {
    pieces: drawing.pieces.map((piece) => ({ ...piece, ring: flip ? piece.ring.map(map).reverse() : piece.ring.map(map) })),
    strokes: drawing.strokes.map((s) => ({ ...s, pts: s.pts.map(map) })),
  }
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

export type SdAnchor = 'foot' | 'top' | 'middle'

/** Wholly inside the frame (clear of it); and clear of every other part in its plane unless it is loose, or of every part at all. */
export function partFits(part: SdPart, panel: Bounds, others: readonly SdPart[], options: { clearOfAll?: boolean } = {}): boolean {
  const b = partBounds(part)
  const clear = SD_FRAME_CLEAR
  if (b.minX < panel.minX + clear || b.maxX > panel.maxX - clear || b.minY < panel.minY + clear || b.maxY > panel.maxY - clear) return false
  const rest = others.filter((o) => o !== part && o.id !== part.id)
  if (options.clearOfAll) return !rest.some((o) => overlaps(partBounds(o), b, 6))
  if (part.loose) return true
  return !rest.some((o) => !o.loose && Math.abs(o.depth - part.depth) < 5 && overlaps(partBounds(o), b, 2))
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
  /** May overlap parts in the same plane (things standing on a blanket). */
  overlap?: boolean
  /** Must stay clear of every part, whatever its plane (a sun is never half behind a tree). */
  clear?: boolean
}

export interface SdRowItem {
  /** Kinds to choose from. */
  kinds: readonly string[]
  /** Printed height, canvas px. */
  h: number
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

  /** Chance scaled by how full this level deals scenes. */
  chance(base: number) {
    return this.rng.chance(Math.min(1, base * [0.9, 1.05, 1.25][this.fullness]!))
  }

  ring(ring: Ring, depth: number) {
    this.structure.push({ ring, depth })
  }

  /** A band across the whole picture from `top` down to `bottom` (canvas px), reaching past the frame. */
  band(top: number, bottom: number, depth: number) {
    const p = this.panel
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
    const bw = b.maxX - b.minX
    const bh = b.maxY - b.minY
    let k = place.h / bh
    if (place.maxW !== undefined) k = Math.min(k, place.maxW / bw)
    if (Math.max(bw, bh) * k < SD_MIN_PART) k = SD_MIN_PART / Math.max(bw, bh)
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
   * little (never below 80%).
   */
  row(items: readonly SdRowItem[], options: { x0: number; x1: number; y: number; depth: number; gap?: number; overlap?: boolean; minScale?: number }): SdPart[] {
    const { x0, x1, y, depth, overlap } = options
    const minScale = options.minScale ?? 0.8
    const gap = options.gap ?? inch(0.12)
    type Plan = { item: SdRowItem; kind: SdPropKind; knobs: SgKnobValues; mirrored: boolean; w: number; optional: boolean }
    let plans: Plan[] = []
    for (const item of items) {
      const chance = item.chance ?? 1
      if (chance < 1 && !this.chance(chance)) continue
      const kind = sdProp(this.rng.pick(item.kinds))
      if (!kind) continue
      const knobs = this.dealKnobs(kind)
      const b = kindDrawing(kind, knobs).bounds
      let k = item.h / (b.maxY - b.minY)
      if (item.maxW !== undefined) k = Math.min(k, item.maxW / (b.maxX - b.minX))
      plans.push({ item, kind, knobs, mirrored: kind.mirror && this.rng.chance(0.5), w: (b.maxX - b.minX) * k, optional: chance < 1 })
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
      const tooSmall = plans.find((p) => p.item.h * scale < SD_MIN_PART - 0.5)
      const over = plans.reduce((s, p) => s + p.w * scale, 0) + gap * Math.max(0, plans.length - 1) > room + 0.5
      if (!tooSmall && !over) break
      plans = plans.filter((p) => p !== (tooSmall ?? plans[plans.length - 1]))
      if (plans.length === 0) break
      scale = fitScale()
    }
    const total = plans.reduce((s, p) => s + p.w * scale, 0)
    const free = Math.max(0, room - total - gap * Math.max(0, plans.length - 1))
    const weights = Array.from({ length: plans.length + 1 }, () => 0.35 + this.rng.next())
    const sum = weights.reduce((s, w) => s + w, 0)
    const placed: SdPart[] = []
    let cursor = x0 + (free * weights[0]!) / sum
    plans.forEach((plan, i) => {
      const w = plan.w * scale
      const part = this.put({
        kind: plan.kind.id,
        cx: cursor + w / 2,
        y: plan.item.y ?? y,
        h: plan.item.h * scale,
        maxW: plan.item.maxW !== undefined ? plan.item.maxW * scale : undefined,
        depth: depth + (plan.item.depth ?? 0) + i * 0.01,
        anchor: plan.item.anchor,
        knobs: plan.knobs,
        mirrored: plan.mirrored,
        removable: plan.item.removable,
        swaps: plan.item.swaps ?? plan.item.kinds.filter((id) => id !== plan.kind.id),
        overlap,
      })
      if (part) placed.push(part)
      cursor += w + gap + (free * weights[i + 1]!) / sum
    })
    return placed
  }

  /** A row standing on a part's surface; the part then holds them up and cannot be taken away. */
  onTop(base: SdPart | null, items: readonly SdRowItem[], pad = inch(0.06)): SdPart[] {
    if (!base) return []
    const surface = partSurface(base)
    if (!surface) return []
    const placed = this.row(items, { x0: surface.x0 + pad, x1: surface.x1 - pad, y: surface.y, depth: base.depth + 1, gap: inch(0.06), overlap: true, minScale: 0.55 })
    if (placed.length > 0) base.removable = false
    return placed
  }

  done(recipe: string): SdScene {
    // Ids follow the final order, so a scene reads the same however it was dealt.
    const parts = this.parts.map((p, i) => ({ ...p, id: `p${i}` }))
    return { recipe, panel: this.panel, structure: [...this.structure], parts }
  }
}
