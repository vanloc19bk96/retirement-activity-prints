import type { PhrasingPool } from '@/utils/studio/_shared/uniqueness/phrasing'

/**
 * Card Sums instruction variants (§4.7).
 *
 * These pages are mental arithmetic and nothing else. The vocabulary lint
 * (§9.7) keeps casino framing out of every line here (§2.4).
 */
export const CARD_SUMS_INSTRUCTIONS: PhrasingPool = {
  /** Mode A — row totals. */
  rowTotals: [
    'Add up each row of cards and write the total on the line.',
    'Work out what every row comes to, then write it at the end.',
    'Each row has a total. Find it and write it down.',
    'Add the values along each row and put the answer in the box.',
    'Total each row of cards, working from left to right.',
    'What does each row add up to? Write your answers on the lines.',
    'Read along each row, adding as you go, and record the total.',
    'Find the sum of every row and write it beside the cards.',
    'Add the cards in each row together. One total per row.',
    'Go row by row and write down what the cards come to.',
  ],
  /** Mode B — pick the subset that hits the target. */
  targetHunt: [
    'Circle the cards that add up to exactly the target shown.',
    'Find the cards that make the target total, and ring them.',
    'Some of these cards add up to the number below. Circle them.',
    'Which cards reach the target exactly? Draw a circle around each one.',
    'Pick out the cards that total the number shown and circle them.',
    'Hunt for the group of cards that comes to exactly the target.',
    'Ring the cards whose values add up to the target total.',
    'Only one group of cards reaches the target. Circle it.',
    'Find and circle the cards that add up to the number given below.',
    'Look for cards that make the target total exactly, then ring them.',
  ],
  /** Mode C — running ladder with alternating plus and minus. */
  runningLadder: [
    'Start at the first card and follow the signs. Write the final total only.',
    'Work along the row, adding and subtracting as marked. What do you end on?',
    'Keep a running total from left to right and write the last value.',
    'Follow the ladder, taking each sign as it comes, and record where you finish.',
    'Add and subtract your way along the row. Write the number you end with.',
    'Track the total as you move across the cards. Only the final figure is needed.',
    'Begin with the first card and apply each sign in turn. Write the answer at the end.',
    'Move along the row keeping count. What is the total when you reach the last card?',
    'Do this one in your head if you can, and write only the final total.',
    'Carry the running total across the row and write down where it lands.',
  ],
}

/**
 * Plain-language card-value sentence appended to the how-to (§4.7).
 *
 * Printed in the instruction band — not as a separate legend — so seniors
 * read one continuous paragraph. Modes match `courtValue` config.
 */
export const CARD_SUMS_VALUE_HINTS: PhrasingPool = {
  face: [
    'Ace is worth 1, number cards keep their face value, Jack is 11, Queen is 12, and King is 13.',
    'Use Ace as 1, two through ten as written, Jack as 11, Queen as 12, and King as 13.',
    'Card values: Ace equals 1, pip cards equal their number, Jack 11, Queen 12, King 13.',
    'Remember: Ace is 1, the number cards are face value, and the court cards are 11, 12 and 13.',
    'An Ace is 1, a two through ten is that number, a Jack is 11, a Queen is 12, and a King is 13.',
    'Treat Ace as 1, leave two through ten as they are, and set Jack, Queen and King to 11, 12 and 13.',
    'Values run Ace = 1, two–ten = face value, then Jack 11, Queen 12, King 13.',
    'Every Ace is 1, every number card is its face value, and Jack, Queen and King are 11, 12 and 13.',
    'Add with Ace as 1, pip cards at face value, Jack as 11, Queen as 12, and King as 13.',
    'The Ace equals 1, cards 2–10 equal their number, Jack equals 11, Queen equals 12, and King equals 13.',
  ],
  ten: [
    'Ace is worth 1, number cards keep their face value, and Jack, Queen and King each count as 10.',
    'Use Ace as 1, two through ten as written, and treat Jack, Queen and King as 10 each.',
    'Card values: Ace equals 1, pip cards equal their number, and every court card equals 10.',
    'Remember: Ace is 1, the number cards are face value, and Jack, Queen and King are each worth 10.',
    'An Ace is 1, a two through ten is that number, and Jack, Queen and King are all 10.',
    'Treat Ace as 1, leave two through ten as they are, and set Jack, Queen and King to 10.',
    'Values run Ace = 1, two–ten = face value, and Jack, Queen, King = 10.',
    'Every Ace is 1, every number card is its face value, and each court card is worth 10.',
    'Add with Ace as 1, pip cards at face value, and Jack, Queen and King as 10 each.',
    'The Ace equals 1, cards 2–10 equal their number, and Jack, Queen and King each equal 10.',
  ],
}

/** Label beside the target number in mode B. */
export const CARD_SUMS_TARGET_LABELS: readonly string[] = [
  'Target',
  'Make this total',
  'Reach exactly',
  'Your target',
  'Total wanted',
  'Add up to',
  'Aim for',
  'The number to make',
  'Find cards totalling',
  'Target total',
]
