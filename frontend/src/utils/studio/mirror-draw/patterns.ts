import patternsJson from '@/data/studio/mirror-draw/patterns.json'
import type { StudioRng } from '../studio-rng'
import { selectOwnerIconPool } from '../studio-owner-icon-pool'
import {
  emptyBitmap,
  isGivenSegment,
  isGivenSide,
  reflectFor,
  reflectSegments,
  transposeHalf,
} from './reflect'
import {
  adaptSegmentsForAxis,
  emptyLineGrid,
  outlineSegmentsFromLeftHalf,
} from './line-from-half'
import { shapesForTheme, type ShapeSpec } from './shapes'
import type {
  Axis,
  Bitmap,
  DrawStyle,
  GridSize,
  HalfPattern,
  MirrorPattern,
  MirrorTheme,
  PatternSource,
  Segment,
} from './types'
import { MIRROR_THEMES } from './types'

const MAX_THEMED_ATTEMPTS = 48

/**
 * Marks the solver still has to add. At zero the mirrored side is empty and the
 * page is not a puzzle at all — reachable when a line figure lands entirely on
 * the axis, because `reflectSegments` dedupes a segment that mirrors onto itself.
 */
const MIN_ANSWER_MARKS = 3
/** Marks printed as the prompt. Too few and there is nothing to read off. */
const MIN_GIVEN_MARKS = 3
/**
 * Past this the grid prints as a near-solid block: costly to ink, and the
 * silhouette stops reading as a subject. A solid picture legitimately fills a
 * lot of its grid, so the cap sits well above a typical silhouette.
 */
const MAX_PIXEL_FILL = 0.68
const MIN_PIXEL_FILL = 0.12

/**
 * Share of a subject pool one seller may draw from. Both the curated art and the
 * shape catalog are fixed sets, so two sellers running the same job would
 * otherwise work through the same subjects in the same order.
 */
const OWNER_LIBRARY_FRACTION = 0.7
const OWNER_LIBRARY_MIN = 24
const OWNER_SHAPE_FRACTION = 0.7
const OWNER_SHAPE_MIN = 12

/**
 * Distinct non-empty row shapes the given region must show. A solid rectangle
 * scores one, and the jitter's notch filling can collapse a subject onto exactly
 * that — a dull page with nothing to read off the grid.
 */
const MIN_ROW_VARIETY = 3

/** Odds of reaching for curated art rather than a procedural silhouette. */
const CURATED_SHARE = 0.5

interface RawPattern {
  id: string
  name: string
  rows: number
  halfCols: number
  theme: string
  style: string
  half: string[]
  segments?: Segment[]
}

function asGridSize(n: number): GridSize {
  if (n === 8 || n === 10 || n === 12 || n === 16) return n
  throw new Error(`Invalid mirror-draw grid size: ${n}`)
}

function asStyle(s: string): DrawStyle {
  return s === 'line' ? 'line' : 'pixel'
}

function parseHalfRows(rows: string[], expectedRows: number, halfCols: number, id: string): Bitmap {
  if (rows.length !== expectedRows) {
    throw new Error(`Pattern ${id}: expected ${expectedRows} rows, got ${rows.length}`)
  }
  const grid = emptyBitmap(expectedRows, halfCols)
  for (let r = 0; r < expectedRows; r++) {
    const row = rows[r]!
    if (row.length !== halfCols) {
      throw new Error(`Pattern ${id} row ${r}: expected ${halfCols} cols, got ${row.length}`)
    }
    for (let c = 0; c < halfCols; c++) {
      grid[r]![c] = row[c] === '#'
    }
  }
  return grid
}

export function loadPatterns(): MirrorPattern[] {
  return (patternsJson as RawPattern[]).map((raw) => ({
    id: raw.id,
    name: raw.name,
    rows: raw.rows,
    halfCols: raw.halfCols,
    theme: raw.theme,
    style: asStyle(raw.style),
    half: raw.half,
    segments: raw.segments,
  }))
}

export const MIRROR_LIBRARY = loadPatterns()

function filterLibrary(
  size: GridSize,
  theme: MirrorTheme,
  style: DrawStyle,
): MirrorPattern[] {
  const all = MIRROR_LIBRARY.filter(
    (p) => p.rows === size && p.halfCols === size / 2 && p.style === style,
  )
  if (theme === 'mixed') return all
  if (!(MIRROR_THEMES as readonly string[]).includes(theme)) return all
  const themed = all.filter((p) => p.theme === theme)
  return themed.length > 0 ? themed : all
}

