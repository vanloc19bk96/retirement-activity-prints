import type { StudioRng } from '../studio-rng'
import { hasPhosphorIcon } from '../studio-phosphor-icon'

export type SymbolType = 'digits' | 'letters' | 'shapes' | 'arrows'
export type Discrimination = 'easy' | 'standard' | 'hard'
export type Density = 'light' | 'medium' | 'dense'

export interface CountingField {
  targets: string[]
  cells: string[]
  counts: Record<string, number>
  rows: number
  cols: number
}

/**
 * Digits/letters = Inter text. Shapes/arrows = Phosphor duotone ids (SVG paths)
 * so PDF/SVG outline export matches the editor (catalog fonts lack those glyphs).
 */
export const SYMBOL_SETS: Record<SymbolType, string[]> = {
  digits: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
  letters: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'K', 'M', 'P', 'R', 'T', 'X'],
  shapes: [
    'circle',
    'square',
    'triangle',
    'diamond',
    'star',
    'plus',
    'cross',
    'caret-right',
    'caret-left',
    'parallelogram',
    'heart',
    'hexagon',
  ],
  arrows: [
    'arrow-up',
    'arrow-down',
    'arrow-left',
    'arrow-right',
    'arrow-up-left',
    'arrow-up-right',
    'arrow-down-right',
    'arrow-down-left',
  ],
}

for (const name of [...SYMBOL_SETS.shapes, ...SYMBOL_SETS.arrows]) {
  if (!hasPhosphorIcon(name)) {
    throw new Error(`counting-streams: missing Phosphor duotone icon "${name}"`)
  }
}

export const DENSITY_CELLS: Record<Density, number> = {
  light: 120,
  medium: 240,
  dense: 400,
}

/** Fraction of cells that are targets. Wide band so counts can be sparse or
 *  plentiful (not stuck in one decade). Cap leaves room for distractors. */
const TARGET_DENSITY_MIN = 0.05
const TARGET_DENSITY_MAX = 0.5
const MAX_TARGET_FRACTION = 0.55
/** Min glyph slot so stream symbols stay legible when printed. */
const MIN_CELL_PX = 18
/** Extra vertical air between stream rows (not a packed hunt field). */
export const STREAM_GUTTER = 16

/** Visually confusable clusters — used for hard discrimination. */
const CONFUSABLE: Record<SymbolType, string[][]> = {
  digits: [
    ['0', '8', '6', '9'],
    ['1', '7', '4'],
    ['3', '5', '2'],
  ],
  letters: [
    ['B', 'R', 'P'],
    ['C', 'G', 'D'],
    ['M', 'H', 'K'],
    ['E', 'F', 'T'],
    ['A', 'X', 'H'],
  ],
  shapes: [
    ['circle', 'hexagon', 'square'],
    ['triangle', 'diamond', 'parallelogram'],
    ['diamond', 'parallelogram', 'square'],
    ['star', 'plus', 'heart'],
    ['caret-right', 'caret-left'],
    ['plus', 'cross', 'star'],
  ],
  arrows: [
    ['arrow-up', 'arrow-up-left', 'arrow-up-right'],
    ['arrow-down', 'arrow-down-left', 'arrow-down-right'],
    ['arrow-left', 'arrow-up-left', 'arrow-down-left'],
    ['arrow-right', 'arrow-up-right', 'arrow-down-right'],
  ],
}

export function usesIconSymbols(symbolType: SymbolType): boolean {
  return symbolType === 'shapes' || symbolType === 'arrows'
}

export function isCountingIconSymbol(symbol: string): boolean {
  return hasPhosphorIcon(symbol)
}

export function parseSymbolType(raw: unknown): SymbolType {
  if (raw === 'letters' || raw === 'shapes' || raw === 'arrows') return raw
  return 'digits'
}

export function parseDiscrimination(raw: unknown): Discrimination {
  if (raw === 'easy' || raw === 'hard') return raw
  return 'standard'
}

export function parseDensity(raw: unknown): Density {
  if (raw === 'light' || raw === 'dense') return raw
  return 'medium'
}

export function clampTargetCount(raw: number): number {
  if (!Number.isFinite(raw)) return 1
  return Math.min(3, Math.max(1, Math.round(raw)))
}

function alternateSet(symbolType: SymbolType): string[] {
  return symbolType === 'letters' ? SYMBOL_SETS.digits : SYMBOL_SETS.letters
}

