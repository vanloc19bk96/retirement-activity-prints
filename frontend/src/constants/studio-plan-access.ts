/**
 * Studio templates unlocked on the Starter plan. Standard and Pro get the
 * whole library.
 *
 * Hand-picked (not simply the first N of the registry) so a Starter seller can
 * still ship a complete, varied book without feeling walled in:
 * - every category is represented, so no tab is ever empty;
 * - the classics that actually sell activity books are in (Word Search,
 *   Crossword, Sudoku, Maze);
 * - a few crowd-pleasers per non-puzzle tab (coloring, trivia, party,
 *   keepsake), which is enough page variety for a full book.
 *
 * Listed in `STUDIO_TEMPLATES` order (grouped by category) so this file reads
 * like the panel. Keys must exist in the registry, and every category must
 * keep at least one entry — both enforced in DEV by `studio-templates.ts`.
 */
export const STARTER_STUDIO_TEMPLATE_KEYS: readonly string[] = [
  // Word (7)
  'word-search',
  'hidden-message-word-search',
  'a-to-z-word-search',
  'crossword',
  'cryptogram',
  'retirement-anagram',
  'missing-vowels',

  // Logic (8)
  'sudoku',
  'wordoku',
  'picture-logic',
  'happy-campers',
  'island-hopping',
  'cruise-fleet',
  'skyline-tour',
  'sun-and-moon',

  // Visual (3)
  'maze',
  'dot-to-dot',
  'spot-the-difference',

  // Coloring (2)
  'color-by-number',
  'quote-coloring',

  // Trivia (3)
  'office-relics',
  'work-lingo-match',
  'riddles-and-jokes',

  // Party (4)
  'would-you-rather',
  'fill-in-funnies',
  'office-awards',
  'retirement-bingo',

  // Keepsake (3)
  'bucket-list',
  'well-wishes-signatures',
  'retirement-certificate',
]

/** How many templates Starter can use (marketing copy reads this too). */
export const STARTER_STUDIO_TEMPLATE_COUNT = STARTER_STUDIO_TEMPLATE_KEYS.length

const STARTER_KEY_SET = new Set(STARTER_STUDIO_TEMPLATE_KEYS)

/** True when the template is part of the Starter selection. */
export function isStarterStudioTemplate(key: string): boolean {
  return STARTER_KEY_SET.has(key)
}
