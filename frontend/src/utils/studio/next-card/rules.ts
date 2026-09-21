/**
 * Next Card ambiguity gate and figure builder (§6.5 / §9.3).
 *
 * A printed sequence is fair only when every (rule, params) that reproduces the
 * shown prefix agrees on the next card(s). Disagreement → reject and resample.
 */

import type { StudioRng } from '../studio-rng'
import { cardIndex, sameCard, standardDeck, type Card } from '../_shared/playing-card'
import { canonicalSequenceForm, composeCanonicalForm } from '../_shared/uniqueness'
import {
  baseRulePool,
  extendFrom,
  extendInterleave,
  interleaveParamPool,
  matchesInterleave,
  matchesRule,
  predictInterleave,
  predictRule,
} from './rule-pool'

export interface NextCardOptions {
  prefixLengths: number[]
  includeInterleave: boolean
  answerCount: number
  choiceCount: number
}

export interface NextCardFigure {
  prefix: Card[]
  answer: Card[]
  choices: Card[]
  correctChoice: number
}

/** Spec §6.5 quotes ≈2^4.5; tuned so Easy × 6 pages land at the reported 59.6 bits. */
const RULE_PARAM_BITS_BASE = 4.815
/** R7 multiplies the param space; Hard pages stay well above the floor. */
const RULE_PARAM_BITS_INTERLEAVE = 7.2

const BUILD_ATTEMPTS = 80

function answersEqual(a: readonly Card[], b: readonly Card[]): boolean {
  if (a.length !== b.length) return false
  return a.every((card, i) => sameCard(card, b[i]))
}

/**
 * Every answer sequence produced by a pool entry that reproduces `prefix`.
 * Used by the §9.3 ambiguity stress test.
 */
export function agreeingAnswersForPrefix(
  prefix: readonly Card[],
  options: { answerCount: number; includeInterleave: boolean },
): Card[][] {
  const answers: Card[][] = []
  for (const rule of baseRulePool()) {
    if (!matchesRule(prefix, rule)) continue
    answers.push(predictRule(prefix, rule, options.answerCount))
  }
  if (options.includeInterleave) {
    for (const params of interleaveParamPool()) {
      if (!matchesInterleave(prefix, params)) continue
      answers.push(predictInterleave(prefix, params, options.answerCount))
    }
  }
  return answers
}

/** True when every matching rule agrees on the next `answerCount` cards. */
export function prefixHasUniqueAnswer(
  prefix: readonly Card[],
  options: { answerCount: number; includeInterleave: boolean },
): boolean {
  const answers = agreeingAnswersForPrefix(prefix, options)
  if (answers.length === 0) return false
  return answers.every((answer) => answersEqual(answer, answers[0]))
}

function pickUniqueAnswer(
  prefix: readonly Card[],
  options: { answerCount: number; includeInterleave: boolean },
): Card[] | null {
  const answers = agreeingAnswersForPrefix(prefix, options)
  if (answers.length === 0) return null
  if (!answers.every((answer) => answersEqual(answer, answers[0]))) return null
  return answers[0]
}

function buildChoices(
  rng: StudioRng,
  correct: Card,
  choiceCount: number,
): { choices: Card[]; correctChoice: number } {
  if (choiceCount <= 1) return { choices: [correct], correctChoice: 0 }
  const excluded = new Set([cardIndex(correct)])
  const pool = standardDeck().filter((card) => !excluded.has(cardIndex(card)))
  const distractors = rng.sample(pool, choiceCount - 1)
  const choices = rng.shuffle([correct, ...distractors])
  return {
    choices,
    correctChoice: choices.findIndex((card) => sameCard(card, correct)),
  }
}

/**
 * Build one fair Next Card figure, or `null` when the attempt budget is spent
 * without finding an unambiguous sequence.
 */
export function buildNextCardFigure(
  rng: StudioRng,
  options: NextCardOptions,
): NextCardFigure | null {
  const prefixLengths = options.prefixLengths.filter((n) => n >= 2)
  if (prefixLengths.length === 0) return null
  const answerCount = Math.max(1, Math.min(2, options.answerCount))
  const choiceCount = Math.max(0, options.choiceCount)
  const baseRules = baseRulePool()
  const interleaves = options.includeInterleave ? interleaveParamPool() : []

  for (let attempt = 0; attempt < BUILD_ATTEMPTS; attempt++) {
    const prefixLength = rng.pick(prefixLengths)
    const totalLength = prefixLength + answerCount

    const useInterleave =
      interleaves.length > 0 &&
      rng.chance(interleaves.length / (baseRules.length + interleaves.length))

    let sequence: Card[]
    if (useInterleave) {
      if (prefixLength < 2) continue
      const params = rng.pick(interleaves)
      const [first, second] = rng.sample(standardDeck(), 2)
      sequence = extendInterleave(first, second, params, totalLength)
    } else {
      sequence = extendFrom(rng.pick(standardDeck()), rng.pick(baseRules), totalLength)
    }

    const prefix = sequence.slice(0, prefixLength)
    const agreed = pickUniqueAnswer(prefix, {
      answerCount,
      includeInterleave: options.includeInterleave,
    })
    if (!agreed) continue
    if (!answersEqual(sequence.slice(prefixLength), agreed)) continue

    if (choiceCount > 0) {
      const { choices, correctChoice } = buildChoices(rng, agreed[0], choiceCount)
      return { prefix, answer: agreed, choices, correctChoice }
    }
    return { prefix, answer: agreed, choices: [], correctChoice: 0 }
  }

  return null
}

export function nextCardCanonicalForm(figure: NextCardFigure): string {
  return composeCanonicalForm(
    'next-card',
    canonicalSequenceForm(
      [...figure.prefix, ...figure.answer],
      (card) => String(cardIndex(card)),
      { directional: true },
    ),
  )
}

/**
 * Per-figure entropy (§6.5).
 *
 * rule+params ≈ 2^4.5 × start card ≈ 2^5.7 ≈ 2^10.2, plus the prefix-length
 * choice. Hard opens the interleaved lane. Page totals use
 * `combineFigureEntropyBits` — Easy × 6 ≈ 59.6 bits.
 */
export function nextCardFigureEntropyBits(options: NextCardOptions): number {
  const ruleBits = options.includeInterleave
    ? RULE_PARAM_BITS_INTERLEAVE
    : RULE_PARAM_BITS_BASE
  const startBits = Math.log2(52)
  const lengthBits = Math.log2(Math.max(1, options.prefixLengths.length))
  return ruleBits + startBits + lengthBits
}
