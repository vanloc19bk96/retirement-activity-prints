import type {
  StudioConfig,
  StudioConfigField,
  StudioConfigValidationError,
} from '@/types/studio-template.types'
import { STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import { AI_THEME_MAX_LENGTH } from '../_shared/retirement-theme-config'
import { themeIpWarning } from '../retirement-word-search/content-quality'
import { TTF_LEVELS, TTF_SUBJECTS, parseTtfSubject, ttfInstruction } from './content'
import { ttfPrintNote } from './layout'

/** Instruction text the page will actually carry, for layout measurement. */
export function instructionFor(config: StudioConfig): string {
  return config.showInstructions === false ? '' : ttfInstruction()
}

export const isCustomTtfSubject = (config: StudioConfig) =>
  parseTtfSubject(config.subject) === 'custom'

/** What the seller typed, trimmed to the prompt budget. */
export function customTtfSubject(config: StudioConfig): string {
  return String(config.customSubject ?? '')
    .trim()
    .slice(0, AI_THEME_MAX_LENGTH)
}

/**
 * Two questions: what the facts are about, and how hard the fib is to spot.
 *
 * What the form deliberately does not ask:
 *
 * *Puzzles per page, type size* — both fall out of the trim and the length of
 * the statements. A seller setting them by hand gets small type or a
 * statement through its row. The subject's help line reports what the page
 * chose.
 *
 * *An answer-page toggle, or whether to explain answers* — the answer page is
 * what makes a fact puzzle trustworthy, and a correction is what makes it
 * worth reading, so both are always added.
 *
 * *Where the fib goes* — the page deals the letters so no position is a safe
 * guess; a setting could only make it one.
 *
 * *Fact checking* — every set is checked by the service before it can print.
 * There is nothing to switch off.
 *
 * The subject list is this game's own rather than the shared retirement
 * themes: those are lifestyle moods, and a fact puzzle needs a field of
 * knowledge to draw true facts from.
 */
export const TTF_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'subject',
    label: 'Subject',
    type: 'select',
    default: 'mixed',
    options: TTF_SUBJECTS.map((subject) => ({ label: subject.label, value: subject.value })),
    helpWhen: (config, layout) => {
      const subject =
        parseTtfSubject(config.subject) === 'mixed'
          ? 'Work, inventions, home life, travel, food, nature and more, a different one for every puzzle.'
          : 'Every puzzle explores a different corner of this subject.'
      const note = ttfPrintNote({
        page: layout,
        config,
        instruction: instructionFor(config),
        font: String(config.fontFamily ?? STUDIO_DEFAULT_FONT),
      })
      return `${subject} ${note}`
    },
  },
  {
    key: 'customSubject',
    label: 'Your subject',
    type: 'text',
    default: '',
    max: AI_THEME_MAX_LENGTH,
    visibleWhen: isCustomTtfSubject,
    help: `A field of facts — for example, canals and narrowboats, or the history of the post office. Max ${AI_THEME_MAX_LENGTH} characters.`,
    warningWhen: (config) => themeIpWarning(String(config.customSubject ?? '')),
  },
  {
    key: 'level',
    label: 'Level',
    type: 'select',
    default: 'classic',
    options: TTF_LEVELS.map((level) => ({ label: level.label, value: level.value })),
    help: 'Every fact is checked before it prints, and the answer page explains each fib.',
  },
]

export function validateTtfConfig(config: StudioConfig): StudioConfigValidationError | null {
  if (!isCustomTtfSubject(config)) return null
  const typed = String(config.customSubject ?? '').trim()
  if (!typed) return { field: 'customSubject', message: 'Enter a subject for the puzzles.' }
  if (typed.length > AI_THEME_MAX_LENGTH) {
    return { field: 'customSubject', message: `Keep the subject under ${AI_THEME_MAX_LENGTH} characters.` }
  }
  return null
}
