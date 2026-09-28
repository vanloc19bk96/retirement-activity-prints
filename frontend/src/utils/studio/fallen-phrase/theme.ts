/**
 * Keeps the Fallen Phrase's rotating theme out of step with the other games'.
 *
 * `mixed` picks its theme from the puzzle's own seed. A book run hands every
 * game on a spread the same seed, so without a per-game salt the cryptogram
 * and the fallen phrase on facing pages would both come out as "Gardening" —
 * and, worse, would be written around the same corner of the same vocabulary.
 */
export const FALLEN_PHRASE_THEME_SALT = 0x66616c6c

/** Registry key, and the tag its stamped content labels are read back under. */
export const FALLEN_PHRASE_TEMPLATE_KEY = 'fallen-phrase'
