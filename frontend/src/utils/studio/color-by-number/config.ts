import type { StudioConfigField } from '@/types/studio-template.types'
import {
  CBN_KEY_STYLES,
  CBN_LEVELS,
  CBN_THEMES,
  DEFAULT_CBN_KEY_STYLE,
  DEFAULT_CBN_LEVEL,
  DEFAULT_CBN_THEME,
  cbnThemeSubjects,
  parseCbnKeyStyle,
  parseCbnLevel,
  parseCbnTheme,
} from './content'
import { cbnPrintNote } from './layout'

/**
 * Three questions: what the scenes are about, how full they are, and how the
 * book is printed.
 *
 * What the form deliberately does not ask:
 *
 * *Which scene, which colors* — a book wants variety, and the page deals it:
 * subjects the book already shows wait their turn, a returning subject comes
 * back as a different drawing in a different scene, and the moods (a summer
 * day, golden hour, a cozy room) rotate. A picker would print six teacups in
 * the same blue.
 *
 * *How many colors* — always six to eight: enough for a satisfying picture,
 * few enough to find in any pencil set. The page settles the count itself.
 *
 * *Number size, line weight, margins* — fixed for print and for older eyes:
 * numbers never print below 9 pt, every space holds its number with clear
 * paper round it, every line is heavy enough for a 300 dpi press. The
 * level's help line reports the number size and the scene's size on this
 * trim.
 */
export const CBN_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'theme',
    label: 'Scenes',
    type: 'select',
    default: DEFAULT_CBN_THEME,
    options: CBN_THEMES.map((theme) => ({ label: theme.label, value: theme.value })),
    helpWhen: (config) => {
      const theme = CBN_THEMES.find((t) => t.value === parseCbnTheme(config.theme))!
      const count = cbnThemeSubjects(theme.value).length
      return `${count} subjects — ${theme.examples}. Every page gets its own scene.`
    },
  },
  {
    key: 'level',
    label: 'Detail',
    type: 'select',
    default: DEFAULT_CBN_LEVEL,
    options: CBN_LEVELS.map((level) => ({ label: level.label, value: level.value })),
    helpWhen: (config, layout) =>
      cbnPrintNote({ page: layout, config, level: parseCbnLevel(config.level), keyStyle: parseCbnKeyStyle(config.keyStyle) }),
  },
  {
    key: 'keyStyle',
    label: 'Color key',
    type: 'select',
    default: DEFAULT_CBN_KEY_STYLE,
    options: CBN_KEY_STYLES.map((style) => ({ label: style.label, value: style.value })),
    helpWhen: (config) => CBN_KEY_STYLES.find((s) => s.value === parseCbnKeyStyle(config.keyStyle))!.help,
  },
]
