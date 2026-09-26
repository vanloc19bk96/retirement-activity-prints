import { DPI } from '@/types/canvas-settings.types'
import type { StudioRng } from '../studio-rng'
import type { Bounds } from '../stained-glass/geometry'
import type { SdFairness } from './content'
import { sdProp } from './props'
import { SD_RASTER_SCALE, cellsToLineInches, compareInk, sceneLines, type SdLines } from './render'
import { growBounds, kindDrawing, overlaps, partBounds, partFits, type SdPart, type SdScene } from './scene'

/**
 * The changes between the two pictures, and the proof that each is fair.
 *
 * A change is one thing done to one part: left out of one picture, one knob
 * set otherwise (the clock's hands, the fence's pickets), turned round, or
 * swapped for something of a similar size. Nothing else ever differs.
 *
 * Nothing is taken on trust. Each candidate is drawn both ways and the ink
 * compared (`render.ts`): it counts only if the ink it adds or takes away,
 * well clear of any line in the other picture, is big enough to see in print
 * and not so big it gives itself away. A change hidden behind something
 * else, a knob that only thickens a line, a thing that looks the same either
 * way round â€” all measure as too small and are never used. The ring the
 * answer page draws is fitted to that measured ink, so the answer key is the
 * change itself, not a guess at it.
 */

export type SdChangeKind = 'remove' | 'knob' | 'mirror' | 'swap'

export interface SdChange {
  /** The part changed (its id in the scene). */
  part: string
  kind: SdChangeKind
  /** The picture that shows the changed version: `a` is the top, `b` the bottom. */
  side: 'a' | 'b'
  /** The part as the changed picture shows it; null when it is left out. */
  to: SdPart | null
  /** What the answer key says: "No teacup (top)", "Clock changed". */
  label: string
}

/** The answer ring: an ellipse round the changed ink, canvas px. */
export interface SdMark {
  cx: number
  cy: number
  rx: number
  ry: number
}

export interface SdDifference extends SdChange {
  /** The changed ink's bounds, canvas px. */
  box: Bounds
  /** Changed line, inches of printed line. */
  ink: number
  mark: SdMark
}

const inch = (n: number) => n * DPI

/** Air between two answer rings, so every change reads as its own. */
export const SD_MARK_GAP = inch(0.06)
/** Changed grid cells tolerated outside every ring: rounding noise, about 0.06 in of hairline at most. */
export const SD_STRAY_CELLS = 3
/** How far an answer ring may run past a picture's frame. */
export const SD_MARK_OVERHANG = inch(0.1)
/** Smallest ring radius, and the ring's air round the changed ink. */
const MARK_MIN_R = inch(0.17)
const MARK_PAD = inch(0.06)

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const labelOf = (part: SdPart) => sdProp(part.kind)?.label ?? part.kind

export const markBounds = (m: SdMark): Bounds => ({ minX: m.cx - m.rx, minY: m.cy - m.ry, maxX: m.cx + m.rx, maxY: m.cy + m.ry })

/** Inside the ring (scaled by `grow`). */
export const inMark = (m: SdMark, x: number, y: number, grow = 1) => ((x - m.cx) / (m.rx * grow)) ** 2 + ((y - m.cy) / (m.ry * grow)) ** 2 <= 1

/** The two pictures' parts once the changes are made. */
export function pictureParts(scene: SdScene, changes: readonly SdChange[]): { a: SdPart[]; b: SdPart[] } {
  const apply = (side: 'a' | 'b') =>
    scene.parts.flatMap((part) => {
      const change = changes.find((c) => c.part === part.id && c.side === side)
      if (!change) return [part]
      return change.to ? [change.to] : []
    })
  return { a: apply('a'), b: apply('b') }
}

/* ------------------------------------------------------------------ *
 * Candidates
 * ------------------------------------------------------------------ */

/** A version of `part` with a new kind, the same printed height, standing where it stood. */
function swapped(part: SdPart, kindId: string, rng: StudioRng): SdPart | null {
  const kind = sdProp(kindId)
  if (!kind) return null
  const knobs: Record<string, number> = {}
  for (const [name, count] of Object.entries(kind.subject.knobs)) knobs[name] = rng.int(0, count - 1)
  const b = kindDrawing(kind, knobs).bounds
  const old = partBounds(part)
  const h = old.maxY - old.minY
  const w = old.maxX - old.minX
  const k = Math.min(h / (b.maxY - b.minY), (w * 1.3) / (b.maxX - b.minX))
  return {
    ...part,
    kind: kind.id,
    knobs,
    mirrored: kind.mirror && part.mirrored,
    k,
    rx: (b.minX + b.maxX) / 2,
    ry: part.anchor === 'foot' ? b.maxY : part.anchor === 'top' ? b.minY : (b.minY + b.maxY) / 2,
  }
}

