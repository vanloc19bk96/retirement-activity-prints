/**
 * Hand-written phrasing pools for procedural Studio templates.
 *
 * Every string in this directory is written by a person and reviewed once. None
 * of it is produced at runtime by a language model — generated copy would
 * require an AI-content disclosure.
 *
 * Pack tests enforce the ten-variant floor, reject duplicates inside a pool,
 * and lint every string against the banned vocabulary.
 */

import type { PhrasingPool } from '@/utils/studio/_shared/uniqueness/phrasing'
import { WORD_FIT_INSTRUCTIONS } from './word-fit.phrasing'

export * from './word-fit.phrasing'

/**
 * Instruction pools for the procedural templates. Same hand-written
 * discipline and the same ten-variant floor.
 */
export const STUDIO_INSTRUCTION_POOLS: Readonly<Record<string, PhrasingPool>> = {
  'word-fit': WORD_FIT_INSTRUCTIONS,
}
