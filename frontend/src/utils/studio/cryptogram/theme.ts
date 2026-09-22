/**
 * Keeps the cryptogram's rotating theme out of step with the other games'.
 *
 * `mixed` picks its theme from the puzzle's own seed. A book run hands every
 * game on a spread the same seed, so without a per-game salt the crossword and
 * the cryptogram on facing pages would both come out as "Gardening".
 */
export const CRYPTOGRAM_THEME_SALT = 0x63727970
