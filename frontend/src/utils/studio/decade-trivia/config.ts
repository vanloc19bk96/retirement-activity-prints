import type {
  StudioConfig,
  StudioConfigField,
  StudioConfigValidationError,
} from '@/types/studio-template.types'
import { CUSTOM_DECADE_MAX, normalizeDecadeLabel } from './decade'

export const CUSTOM_TOPIC_MAX = 80

/**
 * Topic ids. These are a contract with the backend: they must stay identical to
 * `presetTopics` in `app/data/studio/decade-trivia/topics.json`, which is what
 * the accuracy filter matches generated questions against.
 */
export const TOPIC_OPTIONS = [
  { label: 'Music', value: 'music' },
  { label: 'TV', value: 'tv' },
  { label: 'Film', value: 'film' },
  { label: 'Products & brands', value: 'products' },
  { label: 'Food', value: 'food' },
  { label: 'Toys & games', value: 'toys' },
  { label: 'Everyday life', value: 'everyday' },
  { label: 'Events', value: 'events' },
] as const

export const TOPIC_IDS: readonly string[] = TOPIC_OPTIONS.map((o) => o.value)

/** Ticked by default. Unticking one must remove it from the page — see `resolveTopics`. */
export const DEFAULT_TOPICS = ['music', 'tv', 'film', 'products', 'events']

export const QUESTION_COUNT_MIN = 4
export const QUESTION_COUNT_MAX = 8
export const QUESTION_COUNT_DEFAULT = 5

/** Clamp to the schema / API range (4-8). */
export function clampQuestionCount(value: unknown): number {
  const n = Number(value ?? QUESTION_COUNT_DEFAULT)
  if (!Number.isFinite(n)) return QUESTION_COUNT_DEFAULT
  return Math.min(QUESTION_COUNT_MAX, Math.max(QUESTION_COUNT_MIN, Math.round(n)))
}

export function isCustomTopic(config: StudioConfig): boolean {
  return config.customTopic === true
}

/**
 * The topics actually requested — never widened.
 *
 * The old build fell back to the five defaults whenever the selection was
 * empty, so unticking every box quietly generated the default page. An empty
 * selection is now empty, and `validateDecadeTriviaConfig` blocks generation
 * before a request is made.
 */
export function resolveTopics(config: StudioConfig): string[] {
  if (isCustomTopic(config)) {
    const custom = String(config.customTopicText ?? '')
      .trim()
      .slice(0, CUSTOM_TOPIC_MAX)
    return custom ? [custom] : []
  }
  if (!Array.isArray(config.topics)) return []
  const seen = new Set<string>()
  const picked: string[] = []
  for (const raw of config.topics) {
    const id = String(raw).trim().toLowerCase()
    if (!id || seen.has(id) || !TOPIC_IDS.includes(id)) continue
    seen.add(id)
    picked.push(id)
  }
  return picked
}

/** Soft warning when more topics are ticked than there are questions on the page. */
export function topicCoverageWarning(config: StudioConfig): string | null {
  if (isCustomTopic(config)) return null
  const topicCount = resolveTopics(config).length
  if (topicCount === 0) return null
  const questionCount = clampQuestionCount(config.questionCount)
  if (topicCount <= questionCount) return null
  return (
    `${topicCount} topics ticked but only ${questionCount} questions per page — ` +
    'some topics will not appear on this page.'
  )
}

/**
 * One validator for both entry points: `prefetch` calls it before spending an
 * API request, `validateConfig` calls it to show the message under the field.
 */