/** Deterministic per-seller slice of a curated bucket. Same owner → same slice. */
function ownerLibraryPool(
  patterns: MirrorPattern[],
  ownerKey: string | undefined,
): MirrorPattern[] {
  if (!ownerKey || patterns.length === 0) return patterns
  const wanted = Math.max(
    OWNER_LIBRARY_MIN,
    Math.round(patterns.length * OWNER_LIBRARY_FRACTION),
  )
  if (wanted >= patterns.length) return patterns
  const byId = new Map(patterns.map((p) => [p.id, p]))
  const ids = selectOwnerIconPool([...byId.keys()], ownerKey, wanted)
  return ids.map((id) => byId.get(id)!).filter((p): p is MirrorPattern => p !== undefined)
}

/** Deterministic per-seller slice of the procedural shape catalog. */
function ownerShapePool(theme: MirrorTheme, ownerKey: string | undefined): ShapeSpec[] {
  const all = shapesForTheme(theme)
  if (!ownerKey || all.length === 0) return all
  const wanted = Math.max(OWNER_SHAPE_MIN, Math.round(all.length * OWNER_SHAPE_FRACTION))
  if (wanted >= all.length) return all
  const byId = new Map(all.map((s) => [s.id, s]))
  const ids = selectOwnerIconPool([...byId.keys()], ownerKey, wanted)
  return ids.map((id) => byId.get(id)!).filter((s): s is ShapeSpec => s !== undefined)
}

/**
 * Seeded jitter that keeps the subject readable: it slides the figure and fills
 * concave notches, never scattering loose specks. This is what separates two
 * sellers who happen to draw the same subject — the silhouette is the same idea,
 * the printed grid is not the same page.
 */
function jitterHalf(half: Bitmap, rng: StudioRng): Bitmap {
  const rows = half.length
  const cols = half[0]?.length ?? 0
  if (rows === 0 || cols === 0) return half

  const shifted = emptyBitmap(rows, cols)
  const dr = rng.int(-2, 2)
  for (let r = 0; r < rows; r++) {
    const src = r - dr
    if (src < 0 || src >= rows) continue
    for (let c = 0; c < cols; c++) shifted[r]![c] = half[src]![c]!
  }

  // Neighbours read from the pre-pass snapshot so one filled notch cannot
  // cascade into its neighbour and swell the silhouette.
  const before = shifted.map((row) => [...row])
  const chance = 0.15 + rng.next() * 0.25
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (before[r]![c]) continue
      let neighbors = 0
      if (r > 0 && before[r - 1]![c]) neighbors++
      if (r + 1 < rows && before[r + 1]![c]) neighbors++
      if (c > 0 && before[r]![c - 1]) neighbors++
      if (c + 1 < cols && before[r]![c + 1]) neighbors++
      if (neighbors >= 2 && rng.chance(chance)) shifted[r]![c] = true
    }
  }
  return shifted
}

/** Cluster pass so abstract fills read as a shape, not noise. */
function clusterPass(grid: Bitmap, rng: StudioRng): void {
  const rows = grid.length
  const cols = grid[0]?.length ?? 0
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r]![c]) continue
      let neighbors = 0
      if (r > 0 && grid[r - 1]![c]) neighbors++
      if (r + 1 < rows && grid[r + 1]![c]) neighbors++
      if (c > 0 && grid[r]![c - 1]) neighbors++
      if (c + 1 < cols && grid[r]![c + 1]) neighbors++
      if (neighbors >= 2 && rng.chance(0.35)) grid[r]![c] = true
    }
  }
}

function givenDims(size: number, axis: Axis): { rows: number; cols: number } {
  const half = size / 2
  if (axis === 'vertical') return { rows: size, cols: half }
  if (axis === 'horizontal') return { rows: half, cols: size }
  return { rows: half, cols: half }
}

export function generateAbstractHalf(size: number, axis: Axis, rng: StudioRng): HalfPattern {
  const { rows, cols } = givenDims(size, axis)
  // Kept well under the ink cap: the cluster pass below roughly doubles this.
  const density = 0.2 + rng.next() * 0.1
  const grid = emptyBitmap(rows, cols)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      grid[r]![c] = rng.chance(density)
    }
  }
  clusterPass(grid, rng)
  let filled = 0
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) if (grid[r]![c]) filled++
  }
  const total = rows * cols
  if (filled === 0) {
    grid[rng.int(0, rows - 1)]![rng.int(0, cols - 1)] = true
  } else if (filled === total) {
    grid[rng.int(0, rows - 1)]![rng.int(0, cols - 1)] = false
  }
  return { grid, rows, cols }
}

