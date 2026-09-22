/**
 * Keeps the word search's rotating theme out of step with the other games'.
 *
 * `mixed` picks its theme from the puzzle's own seed. A book run hands every
 * game on a spread the same seed, so without a per-game salt the crossword and
 * the word search on facing pages would both come out as "Gardening" — and a
 * reader flicking through a book whose every spread repeats one vocabulary
 * twice sees padding, not variety.
 */
export const WORD_SEARCH_THEME_SALT = 0x77647368
