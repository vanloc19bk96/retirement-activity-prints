import type { StudioRng } from '../studio-rng'
import { canonicalHash, gridSymmetries } from '../_shared/uniqueness'
import {
  NEIGHBORS_BLANK,
  NEIGHBORS_MAX_BLOCK,
  fillNeighborsTown,
  isNeighborsSolution,
  neighborsAnswerKey,
  neighborsBeside,
  neighborsBlockCells,
  solveNeighbors,
  type NeighborsPuzzle,
  type NeighborsRules,
} from './solver'

/**
 * Building a Friendly Neighbors town.
 *
 * The streets come first: the town is cut into blocks of one to five houses.
 * Each block grows from the tightest corner still free, one house at a time,
 * reaching for houses with the fewest free neighbours so no house is left
 * stranded on its own; most blocks come out four or five houses long, a few
 * smaller, and a town with too many lone houses or pairs is not kept.
 *
 * The house numbers come next: a search writes a number in every house so
 * each block holds 1 up to its size and no two touching houses match, trying
 * numbers in a random order so every town is numbered its own way. Many cuts
 * of big blocks cannot be numbered at all; the search finds that out in a
 * few hundred steps, and the town is cut again.
 *
 * The printed numbers come last: every house starts numbered, and numbers
 * are then taken away one by one, the most crowded first, as long as the
 * level's steps still finish the town on the same numbers — so the reader
 * gets few numbers, spread over the whole town, and each one counts.
 */

export interface NeighborsBuilt {
  puzzle: NeighborsPuzzle
  /** The one answer: the number in every house. */
  values: number[]
  /** Digest of the blocks and printed numbers, the same however the town is turned or mirrored. */
  signature: string
}

/** Towns built before a level gives up on this stream. */
export const NEIGHBORS_CANDIDATES = 40
/** Numbers a "what if" level tries to take away once the easier steps can spare no more. */
export const NEIGHBORS_PROBE_TAKES = 12
/** Cuts tried before a candidate gives up: few cuts of a big-block town take numbers, but each is found out fast. */
const TOWN_TRIES = 150
/** Search steps spent numbering one cut before trying another. */
const FILL_PATIENCE = 300

/** How a level likes its blocks: how often each size is aimed for (5 down to 2). */
export type NeighborsBlockMix = readonly [five: number, four: number, three: number, two: number]

/**
 * A town's own fingerprint: turned or mirrored, its blocks and numbers are
 * the same puzzle. Blocks are named afresh in reading order for each turn,
 * so how they were numbered while building does not count.
 */
export function neighborsSignature(puzzle: NeighborsPuzzle): string {
  const n = puzzle.size
  const grid = Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => [puzzle.blocks[r * n + c]!, puzzle.clues[r * n + c]!] as const))
  let best: string | null = null
  for (const turned of gridSymmetries(grid)) {
    const names = new Map<number, number>()
    const text = turned
      .map((row) =>
        row
          .map(([b, v]) => {
            if (!names.has(b)) names.set(b, names.size)
            return `${names.get(b)!.toString(36)}${v === NEIGHBORS_BLANK ? '.' : v}`
          })
          .join(' '),
      )
      .join('/')
    if (best === null || text < best) best = text
  }
  return canonicalHash(best ?? '')
}

/* ------------------------------------------------------------------ *
 * The blocks
 * ------------------------------------------------------------------ */

/** How many blocks of each size a town has (index 1 … 5). */
export function neighborsBlockSizes(blocks: readonly number[]): number[] {
  const sizes = new Array<number>(NEIGHBORS_MAX_BLOCK + 1).fill(0)
  for (const list of neighborsBlockCells({ blocks })) sizes[list.length]!++
  return sizes
}

/** True when the blocks make a good town: few lone houses and pairs, and mostly blocks of four or five. */
export function neighborsBlocksBalanced(n: number, blocks: readonly number[]): boolean {
  const sizes = neighborsBlockSizes(blocks)
  const N = n * n
  if (sizes[1]! > Math.floor(n / 3)) return false
  if (sizes[1]! + sizes[2]! > Math.ceil(n / 2)) return false
  // At least half the houses stand in blocks of four or five.
  return (sizes[4]! * 4 + sizes[5]! * 5) * 2 >= N
}

/**
 * Cuts an n × n town into blocks of one to five houses. Each block starts at
 * the free house with the fewest free neighbours and grows the same way
 * (with a little chance, so blocks do not all grow alike), aiming for a size
 * drawn from the level's mix; the town fills from its tight corners and
 * seldom strands a house. A house stranded on its own joins a neighbouring
 * block with room for it, most of the time.
 */
