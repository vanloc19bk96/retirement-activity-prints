/**
 * Keeps this game's rotating theme out of step with the other word games'.
 *
 * `mixed` picks its theme from the puzzle's own seed. A book run hands every
 * game on a spread the same seed, so without a per-game salt the plain word
 * search and the trivia page on facing pages would both come out as
 * "Gardening" — two grids built from one vocabulary, which reads as padding
 * rather than as variety.
 */
export const TRIVIA_THEME_SALT = 0x74727677
