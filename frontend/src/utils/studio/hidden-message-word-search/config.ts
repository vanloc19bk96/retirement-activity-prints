import type {
  StudioConfig,
  StudioConfigField,
  StudioConfigValidationError,
} from '@/types/studio-template.types'
import {
  AI_THEME_MAX_LENGTH,
  RETIREMENT_THEME_MIXED,
  isCustomRetirementTheme,
  parseRetirementThemeChoice,
  retirementThemeSelectOptions,
} from '../_shared/retirement-theme-config'
import { themeIpWarning } from '../retirement-word-search/content-quality'
import {
  CUSTOM_MESSAGE_MAX_LENGTH,
  letterToken,
  parseCustomMessage,
  resolveTypedMessage,
} from './content'
import { hiddenMessagePrintNote } from './layout'
import {
  DEFAULT_HIDDEN_MESSAGE_LEVEL_ID,
  HIDDEN_MESSAGE_LEVEL_OPTIONS,
  hiddenMessageInstruction,
  parseHiddenMessageLevel,
} from './levels'

export { hiddenMessageInstruction as instructionFor }

/**
 * Three questions, and the third is optional.
 *
 * What the form no longer asks for: where the words come from, a category
 * behind the theme list, a difficulty, a print style, and a three-way mode
 * switch whose only job was to reveal one of the other fields. Print style is
 * gone because every page is large print. Grid size, word count, letter size
 * and the length of the word bank were never questions a seller could answer
 * anyway — they came from a table that could not see the trim, and they now
 * come from `layout.ts`, which can.
 *
 * "Your own message" earns its place by being the reason this game exists
 * rather than the plain word search: a page whose leftover letters spell the
 * retiree's own name is the one page of the book that gets kept. It is one
 * optional text box instead of the mode switch plus the field it used to
 * reveal, and left blank it simply means the AI writes the saying.
 *
 * The level's help line reports what those decisions produced on the page size
 * currently set in Settings, so nothing the form decided stays hidden.
 */
export const HIDDEN_MESSAGE_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'theme',
    label: 'Theme',
    type: 'select',
    default: RETIREMENT_THEME_MIXED,
    options: retirementThemeSelectOptions(),
    helpWhen: (config) =>
      parseRetirementThemeChoice(config) === RETIREMENT_THEME_MIXED
        ? 'A different retirement theme each page — the right pick for a whole book.'
        : 'Fresh words and a fresh saying are written for this theme every time.',
  },
  {
    key: 'customTheme',
    label: 'Your theme',
    type: 'text',
    default: '',
    max: AI_THEME_MAX_LENGTH,
    placeholder: 'e.g. Weekends in the garden',
    visibleWhen: isCustomRetirementTheme,
    help: `What the words and the saying should be about. Max ${AI_THEME_MAX_LENGTH} characters.`,
    warningWhen: (config) => themeIpWarning(String(config.customTheme ?? '')),
  },
  {
    key: 'level',
    label: 'Puzzle level',
    type: 'select',
    default: DEFAULT_HIDDEN_MESSAGE_LEVEL_ID,
    options: HIDDEN_MESSAGE_LEVEL_OPTIONS,
    helpWhen: (config, layout) =>
      hiddenMessagePrintNote(
        parseHiddenMessageLevel(config),
        layout,
        config,
        hiddenMessageInstruction(config),
      ),
  },
  {
    key: 'customMessage',
    label: 'Your own message',
    type: 'text',
    default: '',
    max: CUSTOM_MESSAGE_MAX_LENGTH,
    placeholder: 'e.g. Happy retirement Margaret',
    helpWhen: (config) => {
      const level = parseHiddenMessageLevel(config)
      const band = `${level.minMessageLetters}–${level.maxMessageLetters} letters`
      if (!resolveTypedMessage(config)) {
        return `Leave blank and a fresh saying is written for each page. Or hide your own — ${band}, not counting spaces.`
      }
      // A book run repeats one typed message on every page. Say so once, here,
      // rather than letting a seller find out at proof stage.
      return `Hidden on every page this game makes — best for a single keepsake page. ${band}, not counting spaces.`
    },
  },
]

export function validateHiddenMessageConfig(
  config: StudioConfig,
): StudioConfigValidationError | null {
  if (isCustomRetirementTheme(config)) {
    const typed = String(config.customTheme ?? '').trim()
    if (!typed) {
      return { field: 'customTheme', message: 'Enter a theme for the words and saying.' }
    }
    if (typed.length > AI_THEME_MAX_LENGTH) {
      return {
        field: 'customTheme',
        message: `Keep the theme under ${AI_THEME_MAX_LENGTH} characters.`,
      }
    }
  }

  const typedMessage = resolveTypedMessage(config)
  if (!typedMessage) return null

  const level = parseHiddenMessageLevel(config)
  if (typedMessage.length > CUSTOM_MESSAGE_MAX_LENGTH) {
    return {
      field: 'customMessage',
      message: `Keep the message under ${CUSTOM_MESSAGE_MAX_LENGTH} characters.`,
    }
  }
  if (!parseCustomMessage(typedMessage, level)) {
    const letters = letterToken(typedMessage).length
    return {
      field: 'customMessage',
      message:
        `This message has ${letters} letters. At this level it needs ` +
        `${level.minMessageLetters}–${level.maxMessageLetters}, not counting spaces or punctuation.`,
    }
  }
  return null
}
