import type {
  StudioConfig,
  StudioConfigField,
  StudioConfigLayoutContext,
} from '@/types/studio-template.types'
import { STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import {
  BINGO_CUSTOM_PER_CARD_MAX,
  BINGO_MAX_CHARS,
  customMomentsPerCard,
  parseCustomMoments,
} from './content'
import { fitBingoPhrase, planRetirementBingoPage, retirementBingoPrintNote } from './layout'
import {
  DEFAULT_RETIREMENT_BINGO_THEME_ID,
  RETIREMENT_BINGO_THEME_OPTIONS,
  parseRetirementBingoTheme,
} from './themes'

/**
 * Two questions, both about the book rather than the page.
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
 * What is left is what kind of retirement book this is, and — optionally — the
 * seller's own moments, which are the surest way to make a book theirs.
 */

const font = (config: StudioConfig) => String(config.fontFamily ?? STUDIO_DEFAULT_FONT)

/** Custom moments that pass the rules but will not fit a square on this trim. */
function tooLongForPage(
  config: StudioConfig,
  layout: StudioConfigLayoutContext,
  texts: readonly string[],
): string[] {
  const plan = planRetirementBingoPage({
    page: layout,
    config,
    theme: parseRetirementBingoTheme(config),
    font: font(config),
  })
  if (!plan) return []
  const spec = { fontFamily: font(config) }
  return texts.filter((text) => !fitBingoPhrase(text, plan.metrics, plan.phraseFont, spec))
}

function quoteList(texts: readonly string[]): string {
  const shown = texts.slice(0, 2).map((text) => `“${text}”`)
  const more = texts.length > 2 ? ` and ${texts.length - 2} more` : ''
  return `${shown.join(', ')}${more}`
}

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
  {
    key: 'customMoments',
    label: 'Your own moments (optional)',
    type: 'wordList',
    default: [],
    placeholder: 'Moved to the lake house\nBought a red sports car\nWalked the dog at noon',
    helpWhen: (config: StudioConfig) => {
      const { moments } = parseCustomMoments(config.customMoments)
      if (moments.length === 0) {
        return (
          'One per line, short and in the past tense. Mixed into every card with ' +
          `the built-in moments — up to ${BINGO_CUSTOM_PER_CARD_MAX} a card. The ` +
          'surest way to make your book unlike anyone else’s.'
        )
      }
      const perCard = customMomentsPerCard(moments.length)
      return (
        `${moments.length} of your moments ready — about ${perCard} on each card, ` +
        'the rest from the built-in set.'
      )
    },
    warningWhen: (config: StudioConfig, layout) => {
      const { moments, rejected } = parseCustomMoments(config.customMoments)
      const notes: string[] = []
      if (rejected.length > 0) {
        const first = rejected[0]!
        notes.push(
          rejected.length === 1
            ? `Skipping “${first.text}”: ${first.reason}.`
            : `Skipping ${rejected.length} lines — “${first.text}”: ${first.reason}.`,
        )
      }
      if (layout && moments.length > 0) {
        const long = tooLongForPage(
          config,
          layout,
          moments.map((m) => m.text),
        )
        if (long.length > 0) {
          notes.push(
            `${quoteList(long)} won’t fit a square on this page size — ` +
              `try under ${BINGO_MAX_CHARS} letters with shorter words.`,
          )
        }
      }
      return notes.length > 0 ? notes.join(' ') : null
    },
  },
]
