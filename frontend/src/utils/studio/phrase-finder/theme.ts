/**
 * Keeps the Phrase Finder's rotating theme out of step with the other games'.
 *
 * `mixed` picks its theme from the puzzle's own seed. A book run hands every
 * game on a spread the same seed, so without a per-game salt the cryptogram and
 * the phrase finder on facing pages would both come out as "Gardening" — and
 * both games print a saying, so a reader would meet the same corner of the same
 * vocabulary twice in one opening.
 */
export const PHRASE_FINDER_THEME_SALT = 0x70687266
