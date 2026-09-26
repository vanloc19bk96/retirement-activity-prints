import type {
  StudioConfig,
  StudioConfigField,
  StudioConfigValidationError,
} from '@/types/studio-template.types'
import { STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import {
  WW_AUDIENCES,
  WW_DEFAULT_PAGES,
  WW_NAME_MAX,
  WW_PAGE_COUNTS,
  parseWwAudience,
  parseWwName,
  parseWwPages,
  wwNameProblem,
} from './content'
import { wwPrintNote } from './summary'

/**
 * Three questions: who the pages are for, who is signing, and how many pages.
 *
 * What the form deliberately does not ask:
 *
 * *Boxes per page, box size, line spacing, type size* — all fall out of the
 * trim at handwriting sizes: boxes never narrower than a hand writes across,
 * lines never closer than wide-ruled paper, three or more of them above every
 * signature. Fewer, roomier boxes win over more cramped ones. The pages note
 * reports what the trim prints.
 *
 * *Heading, intro, prompts, frame and ornament* — chosen per set from bundled,
 * original wording and a handful of print-safe looks, steered away from what
 * the book and the seller printed last. The title field still takes a
 * heading of the seller's own.
 *
 * *Details about the retiree* — nothing beyond an optional first name, which
 * is printed only. The messages themselves are written by hand, after printing.
 */
export const WW_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'retireeName',
    label: 'Retiree’s name (optional)',
    type: 'text',
    default: '',
    max: WW_NAME_MAX,
    placeholder: 'e.g. Linda',
    help: 'A first name or nickname for the heading and intro — “Well Wishes for Linda”. Leave blank for wording that works for anyone.',
  },
  {
    key: 'audience',
    label: 'Who’s signing?',
    type: 'select',
    default: 'everyone',
    options: WW_AUDIENCES.map((audience) => ({ label: audience.label, value: audience.value })),
    helpWhen: (config) => WW_AUDIENCES.find((a) => a.value === parseWwAudience(config.audience))!.help,
  },
  {
    key: 'pages',
    label: 'Pages',
    type: 'select',
    default: WW_DEFAULT_PAGES,
    options: WW_PAGE_COUNTS.map((n) => ({ label: n === 1 ? '1 page' : `${n} pages`, value: n })),
    helpWhen: (config, layout) =>
      wwPrintNote({
        page: layout,
        config,
        font: String(config.fontFamily ?? STUDIO_DEFAULT_FONT),
        name: parseWwName(config.retireeName),
        pages: parseWwPages(config.pages),
      }),
  },
]

export function validateWwConfig(config: StudioConfig): StudioConfigValidationError | null {
  const message = wwNameProblem(config.retireeName)
  return message ? { message, field: 'retireeName' } : null
}
