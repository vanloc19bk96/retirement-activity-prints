/**
 * Keeps the Riddle Scramble's rotating theme out of step with the other games'.
 *
 * `mixed` picks its theme from the puzzle's own seed. A book run hands every
 * game on a spread the same seed, so without a per-game salt the anagram and
 * the riddle scramble on facing pages would both come out as "Gardening" — two
 * pages of scrambled words drawn from one vocabulary, which reads as padding
 * rather than as variety.
 */
export const RIDDLE_SCRAMBLE_THEME_SALT = 0x7269_6464