/** Does a changed version keep its footing (or its hook) and its place in the scene? */
function sound(scene: SdScene, before: SdPart, after: SdPart): boolean {
  if (!partFits(after, scene.panel, scene.parts)) return false
  if (after.kind !== before.kind) return true
  const kind = sdProp(after.kind)!
  const a = kindDrawing(kind, before.knobs).bounds
  const b = kindDrawing(kind, after.knobs).bounds
  // A knob that lifts a foot off the floor (or a hanging thing off its hook) would read as moved, not changed.
  if (after.anchor === 'foot' && Math.abs(a.maxY - b.maxY) > 2.5) return false
  if (after.anchor === 'top' && Math.abs(a.minY - b.minY) > 2.5) return false
  return true
}

/** Every change the scene allows, before measuring. */
export function candidateChanges(scene: SdScene, rng: StudioRng): SdChange[] {
  const out: SdChange[] = []
  for (const part of scene.parts) {
    const kind = sdProp(part.kind)
    if (!kind) continue
    const name = labelOf(part)
    if (part.removable) {
      const side = rng.chance(0.5) ? 'a' : 'b'
      out.push({ part: part.id, kind: 'remove', side, to: null, label: `No ${name} (${side === 'a' ? 'top' : 'bottom'})` })
    }
    for (const [knob, count] of Object.entries(kind.subject.knobs)) {
      for (let v = 0; v < count; v++) {
        if (v === (part.knobs[knob] ?? 0)) continue
        const to: SdPart = { ...part, knobs: { ...part.knobs, [knob]: v } }
        if (sound(scene, part, to)) out.push({ part: part.id, kind: 'knob', side: 'b', to, label: `${cap(name)} changed` })
      }
    }
    if (kind.turn) {
      const to: SdPart = { ...part, mirrored: !part.mirrored }
      if (sound(scene, part, to)) out.push({ part: part.id, kind: 'mirror', side: 'b', to, label: `${cap(name)} turned around` })
    }
    for (const id of rng.shuffle([...new Set(part.swaps)].filter((s) => s !== part.kind)).slice(0, 2)) {
      const to = swapped(part, id, rng)
      if (to && sound(scene, part, to)) out.push({ part: part.id, kind: 'swap', side: 'b', to, label: `${cap(name)} / ${labelOf(to)}` })
    }
  }
  return out
}

/* ------------------------------------------------------------------ *
 * Measuring
 * ------------------------------------------------------------------ */

/**
 * The smallest ring round the changed ink that holds every changed cell
 * with air to spare, or null when it will not fit inside the frame.
 */
export function fitMark(box: Bounds, cells: readonly { x: number; y: number }[], panel: Bounds): SdMark | null {
  const w = box.maxX - box.minX
  const h = box.maxY - box.minY
  let rx0 = w / 2 + MARK_PAD
  let ry0 = h / 2 + MARK_PAD
  // Never a sliver of an ellipse: a long change gets a rounder ring.
  if (rx0 > ry0 * 2.5) ry0 = rx0 / 2.5
  if (ry0 > rx0 * 2.5) rx0 = ry0 / 2.5
  const cx = (box.minX + box.maxX) / 2
  const cy = (box.minY + box.maxY) / 2
  // A ring may run a little past the frame (the layout keeps that much paper round each picture).
  const room = growBounds(panel, SD_MARK_OVERHANG)
  for (let f = 1; f <= 1.5; f += 0.05) {
    const m = { cx, cy, rx: Math.max(MARK_MIN_R, rx0 * f), ry: Math.max(MARK_MIN_R, ry0 * f) }
    // Every changed cell inside, with the pad's worth of air round the outermost.
    const grow = 1 - MARK_PAD / (2 * Math.max(m.rx, m.ry))
    if (!cells.every((p) => inMark(m, p.x, p.y, grow))) continue
    const b = markBounds(m)
    if (b.minX >= room.minX && b.maxX <= room.maxX && b.minY >= room.minY && b.maxY <= room.maxY) return m
    return null
  }
  return null
}

