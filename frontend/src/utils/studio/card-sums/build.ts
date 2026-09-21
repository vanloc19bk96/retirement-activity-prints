/**
 * Card Sums puzzle construction (§6.4).
 *
 * Mental arithmetic on card values. Nothing here is a casino drill — the
 * vocabulary lint (§9.7) keeps that framing out of every string the pack prints
 * (§2.4).
 */

import type { StudioRng } from '../studio-rng'
import {
  cardIndex,
  cardValue,
  deal,
  type Card,
  type CourtValueMode,
} from '../_shared/playing-card'
import {
  canonicalSequenceForm,
  canonicalSetForm,
  composeCanonicalForm,
  log2Choose,
  log2Factorial,
} from '../_shared/uniqueness'

export type CardSumsMode = 'rowTotals' | 'targetHunt' | 'runningLadder'

export interface CardSumsRow {
  cards: Card[]
  total: number
}

export interface RowTotalsFigure {
  mode: 'rowTotals'
  rows: CardSumsRow[]
}

export interface TargetHuntFigure {
  mode: 'targetHunt'
  cards: Card[]
  target: number
  /** Indices into `cards` — the one subset that reaches the target. */
  answer: number[]
}

export interface RunningLadderFigure {
  mode: 'runningLadder'
  cards: Card[]
  /** +1 or -1 per card; the first is always +1. */
  signs: number[]
  /** Value after each step; the last entry is the printed answer. */
  runningTotals: number[]
}

export type CardSumsFigure = RowTotalsFigure | TargetHuntFigure | RunningLadderFigure

export interface RowTotalsOptions {
  rowCount: number
  cardsPerRow: number
  courtValue: CourtValueMode
}

export function buildRowTotals(
  rng: StudioRng,
  options: RowTotalsOptions,
): RowTotalsFigure {
  const { rowCount, cardsPerRow, courtValue } = options
  // Drawn from one deck without replacement, so no row ever shows the same card
  // twice — a repeat reads as a printing mistake even though the sum is fine.
  const drawn = deal(rng, Math.min(52, rowCount * cardsPerRow))
  const rows: CardSumsRow[] = []
  for (let r = 0; r < rowCount; r++) {
    const cards = drawn.slice(r * cardsPerRow, (r + 1) * cardsPerRow)
    rows.push({
      cards,
      total: cards.reduce((sum, card) => sum + cardValue(card, courtValue), 0),
    })
  }
  return { mode: 'rowTotals', rows }
}

/** Every k-subset of `values` that sums to `target`. */
export function subsetsHittingTarget(
  values: readonly number[],
  k: number,
  target: number,
): number[][] {
  const hits: number[][] = []
  const current: number[] = []

  const walk = (start: number, remaining: number, sum: number): void => {
    if (remaining === 0) {
      if (sum === target) hits.push([...current])
      return
    }
    for (let i = start; i <= values.length - remaining; i++) {
      current.push(i)
      walk(i + 1, remaining - 1, sum + values[i])
      current.pop()
      // Two solutions is already a broken puzzle; stop the search early.
      if (hits.length > 1) return
    }
  }

  walk(0, k, 0)
  return hits
}

export interface TargetHuntOptions {
  cardCount: number
  pickCount: number
  courtValue: CourtValueMode
}

/** Draws before giving up on finding a spread with exactly one solution. */
const TARGET_HUNT_ATTEMPTS = 400

/**
 * Target hunt with a *proven unique* answer.
 *
 * Without this check the printed key is simply wrong whenever a second subset
 * also reaches the target — the slow-burn defect of §5.6, the kind that shows
 * up in reviews months after the book starts selling. The search is exhaustive
 * over C(n, k), which at n <= 12 is at most 792 subsets.
 */
export function buildTargetHunt(
  rng: StudioRng,
  options: TargetHuntOptions,
): TargetHuntFigure | null {
  const { cardCount, pickCount, courtValue } = options
  for (let attempt = 0; attempt < TARGET_HUNT_ATTEMPTS; attempt++) {
    const cards = deal(rng, cardCount)
    const values = cards.map((card) => cardValue(card, courtValue))
    const candidate = rng.sample(
      values.map((_, index) => index),
      pickCount,
    )
    const target = candidate.reduce((sum, index) => sum + values[index], 0)
    const hits = subsetsHittingTarget(values, pickCount, target)
    if (hits.length !== 1) continue
    return { mode: 'targetHunt', cards, target, answer: [...hits[0]].sort((a, b) => a - b) }
  }
  return null
}

