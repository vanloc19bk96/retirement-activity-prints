import { RETIREMENT_BINGO_WRITE_INS } from '@/constants/studio-phrasing/retirement-bingo'
import { createRngFromSeedInput } from '../_shared/uniqueness'

/**
 * Each seller's house style for the bingo page (§4.6).
 *
 * Two books can hold entirely different cards and still read as the same
 * product, because the column letters, the free square and the write-in line
 * are identical. So the page furniture varies too — but per *account*, not per
 * page. A book whose header changes from black band to plain letters every
 * other page looks unfinished; a seller's books sharing one consistent look,
 * different from the next seller's, looks like a brand.
 *
 * Every option is print-safe on a black-and-white interior, and every free
 * square treatment marks the square without relying on the grey tint alone.
 */

export type BingoHeaderStyle = 'plain' | 'boxed' | 'solid'
export type BingoFreeMark = 'tint-frame' | 'double-frame' | 'tint-rounded'
export type BingoRuleWeight = 'classic' | 'fine' | 'heavy'

export const BINGO_HEADER_STYLES: readonly BingoHeaderStyle[] = ['plain', 'boxed', 'solid']
export const BINGO_FREE_MARKS: readonly BingoFreeMark[] = [
  'tint-frame',
  'double-frame',
  'tint-rounded',
]
export const BINGO_RULE_WEIGHTS: readonly BingoRuleWeight[] = ['classic', 'fine', 'heavy']

/** Small label over NAP. NAP itself never changes — it is the card's joke. */
export const BINGO_FREE_LABELS: readonly string[] = ['FREE', 'FREE SPACE', 'FREE SQUARE']

/** Rule thickness in px: the outer frame, then the lines between squares. */
export const BINGO_RULES: Readonly<Record<BingoRuleWeight, { outer: number; inner: number }>> = {
  classic: { outer: 3, inner: 2 },
  fine: { outer: 3, inner: 1.5 },
  heavy: { outer: 4, inner: 2 },
}

export interface RetirementBingoHouseStyle {
  header: BingoHeaderStyle
  freeMark: BingoFreeMark
  freeLabel: string
  rules: BingoRuleWeight
  writeIn: string
}

/** 3 x 3 x 3 x 3 x 7 = 567 looks; two sellers match on all of them rarely. */
export function retirementBingoHouseStyle(ownerSalt: string): RetirementBingoHouseStyle {
  const rng = createRngFromSeedInput({
    ownerSalt,
    templateKey: 'retirement-bingo',
    configHash: 'house-style',
    pageNonce: 'v1',
  })
  return {
    header: rng.pick(BINGO_HEADER_STYLES),
    freeMark: rng.pick(BINGO_FREE_MARKS),
    freeLabel: rng.pick(BINGO_FREE_LABELS),
    rules: rng.pick(BINGO_RULE_WEIGHTS),
    writeIn: rng.pick(RETIREMENT_BINGO_WRITE_INS),
  }
}
