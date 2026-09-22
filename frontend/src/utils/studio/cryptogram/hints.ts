import { letterCount } from './content'

/**
 * Never fill in so much that the puzzle solves itself. Both caps are needed:
 * the share caps a saying where one letter carries most of the text, and the
 * floor on unrevealed letters caps a short saying that only uses six.
 */
const MAX_REVEALED_SHARE = 0.4
const MIN_UNREVEALED_LETTERS = 5

/**
 * Which letters are printed in before the solver starts.
 *
 * Whole letters, never single slots: revealing one E and hiding the next four
 * would contradict the rule the page states, and a solver who noticed would be
 * right to think the puzzle was broken.
 *
 * Most frequent first, because that is where a starter buys the most — the
 * five E's it opens are five places to read the words around them. Ties break
 * alphabetically so the same saying always gets the same starters, whatever
 * order the letters happened to appear in.
 */
export function pickStarterLetters(plain: string, want: number): Set<string> {
  const chosen = new Set<string>()
  if (want <= 0) return chosen

  const total = letterCount(plain)
  if (total === 0) return chosen

  const frequency = new Map<string, number>()
  for (const ch of plain) {
    if (ch === ' ') continue
    frequency.set(ch, (frequency.get(ch) ?? 0) + 1)
  }

  const ranked = [...frequency.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )
  const slotBudget = Math.floor(total * MAX_REVEALED_SHARE)
  const letterBudget = ranked.length - MIN_UNREVEALED_LETTERS

  let revealed = 0
  for (const [letter, count] of ranked) {
    if (chosen.size >= want) break
    if (chosen.size >= letterBudget) break
    if (revealed + count > slotBudget) continue
    chosen.add(letter)
    revealed += count
  }
  return chosen
}

/** Slots a starter set fills — what the preflight checks the caps against. */
export function revealedSlotCount(plain: string, starters: ReadonlySet<string>): number {
  let count = 0
  for (const ch of plain) {
    if (ch !== ' ' && starters.has(ch)) count++
  }
  return count
}
