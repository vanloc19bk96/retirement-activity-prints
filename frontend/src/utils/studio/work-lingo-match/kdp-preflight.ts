import { MIN_PAIRS_PER_PAGE, normalizeWlPair, pairsConflict, wlLetter } from './content'
import type { FittedWlPair } from './fit'
import { MAX_MEANING_LINES, MAX_PHRASE_LINES, TEXT_FONT_MIN, type WlPagePlan } from './layout'

export interface KdpPreflightResult {
  ok: boolean
  warnings: string[]
  errors: string[]
}

const joined = (lines: readonly string[]) => lines.join(' ').replace(/\s+/g, ' ')

/**
 * The last gate before a sheet is considered export-ready.
 *
 * Fit is already structural — the plan never lays out a pair that does not
 * fit — so this re-proves it, then checks what a reader only finds with the
 * book in hand: a phrase or meaning set differently from the one written, two
 * pairs a reader could confuse, a letter used twice or skipped, a meaning left
 * under its own phrase's position, too few pairs to be a puzzle, or type that
 * fell below large print.
 *
 * Every one of those is a refund, so none of them may print.
 */
export function runWlKdpPreflight(options: {
  pairs: readonly FittedWlPair[]
  plan: WlPagePlan
}): KdpPreflightResult {
  const { pairs, plan } = options
  const errors: string[] = []
  const warnings: string[] = []

  if (pairs.length === 0) return { ok: false, warnings, errors: ['No workplace phrases were laid out.'] }
  if (pairs.length < MIN_PAIRS_PER_PAGE) errors.push('The page holds too few phrases to be a matching puzzle.')
  if (pairs.length !== plan.count) {
    errors.push('The page holds a different number of phrases than it was laid out for.')
  }

  // The letters are exactly A, B, C… one per pair, and none sits at its own
  // phrase's position — so the answers never simply run down the page.
  const letters = pairs.map((pair) => pair.letter)
  const expected = pairs.map((_, index) => wlLetter(index))
  if ([...letters].sort().join() !== expected.join()) errors.push('The meanings are not lettered one each.')
  if (pairs.length > 1 && letters.some((letter, index) => letter === wlLetter(index))) {
    errors.push('A meaning is lettered in its own phrase’s position.')
  }

  pairs.forEach((pair, index) => {
    // Re-gate the whole pair as the service returned it.
    const again = normalizeWlPair({ ...pair, verified: true })
    if (!again || again.phrase !== pair.phrase || again.meaning !== pair.meaning) {
      errors.push('A pair is not suitable for a published activity book.')
    }
    if (pairs.slice(0, index).some((earlier) => pairsConflict(pair, earlier))) {
      errors.push('Two pairs on this page could be confused with each other.')
    }
    if (
      pair.phraseLines.length === 0 ||
      pair.phraseLines.length > MAX_PHRASE_LINES ||
      pair.keyPhraseLines.length === 0 ||
      pair.keyPhraseLines.length > pair.phraseLines.length
    ) {
      errors.push('A phrase needs more lines than the page allows.')
    }
    if (pair.meaningLines.length === 0 || pair.meaningLines.length > MAX_MEANING_LINES) {
      errors.push('A meaning needs more lines than the page allows.')
    }
    if (pair.keyLines.length === 0 || pair.keyLines.length > MAX_MEANING_LINES) {
      errors.push('A meaning needs more lines than the answer page allows.')
    }
    if (joined(pair.phraseLines) !== pair.phrase || joined(pair.keyPhraseLines) !== pair.phrase) {
      errors.push('A phrase was set differently from the one written.')
    }
    if (joined(pair.meaningLines) !== pair.meaning || joined(pair.keyLines) !== pair.meaning) {
      errors.push('A meaning was set differently from the one written.')
    }
  })

  const total = (pick: (pair: FittedWlPair) => readonly string[]) =>
    pairs.reduce((sum, pair) => sum + pick(pair).length, 0)
  if (total((p) => p.phraseLines) > plan.phraseLines) errors.push('The phrases need more lines than the page reserved.')
  if (total((p) => p.meaningLines) > plan.meaningLines) errors.push('The meanings need more lines than the page reserved.')
  if (total((p) => p.keyLines) > plan.keyLines) errors.push('The answers need more lines than the answer page reserved.')
  if (plan.metrics.font < TEXT_FONT_MIN) errors.push('Phrases and meanings must stay large print.')

  return { ok: errors.length === 0, warnings, errors: [...new Set(errors)] }
}
