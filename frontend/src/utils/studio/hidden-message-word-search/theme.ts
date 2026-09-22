/**
 * Keeps the hidden message's rotating theme out of step with the other games'.
 *
 * `mixed` picks its theme from the puzzle's own seed. A book run hands every
 * game on a spread the same seed, so without a per-game salt the word search
 * and the hidden message on facing pages would both come out as "Gardening" —
 * and two puzzles built from one vocabulary, one of them hiding a saying about
 * it, reads as padding rather than as variety.
 */
export const HIDDEN_MESSAGE_THEME_SALT = 0x686d7773
