import type { StudioRng } from '../studio-rng'
import { HUNT_ICON_ICONS } from './icons'

export type SymbolType = 'icons' | 'digits' | 'letters'
export type Discrimination = 'easy' | 'standard' | 'hard'
export type Density = 'light' | 'medium' | 'dense'
export type HuntTask = 'cancel' | 'count' | 'both'

export interface CountingField {
  targets: string[]
  cells: string[]
  counts: Record<string, number>
  rows: number
  cols: number
}

/**
 * Glyphs with their own outer ring/disc — clash with cancel answer circles
 * (double halo). Kept for tests / docs; icon pool is Phosphor ids now.
 */
export const SHAPE_RING_GLYPHS = [
  '○', '●', '◦', '◯', '⬤', '◎', '⭕', '•', '⚫', '⚪',
  '⊕', '⊖', '⊗', '⊘', '⊙', '⊚', '⊛',
] as const

/**
 * Symbol pools. Icons are Phosphor duotone names (SVG paths → PDF-safe).
 * Digits/letters stay as Inter text for clinical cancellation.
 */
export const SYMBOL_SETS: Record<SymbolType, string[]> = {
  icons: HUNT_ICON_ICONS,
  digits: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
  letters: [
    'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
    'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
  ],
}

export const DENSITY_CELLS: Record<Density, number> = {
  light: 120,
  medium: 240,
  dense: 300,
}

/** Spec §5 — fraction of cells that are targets (~0.15–0.3). Jittered per seed
 *  so bulk sheets with one target do not all share the same answer total. */
const TARGET_DENSITY_MIN = 0.15
const TARGET_DENSITY_MAX = 0.3
const MIN_CELL_PX = 18

/** Visually confusable clusters — used for hard discrimination. */
const CONFUSABLE: Record<SymbolType, string[][]> = {
  // Full catalog: no Lucide-style look-alike clusters — hard falls back to same set.
  icons: [],
  digits: [
    ['0', '8', '6', '9'],
    ['1', '7', '4'],
    ['3', '5', '2'],
  ],
  letters: [
    ['B', 'R', 'P', 'D'],
    ['C', 'G', 'O', 'Q'],
    ['M', 'H', 'N', 'W'],
    ['E', 'F', 'T', 'I'],
    ['A', 'V', 'X', 'Y'],
    ['K', 'X', 'Y', 'Z'],
    ['S', 'Z', 'J', 'U'],
    ['L', 'I', 'T', 'J'],
  ],
}

/**
 * Target-selection families — at most one id per family as a listed target.
 * Icons: each glyph is its own family (full Phosphor catalog).
 */
const TARGET_FAMILIES: Record<SymbolType, string[][]> = {
  icons: [],
  digits: [],
  letters: [],
}

export function usesIconSymbols(symbolType: SymbolType): boolean {
  return symbolType === 'icons'
}

function targetFamilies(symbolType: SymbolType): string[][] {
  const set = new Set(SYMBOL_SETS[symbolType])
  const grouped = TARGET_FAMILIES[symbolType]
    .map((group) => group.filter((glyph) => set.has(glyph)))
    .filter((group) => group.length > 0)
  const covered = new Set(grouped.flat())
  const orphans = SYMBOL_SETS[symbolType]
    .filter((glyph) => !covered.has(glyph))
    .map((glyph) => [glyph])
  return [...grouped, ...orphans]
}

/**
 * Sample targets with equal weight per visual family so look-alike twins
 * do not dominate regenerations or multi-target sheets.
 */
export function pickTargets(
  symbolType: SymbolType,
  targetCount: number,
  rng: StudioRng,
): string[] {
  const families = targetFamilies(symbolType)
  const count = Math.min(targetCount, families.length)
  return rng.sample(families, count).map((family) => rng.pick(family))
}

export function parseSymbolType(raw: unknown): SymbolType {
  // Legacy shapes/arrows configs map onto the merged Phosphor icon pool.
  if (raw === 'shapes' || raw === 'arrows' || raw === 'icons') return 'icons'
  if (raw === 'digits' || raw === 'letters') return raw
  return 'icons'
}

export function parseDiscrimination(raw: unknown): Discrimination {
  if (raw === 'easy' || raw === 'hard') return raw
  return 'standard'
}

export function parseDensity(raw: unknown): Density {
  if (raw === 'light' || raw === 'dense') return raw
  return 'medium'
}

export function parseTask(raw: unknown): HuntTask {
  if (raw === 'count' || raw === 'both') return raw
  return 'cancel'
}

export function clampTargetCount(raw: number): number {
  if (!Number.isFinite(raw)) return 1
  return Math.min(3, Math.max(1, Math.round(raw)))
}

/** §4.1 — multi-target letter grids read as word searches. */
export function effectiveTargetCount(symbolType: SymbolType, raw: number): number {
  if (symbolType === 'letters') return 1
  return clampTargetCount(raw)
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
            if (!targetSet.has(s) && SYMBOL_SETS[symbolType].includes(s)) {
              pool.add(s)
            }
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

/** Side length for a square grid nearest `totalCells`. */
export function chooseCols(totalCells: number): number {
  return Math.max(6, Math.min(28, Math.round(Math.sqrt(Math.max(1, totalCells)))))
}

/**
 * Fit a square grid (cols === rows) into the area at a legible cell size.
 * Density maps to ~side² cells (e.g. 15×15 ≈ 225 for medium).
 */
export function clampCellsToFit(
  requested: number,
  areaWidth: number,
  areaHeight: number,
): { totalCells: number; cols: number; rows: number } {
  let side = chooseCols(Math.max(40, requested))

  for (let guard = 0; guard < 24; guard++) {
    const cell = Math.min(areaWidth / side, areaHeight / side)
    if (cell >= MIN_CELL_PX) break
    side = Math.max(6, side - 1)
  }

  const cols = side
  const rows = side
  return { totalCells: cols * rows, cols, rows }
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
  const targets = pickTargets(symbolType, targetCount, rng)
  const count = targets.length
  const distractors = pickDistractors(symbolType, targets, discrimination, rng)

  if (distractors.length === 0) {
    throw new Error('symbol-hunt: empty distractor pool')
  }

  const density =
    TARGET_DENSITY_MIN + rng.next() * (TARGET_DENSITY_MAX - TARGET_DENSITY_MIN)
  const totalTargets = Math.max(count, Math.round(totalCells * density))
  const perTarget = splitEvenlyWithJitter(totalTargets, count, rng)

  const cells: string[] = []
  targets.forEach((t, i) => {
    for (let n = 0; n < perTarget[i]!; n++) cells.push(t)
  })
  while (cells.length < totalCells) {
    cells.push(rng.pick(distractors))
  }
  const shuffled = rng.shuffle(cells.slice(0, totalCells))

  // Recount from the printed array — never trust intended perTarget
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

/** Explicit two-line breaks; band width grows if a line exceeds Study & Recall. */
export function buildInstruction(targetCount: number, task: HuntTask): string {
  if (task === 'cancel') {
    return targetCount > 1
      ? 'Mark every target symbol listed below.\nWork across each row so you don\'t miss any'
      : 'Mark every target you can find.\nWork across each row so you don\'t miss any'
  }
  if (task === 'both') {
    return targetCount > 1
      ? 'Mark every target listed below,\nthen write how many you marked for each'
      : 'Mark every target you can find,\nthen write how many you marked'
  }
  return targetCount > 1
    ? 'Count how many times EACH target appears.\nKeep a separate total for each one'
    : 'Count how many times the symbol appears.\nWrite your total in the box below'
}
