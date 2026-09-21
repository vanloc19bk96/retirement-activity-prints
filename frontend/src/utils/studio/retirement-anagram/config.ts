import type {
  StudioConfig,
  StudioConfigField,
  StudioConfigValidationError,
} from '@/types/studio-template.types'
import {
  CUSTOM_TOPIC_MAX_LENGTH,
  CUSTOM_TOPIC_VALUE,
  DEFAULT_TOPIC,
  MIN_ITEM_COUNT,
  MAX_ITEM_COUNT,
  isCustomTopic,
  parseDifficulty,
  parseTopic,
  resolveCustomTopicText,
  topicSelectOptions,
} from './content'

export const RETIREMENT_ANAGRAM_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'topic',
    label: 'Topic',
    type: 'select',
    default: DEFAULT_TOPIC,
    options: topicSelectOptions(),
    help: 'AI invents fresh retirement words for this topic each time.',
  },
  {
    key: 'customTopic',
    label: 'Custom topic',
    type: 'text',
    default: '',
    max: CUSTOM_TOPIC_MAX_LENGTH,
    visibleWhen: (c) => isCustomTopic(c),
    help: `Short topic for AI words (e.g. retirement by the sea). Max ${CUSTOM_TOPIC_MAX_LENGTH} characters.`,
  },
  {
    key: 'itemCount',
    label: 'Number of words',
    type: 'number',
    default: 12,
    min: MIN_ITEM_COUNT,
    max: MAX_ITEM_COUNT,
    step: 1,
  },
  {
    key: 'difficulty',
    label: 'Word length',
    type: 'select',
    default: 'medium',
    options: [
      { label: 'Easy (4–6 letters)', value: 'easy' },
      { label: 'Medium (5–8 letters)', value: 'medium' },
      { label: 'Hard (7–11 letters)', value: 'hard' },
    ],
  },
]

export function validateRetirementAnagramConfig(
  config: StudioConfig,
): StudioConfigValidationError | null {
  const topic = parseTopic(config.topic)
  if (topic === CUSTOM_TOPIC_VALUE) {
    const custom = resolveCustomTopicText(config)
    if (!custom) {
      return {
        field: 'customTopic',
        message: 'Enter a custom topic, or pick a preset topic.',
      }
    }
    if (String(config.customTopic ?? '').trim().length > CUSTOM_TOPIC_MAX_LENGTH) {
      return {
        field: 'customTopic',
        message: `Keep the custom topic under ${CUSTOM_TOPIC_MAX_LENGTH} characters.`,
      }
    }
  }

  // Touch parsers so invalid stored difficulty still resolves cleanly.
  void parseDifficulty(config.difficulty)
  return null
}
