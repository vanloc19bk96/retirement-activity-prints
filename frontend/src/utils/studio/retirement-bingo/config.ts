import type { StudioConfig, StudioConfigField } from '@/types/studio-template.types'
import { STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import { retirementBingoPrintNote } from './layout'
import {
  DEFAULT_RETIREMENT_BINGO_THEME_ID,
  RETIREMENT_BINGO_THEME_OPTIONS,
  parseRetirementBingoTheme,
} from './themes'

/**
 * One question, about the book rather than the page.
 *
 * What the form deliberately does not ask:
 *
 * *Grid size* — bingo is five by five with a free centre. A 4 x 4 or 6 x 6
 * "bingo" is a different game with rules the reader has to learn.
 *
 * *Square size, type size, line breaks* — all fall out of the trim, and a seller
 * setting any of them by hand gets either tiny type or a phrase through a rule.
 * The help line reports what the page chose.
 *
 * *A card style* — the column header, the free square's treatment, the rules
 * and the write-in line are chosen once per account (`style.ts`), so a seller's
 * books look consistent and unlike anyone else's without a setting for it.
 *
 * *The free square* — always NAP, always in the middle. It is the joke the
 * whole card is built around.
 *
 * *An answer page* — bingo has no answer. Every card is the reader's own record.
 *
 * *A list of the seller's own moments* — each account already prints its own
 * deck of moments and its own wording of them (`deck.ts`), so a book is the
 * seller's own without a list to type and check.
 *
 * What is left is what kind of retirement book this is.
 */

const font = (config: StudioConfig) => String(config.fontFamily ?? STUDIO_DEFAULT_FONT)

export const RETIREMENT_BINGO_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'theme',
    label: 'Moments on the card',
    type: 'select',
    default: DEFAULT_RETIREMENT_BINGO_THEME_ID,
    options: RETIREMENT_BINGO_THEME_OPTIONS,
    helpWhen: (config: StudioConfig, layout) =>
      retirementBingoPrintNote({
        theme: parseRetirementBingoTheme(config),
        page: layout,
        config,
        font: font(config),
      }),
  },
]
