import type { StudioRng } from '../studio-rng'
import { canonicalHash, gridSymmetries } from '../_shared/uniqueness'
import { pqAnswerKey, pqRectKey, pqRectSquares, pqSolutions, isPqSolution, solvePq, type PqPuzzle, type PqRect, type PqRules } from './solver'

/**
 * Piecing a Patchwork Quilt.
 *
 * The answer comes first: the quilt is cut into patches from the top left,
 * each new patch a rectangle of two squares or more that starts on the
 * first square still uncut (so the patches always tile the quilt), bigger
 * patches a little likelier than the smallest and long thin strips rarer,
 * so a quilt has a mix of blocks. Every patch then gets its number on a
 * square of its own, drawn at random. A freshly pieced quilt often has
 * other answers too; every other answer lays some number's patch another
 * way, and moving that number to a square of its true patch the other way
 * misses leaves the other answer with a patch holding no number, so it is
 * gone. Round by round the move that leaves fewest answers is made (the
 * true answer always survives: every number stays inside its own patch)
 * until one answer is left. The solver then decides whether a reader can
 * reach it without guessing, using exactly the level's steps.
 */

export interface PqBuilt {
  puzzle: PqPuzzle
  /** The one answer: each number's patch, in the numbers' order. */
  patches: PqRect[]
  /** Digest of the numbers, the same however the quilt is turned or mirrored. */
  signature: string
}

/** Quilts pieced before a level gives up on this stream. */
export const PQ_CANDIDATES = 400
/** Rounds of number moves before one quilt is given up. */
const ROUNDS = 40
/** Other answers looked at, and moves tried, each round. */
const ANSWERS_SEEN = 30
const PATCHES_TRIED = 8
const SQUARES_TRIED = 4
/** The smallest patch: a patch of one square is a square handed to the reader. */
export const PQ_MIN_PATCH = 2

/** The numbers as a grid (0 where none prints). */
export function pqNumberGrid(puzzle: PqPuzzle): number[][] {
  const n = puzzle.size
  const grid = Array.from({ length: n }, () => new Array<number>(n).fill(0))
  for (const clue of puzzle.clues) grid[Math.floor(clue.at / n)]![clue.at % n] = clue.size
  return grid
}

/** A quilt's own fingerprint: turned or mirrored, its numbers are the same puzzle. */
export function pqSignature(puzzle: PqPuzzle): string {
  let best: string | null = null
  for (const turned of gridSymmetries(pqNumberGrid(puzzle))) {
    const form = turned.map((row) => row.join(',')).join('/')
    if (best === null || form < best) best = form
  }
  return canonicalHash(best ?? '')
}

/**
 * The quilt cut into patches: from the first uncut square in reading order,
 * a rectangle that starts there and runs over uncut squares only. Null when
 * a lone square is left with no room for a patch of two.
 */
export function drawPqPatches(n: number, rng: StudioRng, maxPatch: number, maxSide: number): PqRect[] | null {
  const cut = new Uint8Array(n * n)
  const out: PqRect[] = []
  for (let i = 0; i < n * n; i++) {
    if (cut[i]) continue
    const row = Math.floor(i / n)
    const col = i % n
    const options: { rect: PqRect; weight: number }[] = []
    // How far the uncut run reaches along this row.
    let across = 0
    while (col + across < n && across < maxSide && !cut[row * n + col + across]) across++
    for (let height = 1; height <= Math.min(maxSide, n - row); height++) {
      for (let width = 1; width <= across; width++) {
        const area = height * width
        if (area < PQ_MIN_PATCH || area > maxPatch) continue
        // An earlier patch reaching a lower row would cut this row above it too; checked all the same.
        let free = true
        for (let r = row + 1; r < row + height && free; r++) for (let c = col; c < col + width && free; c++) if (cut[r * n + c]) free = false
        if (!free) continue
        let weight = area === PQ_MIN_PATCH ? 0.5 : 1
        if (Math.min(height, width) === 1 && Math.max(height, width) >= 5) weight *= 0.3
        options.push({ rect: { row, col, height, width }, weight })
      }
    }
    if (options.length === 0) return null
    let x = rng.next() * options.reduce((sum, o) => sum + o.weight, 0)
    let rect = options[options.length - 1]!.rect
    for (const o of options) {
      x -= o.weight
      if (x <= 0) {
        rect = o.rect
        break
      }
    }
    for (const j of pqRectSquares(rect, n)) cut[j] = 1
    out.push(rect)
  }
  return out
}

