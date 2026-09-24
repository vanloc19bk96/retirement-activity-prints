import type { StudioConfig, StudioConfigField } from '@/types/studio-template.types'
import { STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import { retirementBingoPrintNote } from './layout'
import {
  DEFAULT_RETIREMENT_BINGO_THEME_ID,
  RETIREMENT_BINGO_THEME_OPTIONS,
  parseRetirementBingoTheme,
  retirementBingoInstruction,
} from './themes'

/**
 * One question, and it is about the book rather than the page.
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
 * *Which moments go on the card* — a hand-picked list of 24 makes every card in
 * a book the same card, reshuffled. The bank is deep enough that each card
 * draws its own.
 *
 * *The free square* — always NAP, always in the middle. It is the joke the
 * whole card is built around.
 *
 * *An answer page* — bingo has no answer. Every card is the reader's own record.
 *
 * What is left is what kind of retirement book this is.
 */
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
        instruction: retirementBingoInstruction(config),
        font: String(config.fontFamily ?? STUDIO_DEFAULT_FONT),
      }),
  },
]
