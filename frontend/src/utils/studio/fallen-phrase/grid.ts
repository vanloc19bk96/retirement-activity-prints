import { createRng, deriveSeed } from '../studio-rng'

/**
 * Turning a saying into a quotefall grid.
 *
 * The grid is the puzzle's entire contract with the solver: the boxes in a
 * column and the letters printed under it must be the same letters, and
 * reading the boxes back must give the saying word for word. Everything in
 * this module exists to make both true by construction rather than by luck,
 * because a fallen phrase that cannot be rebuilt is not a hard puzzle — it is
 * a page the reader spends an evening on and gets nothing back from.
 *
 * Every row is set to the full width of the grid, the way a justified
 * paragraph is. That is not a typographic flourish. Left ragged, the last
 * columns would hold one or two letters where the first held five, and a
 * column with one letter in it is not a puzzle — it is an answer already
 * written down.
 *
 * Justifying alone is not enough, though, and the rest of this module is about
 * why. Three rows can each be perfectly set and still line their word breaks
 * up in the same column, leaving a stack of boxes with nothing to write in
 * them. So the holes are placed against the grid rather than against the row,
 * and every candidate grid is scored on how evenly its columns came out.
 */

/** Widest word gap a row may print, in blocked cells. */
export const MAX_GAP_SPACES = 4

/**
 * Blocked cells a row may push past its first or last word.
 *
 * The last resort of a row that cannot fit its slack between its words. Those
 * cells come straight out of the edge columns, so the wrap is charged for them
 * and takes them only when the alternative is no grid at all.
 */
const MAX_EDGE_PAD = 4

/**
 * What a cell pushed past the end of a row costs the wrap, against the squared
 * slack it is weighed with.
 *
 * High enough that a row will take a wider word gap over a shifted edge every
 * time, low enough that it will still shift rather than leave the saying with
 * no grid at all.
 */
const EDGE_PAD_PENALTY = 6

/** Share of a grid that may be blocked before it reads as gaps with a puzzle in it. */
export const MAX_BLOCKED_SHARE = 0.3

/** Below this, a column is an answer rather than a puzzle. */
const MIN_COLUMN_LETTERS = 2

/** Rows from which a one-letter column starts to look like a misprint. */
const STRICT_BALANCE_ROWS = 4

/** Shortest column worth protecting from an unshuffled order. */
const MIN_SHUFFLE_LETTERS = 3

/** The blocked cell between two words. */
export const GAP = ' '

export interface FallenPhraseColumn {
  /** The column's letters, top box to bottom box — the solution, never printed. */
  letters: string[]
  /** The same letters in the order they print under the column. */
  fallen: string[]
}

export interface FallenPhraseGrid {
  phrase: string
  cols: number
  /** One row per line, each exactly `cols` characters: A-Z, or GAP. */
  rows: string[]
  columns: FallenPhraseColumn[]
  /** Tallest stack of fallen letters — what the bank under the grid is sized to. */
  maxColumnLetters: number
  /** Cells holding no letter. Reported so the balance rules can be tested. */
  blockedCells: number
}

/** Read the grid back the way a solver would: left to right, top to bottom. */
export function reconstructPhrase(rows: readonly string[]): string {
  return rows.join(GAP).replace(/\s+/g, GAP).trim()
}

/** Letters a column holds, top box first. */
export function columnLetters(rows: readonly string[], col: number): string[] {
  const out: string[] = []
  for (const row of rows) {
    const ch = row[col]
    if (ch && ch !== GAP) out.push(ch)
  }
  return out
}

/* -------------------------------------------------------------------------- *
 * Wrapping
 * -------------------------------------------------------------------------- */

interface RowShape {
  /** Cells this row holds that are not letters. */
  slack: number
  /** Blocked cells the word gaps can absorb between them. */
  intoGaps: number
  /** Blocked cells left over, which have to go past one end of the row. */
  spill: number
}

/**
 * Whether these words can fill a row of `cols` cells, and with how much slack.
 *
 * Slack goes into the word gaps first and only spills past the first and last
 * word once they are full. That order is what keeps the block of boxes
 * square-edged: a row pushed in from the left costs the first column a letter,
 * and the edge columns are the two a solver looks at first. But the spill has
 * to exist — a row of two short words in a thirteen-column grid cannot put
 * nine cells into its single gap, and without somewhere else to put them that
 * saying would have no grid at all.
 *
 * Where the slack lands is deliberately not decided here. That is a question
 * about columns, and it cannot be answered one row at a time.
 */
