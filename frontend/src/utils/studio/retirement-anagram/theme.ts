/**
 * Keeps the anagram's rotating theme out of step with the other games'.
 *
 * `mixed` picks its theme from the puzzle's own seed. A book run hands every
 * game on a spread the same seed, so without a per-game salt the cryptogram and
 * the anagram on facing pages would both come out as "Gardening".
 */
export const ANAGRAM_THEME_SALT = 0x616e6167