function axisForSegment(seg: Segment, size: number, axis: Axis): boolean {
  const half = size / 2
  if (axis === 'vertical') return Math.max(seg.c1, seg.c2) <= half
  if (axis === 'horizontal') return Math.max(seg.r1, seg.r2) <= half
  return Math.max(seg.r1, seg.r2) <= half && Math.max(seg.c1, seg.c2) <= half
}

/** Seeded polyline figure on the given half's grid dots (0..size). */
export function generateAbstractSegments(
  size: number,
  axis: Axis,
  rng: StudioRng,
): Segment[] {
  const half = size / 2
  const maxR = axis === 'vertical' ? size : half
  const maxC = axis === 'horizontal' ? size : half
  const count = rng.int(Math.max(4, half), Math.max(6, size))
  const points: { r: number; c: number }[] = []
  let r = rng.int(0, maxR)
  let c = rng.int(0, maxC)
  points.push({ r, c })
  for (let i = 0; i < count; i++) {
    const horizontal = rng.chance(0.5)
    if (horizontal) {
      c = rng.int(0, maxC)
    } else {
      r = rng.int(0, maxR)
    }
    points.push({ r, c })
  }
  const segs: Segment[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!
    const b = points[i + 1]!
    if (a.r === b.r && a.c === b.c) continue
    const seg = { r1: a.r, c1: a.c, r2: b.r, c2: b.c }
    if (axisForSegment(seg, size, axis)) segs.push(seg)
  }
  if (segs.length === 0) {
    segs.push({ r1: 0, c1: 0, r2: maxR, c2: maxC > 0 ? Math.min(maxC, half) : 0 })
  }
  return segs
}

/**
 * Left half → quadrant by squashing rows in pairs rather than cropping.
 * Cropping keeps only the top of the subject, which throws away most of what
 * made one picture differ from another and prints a decapitated shape.
 */
function squashToQuadrant(left: Bitmap, size: GridSize): Bitmap {
  const half = size / 2
  const out = emptyBitmap(half, half)
  for (let r = 0; r < half; r++) {
    for (let c = 0; c < half; c++) {
      out[r]![c] = Boolean(left[r * 2]?.[c]) || Boolean(left[r * 2 + 1]?.[c])
    }
  }
  return out
}

function leftHalfToGiven(left: Bitmap, size: GridSize, axis: Axis): Bitmap {
  if (axis === 'vertical') return left
  if (axis === 'horizontal') return transposeHalf(left)
  return squashToQuadrant(left, size)
}

export interface MirrorSource {
  style: DrawStyle
  grid: Bitmap
  segments: Segment[]
}

export interface MirrorQuality {
  /** Marks printed on the puzzle page. */
  givenMarks: number
  /** Marks the solver must add — zero means the page is not a puzzle. */
  answerMarks: number
  /** Share of the whole grid inked once mirrored (pixel style only). */
  fillRatio: number
}

/**
 * Measure a source the way the printed page will read it: after reflection, and
 * on the region the active axis actually treats as given.
 */
export function mirrorSourceQuality(
  source: MirrorSource,
  size: GridSize,
  axis: Axis,
): MirrorQuality {
  if (source.style === 'line') {
    const all = reflectSegments(axis, source.segments, size)
    let given = 0
    for (const seg of all) if (isGivenSegment(seg, size, axis)) given++
    return { givenMarks: given, answerMarks: all.length - given, fillRatio: 0 }
  }

  const full = reflectFor(axis, source.grid, size)
  let given = 0
  let total = 0
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!full[r]![c]) continue
      total++
      if (isGivenSide(r, c, size, axis)) given++
    }
  }
  return { givenMarks: given, answerMarks: total - given, fillRatio: total / (size * size) }
}

/** Distinct non-empty row patterns — a plain block scores 1. */
function rowVariety(grid: Bitmap): number {
  const seen = new Set<string>()
  for (const row of grid) {
    if (!row.some(Boolean)) continue
    seen.add(row.map((cell) => (cell ? '1' : '0')).join(''))
  }
  return seen.size
}

