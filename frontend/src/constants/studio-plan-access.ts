/**
 * Studio templates unlocked on the Starter plan. Standard and Pro get the
 * whole library.
 *
 * Hand-picked (not simply the first N of the registry) so a Starter seller can
 * still ship a complete, varied book without feeling walled in:
 * - every category is represented, so no tab is ever empty;
 * - the classics that actually sell activity books are in (Word Search,
 *   Crossword, Sudoku, Maze);
 * - one crowd-pleaser per non-puzzle tab (coloring, trivia, party,
 *   keepsake), which is enough page variety for a full book.
 *
 * Listed in `STUDIO_TEMPLATES` order (grouped by category) so this file reads
 * like the panel. Keys must exist in the registry, and every category must
 * keep at least one entry — both enforced in DEV by `studio-templates.ts`.
 */
export const STARTER_STUDIO_TEMPLATE_KEYS: readonly string[] = [
  // Word (2)
  'word-search',
  'crossword',

  // Logic (1)
  'sudoku',

  // Visual (1)
  'maze',

  // Coloring (1)
  'color-by-number',

  // Trivia (1)
  'office-relics',

  // Party (1)
  'would-you-rather',

  // Keepsake (1)
  'bucket-list',
]

/** How many templates Starter can use (marketing copy reads this too). */
export const STARTER_STUDIO_TEMPLATE_COUNT = STARTER_STUDIO_TEMPLATE_KEYS.length

const STARTER_KEY_SET = new Set(STARTER_STUDIO_TEMPLATE_KEYS)

/** True when the template is part of the Starter selection. */
export function isStarterStudioTemplate(key: string): boolean {
  return STARTER_KEY_SET.has(key)
}
