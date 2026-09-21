/**
 * Card Memory Spread construction (§6.2).
 *
 * A spread to study, then blank write-in slots: name each card as rank + suit
 * (e.g. A♠) — no redrawing.
 */

import type { StudioRng } from '../studio-rng'
import { cardIndex, deal, type Card } from '../_shared/playing-card'
import {
  canonicalSequenceForm,
  composeCanonicalForm,
  log2Choose,
  log2Factorial,
} from '../_shared/uniqueness'

export interface CardMemoryFigure {
  /** The spread on the study page, in printed order. */
  studied: Card[]
}

export interface CardMemoryOptions {
  studiedCount: number
}

export function buildCardMemoryFigure(
  rng: StudioRng,
  options: CardMemoryOptions,
): CardMemoryFigure {
  return { studied: deal(rng, options.studiedCount) }
}

const cardToken = (card: Card): string => String(cardIndex(card)).padStart(2, '0')

/**
 * Canonical form (§4.2).
 *
 * The study spread is a grid, so reading it back to front is the same page;
 * `canonicalSequenceForm` collapses that.
 */
export function cardMemoryCanonicalForm(figure: CardMemoryFigure): string {
  const study = canonicalSequenceForm(figure.studied, cardToken)
  return composeCanonicalForm('card-memory', study)
}

/** Analytic entropy of one figure, in bits (§4.5). */
export function cardMemoryFigureEntropyBits(options: CardMemoryOptions): number {
  const { studiedCount } = options
  // Which cards, and where they sit in the printed grid.
  return log2Choose(52, studiedCount) + log2Factorial(studiedCount)
}
