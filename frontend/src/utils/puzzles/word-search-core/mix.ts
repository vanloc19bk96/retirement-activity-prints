import type { StudioRng } from '@/utils/studio/studio-rng'

interface Dir {
  dr: number
  dc: number
  name: string
}

export type DiagonalFamily = 'slash' | 'backslash'

export interface PlacementMix {
  diagonal: number
  backwards: number
  /** SW / NE — top-right down to bottom-left (`/`). */
  slash: number
  /** SE / NW — top-left down to bottom-right (`\`). */
  backslash: number
}

export interface MixTargets {
  minDiagonal: number
  minBackwards: number
  minSlash: number
  minBackslash: number
}

interface Start {
  r: number
  c: number
  dir: Dir
}

/** Diagonal = both row and column change (SE/SW/NE/NW). */
export function isDiagonalDir(dir: Dir): boolean {
  return dir.dr !== 0 && dir.dc !== 0
}

/** `/` family: SW (1,-1) and NE (-1,1). */
export function isSlashDir(dir: Dir): boolean {
  return isDiagonalDir(dir) && dir.dr * dir.dc < 0
}

/** `\` family: SE (1,1) and NW (-1,-1). */
export function isBackslashDir(dir: Dir): boolean {
  return isDiagonalDir(dir) && dir.dr * dir.dc > 0
}

export function diagonalFamily(dir: Dir): DiagonalFamily | null {
  if (isSlashDir(dir)) return 'slash'
  if (isBackslashDir(dir)) return 'backslash'
  return null
}

/**
 * Player-facing "backwards" for hard mode:
 * reverse spelling, or a hard-only heading (N/W/NW/NE).
 * Medium's forward diagonals (SE/SW) are not backwards.
 */
export function isBackwardsWrite(dir: Dir, written: string, original: string): boolean {
  const isHardOnlyDir = dir.dr < 0 || (dir.dr === 0 && dir.dc < 0)
  return isHardOnlyDir || written !== original
}

function emptyTargets(): MixTargets {
  return { minDiagonal: 0, minBackwards: 0, minSlash: 0, minBackslash: 0 }
}

/**
 * Medium must actually use diagonals; hard must use diagonals and backwards.
 * Caps scale with list size so a 3-word puzzle is not asked for 5 diagonals.
 * When both slash families exist, split the diagonal quota so backslash (`\`)
 * cannot crowd out slash (`/`) — greedy first-fit otherwise stacks on SE.
 */
export function mixTargets(options: {
  wordCount: number
  hasDiagonal: boolean
  allowReverse: boolean
  hasSlash?: boolean
  hasBackslash?: boolean
}): MixTargets {
  const { wordCount, hasDiagonal, allowReverse } = options
  if (wordCount <= 0) return emptyTargets()
  const diagonalRatio = allowReverse ? 0.3 : 0.25
  const minDiagonal = hasDiagonal
    ? Math.min(wordCount, Math.max(1, Math.round(wordCount * diagonalRatio)))
    : 0
  const minBackwards = allowReverse
    ? Math.min(wordCount, Math.max(1, Math.round(wordCount * 0.25)))
    : 0
  const slashAvailable = options.hasSlash ?? hasDiagonal
  const backslashAvailable = options.hasBackslash ?? hasDiagonal
  const canSplit = slashAvailable && backslashAvailable && minDiagonal >= 2
  const minSlash = canSplit ? Math.max(1, Math.floor(minDiagonal / 2)) : 0
  const minBackslash = canSplit ? Math.max(1, minDiagonal - minSlash) : 0
  return { minDiagonal, minBackwards, minSlash, minBackslash }
}

export function meetsMix(mix: PlacementMix, targets: MixTargets): boolean {
  return (
    mix.diagonal >= targets.minDiagonal &&
    mix.backwards >= targets.minBackwards &&
    mix.slash >= targets.minSlash &&
    mix.backslash >= targets.minBackslash
  )
}

/** Higher is better. Meeting quotas outranks extra placements of one class. */
export function mixScore(mix: PlacementMix, targets: MixTargets): number {
  const met =
    (mix.diagonal >= targets.minDiagonal ? 100 : 0) +
    (mix.backwards >= targets.minBackwards ? 100 : 0) +
    (mix.slash >= targets.minSlash ? 50 : 0) +
    (mix.backslash >= targets.minBackslash ? 50 : 0)
  return met + mix.diagonal * 3 + mix.backwards + mix.slash + mix.backslash
}

/**
 * Long words have far fewer diagonal starts than orthogonal ones.
 * Prefer shorter words for the diagonal quota unless we are out of remaining slots.
 */
