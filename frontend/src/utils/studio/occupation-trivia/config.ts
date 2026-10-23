import type {
  StudioConfig,
  StudioConfigField,
  StudioConfigValidationError,
} from '@/types/studio-template.types'
import { STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import {
  customOccupationField,
  isPresetOccupation,
  validateTypedOccupation,
  writeOwnOccupationField,
} from '../_shared/occupations'
import {
  OT_LEVELS,
  OT_OCCUPATIONS,
  otInstruction,
  otJob,
  otOccupationSpec,
  parseOtOccupation,
} from './content'
import { otPrintNote } from './layout'

/** Instruction text the page will actually carry, for layout measurement. */
export function instructionFor(config: StudioConfig): string {
  return config.showInstructions === false ? '' : otInstruction(otJob(config))
}

/**
 * Two questions: whose job, and how deep into it.
 *
 * Whose job is a preset, or — behind the switch above the picker — any job the
 * seller types, for a book written for that one line of work ("for Retired
 * Firefighters"). The service plans a typed job before writing a question and
 * refuses one no warm, KDP-safe pack can be written for, with a reason the
 * form shows.
 *
 * What the form deliberately does not ask:
 *
 * *Question count, type size, pages* — all fall out of the trim. A pack is
 * about ten questions; the largest print that holds them within four pages is
 * chosen for the seller, and the level's help line reports what came out.
 *
 * *Topics within the job* — every pack ranges across the job's tools, terms,
 * routines, traditions and history by itself. A seller narrowing it to one
 * corner is how a pack ends up as ten questions about chalk.
 *
 * *Country, era, answer placement* — questions name a country or era only when
 * the answer depends on one, and the answer page is always added, placed by the
 * book's own solutions setting.
 */
export const OT_CONFIG_SCHEMA: StudioConfigField[] = [
  writeOwnOccupationField(),
  {
    key: 'occupation',
    label: 'Occupation',
    type: 'select',
    default: 'teacher',
    options: OT_OCCUPATIONS.map((o) => ({ label: o.label, value: o.value })),
    visibleWhen: isPresetOccupation,
    helpWhen: (config) => otOccupationSpec(parseOtOccupation(config.occupation)).covers,
  },
  customOccupationField(
    'Any job, like “Firefighter” or “Electrician”: questions on its tools, terms, routines and history, fact-checked before they print.',
  ),
  {
    key: 'level',
    label: 'Level',
    type: 'select',
    default: 'classic',
    options: OT_LEVELS.map((level) => ({ label: level.label, value: level.value })),
    helpWhen: (config, layout) =>
      otPrintNote({
        page: layout,
        config,
        instruction: instructionFor(config),
        font: String(config.fontFamily ?? STUDIO_DEFAULT_FONT),
      }),
  },
]

export function validateOtConfig(config: StudioConfig): StudioConfigValidationError | null {
  return validateTypedOccupation(config)
}