export function passesMirrorQuality(
  source: MirrorSource,
  size: GridSize,
  axis: Axis,
): boolean {
  const q = mirrorSourceQuality(source, size, axis)
  if (q.givenMarks < MIN_GIVEN_MARKS) return false
  if (q.answerMarks < MIN_ANSWER_MARKS) return false
  if (source.style === 'pixel') {
    if (q.fillRatio < MIN_PIXEL_FILL || q.fillRatio > MAX_PIXEL_FILL) return false
    if (rowVariety(source.grid) < MIN_ROW_VARIETY) return false
  }
  return true
}

/** Given half that always clears the gate, for the case every attempt fails. */
function fallbackGivenGrid(size: GridSize, axis: Axis): Bitmap {
  const { rows, cols } = givenDims(size, axis)
  const grid = emptyBitmap(rows, cols)
  const top = Math.floor(rows / 4)
  const left = Math.floor(cols / 4)
  const height = Math.max(2, Math.round(rows / 2))
  const width = Math.max(2, Math.round(cols / 2))
  for (let r = top; r < Math.min(rows, top + height); r++) {
    for (let c = left; c < Math.min(cols, left + width); c++) grid[r]![c] = true
  }
  return grid
}

/**
 * Rectangle held one dot clear of the axis, so every segment mirrors to a
 * distinct one and the answer side can never come out empty.
 */
function fallbackSegments(size: GridSize, axis: Axis): Segment[] {
  const half = size / 2
  const maxR = axis === 'vertical' ? size : half
  const maxC = axis === 'horizontal' ? size : half
  const top = 1
  const left = 1
  const bottom = Math.max(top + 1, maxR - 1)
  const right = Math.max(left + 1, maxC - 1)
  return [
    { r1: top, c1: left, r2: top, c2: right },
    { r1: top, c1: right, r2: bottom, c2: right },
    { r1: bottom, c1: right, r2: bottom, c2: left },
    { r1: bottom, c1: left, r2: top, c2: left },
  ]
}

function abstractPixelSource(size: GridSize, axis: Axis, rng: StudioRng): MirrorSource {
  for (let i = 0; i < MAX_THEMED_ATTEMPTS; i++) {
    const { grid } = generateAbstractHalf(size, axis, rng)
    const candidate: MirrorSource = { style: 'pixel', grid, segments: [] }
    if (passesMirrorQuality(candidate, size, axis)) return candidate
  }
  return { style: 'pixel', grid: fallbackGivenGrid(size, axis), segments: [] }
}

function abstractLineSource(size: GridSize, axis: Axis, rng: StudioRng): MirrorSource {
  for (let i = 0; i < MAX_THEMED_ATTEMPTS; i++) {
    const candidate: MirrorSource = {
      style: 'line',
      grid: emptyLineGrid(size),
      segments: generateAbstractSegments(size, axis, rng),
    }
    if (passesMirrorQuality(candidate, size, axis)) return candidate
  }
  return {
    style: 'line',
    grid: emptyLineGrid(size),
    segments: fallbackSegments(size, axis),
  }
}

function sourceFromPattern(
  pattern: MirrorPattern,
  size: GridSize,
  axis: Axis,
  rng: StudioRng,
): MirrorSource {
  if (pattern.style === 'line' && pattern.segments && pattern.segments.length > 0) {
    const half = size / 2
    const givenSegs = pattern.segments.filter((s) => axisForSegment(s, size, 'vertical'))
    if (axis === 'vertical') {
      return { style: 'line', grid: emptyLineGrid(size), segments: givenSegs }
    }
    if (axis === 'horizontal') {
      const transposed = givenSegs.map((s) => ({
        r1: s.c1,
        c1: s.r1,
        r2: s.c2,
        c2: s.r2,
      }))
      return { style: 'line', grid: emptyLineGrid(size), segments: transposed }
    }
    const quadrantSegs = givenSegs.filter(
      (s) => Math.max(s.r1, s.r2) <= half && Math.max(s.c1, s.c2) <= half,
    )
    return {
      style: 'line',
      grid: emptyLineGrid(size),
      segments: quadrantSegs.length > 0 ? quadrantSegs : generateAbstractSegments(size, axis, rng),
    }
  }

  const left = parseHalfRows(pattern.half, pattern.rows, pattern.halfCols, pattern.id)
  return {
    style: 'pixel',
    grid: leftHalfToGiven(left, asGridSize(size), axis),
    segments: [],
  }
}

