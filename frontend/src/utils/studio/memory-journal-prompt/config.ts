import type { StudioConfigField } from '@/types/studio-template.types'
import { CUSTOM_THEME_TEXT_MAX } from '../reflective-writing/copy'
import { JOURNAL_OPEN_THEME, JOURNAL_THEME_OPTIONS } from '../reflective-writing/theme'

export { CUSTOM_THEME_TEXT_MAX }

export const MEMORY_JOURNAL_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'timeFrame',
    label: 'What to write about',
    type: 'select',
    default: 'mixed',
    options: [
      { label: 'A mix (recommended)', value: 'mixed' },
      { label: 'Memories from the past', value: 'past' },
      { label: 'Today and this week', value: 'present' },
      { label: 'Looking ahead', value: 'future' },
    ],
  },
  {
    key: 'customTheme',
    label: 'Custom theme',
    type: 'toggle',
    default: false,
    help: 'Turn on to type your own theme instead of picking from the list.',
  },
  {
    key: 'theme',
    label: 'Theme',
    type: 'select',
    default: JOURNAL_OPEN_THEME,
    options: JOURNAL_THEME_OPTIONS,
    visibleWhen: (c) => c.customTheme !== true,
  },
  {
    key: 'customThemeText',
    label: 'Your theme',
    type: 'text',
    default: 'Gardening & outdoor days',
    max: CUSTOM_THEME_TEXT_MAX,
    visibleWhen: (c) => c.customTheme === true,
    help: `AI writes prompts around this theme. Max ${CUSTOM_THEME_TEXT_MAX} characters.`,
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
    key: 'promptsPerPage',
    label: 'Prompts per page',
    type: 'select',
    default: 1,
    options: [
      { label: 'One (most room to write)', value: 1 },
      { label: 'Two', value: 2 },
    ],
    help: 'One prompt per page gives the most writing space.',
  },
  {
    key: 'showDateLine',
    label: 'Add a date line',
    type: 'toggle',
    default: true,
    help: 'A small “Date: ______” at the top, useful for a dated journal.',
  },
]
