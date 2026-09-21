import type { StudioRng } from '../studio-rng'

export type GlyphId = string
/** Changes are outline glyph and/or rotation only — no fill variants. */
export type ChangeType = 'shape' | 'rotation' | 'mixed'

export interface CellState {
  glyph: GlyphId
  rotationDeg: number
}

export interface ChangePair {
  study: CellState[][]
  test: CellState[][]
  changed: boolean[][]
}

const ROTATIONS = [0, 45, 90, 135] as const

/**
 * Phosphor icons that look the same (or nearly) across our rotation set —
 * skip rotation mutations for these; mutate shape instead.
 */
const NON_ROTATABLE = new Set([
  'clover',
  'dice-five',
  'snowflake',
  'soccer-ball',
  'basketball',
  'baseball',
])

export function isRotatable(glyph: GlyphId): boolean {
  return !NON_ROTATABLE.has(glyph)
}

function cellsEqual(a: CellState, b: CellState): boolean {
  return a.glyph === b.glyph && a.rotationDeg === b.rotationDeg
}

function grid<T>(size: number, factory: () => T): T[][] {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, () => factory()),
  )
}

function shuffleCells(size: number, rng: StudioRng): { r: number; c: number }[] {
  const cells: { r: number; c: number }[] = []
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) cells.push({ r, c })
  }
  return rng.shuffle(cells)
}

function pickRotatable(pool: readonly string[], rng: StudioRng): string {
  const rotatable = pool.filter((g) => isRotatable(g))
  return rng.pick(rotatable.length > 0 ? rotatable : pool)
}

export function randomCell(
  changeType: ChangeType,
  rng: StudioRng,
  glyphPool: readonly string[],
): CellState {
  if (glyphPool.length === 0) {
    throw new Error('change-detection: glyph pool is empty')
  }
  if (changeType === 'rotation') {
    return {
      glyph: pickRotatable(glyphPool, rng),
      rotationDeg: rng.pick(ROTATIONS),
    }
  }
  const glyph = rng.pick(glyphPool)
  return {
    glyph,
    rotationDeg:
      changeType === 'mixed' && isRotatable(glyph) ? rng.pick(ROTATIONS) : 0,
  }
}

function mutateShape(
  cell: CellState,
  rng: StudioRng,
  glyphPool: readonly string[],
): CellState {
  const others = glyphPool.filter((g) => g !== cell.glyph)
  const source = others.length > 0 ? others : glyphPool
  const glyph = rng.pick(source)
  return {
    glyph,
    rotationDeg: isRotatable(glyph) ? cell.rotationDeg : 0,
  }
}

function mutateRotation(
  cell: CellState,
  rng: StudioRng,
  glyphPool: readonly string[],
): CellState {
  if (!isRotatable(cell.glyph)) return mutateShape(cell, rng, glyphPool)
  const others = ROTATIONS.filter((deg) => deg !== cell.rotationDeg)
  return { ...cell, rotationDeg: rng.pick(others) }
}

export function mutateCell(
  cell: CellState,
  changeType: ChangeType,
  rng: StudioRng,
  glyphPool: readonly string[],
): CellState {
  const dimension: ChangeType =
    changeType === 'mixed' ? rng.pick(['shape', 'rotation'] as const) : changeType

  const next =
    dimension === 'rotation'
      ? mutateRotation(cell, rng, glyphPool)
      : mutateShape(cell, rng, glyphPool)

  // Guard: never emit an accidental no-op
  if (cellsEqual(next, cell)) return mutateShape(cell, rng, glyphPool)
  return next
}

/**
 * Study + test grids that differ in exactly `changeCount` cells.
 * Deterministic from the rng. At least one cell always stays unchanged.
 * Glyphs are drawn from `glyphPool` (full Phosphor duotone catalog).
 */
export function buildChangePair(
  size: number,
  changeCount: number,
  changeType: ChangeType,
  rng: StudioRng,
  glyphPool: readonly string[],
): ChangePair {
  if (glyphPool.length === 0) {
    throw new Error('change-detection: glyph pool is empty')
  }
  const safeCount = Math.min(Math.max(1, changeCount), size * size - 1)
  const study = grid(size, () => randomCell(changeType, rng, glyphPool))
  const test = study.map((row) => row.map((c) => ({ ...c })))
  const changed = grid(size, () => false)

  const picks = shuffleCells(size, rng).slice(0, safeCount)
  for (const { r, c } of picks) {
    test[r][c] = mutateCell(study[r][c], changeType, rng, glyphPool)
    changed[r][c] = true
  }

  return { study, test, changed }
}
