import { createRngFromSeedInput } from '../_shared/uniqueness'
import { OR_TEMPLATE_KEY } from './content'

/**
 * Each seller's house style for the Office Relics page (§4.6).
 *
 * Different pictures on an identical page still read as the same product: the
 * same card frames, the same numbering, the same instruction word for word.
 * So the page furniture varies too — per *account*, not per page. A book whose
 * cards change shape every other page looks unfinished; a seller's books
 * sharing one look, different from the next seller's, looks like a brand.
 *
 * Every option prints in one ink and keeps the page's structure: the grid, the
 * picture sizes and the writing lines are set by the trim alone, so a seller's
 * form note is true whatever their style.
 */

export type OrFrameStyle = 'rounded' | 'square'
export type OrNumberStyle = 'dot' | 'paren'

/** Always a single rule: a double one reads as a card within a card. */
export const OR_FRAME_STYLES: readonly OrFrameStyle[] = ['rounded', 'square']
export const OR_NUMBER_STYLES: readonly OrNumberStyle[] = ['dot', 'paren']
/** The word bank's heading. None of them says what the instruction calls it. */
export const OR_BANK_LABELS: readonly string[] = ['WORD BANK', 'ANSWER BANK', 'CHOOSE FROM']
/** How many phrasings each instruction has (see `orInstructionOptions`). */
export const OR_INSTRUCTION_VARIANTS = 3

export interface OrHouseStyle {
  frame: OrFrameStyle
  number: OrNumberStyle
  bankLabel: string
  /** Which phrasing of the instruction this seller prints. */
  instruction: number
}

/** 2 x 2 x 3 x 3 = 36 looks; two sellers match on all of them rarely. */
export function orHouseStyle(ownerSalt: string): OrHouseStyle {
  const rng = createRngFromSeedInput({
    ownerSalt,
    templateKey: OR_TEMPLATE_KEY,
    configHash: 'house-style',
    pageNonce: 'v1',
  })
  return {
    frame: rng.pick(OR_FRAME_STYLES),
    number: rng.pick(OR_NUMBER_STYLES),
    bankLabel: rng.pick(OR_BANK_LABELS),
    instruction: rng.int(0, OR_INSTRUCTION_VARIANTS - 1),
  }
}

/** A card's number as this style prints it: "4." or "4)". */
export const orNumberLabel = (style: OrNumberStyle, index: number) => `${index + 1}${style === 'paren' ? ')' : '.'}`