export function drawNeighborsBlocks(n: number, rng: StudioRng, mix: NeighborsBlockMix): number[] {
  const N = n * n
  const owner = new Array<number>(N).fill(-1)
  const free = (s: number) => neighborsBeside(n, s).filter((t) => t >= 0 && owner[t] === -1).length
  const rank = new Map(rng.shuffle(Array.from({ length: N }, (_, s) => s)).map((s, i) => [s, i]))
  const tighter = (a: number, b: number) => {
    const d = free(a) - free(b)
    return d < 0 || (d === 0 && rank.get(a)! < rank.get(b)!)
  }
  const target = () => {
    const total = mix[0] + mix[1] + mix[2] + mix[3]
    let roll = rng.next() * total
    for (let k = 0; k < 4; k++) {
      roll -= mix[k]!
      if (roll < 0) return NEIGHBORS_MAX_BLOCK - k
    }
    return 2
  }
  let block = 0
  for (;;) {
    let start = -1
    for (let s = 0; s < N; s++) if (owner[s] === -1 && (start < 0 || tighter(s, start))) start = s
    if (start < 0) break
    const want = target()
    const members = [start]
    owner[start] = block
    while (members.length < want) {
      const frontier = [...new Set(members.flatMap((s) => neighborsBeside(n, s).filter((t) => t >= 0 && owner[t] === -1)))]
      if (frontier.length === 0) break
      const next = rng.chance(0.25) ? frontier[rng.int(0, frontier.length - 1)]! : frontier.reduce((a, b) => (tighter(b, a) ? b : a))
      owner[next] = block
      members.push(next)
    }
    block++
  }
  // A lone house joins a neighbouring block with room for it, the smallest first.
  for (let s = 0; s < N; s++) {
    const sizes = neighborsBlockCells({ blocks: owner }).map((list) => list.length)
    if (sizes[owner[s]!] !== 1 || !rng.chance(0.7)) continue
    const room = neighborsBeside(n, s)
      .filter((t) => t >= 0 && sizes[owner[t]!]! < NEIGHBORS_MAX_BLOCK)
      .sort((a, b) => sizes[owner[a]!]! - sizes[owner[b]!]!)
    if (room.length > 0) owner[s] = owner[room[0]!]!
  }
  // Blocks numbered afresh, 0 up in reading order.
  const names = new Map<number, number>()
  return owner.map((b) => {
    if (!names.has(b)) names.set(b, names.size)
    return names.get(b)!
  })
}

/**
 * A town cut and numbered from this stream: blocks cut until a balanced cut
 * takes numbers within the search's patience (a cut that cannot be numbered
 * is usually found out at once). Null when none does within the tries.
 */
export function drawNeighborsTown(n: number, rng: StudioRng, mix: NeighborsBlockMix): { blocks: number[]; values: number[] } | null {
  for (let t = 0; t < TOWN_TRIES; t++) {
    const blocks = drawNeighborsBlocks(n, rng, mix)
    if (!neighborsBlocksBalanced(n, blocks)) continue
    const values = fillNeighborsTown({ size: n, blocks }, (o) => rng.shuffle(o), FILL_PATIENCE)
    if (values) return { blocks, values }
  }
  return null
}

/* ------------------------------------------------------------------ *
 * The printed numbers
 * ------------------------------------------------------------------ */

export interface NeighborsLevelNeeds {
  size: number
  rules: NeighborsRules
  /** Refuse towns these steps alone finish. */
  beyond?: NeighborsRules | null
  /** How often each block size is aimed for. */
  mix: NeighborsBlockMix
  /** Fewest and most numbers the page prints, as a share of the houses. */
  clues: readonly [number, number]
}

/** True when the level's own steps finish the town on exactly these numbers. */
function finishes(puzzle: NeighborsPuzzle, values: readonly number[], rules: NeighborsRules): boolean {
  const done = (r: NeighborsRules) => {
    const solve = solveNeighbors(puzzle, r)
    return solve.solved && neighborsAnswerKey(solve.values) === neighborsAnswerKey(values)
  }
  // "What if" only adds to the other steps: a town they finish, it finishes too — and far sooner.
  if (rules === 'probe' && done('touch')) return true
  return done(rules)
}

/** How many numbers a town prints. */
export const neighborsClueCount = (puzzle: NeighborsPuzzle) => puzzle.clues.filter((v) => v !== NEIGHBORS_BLANK).length

