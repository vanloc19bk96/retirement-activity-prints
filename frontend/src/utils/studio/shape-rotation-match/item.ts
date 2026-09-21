import type { StudioRng } from '../studio-rng'
import {
  generateUniqueFigure,
  identityKey,
  isMirrorOf,
  isRotationOf,
  mirrorH,
  rotateBy,
} from './figure'
import { maxShapeSpan } from './polyomino'
import type { Difficulty, Format, Item } from './types'

export const ANGLES: Record<Difficulty, readonly number[]> = {
  easy: [90, 180],
  medium: [90, 180, 270],
  hard: [90, 180, 270],
}

/**
 * Larger blocks → exponentially more shapes, but smaller printed cells.
 * Catalogued figures (shape × accent) available per tier — see polyomino.ts.
 */
export const CELL_RANGE: Record<Difficulty, readonly [number, number]> = {
  easy: [5, 7],
  medium: [7, 9],
  hard: [8, 10],
}

function pickCellCount(difficulty: Difficulty, rng: StudioRng): number {
  const [min, max] = CELL_RANGE[difficulty]
  return rng.int(min, max)
}

/**
 * Widest block this tier can produce, in cells. Layout reserves row height for it so
 * the one tall silhouette on a page is still printable, not just the average one.
 */
export function maxBlockSpan(difficulty: Difficulty): number {
  const [min, max] = CELL_RANGE[difficulty]
  let span = 1
  for (let n = min; n <= max; n++) {
    span = Math.max(span, maxShapeSpan(n))
  }
  return span
}

/** Smallest bounding-box side that still has a playable catalogue for this tier. */
export function minBlockSpan(difficulty: Difficulty): number {
  const [, maxCells] = CELL_RANGE[difficulty]
  let side = 2
  while (side * side < maxCells) side++
  // A filled 3×3 nine-omino has no honest 4-rotation set; 4×4 still packs 8 rows.
  return Math.max(4, side)
}

function quarterTurns(angleDeg: number): number {
  return Math.round(angleDeg / 90)
}

function verifySameDifferent(item: Item): void {
  const cand = item.candidates[0]
  if (!cand || item.answer == null) {
    throw new Error('shape-rotation-match: same-different item incomplete')
  }
  if (item.answer === 'SAME') {
    if (!isRotationOf(item.ref, cand)) {
      throw new Error('shape-rotation-match: SAME candidate is not a rotation')
    }
    return
  }
  if (!isMirrorOf(item.ref, cand) || isRotationOf(item.ref, cand)) {
    throw new Error('shape-rotation-match: MIRROR candidate invalid')
  }
}

function verifyPickMatches(item: Item): void {
  const indices = item.correctIndices
  if (!indices || indices.length !== 2) {
    throw new Error('shape-rotation-match: pick-matches needs exactly two matches')
  }
  item.candidates.forEach((cand, i) => {
    const isMatch = indices.includes(i)
    if (isMatch) {
      if (!isRotationOf(item.ref, cand)) {
        throw new Error(`shape-rotation-match: match at ${i} is not a rotation`)
      }
      return
    }
    if (isRotationOf(item.ref, cand)) {
      throw new Error(`shape-rotation-match: foil at ${i} is also a rotation`)
    }
  })
}

export function buildItem(
  cellCount: number,
  format: Format,
  angles: readonly number[],
  rng: StudioRng,
  usedIdentities?: Set<string>,
  maxSpan?: number,
): Item {
  if (angles.length < 1) {
    throw new Error('shape-rotation-match: angles required')
  }

  const used = usedIdentities ?? new Set<string>()
  const ref = generateUniqueFigure(cellCount, rng, used, maxSpan)

  if (format === 'same-different') {
    const isSame = rng.chance(0.5)
    const base = isSame ? ref : mirrorH(ref)
    const candidate = rotateBy(base, quarterTurns(rng.pick(angles)))
    const item: Item = {
      ref,
      candidates: [candidate],
      answer: isSame ? 'SAME' : 'MIRROR',
    }
    verifySameDifferent(item)
    return item
  }

  const matchAngles = rng.sample(angles, Math.min(2, angles.length))
  while (matchAngles.length < 2) {
    matchAngles.push(rng.pick(angles))
  }
  const matches = matchAngles.map((a) => rotateBy(ref, quarterTurns(a)))

  // Mirror decoys only — different-shape foils made the task too easy.
  const foilAngles = rng.sample(angles, Math.min(2, angles.length))
  while (foilAngles.length < 2) {
    foilAngles.push(rng.pick(angles))
  }
  const foils = foilAngles.map((a) => rotateBy(mirrorH(ref), quarterTurns(a)))

  const candidates = rng.shuffle([...matches, ...foils])
  const correctIndices = candidates
    .map((cand, i) => (isRotationOf(ref, cand) ? i : -1))
    .filter((i) => i >= 0)

  const item: Item = { ref, candidates, correctIndices }
  verifyPickMatches(item)
  return item
}

export function buildItemForDifficulty(
  format: Format,
  difficulty: Difficulty,
  rng: StudioRng,
  usedIdentities?: Set<string>,
  maxSpan?: number,
): Item {
  return buildItem(
    pickCellCount(difficulty, rng),
    format,
    ANGLES[difficulty],
    rng,
    usedIdentities,
    maxSpan,
  )
}

export { identityKey }
