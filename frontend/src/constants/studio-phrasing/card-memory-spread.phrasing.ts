import type { PhrasingPool } from '@/utils/studio/_shared/uniqueness/phrasing'

/**
 * Card Memory Spread instruction variants (§4.7). Hand-written, never generated.
 *
 * One recall style: write rank + suit into blanks (e.g. 7♥). Do not redraw faces.
 */
export const CARD_MEMORY_SPREAD_INSTRUCTIONS: PhrasingPool = {
  study: [
    'Study each card — rank and suit. You will write them back, not redraw them.',
    'Remember which cards are here (e.g. A♠, 10♥). Next page is write-in only.',
    'Learn every card below. Next: write rank and suit — do not redraw the face.',
    'Fix rank and suit in mind for each card. Writing them back is enough.',
    'Memorise the cards you see. You will jot rank + suit after you turn.',
    'Study rank and suit only. The next page asks you to write them, not draw.',
    'Take a good look at these cards. Next, write each one as rank plus suit.',
    'Remember the cards (A–K and ♠♥♦♣). Turn the page when you have them.',
    'Learn every card here. On the next page, write them into the empty boxes.',
    'Commit these cards to memory. Writing them back is enough — no drawing.',
  ],
  recall: [
    'Write each card as rank + suit (e.g. A♠ or 10♥). Do not redraw the face.',
    'Fill any blank with short form only (e.g. 7♦). Write — do not redraw.',
    'Name the cards from memory as rank + suit. Write them; do not draw them.',
    'One card per box: write the letter/number and suit. No drawing needed.',
    'List every card you can (A–K plus ♠♥♦♣). Write only — do not redraw.',
    'Write rank and suit into the blanks (e.g. Q♣). Do not redraw the picture.',
    'Jot each remembered card in short form. Do not try to redraw the face.',
    'Fill the boxes with rank + suit from the study page. Write, do not draw.',
    'How many can you name? Write one short label per blank (e.g. 3♥) — no drawing.',
    'Write the cards you remember as rank + suit. Do not redraw; turn back to check.',
  ],
}

/** Optional cue printed under the study spread. */
export const CARD_MEMORY_STUDY_TIME_HINTS: readonly string[] = [
  'Study for about a minute, then turn the page.',
  'Give yourself around 60 seconds before turning over.',
  'A minute is usually enough. Then turn the page.',
  'Take up to a minute, then turn over.',
  'Aim for 60 seconds of study, then turn the page.',
  'When about a minute has passed, turn over.',
  'Spend a minute here before you continue.',
  'Set a timer for a minute if it helps, then turn the page.',
  'Around a minute of study, then turn over.',
  'Study until you can picture the whole spread — about a minute.',
]
