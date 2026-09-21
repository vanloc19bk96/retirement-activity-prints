import type { TriviaItem } from '@/types/studio-decade-trivia.types'

const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const

/** Multiple-choice → option letter; otherwise the answer text. */
export function answerLabel(item: TriviaItem): string {
  if (item.format === 'multiple-choice' && item.options?.length) {
    const index = item.options.findIndex(
      (opt) => opt.trim().toLowerCase() === item.answer.trim().toLowerCase(),
    )
    if (index >= 0 && index < OPTION_LETTERS.length) {
      return OPTION_LETTERS[index]!
    }
  }
  return item.answer.trim()
}

/** Printed option marker on the sheet — `A`, `B`, … (no parenthesis; ring circles the letter). */
export function optionLetter(index: number): string {
  const letter = OPTION_LETTERS[index]
  return letter ?? String(index + 1)
}