function rowShape(words: readonly string[], cols: number): RowShape | null {
  const gaps = words.length - 1
  let letters = 0
  for (const word of words) letters += word.length
  const tightest = letters + gaps
  if (tightest > cols) return null

  const slack = cols - tightest
  const intoGaps = Math.min(slack, gaps * (MAX_GAP_SPACES - 1))
  const spill = slack - intoGaps
  if (spill > MAX_EDGE_PAD * 2) return null
  return { slack, intoGaps, spill }
}

/**
 * Cost of setting `words[from..to)` as one row of the grid.
 *
 * Squared slack, so the wrap spreads its holes evenly rather than packing four
 * rows tight and leaving the fifth half empty — the same objective a
 * typesetter's line breaker uses, for the same reason. Cells spilled past the
 * ends of a row are charged on top, because those are the ones that thin out
 * the edge columns.
 */
function rowCost(
  words: readonly string[],
  from: number,
  to: number,
  cols: number,
): number | null {
  if (to - from <= 0) return null
  const shape = rowShape(words.slice(from, to), cols)
  if (!shape) return null
  return shape.slack * shape.slack + shape.spill * EDGE_PAD_PENALTY
}

/** One way of spreading a row's slack: which gap took each extra cell. */
function renderRowAt(
  words: readonly string[],
  shape: RowShape,
  offset: number,
  leadFirst: boolean,
): string {
  const gaps = words.length - 1
  const extra = new Array<number>(Math.max(gaps, 0)).fill(0)
  for (let i = 0; i < shape.intoGaps; i++) extra[(offset + i) % gaps]! += 1

  const half = Math.floor(shape.spill / 2)
  const odd = shape.spill - half * 2
  const leadPad = half + (leadFirst ? odd : 0)
  const trailPad = half + (leadFirst ? 0 : odd)

  let out = GAP.repeat(leadPad) + words[0]!
  for (let i = 1; i < words.length; i++) {
    out += GAP.repeat(1 + extra[i - 1]!) + words[i]!
  }
  return out + GAP.repeat(trailPad)
}

/**
 * Every distinct way this row could be set, as finished row strings.
 *
 * A row on its own does not care which of its gaps got the extra cell. The
 * grid cares a great deal: let three rows put their word breaks in the same
 * column and that column comes out with no letters at all — a stack of boxes
 * with nothing to write in them, under an instruction promising otherwise. So
 * the row offers the grid all of its arrangements and lets the grid choose.
 */
function rowVariants(words: readonly string[], cols: number): string[] {
  const shape = rowShape(words, cols)
  if (!shape) return []
  const offsets = Math.max(1, words.length - 1)
  const seen = new Set<string>()
  for (let offset = 0; offset < offsets; offset++) {
    for (const leadFirst of [false, true]) {
      seen.add(renderRowAt(words, shape, offset, leadFirst))
    }
  }
  return [...seen]
}

/**
 * What this row is worth to a grid whose columns are already this full.
 *
 * A letter is worth more to an empty column than to a full one, so the weight
 * falls away as a column fills. That one rule does both jobs at once: it
 * drives the rows' holes apart so no column is left without a letter, and it
 * keeps the columns near enough the same height that the bank under the grid
 * reads as one band rather than a skyline.
 */
function rowFillScore(row: string, counts: readonly number[]): number {
  let score = 0
  for (let c = 0; c < row.length; c++) {
    if (row[c] !== GAP) score += 1 / (1 + counts[c]!)
  }
  return score
}

/**
 * Break `words` into exactly `rowCount` rows of `cols` cells.
 *
 * Two decisions, taken in this order for a reason. Which words land on which
 * row is a dynamic program, because a greedy fill packs the early rows and
 * strands the last one — and the last row of a quotefall is a row of the grid
 * like any other, so it cannot be left short. Where each row's holes then fall
 * is chosen a row at a time against the columns already filled, because that
 * is the question no row can answer by itself.
 */
