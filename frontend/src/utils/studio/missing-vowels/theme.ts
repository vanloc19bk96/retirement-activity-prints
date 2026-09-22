/**
 * Keeps the missing-vowels rotating theme out of step with the other games'.
 *
 * `mixed` picks its theme from the puzzle's own seed. A book run hands every
 * game on a spread the same seed, so without a per-game salt the anagram and
 * the missing-vowels page on facing pages would both come out as "Gardening" —
 * which is the same vocabulary printed twice.
 */
export const MISSING_VOWELS_THEME_SALT = 0x6d76776c
