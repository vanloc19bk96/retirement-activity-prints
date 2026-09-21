import type { StudioConfig } from '@/types/studio-template.types'

/**
 * Coordinate convention (fixed — every file in this folder assumes it):
 * `row` increases downward, `col` increases rightward, both 1-based.
 * `U` = row−, `D` = row+, `L` = col−, `R` = col+.
 * Printed coordinates read column-then-row, battleship style: `C4` is the
 * 3rd column, 4th row.
 */
export type Dir = 'U' | 'D' | 'L' | 'R' | 'UL' | 'UR' | 'DL' | 'DR'

export const ORTHOGONAL_DIRS: readonly Dir[] = ['U', 'D', 'L', 'R']
export const DIAGONAL_DIRS: readonly Dir[] = ['UL', 'UR', 'DL', 'DR']

export interface Cell {
  row: number
  col: number
}

export interface Step {
  dir: Dir
  /** Squares moved in `dir`. Always >= 1. */
  count: number
}

export interface Route {
  gridRows: number
  gridCols: number
  start: Cell
  steps: Step[]
  /** Every cell visited, start..end inclusive — the traced key path. */
  path: Cell[]
  /** The answer. */
  end: Cell
}

/** What the reader writes (§4 of the spec). */
export type RouteMode =
  /** A — shade the ending square. */
  | 'mark'
  /** B — write the ending square's coordinate. */
  | 'coordinate'
  /** C — given both ends, write a route that connects them. */
  | 'route'

export type RouteTierKey = 'warmup' | 'easy' | 'medium' | 'hard' | 'expert'

export type InstructionStyle = 'arrows' | 'words'

export type CellSizeKey = 'small' | 'medium' | 'large'

export type FigureCount = 1 | 2 | 4

export interface RouteTier {
  gridRows: number
  gridCols: number
  numSteps: number
  maxStepLen: number
  /** Diagonal moves may be switched on at this tier. */
  allowsDiagonals: boolean
}

/** Difficulty presets — grid size and move knobs only; mode/figures are form fields. */
export const ROUTE_TIERS: Record<RouteTierKey, RouteTier> = {
  warmup: {
    gridRows: 4,
    gridCols: 4,
    numSteps: 3,
    maxStepLen: 2,
    allowsDiagonals: false,
  },
  easy: {
    gridRows: 5,
    gridCols: 5,
    numSteps: 4,
    maxStepLen: 3,
    allowsDiagonals: false,
  },
  medium: {
    gridRows: 6,
    gridCols: 6,
    // 6 packs as 3×2 / 2×3 — 5 left a short last row (3+2).
    numSteps: 6,
    maxStepLen: 3,
    allowsDiagonals: false,
  },
  hard: {
    gridRows: 7,
    gridCols: 7,
    // 8 packs as 4×2 / 2×4 — 7 left a short last row.
    numSteps: 8,
    maxStepLen: 4,
    allowsDiagonals: false,
  },
  expert: {
    gridRows: 8,
    gridCols: 8,
    numSteps: 9,
    maxStepLen: 5,
    allowsDiagonals: true,
  },
}

export const ROUTE_TIER_KEYS = Object.keys(ROUTE_TIERS) as RouteTierKey[]

/** Word for each direction, used by the Words instruction style. */
export const DIR_WORDS: Record<Dir, string> = {
  U: 'Up',
  D: 'Down',
  L: 'Left',
  R: 'Right',
  UL: 'Up-left',
  UR: 'Up-right',
  DL: 'Down-left',
  DR: 'Down-right',
}

/**
 * Preferred square size in canvas px (96 per inch), used as a *cap*: a crowded
 * page prints smaller, never bigger. Large is the senior large-print setting.
 */
export const CELL_SIZE_PX: Record<CellSizeKey, number> = {
  small: 26,
  medium: 34,
  large: 46,
}

/** Everything the generator needs, with tier defaults already resolved. */
export interface RouteSettings {
  tierKey: RouteTierKey
  rows: number
  cols: number
  numSteps: number
  maxStepLen: number
  mode: RouteMode
  figures: FigureCount
  /** Cap on the printed square size (px). */
  maxCell: number
  showCoordLabels: boolean
  instructionStyle: InstructionStyle
  showPathOnKey: boolean
  diagonals: boolean
}

function pickTier(raw: unknown): RouteTierKey {
  const value = String(raw ?? 'easy') as RouteTierKey
  return ROUTE_TIERS[value] ? value : 'easy'
}

function pickMode(raw: unknown): RouteMode {
  const value = String(raw ?? 'mark')
  if (value === 'mark' || value === 'coordinate' || value === 'route') return value
  // Legacy "Match the difficulty" / unknown → shade the end (gentlest).
  return 'mark'
}

function pickFigures(raw: unknown): FigureCount {
  const value = Number(raw)
  if (value === 1 || value === 2 || value === 4) return value
  // Legacy "Match the difficulty" / unknown → 4 grids.
  return 4
}

function pickStyle(raw: unknown): InstructionStyle {
  return String(raw ?? 'arrows') === 'words' ? 'words' : 'arrows'
}

function pickCell(raw: unknown): number {
  const value = String(raw ?? 'medium') as CellSizeKey
  return CELL_SIZE_PX[value] ?? CELL_SIZE_PX.medium
}

/**
 * Config -> knobs. Difficulty only supplies grid / step count; mode and
 * figures come from the form (or fixed fallbacks for legacy `auto` configs).
 */
export function resolveRouteSettings(config: StudioConfig): RouteSettings {
  const tierKey = pickTier(config.difficulty)
  const tier = ROUTE_TIERS[tierKey]
  const mode = pickMode(config.mode)
  return {
    tierKey,
    rows: tier.gridRows,
    cols: tier.gridCols,
    numSteps: tier.numSteps,
    maxStepLen: tier.maxStepLen,
    mode,
    figures: pickFigures(config.figuresPerPage),
    maxCell: pickCell(config.cellSize),
    // Writing a coordinate is impossible without the letters and numbers.
    showCoordLabels: mode === 'coordinate' || config.showCoordLabels === true,
    instructionStyle: pickStyle(config.instructionStyle),
    showPathOnKey: config.showPathOnKey === true,
    diagonals: tier.allowsDiagonals && config.allowDiagonals === true,
  }
}
