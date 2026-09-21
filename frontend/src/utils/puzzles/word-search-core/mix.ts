import type { StudioRng } from '@/utils/studio/studio-rng'

interface Dir {
  dr: number
  dc: number
  name: string
}

export interface PlacementMix {
  diagonal: number
  backwards: number
}

export interface MixTargets {
  minDiagonal: number
  minBackwards: number
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

/**
 * Player-facing "backwards" for hard mode:
 * reverse spelling, or a hard-only heading (N/W/NW/NE).
 * Medium's forward diagonals (SE/SW) are not backwards.
 */
export function isBackwardsWrite(dir: Dir, written: string, original: string): boolean {
  const isHardOnlyDir = dir.dr < 0 || (dir.dr === 0 && dir.dc < 0)
  return isHardOnlyDir || written !== original
}

/**
 * Medium must actually use diagonals; hard must use diagonals and backwards.
 * Caps scale with list size so a 3-word puzzle is not asked for 5 diagonals.
 */
export function mixTargets(options: {
  wordCount: number
  hasDiagonal: boolean
  allowReverse: boolean
}): MixTargets {
  const { wordCount, hasDiagonal, allowReverse } = options
  if (wordCount <= 0) return { minDiagonal: 0, minBackwards: 0 }
  const diagonalRatio = allowReverse ? 0.3 : 0.25
  const minDiagonal = hasDiagonal
    ? Math.min(wordCount, Math.max(1, Math.round(wordCount * diagonalRatio)))
    : 0
  const minBackwards = allowReverse
    ? Math.min(wordCount, Math.max(1, Math.round(wordCount * 0.25)))
    : 0
  return { minDiagonal, minBackwards }
}

export function meetsMix(mix: PlacementMix, targets: MixTargets): boolean {
  return mix.diagonal >= targets.minDiagonal && mix.backwards >= targets.minBackwards
}

/** Higher is better. Meeting quotas outranks extra placements of one class. */
export function mixScore(mix: PlacementMix, targets: MixTargets): number {
  const met =
    (mix.diagonal >= targets.minDiagonal ? 100 : 0) +
    (mix.backwards >= targets.minBackwards ? 100 : 0)
  return met + mix.diagonal * 3 + mix.backwards
}

/**
 * Long words have far fewer diagonal starts than orthogonal ones.
 * Prefer shorter words for the diagonal quota unless we are out of remaining slots.
 */
export function isLongForDiagonal(wordLength: number, gridSize: number): boolean {
  return gridSize - wordLength < 5
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

/**
 * Flattened (row, col, dir) lists let orthogonal dirs drown diagonals:
 * a 10-letter word on 14×14 has ~70 East starts vs ~25 South-East starts.
 * Round-robin by direction so each dir gets an equal first look.
 * When `preferDiagonal`, every diagonal start is tried before any orthogonal one.
 */
export function interleavedCandidateStarts(
  word: string,
  size: number,
  directions: readonly Dir[],
  rng: StudioRng,
  preferDiagonal: boolean,
): Start[] {
  const queues = directions.map((dir) => rng.shuffle(startsForDirection(word, size, dir)))
  const dirOrder = rng.shuffle(directions.map((_, i) => i))
  const diagonalOrder = dirOrder.filter((i) => isDiagonalDir(directions[i]!))
  const orthogonalOrder = dirOrder.filter((i) => !isDiagonalDir(directions[i]!))
  if (preferDiagonal) {
    return [
      ...drainDirectionQueues(diagonalOrder, queues),
      ...drainDirectionQueues(orthogonalOrder, queues),
    ]
  }
  return drainDirectionQueues(dirOrder, queues)
}
