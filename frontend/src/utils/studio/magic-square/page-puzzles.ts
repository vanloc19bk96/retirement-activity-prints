import { createRng, deriveSeed } from '../studio-rng'
import {
  rememberStudioContent,
  studioAvoidList,
  studioVarietyKey,
} from '../studio-variety'
import type { MagicDifficulty, MagicNumberSet, MagicOrder, MagicPuzzle } from './types'
import { rollMapping } from './values'
import { buildMagicPuzzle, gridVarietyLabel } from './puzzle'

const MAPPING_VARIETY_ATTEMPTS = 12

function parseAvoidConstants(labels: readonly string[]): number[] {
  const out: number[] = []
  for (const label of labels) {
    const n = Number(label)
    if (Number.isFinite(n) && n > 0) out.push(n)
  }
  return out
}

/**
 * Build the page's squares, preferring line totals / products and grids that
 * this seller has not printed recently (bulk + multi-sitting KDP books).
 */
export function buildVariedPagePuzzles(options: {
  order: MagicOrder
  difficulty: MagicDifficulty
  numberSet: MagicNumberSet
  hideConstant: boolean
  perPage: number
  seed: number
  ownerKey: string
}): MagicPuzzle[] {
  const { order, difficulty, numberSet, hideConstant, perPage, seed, ownerKey } = options
  const constKey = studioVarietyKey('magic-square', numberSet, ownerKey)
  const gridKey = studioVarietyKey('magic-square', numberSet, ownerKey, 'grid')
  const avoidConstants = parseAvoidConstants(studioAvoidList(constKey))
  const avoidConstantSet = new Set(avoidConstants)
  const seen = new Set(studioAvoidList(gridKey))

  let mapping = rollMapping(
    order,
    numberSet,
    createRng(deriveSeed(seed, `magic:bank:${ownerKey}`)),
    { avoidConstantsNewestFirst: avoidConstants },
  )
  let puzzles: MagicPuzzle[] = []

  for (let attempt = 0; attempt < MAPPING_VARIETY_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      mapping = rollMapping(
        order,
        numberSet,
        createRng(deriveSeed(seed, `magic:bank:${ownerKey}:${attempt}`)),
        { avoidConstantsNewestFirst: avoidConstants },
      )
    }
    const pageSeen = new Set(seen)
    puzzles = []
    for (let s = 0; s < perPage; s++) {
      const puzzle = buildMagicPuzzle(
        { order, difficulty, mapping, hideConstant, avoid: pageSeen },
        createRng(deriveSeed(seed, `magic:${ownerKey}:${attempt}:${s}`)),
      )
      pageSeen.add(gridVarietyLabel(puzzle.grid))
      puzzles.push(puzzle)
    }
    const constant = puzzles[0]!.constant
    if (!avoidConstantSet.has(constant) || numberSet === 'multiply') break
  }

  rememberStudioContent(
    constKey,
    puzzles.map((puzzle) => String(puzzle.constant)),
  )
  rememberStudioContent(
    gridKey,
    puzzles.map((puzzle) => gridVarietyLabel(puzzle.grid)),
  )
  return puzzles
}
