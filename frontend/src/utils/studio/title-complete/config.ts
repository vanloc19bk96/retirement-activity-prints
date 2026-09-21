import type { StudioConfigField } from '@/types/studio-template.types'
import { CUSTOM_CATEGORY_MAX } from './category'
import { CUSTOM_ERA_MAX } from './era'

export const TITLE_COMPLETE_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'customCategory',
    label: 'Custom category',
    type: 'toggle',
    default: false,
    help: 'Turn on to type your own category instead of picking from the list.',
  },
  {
    key: 'category',
    label: 'Category',
    type: 'select',
    default: 'songs',
    visibleWhen: (c) => c.customCategory !== true,
    options: [
      { label: 'Songs', value: 'songs' },
      { label: 'Films', value: 'films' },
      { label: 'TV shows', value: 'tv' },
    ],
  },
  {
    key: 'customCategoryText',
    label: 'Your category',
    type: 'text',
    default: 'Broadway musicals',
    max: CUSTOM_CATEGORY_MAX,
    placeholder: 'e.g. Disney films or country songs',
    visibleWhen: (c) => c.customCategory === true,
    help: `Short focus for AI titles (songs, films, or TV). Max ${CUSTOM_CATEGORY_MAX} characters.`,
  },
  {
    key: 'customEra',
    label: 'Custom era',
    type: 'toggle',
    default: false,
    help: 'Turn on to type your own era instead of picking from the list.',
  },
  {
    key: 'era',
    label: 'Era',
    type: 'select',
    default: 'any',
    visibleWhen: (c) => c.customEra !== true,
    options: [
      { label: 'Any era', value: 'any' },
      { label: '1950s', value: '1950s' },
      { label: '1960s', value: '1960s' },
      { label: '1970s', value: '1970s' },
      { label: '1980s', value: '1980s' },
      { label: '1990s', value: '1990s' },
      { label: '2000s', value: '2000s' },
    ],
  },
  {
    key: 'customEraText',
    label: 'Your era',
    type: 'text',
    default: '2010s',
    max: CUSTOM_ERA_MAX,
    placeholder: 'e.g. 1940s or 2010s',
    visibleWhen: (c) => c.customEra === true,
    help: `Type a decade like 1940s or 2010s. Max ${CUSTOM_ERA_MAX} characters.`,
  },
  {
    key: 'difficulty',
    label: 'Difficulty',
    type: 'select',
    default: 'standard',
    options: [
      { label: 'Easy (very famous, one blank)', value: 'easy' },
      { label: 'Standard', value: 'standard' },
    ],
  },
  {
    key: 'itemCount',
    label: 'Items per page',
    type: 'number',
    default: 12,
    min: 6,
    max: 20,
    step: 1,
  },
  {
    key: 'showLengthHint',
    label: 'Show the number of letters',
    type: 'toggle',
    default: false,
    help: 'Prints “(4)” after each blank so the solver knows the word length. Only titles are ever used — never lyrics.',
  },
]
