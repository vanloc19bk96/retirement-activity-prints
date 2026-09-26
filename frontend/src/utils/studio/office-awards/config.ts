import type {
  StudioConfig,
  StudioConfigField,
  StudioConfigValidationError,
} from '@/types/studio-template.types'
import { STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import { WKB_NAME_MAX, parseRetireeName, retireeNameProblem } from '../who-knows-retiree-best/content'
import {
  OA_COUNTS,
  OA_DEFAULT_COUNT,
  OA_WORKPLACES,
  parseOaCount,
  parseOaWorkplace,
} from './content'
import { oaPrintNote } from './layout'

/**
 * Four short questions: whose farewell it is, where they worked, how many
 * awards, and whether each gets a line for the reason.
 *
 * What the form deliberately does not ask:
 *
 * *Coworkers' names* — winners are written by hand at the party, so no
 * employee list is typed, stored or sent anywhere. The retiree's name is
 * optional, printed only, and never sent to the content service.
 *
 * *The awards themselves, tone or themes* — every set is written fresh,
 * spread over many themes, about two in five warm and the rest playful,
 * and never mean. One award honours the retiree's farewell where it fits.
 *
 * *Type size, cards per page, line lengths, pages* — they fall out of the
 * trim, at large print. The awards' help line reports what came out.
 */
export const OA_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'retireeName',
    label: 'Retiree’s name (optional)',
    type: 'text',
    default: '',
    max: WKB_NAME_MAX,
    placeholder: 'e.g. Linda',
    help: 'A first name or nickname for the heading, instructions and awards about the retiree — “Most Likely to Inherit Linda’s Chair”. It is printed only, never sent to the AI. Leave blank to say “the retiree”.',
  },
  {
    key: 'workplace',
    label: 'Where did they work?',
    type: 'select',
    default: 'any',
    options: OA_WORKPLACES.map((w) => ({ label: w.label, value: w.value })),
    helpWhen: (config) => {
      const workplace = OA_WORKPLACES.find((w) => w.value === parseOaWorkplace(config.workplace))!
      return `${workplace.help} Always friendly — a mix of playful and heartfelt, nothing about looks, age, health or money.`
    },
  },
  {
    key: 'awards',
    label: 'Awards',
    type: 'select',
    default: OA_DEFAULT_COUNT,
    options: OA_COUNTS.map((n) => ({ label: `${n} awards`, value: n })),
    helpWhen: (config, layout) =>
      oaPrintNote({
        page: layout,
        config,
        font: String(config.fontFamily ?? STUDIO_DEFAULT_FONT),
        name: parseRetireeName(config.retireeName),
        count: parseOaCount(config.awards),
        reasonLine: config.reasonLine === true,
      }),
  },
  {
    key: 'reasonLine',
    label: 'Add a “Why” line',
    type: 'toggle',
    default: false,
    help: 'A second line under each winner for a quick reason or memory — lovely for keepsake books. Fewer awards fit on each page.',
  },
]

export function validateOaConfig(config: StudioConfig): StudioConfigValidationError | null {
  const message = retireeNameProblem(config.retireeName)
  return message ? { message, field: 'retireeName' } : null
}
