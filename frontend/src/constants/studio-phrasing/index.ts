/**
 * Hand-written phrasing pools for the Card Games Pack (§4.7).
 *
 * Every string in this directory is written by a person and reviewed once. None
 * of it is produced at runtime by a language model — the moment generated text
 * enters, the pack's "no AI-content disclosure required" claim dies (§5.4).
 *
 * `studio-phrasing.test.ts` enforces the ten-variant floor, rejects duplicates
 * inside a pool, and lints every string against the banned vocabulary (§9.7).
 */

import type { PhrasingPool } from '@/utils/studio/_shared/uniqueness/phrasing'
import {
  CARD_MEMORY_SPREAD_INSTRUCTIONS,
  CARD_MEMORY_STUDY_TIME_HINTS,
} from './card-memory-spread.phrasing'
import {
  CARD_SUMS_INSTRUCTIONS,
  CARD_SUMS_TARGET_LABELS,
  CARD_SUMS_VALUE_HINTS,
} from './card-sums.phrasing'
import { NEXT_CARD_CHOICE_LABELS, NEXT_CARD_INSTRUCTIONS } from './next-card.phrasing'
import { FIND_THE_PAIR_INSTRUCTIONS } from './find-the-pair.phrasing'
import { WORD_FIT_INSTRUCTIONS } from './word-fit.phrasing'
import {
  CARDS_CHANGED_INSTRUCTIONS,
  CARDS_CHANGED_SPREAD_LABELS,
} from './cards-changed.phrasing'

export * from './card-memory-spread.phrasing'
export * from './card-sums.phrasing'
export * from './next-card.phrasing'
export * from './cards-changed.phrasing'
export * from './find-the-pair.phrasing'
export * from './word-fit.phrasing'

/** Every instruction pool, keyed by template. Used by the phrasing tests. */
export const CARD_INSTRUCTION_POOLS: Readonly<Record<string, PhrasingPool>> = {
  'card-memory-spread': CARD_MEMORY_SPREAD_INSTRUCTIONS,
  'card-sums': CARD_SUMS_INSTRUCTIONS,
  'next-card': NEXT_CARD_INSTRUCTIONS,
  'cards-changed': CARDS_CHANGED_INSTRUCTIONS,
}

/**
 * Instruction pools for the procedural non-card templates. Same hand-written
 * discipline and the same ten-variant floor; kept in its own map so the card
 * pack's ship gate keeps testing the card pack.
 */
export const STUDIO_INSTRUCTION_POOLS: Readonly<Record<string, PhrasingPool>> = {
  'find-the-pair': FIND_THE_PAIR_INSTRUCTIONS,
  'word-fit': WORD_FIT_INSTRUCTIONS,
}

/** Every label pool. Held together so the lint cannot miss one. */
export const CARD_LABEL_POOLS: Readonly<Record<string, readonly string[]>> = {
  'card-memory-spread:studyTime': CARD_MEMORY_STUDY_TIME_HINTS,
  'card-sums:valueHint:face': CARD_SUMS_VALUE_HINTS.face ?? [],
  'card-sums:valueHint:ten': CARD_SUMS_VALUE_HINTS.ten ?? [],
  'card-sums:target': CARD_SUMS_TARGET_LABELS,
  'next-card:choice': NEXT_CARD_CHOICE_LABELS,
  'cards-changed:before': CARDS_CHANGED_SPREAD_LABELS.map((pair) => pair.before),
  'cards-changed:after': CARDS_CHANGED_SPREAD_LABELS.map((pair) => pair.after),
}
