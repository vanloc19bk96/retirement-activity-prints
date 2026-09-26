import type {
  StudioConfig,
  StudioConfigField,
  StudioConfigValidationError,
} from '@/types/studio-template.types'
import {
  CR_DATE_MAX,
  CR_NAME_MAX,
  CR_PLACE_MAX,
  CR_TITLE_MAX,
  CR_TONES,
  crCustomTitleProblem,
  crDateProblem,
  crHeadingProblem,
  crNameProblem,
  crPlaceProblem,
  crYearsProblem,
  parseCrTone,
} from './content'

/**
 * Six short questions, every one optional, so a certificate can be made in
 * seconds and still come out complete.
 *
 * A missing detail is never a gap: no name prints a line to write it on, no
 * years or workplace simply reads "many years of dedicated service", no date
 * leaves the date line blank for whoever signs, and no title picks one to
 * suit the tone.
 *
 * What the form deliberately does not ask:
 *
 * *Type sizes, spacing, frame, emblem, seal, wording* — chosen per
 * certificate from bundled, original wording and a handful of print-safe
 * looks, sized to the trim and steered away from what the book and the
 * seller printed last.
 *
 * *Anything private* — no address, employer records or contact details; a
 * workplace name is the most a certificate needs.
 */
export const CR_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'retireeName',
    label: 'Retiree’s name (optional)',
    type: 'text',
    default: '',
    max: CR_NAME_MAX,
    help: 'Printed large in the centre, e.g. “Linda Moore”. Leave blank for a line to write it in by hand.',
  },
  {
    key: 'yearsOfService',
    label: 'Years of service (optional)',
    type: 'text',
    default: '',
    max: 2,
    help: 'A number, e.g. 32 — “after 32 years of dedicated service”. Leave blank for “many years”.',
  },
  {
    key: 'retirementDate',
    label: 'Retirement date (optional)',
    type: 'text',
    default: '',
    max: CR_DATE_MAX,
    help: 'Printed on the date line, e.g. “June 30, 2026”. Leave blank to date it by hand when it is presented.',
  },
  {
    key: 'workplace',
    label: 'Workplace or team (optional)',
    type: 'text',
    default: '',
    max: CR_PLACE_MAX,
    help: 'Reads “… of service at Riverside Library”. Leave blank to keep it general.',
  },
  {
    key: 'tone',
    label: 'Tone',
    type: 'select',
    default: 'playful',
    options: CR_TONES.map((tone) => ({ label: tone.label, value: tone.value })),
    helpWhen: (config) => CR_TONES.find((t) => t.value === parseCrTone(config.tone))!.help,
  },
  {
    key: 'promotedTo',
    label: 'Officially promoted to (optional)',
    type: 'text',
    default: '',
    max: CR_TITLE_MAX,
    help: 'Leave blank and each certificate gets its own new title to suit the tone — or type one, e.g. “Head Gardener”.',
  },
]

export function validateCrConfig(config: StudioConfig): StudioConfigValidationError | null {
  const checks: [string, string | null][] = [
    ['title', config.showTitle === false ? null : crHeadingProblem(config.title)],
    ['retireeName', crNameProblem(config.retireeName)],
    ['yearsOfService', crYearsProblem(config.yearsOfService)],
    ['retirementDate', crDateProblem(config.retirementDate)],
    ['workplace', crPlaceProblem(config.workplace)],
    ['promotedTo', crCustomTitleProblem(config.promotedTo)],
  ]
  for (const [field, message] of checks) {
    if (message) return { message, field }
  }
  return null
}