export function validateDecadeTriviaConfig(
  config: StudioConfig,
): StudioConfigValidationError | null {
  if (config.customDecade === true) {
    const raw = String(config.customDecadeText ?? '').trim()
    if (!raw) {
      return {
        field: 'customDecadeText',
        message: 'Enter a decade, or turn off Custom decade.',
      }
    }
    if (raw.length > CUSTOM_DECADE_MAX) {
      return {
        field: 'customDecadeText',
        message: `Keep the decade under ${CUSTOM_DECADE_MAX} characters.`,
      }
    }
    if (!normalizeDecadeLabel(raw)) {
      return {
        field: 'customDecadeText',
        message: 'Use a decade like 1940s or 2010s.',
      }
    }
  }

  if (isCustomTopic(config)) {
    if (!String(config.customTopicText ?? '').trim()) {
      return {
        field: 'customTopicText',
        message: 'Describe the topic, or turn off Custom topic.',
      }
    }
    return null
  }

  if (resolveTopics(config).length === 0) {
    return {
      field: 'topics',
      message: 'Tick at least one topic — only ticked topics appear on the page.',
    }
  }

  return null
}

export const DECADE_TRIVIA_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'customDecade',
    label: 'Custom decade',
    type: 'toggle',
    default: false,
    help: 'Turn on to type your own decade instead of picking from the list.',
  },
  {
    key: 'decade',
    label: 'Decade',
    type: 'select',
    default: '1960s',
    visibleWhen: (c) => c.customDecade !== true,
    options: [
      { label: '1950s', value: '1950s' },
      { label: '1960s', value: '1960s' },
      { label: '1970s', value: '1970s' },
      { label: '1980s', value: '1980s' },
      { label: '1990s', value: '1990s' },
      { label: '2000s', value: '2000s' },
    ],
  },
  {
    key: 'customDecadeText',
    label: 'Your decade',
    type: 'text',
    default: '2010s',
    max: CUSTOM_DECADE_MAX,
    placeholder: 'e.g. 1940s or 2010s',
    visibleWhen: (c) => c.customDecade === true,
    help: `Type a decade like 1940s or 2010s. Max ${CUSTOM_DECADE_MAX} characters.`,
  },
  {
    key: 'customTopic',
    label: 'Custom topic',
    type: 'toggle',
    default: false,
    help: 'Turn on to type your own topic instead of ticking from the list.',
  },
  {
    key: 'topics',
    label: 'Topics',
    type: 'multiSelect',
    default: [...DEFAULT_TOPICS],
    visibleWhen: (c) => c.customTopic !== true,
    help: 'Only ticked topics are used. Untick one and it will not appear on the page.',
    options: TOPIC_OPTIONS.map((o) => ({ label: o.label, value: o.value })),
  },
  {
    key: 'customTopicText',
    label: 'Your topic',
    type: 'text',
    default: 'school days and playground games',
    max: CUSTOM_TOPIC_MAX,
    visibleWhen: (c) => c.customTopic === true,
    help: `Short topic phrase for AI questions. Max ${CUSTOM_TOPIC_MAX} characters.`,
  },
  {
    key: 'format',
    label: 'Question style',
    type: 'select',
    default: 'multiple-choice',
    options: [
      { label: 'Multiple choice', value: 'multiple-choice' },
      { label: 'Short answer', value: 'short-answer' },
      { label: 'Fill in the blank', value: 'fill-blank' },
      { label: 'Mixed', value: 'mixed' },
    ],
  },
  {
    key: 'difficulty',
    label: 'Difficulty',
    type: 'select',
    default: 'standard',
    options: [
      { label: 'Easy — most people from the era remember', value: 'easy' },
      { label: 'Standard — well-known facts of the decade', value: 'standard' },
      { label: 'Challenging — less obvious, still well documented', value: 'challenging' },
    ],
  },
  {
    key: 'questionCount',
    label: 'Questions per page',
    type: 'number',
    // 5 MC items sit at 16pt on 6x9 at 96dpi; denser pages step down toward 14pt.
    default: QUESTION_COUNT_DEFAULT,
    min: QUESTION_COUNT_MIN,
    max: QUESTION_COUNT_MAX,
    step: 1,
    help: 'Fewer questions keep large-print pages easy to read — 4–5 works best on 6×9 and smaller. Do check the AI’s facts before publishing.',
    warningWhen: topicCoverageWarning,
  },
]
