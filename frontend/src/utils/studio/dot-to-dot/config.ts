import type { StudioConfigField } from '@/types/studio-template.types'
import { DEFAULT_DTD_LEVEL, DEFAULT_DTD_THEME, DTD_LEVELS, DTD_THEMES, dtdThemeSubjects, parseDtdLevel, parseDtdTheme } from './content'
import { dtdPrintNote } from './layout'

/**
 * Two questions: what the pictures are about, and how many dots.
 *
 * What the form deliberately does not ask:
 *
 * *Which picture* — a book wants variety, and the page deals it: subjects the
 * book already shows wait their turn, and a returning subject comes back as
 * a different shape. A picker would print six teapots.
 *
 * *Dot size, number size, spacing* — fixed for print and for older eyes:
 * numbers never below 10.5 pt, dots a clear gap apart, both set by the
 * level. The level's help line reports them and the picture's size on this
 * trim.
 *
 * *Where to start, how to number* — dot 1 is always near the top left,
 * ringed and in bold, and the numbers run clockwise round the picture.
 */
export const DTD_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'theme',
    label: 'Pictures',
    type: 'select',
    default: DEFAULT_DTD_THEME,
    options: DTD_THEMES.map((theme) => ({ label: theme.label, value: theme.value })),
    helpWhen: (config) => {
      const theme = DTD_THEMES.find((t) => t.value === parseDtdTheme(config.theme))!
      const count = dtdThemeSubjects(theme.value).length
      return `${count} subjects — ${theme.examples}. Every page gets a different picture.`
    },
  },
  {
    key: 'level',
    label: 'Dots',
    type: 'select',
    default: DEFAULT_DTD_LEVEL,
    options: DTD_LEVELS.map((level) => ({ label: level.label, value: level.value })),
    helpWhen: (config, layout) => dtdPrintNote({ page: layout, config, level: parseDtdLevel(config.level) }),
  },
]
