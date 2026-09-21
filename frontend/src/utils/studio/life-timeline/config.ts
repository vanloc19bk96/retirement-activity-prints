import type { StudioConfigField } from '@/types/studio-template.types'
import { CUSTOM_STAGE_LABEL_MAX } from './stages'

export const LIFE_TIMELINE_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'customStages',
    label: 'Custom stage',
    type: 'toggle',
    default: false,
    help: 'Turn on to type your own life-stage name instead of picking from the list.',
  },
  {
    key: 'stage',
    label: 'Life stage',
    type: 'select',
    default: 'childhood',
    options: [
      { label: 'Childhood', value: 'childhood' },
      { label: 'School days', value: 'school' },
      { label: 'Young adulthood', value: 'youngAdult' },
      { label: 'Work', value: 'work' },
      { label: 'Family & friends', value: 'family' },
      { label: 'Places & journeys', value: 'places' },
      { label: 'Later years', value: 'laterLife' },
    ],
    visibleWhen: (c) => c.customStages !== true,
  },
  {
    key: 'customStagesText',
    label: 'Your life stage',
    type: 'text',
    default: 'Military years',
    max: CUSTOM_STAGE_LABEL_MAX,
    visibleWhen: (c) => c.customStages === true,
    help: `One stage name, generating a single page. Max ${CUSTOM_STAGE_LABEL_MAX} characters.`,
  },
  {
    key: 'tone',
    label: 'Tone',
    type: 'select',
    default: 'gentle',
    options: [
      { label: 'Gentle', value: 'gentle' },
      { label: 'Playful', value: 'playful' },
      { label: 'Reflective', value: 'reflective' },
    ],
  },
  {
    key: 'promptsPerStage',
    label: 'Prompts per page',
    type: 'number',
    default: 4,
    min: 2,
    max: 6,
    step: 1,
    help: 'Fewer prompts means more room to write.',
  },
]
