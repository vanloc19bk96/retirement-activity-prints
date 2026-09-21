import type { PhrasingPool } from '@/utils/studio/_shared/uniqueness/phrasing'

/**
 * Next Card instruction variants (§4.7).
 *
 * Modes match `answerStyle`. Vocabulary stays free of gambling framing (§2.4)
 * and deck brand names (§2.3) — the pack lint (§9.7) enforces both.
 */
export const NEXT_CARD_INSTRUCTIONS: PhrasingPool = {
  draw: [
    'Each row follows a hidden rule. Draw the card that comes next in the blank.',
    'Work out the pattern in each sequence, then draw the next card.',
    'Find the rule that links the cards, and draw what follows in the outline.',
    'Every run of cards has a pattern. Draw the card that continues it.',
    'Study each sequence. Draw the next card in the empty outline.',
    'The cards in each row follow a rule. Draw the one that comes next.',
    'Spot the pattern along the row, then draw the missing next card.',
    'Decide what the rule is, and draw the card that should follow.',
    'Each sequence is building toward a next card. Draw it in the blank.',
    'Read the run left to right, find the rule, and draw what comes next.',
  ],
  write: [
    'Each row follows a hidden rule. Write the rank and suit of the next card.',
    'Work out the pattern, then write the next card on the line.',
    'Find the rule that links the cards, and write what follows.',
    'Every run of cards has a pattern. Write the card that continues it.',
    'Study each sequence. Write the next card on the ruled line.',
    'The cards in each row follow a rule. Write the one that comes next.',
    'Spot the pattern along the row, then write the missing next card.',
    'Decide what the rule is, and write the card that should follow.',
    'Each sequence points to a next card. Name it on the line.',
    'Read the run left to right, find the rule, and write what comes next.',
  ],
  multipleChoice: [
    'Each row follows a hidden rule. Circle the card that comes next.',
    'Work out the pattern in each sequence, then circle the right choice.',
    'Find the rule that links the cards, and circle what follows.',
    'Every run of cards has a pattern. Circle the card that continues it.',
    'Study each sequence. Circle the choice that belongs next.',
    'The cards in each row follow a rule. Circle the one that comes next.',
    'Spot the pattern along the row, then circle the matching next card.',
    'Decide what the rule is, and circle the card that should follow.',
    'Each sequence has one correct next card among the choices. Circle it.',
    'Read the run left to right, find the rule, and circle what comes next.',
  ],
}

/** Short labels above a multiple-choice strip. */
export const NEXT_CARD_CHOICE_LABELS: readonly string[] = [
  'Next',
  'Which follows?',
  'Choose one',
  'The next card',
  'Pick the next',
  'What comes next?',
  'Circle one',
  'Your choice',
  'Continue with',
  'Select the next',
]
