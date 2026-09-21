import { createRng, deriveSeed } from '../studio-rng'
import { hashStudioFingerprint } from '../studio-content-fingerprint'
import { rememberStudioContent, studioAvoidList, studioVarietyKey } from '../studio-variety'
import { boardSignature, buildBoard } from './board'
import { buildOptions } from './distractors'
import { planLabel, type Difficulty, type MatrixItem } from './types'

/**
 * Keeping a shelf of books from repeating itself.
 *
 * Three layers stack up, and each one covers a hole the others cannot see:
 *
 * 1. *This page* — no two puzzles on one sheet share a board or a rule plan.
 *    A page that prints the same grid twice looks like a printing fault.
 * 2. *This seller* — grids and plans printed in earlier sittings are avoided
 *    while there is budget to find something else, so a 120-page book does not
 *    open with forty variations of "shape by row, paint by column". This is the
 *    layer the seed alone cannot provide: a fresh seed is happy to re-roll a
 *    plan it has used forty times.
 * 3. *The batch* — whole-page fingerprints, handled upstream in
 *    `claimUniqueStudioOutputs`.
 *
 * Recorded labels are hashes rather than the readable signatures, because the
 * shared history store trims labels to 60 characters and a nine-figure board
 * signature is four times that — every board would have been remembered as the
 * same truncated prefix.
 */

/** Boards and plans a seller has printed lately, newest first. */
function recent(key: string): Set<string> {
  return new Set(studioAvoidList(key))
}

export interface MatrixItemsOptions {
  itemCount: number
  optionCount: number
  difficulty: Difficulty
  seed: number
  /** Per-seller salt, so two sellers running the same job get different boards. */
  ownerKey?: string
  /** False on trims where three shapes in one cell stop being countable. */
  allowTriples?: boolean
  /** False on trims where an inner mark stops being legible. */
  allowMarks?: boolean
}

export function buildMatrixItems(options: MatrixItemsOptions): MatrixItem[] {
  const {
    itemCount,
    optionCount,
    difficulty,
    seed,
    ownerKey = '',
    allowTriples = true,
    allowMarks = true,
  } = options

  const boardKey = studioVarietyKey('matrix-reasoning', difficulty, ownerKey, 'board')
  const planKey = studioVarietyKey('matrix-reasoning', difficulty, ownerKey, 'plan')
  const avoidBoards = recent(boardKey)
  const avoidPlans = recent(planKey)

  const items: MatrixItem[] = []
  const pageBoards: string[] = []
  const pagePlans: string[] = []

  for (let i = 0; i < itemCount; i++) {
    const rng = createRng(deriveSeed(seed, `matrix:${ownerKey}:${i}`))
    const board = buildBoard(
      { difficulty, allowTriples, allowMarks, avoidBoards, avoidPlans },
      rng,
    )

    const signature = boardSignature(board.cells)
    const boardHash = hashStudioFingerprint(signature)
    const planHash = hashStudioFingerprint(planLabel(board.rules))
    avoidBoards.add(boardHash)
    avoidPlans.add(planHash)
    pageBoards.push(boardHash)
    pagePlans.push(planHash)

    const answer = board.cells[8]!
    /**
     * Seeded from the board rather than from the page, so one grid always gets
     * one answer strip. Two pages that happened on the same grid used to differ
     * only in the shuffle of A–F, which read as unique to the batch-level
     * duplicate check and let a repeated matrix through into the book.
     */
    const { options: choices, correctIndex } = buildOptions({
      answer,
      cells: board.cells,
      rules: board.rules,
      optionCount,
      difficulty,
      rng: createRng(
        deriveSeed(0, `matrix-options:${ownerKey}:${difficulty}:${optionCount}:${signature}`),
      ),
    })

    items.push({
      cells: board.cells,
      answer,
      options: choices,
      correctIndex,
      rules: board.rules,
      tier: board.tier,
    })
  }

  rememberStudioContent(boardKey, pageBoards)
  rememberStudioContent(planKey, pagePlans)
  return items
}
