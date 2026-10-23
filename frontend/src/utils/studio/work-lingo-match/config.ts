import type {
  StudioConfig,
  StudioConfigField,
  StudioConfigValidationError,
} from '@/types/studio-template.types'
import { STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import {
  PRESET_OCCUPATIONS,
  customOccupationField,
  isPresetOccupation,
  validateTypedOccupation,
  writeOwnOccupationField,
} from '../_shared/occupations'
import { WL_ANY_OCCUPATION, WL_LEVELS, parseWlLevel, wlInstruction, wlJob } from './content'
import { wlPrintNote } from './layout'

/** Instruction text the page will actually carry, for layout measurement. */
export function instructionFor(config: StudioConfig): string {
  return config.showInstructions === false ? '' : wlInstruction()
}

/**
 * Two questions: whose lingo, and how familiar the phrases should be.
 *
 * Whose lingo is everyday workplace talk by default. A book written for one
 * job ("for Retired Truckers") can make the page that job's own shop talk —
 * a preset, or any job the seller types behind the switch, which the service
 * plans first and refuses, with a reason, when no warm, KDP-safe page fits it.
 *
 * What the form deliberately does not ask:
 *
 * *A workplace area or theme* — a page that is all meetings is ten ways to say
 * "let's talk later", which is exactly the look-alike meanings that make a
 * matching puzzle unfair. Every page ranges across meetings, deadlines, sales,
 * teamwork and the rest by itself.
 *
 * *Pairs per page, type size* — both fall out of the trim and the level. A
 * seller setting them by hand gets small type or a meaning running into the
 * next. The level's help line reports what the page chose.
 *
 * *Where the answers go, extra decoy meanings* — every page gets an answer
 * page, placed by the book's own solutions setting. Decoys would add a second
 * way for a meaning to fit a phrase, which is the one thing this puzzle must
 * never have.
 */
export const WL_CONFIG_SCHEMA: StudioConfigField[] = [
  writeOwnOccupationField(),
  {
    key: 'occupation',
    label: 'Whose lingo?',
    type: 'select',
    default: WL_ANY_OCCUPATION,
    options: [
      { label: 'Everyday workplace talk', value: WL_ANY_OCCUPATION },
      ...PRESET_OCCUPATIONS.map((o) => ({ label: `${o.label} lingo`, value: o.value })),
    ],
    visibleWhen: isPresetOccupation,
    helpWhen: (config) =>
      wlJob(config).key === WL_ANY_OCCUPATION
        ? 'Office classics like “circle back” and “touch base”, from every kind of workplace.'
        : 'That job’s own shop talk, each phrase checked to be real and to have one clear meaning.',
  },
  customOccupationField(
    'Any job, like “Firefighter” or “Electrician”: the page becomes that job’s own lingo, each phrase checked to be real.',
  ),
  {
    key: 'level',
    label: 'Level',
    type: 'select',
    default: 'classic',
    options: WL_LEVELS.map((level) => ({ label: level.label, value: level.value })),
    helpWhen: (config, layout) => {
      const note = wlPrintNote({
        page: layout,
        config,
        instruction: instructionFor(config),
        font: String(config.fontFamily ?? STUDIO_DEFAULT_FONT),
        level: parseWlLevel(config.level),
      })
      const job = wlJob(config)
      const what =
        job.key === WL_ANY_OCCUPATION
          ? 'Phrases from meetings, memos, deadlines, sales and teamwork'
          : `${job.label} lingo from across the job`
      return `${what}, each checked to have one clear meaning. ${note}`
    },
  },
]

export function validateWlConfig(config: StudioConfig): StudioConfigValidationError | null {
  return validateTypedOccupation(config)
}
