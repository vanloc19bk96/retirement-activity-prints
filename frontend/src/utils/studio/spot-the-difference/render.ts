import { DPI } from '@/types/canvas-settings.types'
import {
  chainSegments,
  cutSegments,
  inRegion,
  polylineSegments,
  ringBounds,
  ringSegments,
  toRegion,
  type Bounds,
  type Pt,
  type Region,
  type Ring,
  type Seg,
} from '../stained-glass/geometry'
import { rect } from '../stained-glass/subject-kit'
import { overlaps, placedDrawing, type SdPart, type SdScene } from './scene'

/**
 * A scene → the lines it prints, and a way to see what changed.
 *
 * Every shape is white paper with a black edge, laid back to front, so a
 * later shape hides whatever lies behind it: what prints is each edge where
 * nothing later covers it, clipped to the picture's frame. Parts print a
 * little heavier than the backdrop, so objects read first.
 *
 * The comparison works on ink, the way a reader sees it: both pictures are
 * stamped onto a grid at print weight, and a cell counts as changed only
 * where one picture has ink and the other has none within the tolerance — so
 * a line nudged by a hair is not a difference, and a missing cup is.
 */

export type SdInk = 'scene' | 'part'

/** Print weights, canvas px (1 px = 0.75 pt). */
export const SD_INK_WIDTH: Readonly<Record<SdInk, number>> = { scene: 1.25, part: 1.6 }
/** The frame round each picture. */
export const SD_FRAME_WIDTH = 2.5
export const SD_FRAME_RADIUS = 0.1 * DPI

interface Item {
  pts: Ring
  closed: boolean
  ink: SdInk
  bounds: Bounds
  region: Region | null
}

export interface SdLines {
  scene: Pt[][]
  part: Pt[][]
}

/** The shapes of a scene in painting order, with parts swapped or taken out as `parts` says. */
function items(scene: SdScene, parts: readonly SdPart[], within?: Bounds): Item[] {
  type Unit = { depth: number; order: number; build: () => Item[] }
  const units: Unit[] = []
  scene.structure.forEach((s, i) =>
    units.push({
      depth: s.depth,
      order: i,
      build: () => [{ pts: s.ring, closed: true, ink: 'scene', bounds: ringBounds(s.ring), region: toRegion(s.ring) }],
    }),
  )
  parts.forEach((part, i) =>
    units.push({
      depth: part.depth,
      order: 10_000 + i,
      build: () => {
        const d = placedDrawing(part)
        const out: Item[] = []
        const stroke = (at: number) =>
          d.strokes
            .filter((s) => s.under === at)
            .forEach((s) => out.push({ pts: s.pts, closed: false, ink: 'part', bounds: ringBounds(s.pts), region: null }))
        d.pieces.forEach((piece, j) => {
          stroke(j)
          out.push({ pts: piece.ring, closed: true, ink: 'part', bounds: ringBounds(piece.ring), region: toRegion(piece.ring) })
        })
        stroke(d.pieces.length)
        return out
      },
    }),
  )
  units.sort((a, b) => a.depth - b.depth || a.order - b.order)
  const out = units.flatMap((u) => u.build())
  return within ? out.filter((it) => overlaps(it.bounds, within, 1)) : out
}

/** The picture's clip: inside the frame line. */
export function frameRing(panel: Bounds): Ring {
  return rect(panel.minX, panel.minY, panel.maxX - panel.minX, panel.maxY - panel.minY, SD_FRAME_RADIUS)
}

/**
 * Every line one picture prints, by weight: each shape's edge where no later
 * shape covers it, inside the frame (and inside `window`, when given).
 */
export function sceneLines(scene: SdScene, parts: readonly SdPart[], window?: Bounds): SdLines {
  const clip = toRegion(frameRing(insetFrame(scene.panel)))
  const box = window ? toRegion(rect(window.minX, window.minY, window.maxX - window.minX, window.maxY - window.minY)) : null
  const list = items(scene, parts, window)
  const segs: Record<SdInk, Seg[]> = { scene: [], part: [] }
  const inside = (p: Pt) => inRegion(p, clip) && (!box || inRegion(p, box))
  for (let i = 0; i < list.length; i++) {
    const it = list[i]!
    const later: Region[] = []
    for (let j = i + 1; j < list.length; j++) {
      const o = list[j]!
      if (o.region && overlaps(o.bounds, it.bounds, 1)) later.push(o.region)
    }
    const cutters = box ? [clip, box, ...later] : [clip, ...later]
    const own = it.closed ? ringSegments(it.pts) : polylineSegments(it.pts)
    segs[it.ink].push(...cutSegments(own, cutters, (mid) => inside(mid) && !later.some((r) => inRegion(mid, r))))
  }
  return { scene: chainSegments(segs.scene), part: chainSegments(segs.part) }
}

