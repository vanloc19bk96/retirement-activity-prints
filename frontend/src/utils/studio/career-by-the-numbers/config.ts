import type {
  StudioConfig,
  StudioConfigField,
  StudioConfigValidationError,
} from '@/types/studio-template.types'
import { STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import { WKB_NAME_MAX, parseRetireeName, retireeNameProblem } from '../who-knows-retiree-best/content'
import {
  CBN_COUNTS,
  CBN_DEFAULT_COUNT,
  CBN_DISTANCES,
  CBN_WORKPLACES,
  parseCbnCount,
  parseCbnWorkplace,
} from './content'
import { cbnPrintNote } from './layout'

/**
 * Four short questions: whose career it is, what kind of work, how many
 * questions, and whether distances are in miles or kilometres.
 *
 * What the form deliberately does not ask:
 *
 * *Years worked, salary, employer, job title* — every number is the
 * retiree's own best guess, written by hand. Nothing private is typed,
 * stored or sent; the retiree's name is optional, printed only in the
 * heading, and never sent to the content service.
 *
 * *The questions, tone or themes* — every set is written fresh, spread over
 * many parts of working life, about two in five nostalgic and the rest
 * playful, and never about pay, health or age. One question looks at the
 * road to retirement to close on.
 *
 * *Type size, questions per page, line lengths, pages* — they fall out of the
 * trim, at large print. The questions' help line reports what came out.
 */
export const CBN_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'retireeName',
    label: 'Retiree’s name (optional)',
    type: 'text',
    default: '',
    max: WKB_NAME_MAX,
    placeholder: 'e.g. Linda',
    help: 'A first name or nickname for the heading — “Linda’s Career By the Numbers”. It is printed only, never sent to the AI.',
  },
  {
    key: 'workplace',
    label: 'What kind of work?',
    type: 'select',
    default: 'any',
    options: CBN_WORKPLACES.map((w) => ({ label: w.label, value: w.value })),
    helpWhen: (config) => {
      const workplace = CBN_WORKPLACES.find((w) => w.value === parseCbnWorkplace(config.workplace))!
      return `${workplace.help} Every question is a fun estimate — nothing about pay, health or age.`
    },
  },
  {
    key: 'questions',
    label: 'Questions',
    type: 'select',
    default: CBN_DEFAULT_COUNT,
    options: CBN_COUNTS.map((n) => ({ label: `${n} questions`, value: n })),
    helpWhen: (config, layout) =>
      cbnPrintNote({
        page: layout,
        config,
        font: String(config.fontFamily ?? STUDIO_DEFAULT_FONT),
        name: parseRetireeName(config.retireeName),
        count: parseCbnCount(config.questions),
      }),
  },
  {
    key: 'distance',
    label: 'Distances in',
    type: 'select',
    default: 'miles',
    options: CBN_DISTANCES.map((d) => ({ label: d.label, value: d.value })),
    help: 'Used for any commute or travel question, so nobody wonders which to write.',
  },
]

export function validateCbnConfig(config: StudioConfig): StudioConfigValidationError | null {
  const message = retireeNameProblem(config.retireeName)
  return message ? { message, field: 'retireeName' } : null
}