export function justifyRows(
  words: readonly string[],
  cols: number,
  rowCount: number,
): string[] | null {
  const n = words.length
  if (n === 0 || rowCount <= 0 || rowCount > n || cols <= 0) return null
  if (words.some((word) => word.length > cols)) return null

  const INFINITE = Number.POSITIVE_INFINITY
  // best[i][r]: cheapest way to set words[i..] in r rows.
  // next[i][r]: which word the row after this one starts at.
  const best: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(rowCount + 1).fill(INFINITE),
  )
  const next: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(rowCount + 1).fill(-1),
  )
  best[n]![0] = 0

  for (let i = n - 1; i >= 0; i--) {
    for (let r = 1; r <= rowCount; r++) {
      for (let j = i + 1; j <= n; j++) {
        const tail = best[j]![r - 1]!
        if (tail === INFINITE) continue
        const cost = rowCost(words, i, j, cols)
        if (cost === null) continue
        const total = cost + tail
        if (total < best[i]![r]!) {
          best[i]![r] = total
          next[i]![r] = j
        }
      }
    }
  }

  if (best[0]![rowCount] === INFINITE) return null

  const counts = new Array<number>(cols).fill(0)
  const rows: string[] = []
  let at = 0
  for (let r = rowCount; r > 0; r--) {
    const to = next[at]![r]!
    const variants = rowVariants(words.slice(at, to), cols)
    if (variants.length === 0) return null

    let chosen = variants[0]!
    let bestScore = Number.NEGATIVE_INFINITY
    for (const variant of variants) {
      const score = rowFillScore(variant, counts)
      if (score > bestScore) {
        bestScore = score
        chosen = variant
      }
    }
    for (let c = 0; c < cols; c++) {
      if (chosen[c] !== GAP) counts[c]! += 1
    }
    rows.push(chosen)
    at = to
  }
  return rows
}

/* -------------------------------------------------------------------------- *
 * Shuffling
 * -------------------------------------------------------------------------- */

function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((ch, i) => ch === b[i])
}

/**
 * The order a column's letters print in under the grid.
 *
 * Columns of one or two letters are shuffled and then left alone. A two-letter
 * column forced out of its original order would *always* print reversed, which
 * is a rule a regular solver would learn and then read every short column
 * straight off the page. From three letters up the identity order is worth
 * rejecting: it costs nothing, and a column that happens to print in solved
 * order is a column the page gave away.
 */
export function shuffleColumn(letters: readonly string[], seed: number): string[] {
  if (letters.length < 2) return [...letters]
  const rng = createRng(seed)
  let out = rng.shuffle(letters)
  if (letters.length < MIN_SHUFFLE_LETTERS) return out
  if (new Set(letters).size < 2) return out
  for (let attempt = 0; attempt < 8 && sameOrder(out, letters); attempt++) {
    out = rng.shuffle(letters)
  }
  return out
}

/* -------------------------------------------------------------------------- *
 * Building
 * -------------------------------------------------------------------------- */

function buildColumns(
  rows: readonly string[],
  cols: number,
  seed: number,
): FallenPhraseColumn[] {
  return Array.from({ length: cols }, (_, col) => {
    const letters = columnLetters(rows, col)
    return {
      letters,
      // Seeded per column, so re-shuffling column 4 cannot disturb column 3 —
      // which is what keeps one sheet redrawing identically from its seed.
      fallen: shuffleColumn(letters, deriveSeed(seed, `fallen-phrase:col:${col}`)),
    }
  })
}

function gridFrom(
  phrase: string,
  rows: string[],
  cols: number,
  seed: number,
): FallenPhraseGrid | null {
  // Belt and braces: the wrap is built not to lose a letter, and this is where
  // we would find out if it ever did. A grid that does not read back is dropped
  // here rather than printed and discovered by a reader.
  if (reconstructPhrase(rows) !== phrase) return null
  if (rows.some((row) => row.length !== cols)) return null

  const columns = buildColumns(rows, cols, seed)
  const letters = columns.reduce((sum, column) => sum + column.letters.length, 0)
  return {
    phrase,
    cols,
    rows,
    columns,
    maxColumnLetters: columns.reduce((max, c) => Math.max(max, c.letters.length), 0),
    blockedCells: rows.length * cols - letters,
  }
}

/** Share of a grid's cells that hold no letter. */
export function blockedShare(grid: FallenPhraseGrid): number {
  const cells = grid.rows.length * grid.cols
  return cells === 0 ? 1 : grid.blockedCells / cells
}