/** The fewest and most numbers a level prints in its houses. */
export function neighborsClueRange(needs: Pick<NeighborsLevelNeeds, 'size' | 'clues'>): [number, number] {
  const N = needs.size * needs.size
  return [Math.ceil(needs.clues[0] * N), Math.floor(needs.clues[1] * N)]
}

/** True when the town is one the level's steps finish on exactly these numbers, and no easier. */
export function neighborsMeetsLevel(puzzle: NeighborsPuzzle, values: readonly number[], needs: Pick<NeighborsLevelNeeds, 'rules' | 'beyond'>): boolean {
  if (!isNeighborsSolution(puzzle, values)) return false
  if (!finishes(puzzle, values, needs.rules)) return false
  return !(needs.beyond && solveNeighbors(puzzle, needs.beyond).solved)
}

/** Houses within two steps (any direction) of each other. */
const near = (n: number, a: number, b: number) =>
  Math.max(Math.abs(Math.floor(a / n) - Math.floor(b / n)), Math.abs((a % n) - (b % n))) <= 2

/**
 * One town built for the level, kept only when the level's steps solve it
 * to exactly its numbers (and, when `beyond` is given, those steps alone do
 * not), with a fair share of numbers left. Null when this draw does not.
 */
export function drawNeighborsCandidate(options: NeighborsLevelNeeds & { rng: StudioRng }): NeighborsBuilt | null {
  const { size: n, rng } = options
  const N = n * n
  const town = drawNeighborsTown(n, rng, options.mix)
  if (!town) return null
  const { blocks, values } = town
  const clues = [...values]
  const [fewest, most] = neighborsClueRange(options)

  // Take numbers away while the level's steps still finish the town, never
  // below the level's fewest: first while the steps short of "what if" do,
  // then — at a "what if" level — a few more that only "what if" can do
  // without. The most crowded number is tried first, so the ones left
  // spread over the whole town instead of leaving a corner bare.
  const rank = new Map(rng.shuffle(clues.map((_, k) => k)).map((s, i) => [s, i]))
  const crowd = (s: number) => {
    let count = 0
    for (let t = 0; t < N; t++) if (t !== s && clues[t] !== NEIGHBORS_BLANK && near(n, s, t)) count++
    return count
  }
  const nextToTry = (tried: ReadonlySet<number>) => {
    let best = -1
    let bestCrowd = -1
    for (let s = 0; s < N; s++) {
      if (clues[s] === NEIGHBORS_BLANK || tried.has(s)) continue
      const c = crowd(s)
      if (c > bestCrowd || (c === bestCrowd && rank.get(s)! < rank.get(best)!)) {
        best = s
        bestCrowd = c
      }
    }
    return best
  }
  const first: NeighborsRules = options.rules === 'probe' ? 'touch' : options.rules
  let left = N
  const kept = new Set<number>()
  for (let s = nextToTry(kept); s >= 0 && left > fewest; s = nextToTry(kept)) {
    const keep = clues[s]!
    clues[s] = NEIGHBORS_BLANK
    if (finishes({ size: n, blocks, clues }, values, first)) left--
    else {
      clues[s] = keep
      kept.add(s)
    }
  }
  if (options.rules === 'probe') {
    const tried = new Set<number>()
    for (let s = nextToTry(tried); s >= 0 && left > fewest && tried.size < NEIGHBORS_PROBE_TAKES; s = nextToTry(tried)) {
      tried.add(s)
      const keep = clues[s]!
      clues[s] = NEIGHBORS_BLANK
      if (finishes({ size: n, blocks, clues }, values, 'probe')) left--
      else clues[s] = keep
    }
  }
  if (left > most) return null
  const puzzle: NeighborsPuzzle = { size: n, blocks, clues }
  if (!neighborsMeetsLevel(puzzle, values, options)) return null
  return { puzzle, values, signature: neighborsSignature(puzzle) }
}

/**
 * A town for the level from this stream: towns built until one is solved
 * by exactly the level's steps, or null when none is within the budget.
 */
export function buildNeighborsTown(
  options: NeighborsLevelNeeds & {
    rng: StudioRng
    /** Towns already refused for this page (by signature). */
    exclude?: ReadonlySet<string>
  },
): NeighborsBuilt | null {
  const { exclude, ...needs } = options
  for (let k = 0; k < NEIGHBORS_CANDIDATES; k++) {
    const built = drawNeighborsCandidate(needs)
    if (built && !exclude?.has(built.signature)) return built
  }
  return null
}