/** Draw the change both ways near the part and measure it; null when it is not a fair difference. */
export function measureChange(scene: SdScene, change: SdChange, fair: SdFairness): SdDifference | null {
  const part = scene.parts.find((p) => p.id === change.part)
  if (!part) return null
  const tolerance = fair.tolerance * DPI
  let window = partBounds(part)
  if (change.to) {
    const t = partBounds(change.to)
    window = { minX: Math.min(window.minX, t.minX), minY: Math.min(window.minY, t.minY), maxX: Math.max(window.maxX, t.maxX), maxY: Math.max(window.maxY, t.maxY) }
  }
  window = growBounds(window, tolerance * 2 + 6)
  const p = scene.panel
  // On the whole picture's grid, so a change measures the same here as in the full check (`checkPair`).
  const snap = (v: number, o: number, up: boolean) => o + (up ? Math.ceil : Math.floor)((v - o) * SD_RASTER_SCALE) / SD_RASTER_SCALE
  window = {
    minX: Math.max(p.minX, snap(window.minX, p.minX, false)),
    minY: Math.max(p.minY, snap(window.minY, p.minY, false)),
    maxX: Math.min(p.maxX, snap(window.maxX, p.minX, true)),
    maxY: Math.min(p.maxY, snap(window.maxY, p.minY, true)),
  }
  const before = sceneLines(scene, scene.parts, window)
  const after = sceneLines(scene, pictureParts(scene, [{ ...change, side: 'b' }]).b, window)
  const map = compareInk(before, after, window, tolerance)
  if (!map.bounds) return null
  const box = map.bounds
  const ink = cellsToLineInches(map.count)
  const extent = Math.max(box.maxX - box.minX, box.maxY - box.minY)
  if (ink < fair.minLine) return null
  if (extent < inch(fair.minExtent)) return null
  if (extent > fair.maxExtentShare * (p.maxY - p.minY)) return null
  const s = map.w / (map.box.maxX - map.box.minX)
  const cells: { x: number; y: number }[] = []
  for (let i = 0; i < map.changed.length; i++) {
    if (map.changed[i]) cells.push({ x: map.box.minX + ((i % map.w) + 0.5) / s, y: map.box.minY + (Math.floor(i / map.w) + 0.5) / s })
  }
  const mark = fitMark(box, cells, p)
  if (!mark) return null
  return { ...change, box, ink, mark }
}

/* ------------------------------------------------------------------ *
 * Choosing
 * ------------------------------------------------------------------ */

/**
 * Deal fair changes: as many as `count` allows (its upper end first, never
 * fewer than its lower end), kinds weighted by the level, at most one per
 * part, never more than half of one kind, every ring clear of every other.
 * Candidates are measured lazily in dealt order, so a page measures only
 * what it might use. Null when the scene cannot hide enough of them.
 */
export function chooseDifferences(options: {
  scene: SdScene
  rng: StudioRng
  fair: SdFairness
  /** How many: an exact number, or `[fewest, most]`. */
  count: number | readonly [number, number]
  /** Parts not to change (an earlier choice failed the full check there). */
  exclude?: ReadonlySet<string>
}): SdDifference[] | null {
  const { scene, rng, fair, exclude } = options
  const [fewest, count] = typeof options.count === 'number' ? [options.count, options.count] : options.count
  const candidates = candidateChanges(scene, rng).filter((c) => !exclude?.has(c.part))
  // Weight is per kind of change, shared across a part's versions so a many-knobbed part is not favoured.
  const weights = candidates.map((c) => {
    const siblings = c.kind === 'knob' || c.kind === 'swap' ? candidates.filter((o) => o.part === c.part && o.kind === c.kind).length : 1
    return fair.weights[c.kind] / siblings
  })
  const measured = new Map<number, SdDifference | null>()
  const measure = (i: number) => {
    if (!measured.has(i)) measured.set(i, measureChange(scene, candidates[i]!, fair))
    return measured.get(i)!
  }
  const maxOfKind = Math.ceil(count / 2)
  let best: SdDifference[] = []
  const area = (i: number) => {
    const d = measure(i)
    return d ? d.mark.rx * d.mark.ry : Infinity
  }
  // A few dealt orders: rings compete for room, and the first order is not always the one that fits.
  // The last pass packs: every candidate measured, smallest rings first (a little shuffled), which
  // fits the most rings into a small picture.
  for (let pass = 0; pass <= SD_CHOOSE_PASSES; pass++) {
    const packing = pass === SD_CHOOSE_PASSES
    // A weighted shuffle: each candidate's key is -ln(u) / weight, smallest first.
    const order = candidates
      .map((_, i) => ({ i, key: packing ? area(i) * (0.8 + rng.next() * 0.4) : -Math.log(1 - rng.next()) / Math.max(1e-6, weights[i]!) }))
      .sort((a, b) => a.key - b.key)
    const chosen: SdDifference[] = []
    const used = new Set<string>()
    const kinds = new Map<SdChangeKind, number>()
    const busy: Bounds[] = []
    for (const { i } of order) {
      if (chosen.length >= count) break
      const c = candidates[i]!
      if (used.has(c.part) || (kinds.get(c.kind) ?? 0) >= maxOfKind) continue
      const part = scene.parts.find((p) => p.id === c.part)!
      // Cheap test first: a part wholly inside a ring already chosen cannot hold another change.
      if (busy.some((b) => overlaps(b, partBounds(part), -inch(0.05)) && overlaps(b, partBounds(c.to ?? part), -inch(0.05)))) continue
      const d = measure(i)
      if (!d) continue
      const mb = growBounds(markBounds(d.mark), SD_MARK_GAP / 2)
      if (busy.some((b) => overlaps(b, mb))) continue
      chosen.push(d)
      used.add(c.part)
      kinds.set(c.kind, (kinds.get(c.kind) ?? 0) + 1)
      busy.push(mb)
    }
    if (chosen.length >= count) return sortReading(chosen, scene.panel)
    // Most-of-kind is fair for the full count; below it, a mix still needs every kind at or under half.
    if (chosen.length > best.length && [...kinds.values()].every((n) => n <= Math.ceil(chosen.length / 2))) best = chosen
  }
  return best.length >= fewest ? sortReading(best, scene.panel) : null
}

