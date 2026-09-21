/**
 * Canonical forms (§4.2).
 *
 * A unique seed does not make a unique *puzzle*: two seeds can land on the same
 * figure. So the puzzle itself is hashed, after collapsing the variants that a
 * reader would call the same puzzle.
 *
 * The reduction covers the **geometric symmetry group only** — rotations and
 * reflections of the layout. It deliberately does *not* canonicalise over
 * rank/suit relabelling: a grid on {A,3,7,K} and the same logical grid on
 * {2,5,9,Q} print as visibly different puzzles and feel different to solve, and
 * relabelling is a large, cheap entropy axis worth keeping. A puzzle rotated 90°
 * *is* the same puzzle and must collide. Getting that boundary right is what
 * stops the §9.4 entropy measurement from flattering itself.
 */

export type CellSerialiser<T> = (value: T) => string

const ROW_SEP = '/'
const CELL_SEP = ','

function serialiseGrid<T>(grid: readonly (readonly T[])[], cell: CellSerialiser<T>): string {
  return grid.map((row) => row.map(cell).join(CELL_SEP)).join(ROW_SEP)
}

type Grid<T> = readonly (readonly T[])[]

function rotate90<T>(grid: Grid<T>): T[][] {
  const rows = grid.length
  const cols = grid[0]?.length ?? 0
  return Array.from({ length: cols }, (_, r) =>
    Array.from({ length: rows }, (_, c) => grid[rows - 1 - c][r]),
  )
}

function flipHorizontal<T>(grid: Grid<T>): T[][] {
  return grid.map((row) => [...row].reverse())
}

/**
 * Every symmetry of the grid's own shape. A square grid has all eight of D4;
 * a rectangle keeps only the four that preserve its proportions, because a 90°
 * turn of a 4x6 layout is a different page, not the same one rotated.
 */
export function gridSymmetries<T>(grid: Grid<T>): T[][][] {
  const rows = grid.length
  const cols = grid[0]?.length ?? 0
  const square = rows === cols
  const out: T[][][] = []
  let current: T[][] = grid.map((row) => [...row])
  const turns = square ? 4 : 2
  const step = square ? 1 : 2
  for (let i = 0; i < turns; i++) {
    out.push(current, flipHorizontal(current))
    for (let s = 0; s < step; s++) current = rotate90(current)
  }
  return out
}

/**
 * Lexicographically smallest serialisation over the grid's symmetry group.
 * Two layouts that are rotations or reflections of one another return the
 * same string, and therefore the same canonical hash.
 */
export function canonicalGridForm<T>(grid: Grid<T>, cell: CellSerialiser<T>): string {
  let best: string | null = null
  for (const candidate of gridSymmetries(grid)) {
    const form = serialiseGrid(candidate, cell)
    if (best === null || form < best) best = form
  }
  return best ?? ''
}

/**
 * Canonical form of an ordered run. A sequence read back to front is the same
 * puzzle for layouts with no inherent direction; pass `directional` for the
 * ones that have one (a rule that runs left to right and only that way).
 */
export function canonicalSequenceForm<T>(
  items: readonly T[],
  cell: CellSerialiser<T>,
  options?: { directional?: boolean },
): string {
  const forward = items.map(cell).join(CELL_SEP)
  if (options?.directional) return forward
  const backward = [...items].reverse().map(cell).join(CELL_SEP)
  return forward < backward ? forward : backward
}

/** Canonical form of an unordered collection — sorted, so order never leaks in. */
export function canonicalSetForm<T>(items: readonly T[], cell: CellSerialiser<T>): string {
  return items.map(cell).sort().join(CELL_SEP)
}

/** Join several canonical parts into one form for a multi-part puzzle. */
export function composeCanonicalForm(kind: string, ...parts: string[]): string {
  return `${kind}|${parts.join('|')}`
}