/** The puzzle and its answer, numbers in reading order, from each patch and its number's square. */
export function pqFromPatches(n: number, patches: readonly PqRect[], ats: readonly number[]): { puzzle: PqPuzzle; patches: PqRect[] } {
  const order = patches.map((_, k) => k).sort((a, b) => ats[a]! - ats[b]!)
  return {
    puzzle: { size: n, clues: order.map((k) => ({ at: ats[k]!, size: patches[k]!.height * patches[k]!.width })) },
    patches: order.map((k) => patches[k]!),
  }
}

export interface PqLevelNeeds {
  size: number
  maxPatch: number
  maxSide: number
  rules: PqRules
  /** Refuse quilts these steps alone finish. */
  beyond?: PqRules | null
}

/** True when the quilt is one the level's steps finish on exactly this answer, and no easier. */
export function pqMeetsLevel(puzzle: PqPuzzle, patches: readonly PqRect[], needs: PqLevelNeeds): boolean {
  if (!isPqSolution(puzzle, patches)) return false
  if (puzzle.clues.some((c) => c.size < PQ_MIN_PATCH || c.size > needs.maxPatch)) return false
  const solve = solvePq(puzzle, needs.rules)
  if (!solve.solved || pqAnswerKey(solve.rects as PqRect[]) !== pqAnswerKey(patches)) return false
  return !(needs.beyond && solvePq(puzzle, needs.beyond).solved)
}

/**
 * One quilt pieced for the level, kept only when the level's steps solve it
 * to exactly its answer (and, when `beyond` is given, those steps alone do
 * not). Null when this draw does not.
 */
export function drawPqCandidate(options: PqLevelNeeds & { rng: StudioRng }): PqBuilt | null {
  const { size: n, rng } = options
  const patches = drawPqPatches(n, rng, options.maxPatch, options.maxSide)
  if (!patches) return null
  const truth = new Set(patches.map(pqRectKey))
  let ats = patches.map((rect) => (rect.row + rng.int(0, rect.height - 1)) * n + rect.col + rng.int(0, rect.width - 1))
  for (let round = 0; round < ROUNDS; round++) {
    const made = pqFromPatches(n, patches, ats)
    const answers = pqSolutions(made.puzzle, ANSWERS_SEEN)
    if (answers.length === 1) {
      return pqMeetsLevel(made.puzzle, made.patches, options) ? { ...made, signature: pqSignature(made.puzzle) } : null
    }
    // Squares some other answer lays differently, and the patches holding them.
    const astray = new Set<number>()
    for (const answer of answers) for (const rect of answer) if (!truth.has(pqRectKey(rect))) for (const i of pqRectSquares(rect, n)) astray.add(i)
    const movable = patches.flatMap((rect, k) => (pqRectSquares(rect, n).some((i) => astray.has(i)) ? [k] : []))
    let best: { ats: number[]; left: number } | null = null
    for (const k of rng.shuffle(movable).slice(0, PATCHES_TRIED)) {
      for (const at of rng.shuffle(pqRectSquares(patches[k]!, n)).slice(0, SQUARES_TRIED)) {
        if (at === ats[k]) continue
        const moved = [...ats]
        moved[k] = at
        const left = pqSolutions(pqFromPatches(n, patches, moved).puzzle, ANSWERS_SEEN).length
        if (!best || left < best.left) best = { ats: moved, left }
      }
    }
    if (!best) return null
    ats = best.ats
  }
  return null
}

/**
 * A quilt for the level from this stream: quilts pieced until one is solved
 * by exactly the level's steps, or null when none is within the budget.
 */
export function buildPqQuilt(
  options: PqLevelNeeds & {
    rng: StudioRng
    /** Quilts already refused for this page (by signature). */
    exclude?: ReadonlySet<string>
  },
): PqBuilt | null {
  const { exclude, ...needs } = options
  for (let k = 0; k < PQ_CANDIDATES; k++) {
    const built = drawPqCandidate(needs)
    if (built && !exclude?.has(built.signature)) return built
  }
  return null
}

/** Each square's patch (its index in `patches`). */
export function pqPatchMap(n: number, patches: readonly PqRect[]): number[] {
  const map = new Array<number>(n * n).fill(-1)
  patches.forEach((rect, k) => {
    for (const i of pqRectSquares(rect, n)) map[i] = k
  })
  return map
}