/** Dealt orders tried before a scene is judged unable to hide the count. */
const SD_CHOOSE_PASSES = 5

/** Numbered in reading order: top to bottom in thirds of the picture, left to right within each. */
export function sortReading(list: readonly SdDifference[], panel: Bounds): SdDifference[] {
  const third = (panel.maxY - panel.minY) / 3
  const band = (d: SdDifference) => Math.floor((d.mark.cy - panel.minY) / third)
  return [...list].sort((a, b) => band(a) - band(b) || a.mark.cx - b.mark.cx)
}

/* ------------------------------------------------------------------ *
 * The whole pair, checked
 * ------------------------------------------------------------------ */

/** Both finished pictures' line art. */
export function sdPairLines(scene: SdScene, changes: readonly SdChange[]): { a: SdLines; b: SdLines } {
  const { a, b } = pictureParts(scene, changes)
  return { a: sceneLines(scene, a), b: sceneLines(scene, b) }
}

export interface SdPairCheck {
  ok: boolean
  errors: string[]
  /** Parts whose change failed (too faint in the full picture, or spilling outside its ring). */
  offending: string[]
}

/**
 * The two finished pictures compared whole: every change still shows as
 * much ink as it did alone (nothing in front of it, no neighbour's change
 * masking it), and no ink differs anywhere outside the rings. This is the
 * proof that the answer key is exactly the differences, no more, no fewer.
 */
export function checkPair(scene: SdScene, differences: readonly SdDifference[], fair: SdFairness, lines?: { a: SdLines; b: SdLines }): SdPairCheck {
  const drawn = lines ?? sdPairLines(scene, differences)
  const map = compareInk(drawn.a, drawn.b, scene.panel, fair.tolerance * DPI)
  const errors: string[] = []
  const offending = new Set<string>()
  const cells = new Array<number>(differences.length).fill(0)
  let stray = 0
  const s = map.w / (map.box.maxX - map.box.minX)
  for (let i = 0; i < map.changed.length; i++) {
    if (!map.changed[i]) continue
    const x = map.box.minX + ((i % map.w) + 0.5) / s
    const y = map.box.minY + (Math.floor(i / map.w) + 0.5) / s
    const hit = differences.findIndex((d) => inMark(d.mark, x, y, 1.04))
    if (hit >= 0) cells[hit]!++
    else {
      stray++
      // Blame the nearest change, so a retry can leave it out.
      let best = -1
      let bestD = Infinity
      differences.forEach((d, j) => {
        const dd = Math.hypot(d.mark.cx - x, d.mark.cy - y)
        if (dd < bestD) (bestD = dd), (best = j)
      })
      if (best >= 0) offending.add(differences[best]!.part)
    }
  }
  // A cell or two can flip exactly at the tolerance where two renders round differently; that is
  // a few hundredths of an inch, far below anything a reader could see. More than that is a real stray.
  if (stray > SD_STRAY_CELLS) errors.push(`The pictures differ outside the answer rings (${stray} spots of ink).`)
  else offending.clear()
  differences.forEach((d, i) => {
    if (cellsToLineInches(cells[i]!) < fair.minLine * 0.9) {
      errors.push(`â€œ${d.label}â€ barely shows once both pictures are complete.`)
      offending.add(d.part)
    }
  })
  return { ok: errors.length === 0, errors, offending: [...offending] }
}