/** Columns with no boxes at all — a blank stripe down the middle of the grid. */
export function emptyColumns(grid: FallenPhraseGrid): number {
  return grid.columns.filter((column) => column.letters.length === 0).length
}

/** Columns too thin to be a puzzle — the sparse edge a bad wrap leaves. */
function sparseColumns(grid: FallenPhraseGrid): number {
  if (grid.rows.length < STRICT_BALANCE_ROWS) return 0
  return grid.columns.filter(
    (column) =>
      column.letters.length > 0 && column.letters.length < MIN_COLUMN_LETTERS,
  ).length
}

/**
 * How good a grid this is, lower being better.
 *
 * Blocked cells lead, because they are what a reader sees first: a grid that
 * is a third holes reads as a puzzle someone gave up on.
 *
 * An empty column is the expensive one, and it is worth being clear that it is
 * expensive rather than forbidden. A column with no boxes is perfectly
 * solvable — there are no letters printed under it either, so the page still
 * says exactly what it means — but it prints as a blank stripe from top to
 * bottom, which reads as two grids side by side rather than one. Weighted
 * heavily enough that almost any other shape wins; not fatal, because for some
 * sayings every arrangement has one, and a page with a stripe beats an error
 * card where a puzzle should be.
 *
 * The last two are worth a couple of cells each: enough to break a tie towards
 * the shape the level asked for, not enough to take a gappy grid over a tidy
 * one.
 */
const EMPTY_COLUMN_PENALTY = 0.15
const SPARSE_COLUMN_PENALTY = 0.04
const ROW_DRIFT_PENALTY = 0.02
const COLUMN_DRIFT_PENALTY = 0.01

function gridScore(
  grid: FallenPhraseGrid,
  targetRows: number,
  preferredCols: number,
): number {
  return (
    blockedShare(grid) +
    emptyColumns(grid) * EMPTY_COLUMN_PENALTY +
    sparseColumns(grid) * SPARSE_COLUMN_PENALTY +
    Math.abs(grid.rows.length - targetRows) * ROW_DRIFT_PENALTY +
    Math.abs(grid.cols - preferredCols) * COLUMN_DRIFT_PENALTY
  )
}

export interface BuildFallenPhraseGridOptions {
  /** Uppercase A-Z with single spaces — already gated by `content.ts`. */
  phrase: string
  /** Grid widths this trim can print, widest last. */
  colCandidates: readonly number[]
  /** Row counts the level will accept. */
  rowCandidates: readonly number[]
  /** The shape the level asked for; ties break towards it. */
  targetRows: number
  preferredCols: number
  seed: number
}

/**
 * The tidiest grid this saying makes, or nothing.
 *
 * Every width and row count the page allows is tried and then scored, rather
 * than taking the first that fits. The two are not independent — a saying that
 * leaves a twelve-column grid full of holes often settles perfectly into
 * thirteen, and one that will not make four rows makes five without a gap — so
 * searching one and fixing the other is how a page ends up printing a
 * respectable saying in a grid that looks like a mistake.
 *
 * Nothing at all means this saying does not belong on this trim. The caller
 * moves on to the next candidate rather than forcing it, because the failure
 * modes here are not cosmetic: they are the ones that reach a reader.
 */
export function buildFallenPhraseGrid(
  options: BuildFallenPhraseGridOptions,
): FallenPhraseGrid | null {
  const { phrase, colCandidates, rowCandidates, targetRows, preferredCols, seed } =
    options
  const words = phrase.split(GAP).filter(Boolean)
  if (words.length === 0) return null

  let best: FallenPhraseGrid | null = null
  let bestScore = Number.POSITIVE_INFINITY

  for (const cols of colCandidates) {
    if (cols <= 0) continue
    for (const rowCount of rowCandidates) {
      const rows = justifyRows(words, cols, rowCount)
      if (!rows) continue
      const grid = gridFrom(phrase, rows, cols, seed)
      if (!grid) continue
      // The one shape that must never print: a grid so full of holes it reads
      // as scattered words rather than a saying. Everything else this loop
      // cares about is a preference, and preferences belong in the score.
      if (blockedShare(grid) > MAX_BLOCKED_SHARE) continue

      const score = gridScore(grid, targetRows, preferredCols)
      if (score < bestScore) {
        bestScore = score
        best = grid
      }
    }
  }
  return best
}