export function pickDistractors(
  symbolType: SymbolType,
  targets: string[],
  discrimination: Discrimination,
  _rng: StudioRng,
): string[] {
  const targetSet = new Set(targets)
  const sameCategory = SYMBOL_SETS[symbolType].filter((s) => !targetSet.has(s))

  if (discrimination === 'easy') {
    const other = alternateSet(symbolType).filter((s) => !targetSet.has(s))
    return other.length > 0 ? other : sameCategory
  }

  if (discrimination === 'hard') {
    const pool = new Set<string>()
    for (const target of targets) {
      for (const group of CONFUSABLE[symbolType]) {
        if (group.includes(target)) {
          for (const s of group) {
            if (!targetSet.has(s)) pool.add(s)
          }
        }
      }
    }
    if (pool.size >= 2) return [...pool]
    return sameCategory.length > 0 ? sameCategory : alternateSet(symbolType)
  }

  return sameCategory.length > 0 ? sameCategory : alternateSet(symbolType)
}

/** Split `total` across `n` buckets, each ≥ 1, with light random jitter. */
export function splitEvenlyWithJitter(total: number, n: number, rng: StudioRng): number[] {
  const ensured = Math.max(total, n)
  const counts = Array.from({ length: n }, () => 1)
  let remaining = ensured - n
  while (remaining > 0) {
    counts[rng.int(0, n - 1)]!++
    remaining--
  }
  return counts
}

/** Wide stream rows — more columns than a square hunt field. */
export function chooseCols(totalCells: number): number {
  return Math.max(12, Math.min(28, Math.round(Math.sqrt(totalCells) * 1.6)))
}

/**
 * Shrink cell count until stream glyphs stay legible.
 * Vertical gutters between streams are reserved so row height stays usable.
 */
export function clampCellsToFit(
  requested: number,
  areaWidth: number,
  areaHeight: number,
): { totalCells: number; cols: number; rows: number } {
  let totalCells = Math.max(40, requested)
  let cols = chooseCols(totalCells)
  let rowCount = Math.ceil(totalCells / cols)

  for (let guard = 0; guard < 20; guard++) {
    const gutterTotal = STREAM_GUTTER * Math.max(0, rowCount - 1)
    const rowH = (areaHeight - gutterTotal) / rowCount
    const cellW = areaWidth / cols
    const cell = Math.min(cellW, rowH)
    if (cell >= MIN_CELL_PX) break
    totalCells = Math.max(40, Math.floor(totalCells * 0.85))
    cols = chooseCols(totalCells)
    rowCount = Math.ceil(totalCells / cols)
  }

  totalCells = cols * rowCount
  return { totalCells, cols, rows: rowCount }
}

export function buildField(options: {
  symbolType: SymbolType
  targetCount: number
  totalCells: number
  cols: number
  rows: number
  discrimination: Discrimination
  rng: StudioRng
}): CountingField {
  const { symbolType, targetCount, totalCells, cols, rows, discrimination, rng } = options
  const symbolSet = SYMBOL_SETS[symbolType]
  const count = Math.min(targetCount, symbolSet.length)
  const targets = rng.sample(symbolSet, count)
  const distractors = pickDistractors(symbolType, targets, discrimination, rng)

  if (distractors.length === 0) {
    throw new Error('counting-streams: empty distractor pool')
  }

  const density =
    TARGET_DENSITY_MIN + rng.next() * (TARGET_DENSITY_MAX - TARGET_DENSITY_MIN)
  const maxTargets = Math.max(count, Math.floor(totalCells * MAX_TARGET_FRACTION))
  const totalTargets = Math.min(
    maxTargets,
    Math.max(count, Math.round(totalCells * density)),
  )
  const perTarget = splitEvenlyWithJitter(totalTargets, count, rng)

  const cells: string[] = []
  targets.forEach((t, i) => {
    for (let n = 0; n < perTarget[i]!; n++) cells.push(t)
  })
  while (cells.length < totalCells) {
    cells.push(rng.pick(distractors))
  }
  const trimmed = cells.slice(0, totalCells)
  const shuffled = rng.shuffle(trimmed)

  const counts: Record<string, number> = {}
  for (const t of targets) {
    let n = 0
    for (const c of shuffled) {
      if (c === t) n++
    }
    counts[t] = n
  }

  return { targets, cells: shuffled, counts, rows, cols }
}

export function buildInstruction(targetCount: number): string {
  if (targetCount > 1) {
    return 'Scan each stream left to right. Count EACH target separately. Write one total per target'
  }
  return 'Scan each stream left to right. Count how many times the target appears. Write the total in the box'
}
