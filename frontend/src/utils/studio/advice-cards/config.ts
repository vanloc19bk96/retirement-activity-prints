import type {
  StudioConfig,
  StudioConfigField,
  StudioConfigLayoutContext,
  StudioConfigValidationError,
} from '@/types/studio-template.types'
import { DPI } from '@/types/canvas-settings.types'
import { WW_NAME_MAX, wwNameProblem } from '../well-wishes/content'
import {
  AC_AUDIENCES,
  AC_CARDS_PER_PAGE,
  AC_DEFAULT_CARDS,
  AC_DEFAULT_PAGES,
  AC_PAGE_COUNTS,
  acCrowdedMessage,
  parseAcAudience,
  parseAcCards,
  parseAcPages,
} from './content'
import { acFit } from './layout'

/**
 * Who the cards are for, who is writing, how many cards, and whether they are
 * cut apart.
 *
 * What the form deliberately does not ask:
 *
 * *Card size, line spacing, type size* — all fall out of the trim and the
 * cards per page at handwriting sizes: cards never narrower than a hand writes
 * across, lines never closer than wide-ruled paper, three or more of them
 * above every signature. The cards note reports the size; a grid that cannot
 * meet those sizes is refused in the form, never squeezed.
 *
 * *Heading, intro, prompts, frame and ornament* — chosen per set from bundled,
 * original wording and the Well Wishes frames, steered away from what the book
 * and the seller printed last. The title field still takes a heading of the
 * seller's own.
 */

const inches = (px: number) => (Math.floor((px / DPI) * 10) / 10).toFixed(1)

function cardsNote(config: StudioConfig, layout: StudioConfigLayoutContext | undefined): string {
  const cards = parseAcCards(config.cardsPerPage)
  const total = cards * parseAcPages(config.pages)
  const summary = `${total} ${total === 1 ? 'card' : 'cards'} in all`
  if (!layout) return `${summary}, sized to your page for comfortable handwriting.`
  const fit = acFit(layout, config, cards, config.cutApart === true)
  if (!fit.ok) return summary
  return `${summary}, each about ${inches(fit.cardWidth)} x ${inches(fit.cardHeight)} in.`
}

export const AC_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'retireeName',
    label: 'Retiree’s name (optional)',
    type: 'text',
    default: '',
    max: WW_NAME_MAX,
    placeholder: 'e.g. Linda',
    help: 'A first name or nickname for the heading and intro, e.g. “Advice for Linda”. Leave blank for wording that works for anyone.',
  },
  {
    key: 'audience',
    label: 'Who’s writing?',
    type: 'select',
    default: 'everyone',
    options: AC_AUDIENCES.map((audience) => ({ label: audience.label, value: audience.value })),
    helpWhen: (config) => AC_AUDIENCES.find((a) => a.value === parseAcAudience(config.audience))!.help,
  },
  {
    key: 'cardsPerPage',
    label: 'Cards per page',
    type: 'select',
    default: AC_DEFAULT_CARDS,
    options: AC_CARDS_PER_PAGE.map((n) => ({
      label: n === 1 ? '1 large card' : n === 2 ? '2 cards' : '4 small cards',
      value: n,
    })),
    helpWhen: (config, layout) => cardsNote(config, layout),
    warningWhen: (config, layout) => {
      if (!layout) return null
      const cards = parseAcCards(config.cardsPerPage)
      return acFit(layout, config, cards, config.cutApart === true).ok ? null : acCrowdedMessage(cards)
    },
  },
  {
    key: 'pages',
    label: 'Pages',
    type: 'select',
    default: AC_DEFAULT_PAGES,
    options: AC_PAGE_COUNTS.map((n) => ({ label: n === 1 ? '1 page' : `${n} pages`, value: n })),
    help: 'One card per guest. Each card gets its own prompt, never the same one twice on a page.',
  },
  {
    key: 'cutApart',
    label: 'Cut-apart cards',
    type: 'toggle',
    default: false,
    help: 'For loose cards handed out at a party: dashed cut lines between the cards, and each card carries the heading.',
  },
]

export function validateAcConfig(config: StudioConfig): StudioConfigValidationError | null {
  const message = wwNameProblem(config.retireeName)
  return message ? { message, field: 'retireeName' } : null
}