export function isLongForDiagonal(wordLength: number, gridSize: number): boolean {
  return gridSize - wordLength < 5
}

/** Which diagonal family (if any) the next word should try first. */
export function preferredDiagonalFamily(options: {
  wordLength: number
  gridSize: number
  remaining: number
  targets: MixTargets
  diagonalCount: number
  slashCount: number
  backslashCount: number
}): { preferDiagonal: boolean; preferFamily: DiagonalFamily | null } {
  const needDiagonal = options.targets.minDiagonal - options.diagonalCount
  const needSlash = options.targets.minSlash - options.slashCount
  const needBackslash = options.targets.minBackslash - options.backslashCount
  const preferFamily: DiagonalFamily | null =
    needSlash > 0 && needSlash >= needBackslash
      ? 'slash'
      : needBackslash > 0
        ? 'backslash'
        : null
  const preferDiagonal =
    preferFamily != null ||
    (needDiagonal > 0 &&
      (!isLongForDiagonal(options.wordLength, options.gridSize) ||
        needDiagonal >= options.remaining))
  return { preferDiagonal, preferFamily }
}

function startsForDirection(word: string, size: number, dir: Dir): Start[] {
  const out: Start[] = []
  const last = word.length - 1
  const endR0 = dir.dr * last
  const endC0 = dir.dc * last
  for (let r = 0; r < size; r++) {
    const endR = r + endR0
    if (endR < 0 || endR >= size) continue
    for (let c = 0; c < size; c++) {
      const endC = c + endC0
      if (endC < 0 || endC >= size) continue
      out.push({ r, c, dir })
    }
  }
  return out
}

function drainDirectionQueues(
  order: number[],
  queues: Start[][],
): Start[] {
  const out: Start[] = []
  const cursor = order.map(() => 0)
  const localQueues = order.map((dirIndex) => queues[dirIndex]!)
  let remaining = localQueues.reduce((n, q) => n + q.length, 0)
  while (remaining > 0) {
    let progressed = false
    for (let slot = 0; slot < order.length; slot++) {
      const q = localQueues[slot]!
      const i = cursor[slot]!
      if (i >= q.length) continue
      out.push(q[i]!)
      cursor[slot] = i + 1
      remaining -= 1
      progressed = true
    }
    if (!progressed) break
  }
  return out
}

function startsByPreference(options: {
  dirOrder: number[]
  directions: readonly Dir[]
  queues: Start[][]
  preferDiagonal: boolean
  preferFamily: DiagonalFamily | null
}): Start[] {
  const { dirOrder, directions, queues, preferDiagonal, preferFamily } = options
  const slashOrder = dirOrder.filter((i) => isSlashDir(directions[i]!))
  const backslashOrder = dirOrder.filter((i) => isBackslashDir(directions[i]!))
  const orthogonalOrder = dirOrder.filter((i) => !isDiagonalDir(directions[i]!))
  const diagonalOrder = dirOrder.filter((i) => isDiagonalDir(directions[i]!))

  if (preferFamily === 'slash' && slashOrder.length > 0) {
    return [
      ...drainDirectionQueues(slashOrder, queues),
      ...drainDirectionQueues(backslashOrder, queues),
      ...drainDirectionQueues(orthogonalOrder, queues),
    ]
  }
  if (preferFamily === 'backslash' && backslashOrder.length > 0) {
    return [
      ...drainDirectionQueues(backslashOrder, queues),
      ...drainDirectionQueues(slashOrder, queues),
      ...drainDirectionQueues(orthogonalOrder, queues),
    ]
  }
  if (preferDiagonal) {
    return [
      ...drainDirectionQueues(diagonalOrder, queues),
      ...drainDirectionQueues(orthogonalOrder, queues),
    ]
  }
  return drainDirectionQueues(dirOrder, queues)
}

/**
 * Flattened (row, col, dir) lists let orthogonal dirs drown diagonals:
 * a 10-letter word on 14×14 has ~70 East starts vs ~25 South-East starts.
 * Round-robin by direction so each dir gets an equal first look.
 * When `preferDiagonal`, every diagonal start is tried before any orthogonal one.
 * `preferFamily` further puts `/` or `\` first so one slant cannot monopolise.
 */
export function interleavedCandidateStarts(
  word: string,
  size: number,
  directions: readonly Dir[],
  rng: StudioRng,
  preferDiagonal: boolean,
  preferFamily: DiagonalFamily | null = null,
): Start[] {
  const queues = directions.map((dir) => rng.shuffle(startsForDirection(word, size, dir)))
  const dirOrder = rng.shuffle(directions.map((_, i) => i))
  return startsByPreference({
    dirOrder,
    directions,
    queues,
    preferDiagonal,
    preferFamily,
  })
}