/** Lines stay a hair inside the frame's stroke, so they meet it cleanly. */
export const insetFrame = (panel: Bounds): Bounds => {
  const by = SD_FRAME_WIDTH / 2 + 0.5
  return { minX: panel.minX + by, minY: panel.minY + by, maxX: panel.maxX - by, maxY: panel.maxY - by }
}

/* ------------------------------------------------------------------ *
 * Ink on a grid
 * ------------------------------------------------------------------ */

/** Grid cells per canvas px: 48 per inch, finer than any change worth counting. */
export const SD_RASTER_SCALE = 0.5

export interface SdInkGrid {
  box: Bounds
  w: number
  h: number
  ink: Uint8Array
}

/** Stamp the lines at print weight, each widened by `grow` canvas px. */
export function stampInk(lines: SdLines, box: Bounds, grow = 0): SdInkGrid {
  const scale = SD_RASTER_SCALE
  const w = Math.max(1, Math.ceil((box.maxX - box.minX) * scale))
  const h = Math.max(1, Math.ceil((box.maxY - box.minY) * scale))
  const ink = new Uint8Array(w * h)
  for (const kind of ['scene', 'part'] as const) {
    const half = Math.max(0.75, ((SD_INK_WIDTH[kind] + grow * 2) * scale) / 2)
    const half2 = half * half
    for (const line of lines[kind]) {
      for (let i = 1; i < line.length; i++) {
        const ax = (line[i - 1]!.x - box.minX) * scale
        const ay = (line[i - 1]!.y - box.minY) * scale
        const bx = (line[i]!.x - box.minX) * scale
        const by = (line[i]!.y - box.minY) * scale
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
            if (ex * ex + ey * ey <= half2) ink[y * w + x] = 1
          }
        }
      }
    }
  }
  return { box, w, h, ink }
}

export interface SdChangeMap {
  /** Changed cells: ink in one picture with none in the other within the tolerance. */
  changed: Uint8Array
  w: number
  h: number
  box: Bounds
  count: number
  /** Bounds of the changed cells, canvas px; null when nothing changed. */
  bounds: Bounds | null
}

/** Where two pictures' ink differs by more than `tolerance` canvas px, over `box`. */
export function compareInk(a: SdLines, b: SdLines, box: Bounds, tolerance: number): SdChangeMap {
  const thinA = stampInk(a, box)
  const thinB = stampInk(b, box)
  const fatA = stampInk(a, box, tolerance)
  const fatB = stampInk(b, box, tolerance)
  const { w, h } = thinA
  const changed = new Uint8Array(w * h)
  let count = 0
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let i = 0; i < w * h; i++) {
    if ((thinA.ink[i] && !fatB.ink[i]) || (thinB.ink[i] && !fatA.ink[i])) {
      changed[i] = 1
      count++
      const x = i % w
      const y = (i - x) / w
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  const s = SD_RASTER_SCALE
  const bounds = count === 0 ? null : { minX: box.minX + minX / s, minY: box.minY + minY / s, maxX: box.minX + (maxX + 1) / s, maxY: box.minY + (maxY + 1) / s }
  return { changed, w, h, box, count, bounds }
}

/** Changed cells inside `area` (canvas px). */
export function changedWithin(map: SdChangeMap, area: Bounds): number {
  const s = SD_RASTER_SCALE
  const x0 = Math.max(0, Math.floor((area.minX - map.box.minX) * s))
  const x1 = Math.min(map.w - 1, Math.ceil((area.maxX - map.box.minX) * s))
  const y0 = Math.max(0, Math.floor((area.minY - map.box.minY) * s))
  const y1 = Math.min(map.h - 1, Math.ceil((area.maxY - map.box.minY) * s))
  let n = 0
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) n += map.changed[y * map.w + x]!
  return n
}

/** Share of the panel covered by ink, 0..1. */
export function inkShare(lines: SdLines, panel: Bounds): number {
  const grid = stampInk(lines, panel)
  let n = 0
  for (let i = 0; i < grid.ink.length; i++) n += grid.ink[i]!
  return n / grid.ink.length
}

/**
 * Inches of printed line for a count of changed grid cells: a line stamps
 * about a cell and a half across, so an inch of it is 1.5 × 48 cells.
 */
export const cellsToLineInches = (cells: number) => cells / (SD_RASTER_SCALE * DPI * 1.5)