/**
 * One seeded subject, drawn as a left-half silhouette.
 *
 * Curated art and procedural drawers are one pool rather than a primary and a
 * fallback: the drawers cover only 27 subjects, and the curated JSON adds ~140
 * per grid size, so taking both is what gives a 50-page book enough variety.
 */
function pickBaseHalf(
  size: GridSize,
  theme: MirrorTheme,
  rng: StudioRng,
  ownerKey: string | undefined,
): Bitmap | null {
  const curated = ownerLibraryPool(filterLibrary(size, theme, 'pixel'), ownerKey)
  const shapes = ownerShapePool(theme, ownerKey)

  const takeCurated = curated.length > 0 && (shapes.length === 0 || rng.chance(CURATED_SHARE))
  if (takeCurated) {
    const pattern = rng.pick(curated)
    return parseHalfRows(pattern.half, pattern.rows, pattern.halfCols, pattern.id)
  }
  if (shapes.length === 0) return null
  return rng.pick(shapes).draw(size, rng)
}

/**
 * Four-quadrant mode is a kaleidoscope, not a portrait: the given region is a
 * quarter grid (4×4 at the smallest size), far too coarse to hold a readable
 * subject, and squeezing one in there collapses hundreds of different pictures
 * onto the same few blobs. A clustered abstract quarter both looks like what
 * this mode is for and carries orders of magnitude more variation.
 */
function buildPixelSource(
  size: GridSize,
  theme: MirrorTheme,
  axis: Axis,
  rng: StudioRng,
  ownerKey: string | undefined,
): MirrorSource {
  if (axis === 'both') return abstractPixelSource(size, axis, rng)

  for (let i = 0; i < MAX_THEMED_ATTEMPTS; i++) {
    const base = pickBaseHalf(size, theme, rng, ownerKey)
    if (!base) break
    const candidate: MirrorSource = {
      style: 'pixel',
      grid: leftHalfToGiven(jitterHalf(base, rng), size, axis),
      segments: [],
    }
    if (passesMirrorQuality(candidate, size, axis)) return candidate
  }
  return abstractPixelSource(size, axis, rng)
}

/** Same subject pool as pixel, traced to its outline instead of shaded. */
function buildLineSource(
  size: GridSize,
  theme: MirrorTheme,
  axis: Axis,
  rng: StudioRng,
  ownerKey: string | undefined,
): MirrorSource {
  if (axis === 'both') return abstractLineSource(size, axis, rng)

  for (let i = 0; i < MAX_THEMED_ATTEMPTS; i++) {
    const base = pickBaseHalf(size, theme, rng, ownerKey)
    if (!base) break
    const outline = outlineSegmentsFromLeftHalf(jitterHalf(base, rng), size)
    const candidate: MirrorSource = {
      style: 'line',
      grid: emptyLineGrid(size),
      segments: adaptSegmentsForAxis(outline, size, axis),
    }
    if (passesMirrorQuality(candidate, size, axis)) return candidate
  }

  const pool = ownerLibraryPool(filterLibrary(size, theme, 'line'), ownerKey)
  for (const pattern of rng.shuffle(pool)) {
    const candidate = sourceFromPattern(pattern, size, axis, rng)
    if (passesMirrorQuality(candidate, size, axis)) return candidate
  }

  return abstractLineSource(size, axis, rng)
}

export interface LoadMirrorSourceOptions {
  size: GridSize
  theme: MirrorTheme
  style: DrawStyle
  source: PatternSource
  axis: Axis
  rng: StudioRng
  /** Per-seller identity; scopes the curated fallback pool. */
  ownerKey?: string
}

export function loadMirrorSource(options: LoadMirrorSourceOptions): MirrorSource {
  const { size, theme, style, source, axis, rng, ownerKey } = options

  if (source === 'abstract') {
    return style === 'line'
      ? abstractLineSource(size, axis, rng)
      : abstractPixelSource(size, axis, rng)
  }

  return style === 'line'
    ? buildLineSource(size, theme, axis, rng, ownerKey)
    : buildPixelSource(size, theme, axis, rng, ownerKey)
}

export function parseTheme(raw: unknown): MirrorTheme {
  const v = String(raw ?? 'mixed')
  if (v === 'mixed' || (MIRROR_THEMES as readonly string[]).includes(v)) {
    return v as MirrorTheme
  }
  return 'mixed'
}

export function parseGridSize(raw: unknown): GridSize {
  const n = Number(raw ?? 10)
  if (n === 8 || n === 10 || n === 12 || n === 16) return n
  return 10
}
