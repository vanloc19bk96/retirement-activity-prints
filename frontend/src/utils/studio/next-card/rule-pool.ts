/**
 * Next Card rule pool R1–R7 (§6.5).
 *
 * Each entry is a pure step: given the current card and the step index, produce
 * the next. R7 (interleaved lanes) is handled separately because it needs two
 * independent starts rather than a single step function.
 */

import { sameCard, type Card, type Rank, type Suit } from '../_shared/playing-card'

export type RankStep = (rank: Rank, stepIndex: number) => Rank
export type SuitStep = (suit: Suit, stepIndex: number) => Suit

export interface RuleInstance {
  id: string
  label: string
  nextRank: RankStep
  nextSuit: SuitStep
}

export interface InterleaveParams {
  kEven: number
  kOdd: number
}

function asRank(n: number): Rank {
  return ((((n - 1) % 13) + 13) % 13) + 1 as Rank
}

export function addRank(rank: Rank, delta: number): Rank {
  return asRank(rank + delta)
}

function mirrorRank(rank: Rank): Rank {
  return (14 - rank) as Rank
}

/** ♠↔♥ and ♣↔♦ — colour groups ♠♣ / ♥♦ from the spec. */
function flipColour(suit: Suit): Suit {
  if (suit === 0) return 1
  if (suit === 1) return 0
  if (suit === 2) return 3
  return 2
}

export function stepCard(rule: RuleInstance, card: Card, stepIndex: number): Card {
  return {
    rank: rule.nextRank(card.rank, stepIndex),
    suit: rule.nextSuit(card.suit, stepIndex),
  }
}

export function extendFrom(start: Card, rule: RuleInstance, length: number): Card[] {
  const out: Card[] = [start]
  for (let i = 0; i < length - 1; i++) out.push(stepCard(rule, out[i], i))
  return out
}

export function extendInterleave(
  first: Card,
  second: Card,
  params: InterleaveParams,
  length: number,
): Card[] {
  const out: Card[] = new Array(length)
  let even = first
  for (let i = 0; i < length; i += 2) {
    if (i > 0) even = { rank: addRank(even.rank, params.kEven), suit: even.suit }
    out[i] = even
  }
  let odd = second
  for (let i = 1; i < length; i += 2) {
    if (i > 1) odd = { rank: addRank(odd.rank, params.kOdd), suit: odd.suit }
    out[i] = odd
  }
  return out
}

export function matchesInterleave(prefix: readonly Card[], params: InterleaveParams): boolean {
  if (prefix.length < 2) return false
  const rebuilt = extendInterleave(prefix[0], prefix[1], params, prefix.length)
  return rebuilt.every((card, i) => sameCard(card, prefix[i]))
}

export function predictInterleave(
  prefix: readonly Card[],
  params: InterleaveParams,
  answerCount: number,
): Card[] {
  return extendInterleave(
    prefix[0],
    prefix[1],
    params,
    prefix.length + answerCount,
  ).slice(prefix.length)
}

export function matchesRule(prefix: readonly Card[], rule: RuleInstance): boolean {
  if (prefix.length < 2) return false
  let current = prefix[0]
  for (let i = 0; i < prefix.length - 1; i++) {
    current = stepCard(rule, current, i)
    if (!sameCard(current, prefix[i + 1])) return false
  }
  return true
}

export function predictRule(
  prefix: readonly Card[],
  rule: RuleInstance,
  answerCount: number,
): Card[] {
  const answer: Card[] = []
  let current = prefix[prefix.length - 1]
  for (let i = 0; i < answerCount; i++) {
    current = stepCard(rule, current, prefix.length - 1 + i)
    answer.push(current)
  }
  return answer
}

/** R1–R6 instances. ~25 param combos ≈ 2^4.6, matching the §6.5 estimate. */
export function baseRulePool(): RuleInstance[] {
  const rules: RuleInstance[] = []

  for (let k = 1; k <= 4; k++) {
    rules.push({
      id: 'R1',
      label: `R1:k=${k}`,
      nextRank: (rank) => addRank(rank, k),
      nextSuit: (suit) => suit,
    })
  }

  for (const delta of [1, 2, 3] as const) {
    rules.push({
      id: 'R2',
      label: `R2:d=${delta}`,
      nextRank: (rank) => rank,
      nextSuit: (suit) => ((suit + delta) % 4) as Suit,
    })
  }

  for (let k = 1; k <= 4; k++) {
    for (const delta of [1, 2, 3] as const) {
      rules.push({
        id: 'R3',
        label: `R3:k=${k},d=${delta}`,
        nextRank: (rank) => addRank(rank, k),
        nextSuit: (suit) => ((suit + delta) % 4) as Suit,
      })
    }
  }

  for (let k = 1; k <= 4; k++) {
    rules.push({
      id: 'R4',
      label: `R4:k=${k}`,
      nextRank: (rank) => addRank(rank, k),
      nextSuit: (suit) => flipColour(suit),
    })
  }

  rules.push({
    id: 'R5',
    label: 'R5:mirror',
    nextRank: (rank) => mirrorRank(rank),
    nextSuit: (suit) => suit,
  })

  rules.push({
    id: 'R6',
    label: 'R6:inc',
    nextRank: (rank, stepIndex) => addRank(rank, stepIndex + 1),
    nextSuit: (suit) => suit,
  })

  return rules
}

/** R7 param grid — Hard only. */
export function interleaveParamPool(): InterleaveParams[] {
  const out: InterleaveParams[] = []
  for (let kEven = 1; kEven <= 4; kEven++) {
    for (let kOdd = 1; kOdd <= 4; kOdd++) out.push({ kEven, kOdd })
  }
  return out
}
