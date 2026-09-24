/**
 * Hand-written phrasing pools for procedural Studio templates.
 *
 * Every string in this directory is written by a person and reviewed once. None
 * of it is produced at runtime by a language model — generated copy would
 * require an AI-content disclosure.
 */

import type { PhrasingPool } from '@/utils/studio/_shared/uniqueness/phrasing'
import { RETIREMENT_BINGO_INSTRUCTIONS } from './retirement-bingo'

export const STUDIO_INSTRUCTION_POOLS: Readonly<Record<string, PhrasingPool>> = {
  'retirement-bingo': { default: RETIREMENT_BINGO_INSTRUCTIONS },
}