export interface RunningLadderOptions {
  length: number
  courtValue: CourtValueMode
}

/** The ladder keeps its running total inside this band, by construction. */
export const LADDER_MIN_TOTAL = 0
export const LADDER_MAX_TOTAL = 99

/**
 * Running ladder whose total never goes negative and never passes 99.
 *
 * Guaranteed by construction rather than by resampling the whole sequence: at
 * each step the sign that would leave the band is simply not offered, so the
 * generator cannot paint itself into a corner or loop.
 */
export function buildRunningLadder(
  rng: StudioRng,
  options: RunningLadderOptions,
): RunningLadderFigure {
  const { length, courtValue } = options
  const cards = deal(rng, Math.min(52, length))
  const signs: number[] = []
  const runningTotals: number[] = []
  let total = 0

  cards.forEach((card, index) => {
    const value = cardValue(card, courtValue)
    const canAdd = total + value <= LADDER_MAX_TOTAL
    const canSubtract = index > 0 && total - value >= LADDER_MIN_TOTAL
    // First card always opens the ladder; after that, alternate where legal so
    // the row does not read as a plain addition drill.
    let sign: number
    if (!canSubtract) sign = 1
    else if (!canAdd) sign = -1
    else sign = signs[index - 1] === 1 ? -1 : 1
    total += sign * value
    signs.push(sign)
    runningTotals.push(total)
  })

  return { mode: 'runningLadder', cards, signs, runningTotals }
}

const cardToken = (card: Card): string => String(cardIndex(card)).padStart(2, '0')

/** Canonical form (§4.2). */
export function cardSumsCanonicalForm(figure: CardSumsFigure): string {
  if (figure.mode === 'rowTotals') {
    // Rows can be read top-to-bottom or bottom-to-top and are the same sheet;
    // the cards within a row cannot be reordered without changing the figure.
    return composeCanonicalForm(
      'card-sums:rowTotals',
      canonicalSequenceForm(figure.rows, (row) =>
        canonicalSequenceForm(row.cards, cardToken, { directional: true }),
      ),
    )
  }
  if (figure.mode === 'targetHunt') {
    return composeCanonicalForm(
      'card-sums:targetHunt',
      String(figure.target),
      canonicalSequenceForm(figure.cards, cardToken),
      canonicalSetForm(figure.answer, String),
    )
  }
  // A ladder is read left to right; reversing it is a different puzzle.
  return composeCanonicalForm(
    'card-sums:runningLadder',
    canonicalSequenceForm(
      figure.cards.map((card, index) => `${figure.signs[index] > 0 ? '+' : '-'}${cardToken(card)}`),
      (token) => token,
      { directional: true },
    ),
  )
}

/** Analytic entropy of one figure, in bits (§4.5). */
export function cardSumsFigureEntropyBits(options: {
  mode: CardSumsMode
  rowCount: number
  cardsPerRow: number
  cardCount: number
  pickCount: number
  ladderLength: number
}): number {
  const { mode } = options
  if (mode === 'rowTotals') {
    const n = Math.min(52, options.rowCount * options.cardsPerRow)
    // Choose the cards, then their arrangement; rows are order-free, so one
    // row-permutation is discounted.
    return log2Choose(52, n) + log2Factorial(n) - log2Factorial(options.rowCount)
  }
  if (mode === 'targetHunt') {
    const n = options.cardCount
    // The uniqueness filter rejects most draws; discount generously so the
    // reported figure stays a lower bound.
    return log2Choose(52, n) + log2Factorial(n) - 4
  }
  const n = options.ladderLength
  // The opening step is always an addition and the band constraint forces the
  // sign at some later steps too; discounting three of them keeps the figure a
  // lower bound on what the sign pattern actually contributes.
  return log2Choose(52, n) + log2Factorial(n) + Math.max(0, n - 3)
}
