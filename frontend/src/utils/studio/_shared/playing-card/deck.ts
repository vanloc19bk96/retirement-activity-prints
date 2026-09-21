/**
 * Deck operations. Every draw is seeded — nothing here reaches for Math.random.
 *
 * The 52-card deck is the entropy source the whole pack is built on
 * (§4.5): C(52,12) alone is ~2^38, which is what lets the memory templates
 * clear the uniqueness floor on a single figure per page.
 */

import type { StudioRng } from '../../studio-rng'
import {
  RANKS,
  SUITS,
  cardIndex,
  isCourtRank,
  type Card,
  type Rank,
  type Suit,
} from './types'

export const DECK_SIZE = 52

/** The 52 cards in canonical order (A♠ A♥ A♦ A♣ 2♠ …). No jokers, ever (§2.3). */
export function standardDeck(): Card[] {
  const deck: Card[] = []
  for (const rank of RANKS) {
    for (const suit of SUITS) deck.push({ rank, suit })
  }
  return deck
}

/** All 13 cards of one suit, in rank order. */
export function suitRun(suit: Suit): Card[] {
  return RANKS.map((rank) => ({ rank, suit }))
}

/** Every combination of the given ranks and suits, rank-major. */
export function rankSuitSet(ranks: readonly Rank[], suits: readonly Suit[] = SUITS): Card[] {
  const out: Card[] = []
  for (const rank of ranks) {
    for (const suit of suits) out.push({ rank, suit })
  }
  return out
}

export function shuffleDeck(rng: StudioRng, deck: readonly Card[] = standardDeck()): Card[] {
  return rng.shuffle(deck)
}

/** Draw `n` distinct cards from a full deck. */
export function deal(rng: StudioRng, n: number, from: readonly Card[] = standardDeck()): Card[] {
  if (n > from.length) {
    throw new Error(`deal: asked for ${n} cards from a pool of ${from.length}`)
  }
  return rng.sample(from, n)
}

/**
 * `k` distinct ranks from the 13, returned in ascending order.
 *
 * Sorted because the *set* is the puzzle input; leaving it in draw order would
 * make two identical puzzles serialise differently and defeat the canonical
 * hash (§4.2).
 */
export function rankSubset(rng: StudioRng, k: number): Rank[] {
  if (k > RANKS.length) throw new Error(`rankSubset: asked for ${k} of 13 ranks`)
  return rng.sample(RANKS, k).sort((a, b) => a - b)
}

/** `k` distinct suits, in canonical suit order. */
export function suitSubset(rng: StudioRng, k: number): Suit[] {
  if (k > SUITS.length) throw new Error(`suitSubset: asked for ${k} of 4 suits`)
  return rng.sample(SUITS, k).sort((a, b) => a - b)
}

/** Deck order, ascending by card index — the canonical ordering for a set. */
export function sortCards(cards: readonly Card[]): Card[] {
  return [...cards].sort((a, b) => cardIndex(a) - cardIndex(b))
}

export function cardsEqualAsSets(a: readonly Card[], b: readonly Card[]): boolean {
  if (a.length !== b.length) return false
  const left = sortCards(a).map(cardIndex)
  const right = sortCards(b).map(cardIndex)
  return left.every((value, i) => value === right[i])
}

/** Set difference in canonical order. */
export function cardsMissingFrom(full: readonly Card[], shown: readonly Card[]): Card[] {
  const seen = new Set(shown.map(cardIndex))
  return sortCards(full.filter((card) => !seen.has(cardIndex(card))))
}

/**
 * Near-miss decoys for recognition memory (§6.2 mode A).
 *
 * Random decoys are rejected by a reader who only half-remembers the spread,
 * which turns a memory test into a shape-matching test. The mix is
 * 50% same-rank / 30% rank±1 same-suit / 20% unrelated, and every decoy is
 * checked against the studied set so a "decoy" is never a card that was shown.
 */
export function buildDecoys(
  rng: StudioRng,
  studied: readonly Card[],
  count: number,
): Card[] {
  const excluded = new Set(studied.map(cardIndex))
  const picked: Card[] = []

  const take = (card: Card | null): boolean => {
    if (!card) return false
    const index = cardIndex(card)
    if (excluded.has(index)) return false
    excluded.add(index)
    picked.push(card)
    return true
  }

  const sameRank = (): Card | null => {
    const source = rng.pick(studied)
    const options = SUITS.filter((suit) => !excluded.has(cardIndex({ rank: source.rank, suit })))
    if (options.length === 0) return null
    return { rank: source.rank, suit: rng.pick(options) }
  }

  const nearRank = (): Card | null => {
    const source = rng.pick(studied)
    const deltas = rng.shuffle([-1, 1])
    for (const delta of deltas) {
      // Ranks wrap so K±1 still has two neighbours; A and K are adjacent in the
      // reader's mind on a sorted run, which is exactly the confusion we test.
      const rank = (((source.rank - 1 + delta + 13) % 13) + 1) as Rank
      const candidate = { rank, suit: source.suit }
      if (!excluded.has(cardIndex(candidate))) return candidate
    }
    return null
  }

  const unrelated = (): Card | null => {
    const options = standardDeck().filter((card) => !excluded.has(cardIndex(card)))
    return options.length > 0 ? rng.pick(options) : null
  }

  const wanted = Math.max(0, Math.min(count, DECK_SIZE - studied.length))
  // Guard against a pathological run of rejections; `unrelated` always
  // terminates while any card is left, so the loop cannot spin forever.
  let guard = wanted * 12 + 24
  while (picked.length < wanted && guard-- > 0) {
    const roll = rng.next()
    const attempt = roll < 0.5 ? sameRank() : roll < 0.8 ? nearRank() : unrelated()
    if (!take(attempt)) take(unrelated())
  }
  return picked
}

/** Ranks present in a set of cards, ascending. */
export function ranksOf(cards: readonly Card[]): Rank[] {
  return [...new Set(cards.map((card) => card.rank))].sort((a, b) => a - b)
}

/** True when the set contains a Jack, Queen or King. */
export function hasCourtCard(cards: readonly Card[]): boolean {
  return cards.some((card) => isCourtRank(card.rank))
}
