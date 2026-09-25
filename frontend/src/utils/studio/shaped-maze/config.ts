import type { StudioConfigField } from '@/types/studio-template.types'
import {
  DEFAULT_SM_LEVEL_ID,
  DEFAULT_SM_THEME,
  SM_LEVEL_OPTIONS,
  SM_THEMES,
  parseSmLevel,
  parseSmTheme,
  smThemeShapes,
} from './content'
import { smPrintNote } from './layout'

/**
 * Two questions: what the shapes are about, and how hard the walk is.
 *
 * What the form deliberately does not ask:
 *
 * *Which shape, which Start and Finish* — a book wants variety, and the page
 * deals it: shapes the book already holds wait their turn, a returning shape
 * comes back as a different drawing with a different journey, and every
 * workday gets its turn as a Start. A picker would print twelve teapots from
 * the Office to Tea Time.
 *
 * *Grid size, path width, wall weight* — derived from the level and the page
 * size in Settings, as in the regular Maze. The corridor never drops below a
 * quarter inch, whatever the shape or trim; a harder maze is a longer walk,
 * never a narrower one. The level's help line reports the path widths.
 *
 * *Whether to label Start and Finish* — not a preference: a maze without them
 * has no way in.
 */
export const SM_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'theme',
    label: 'Shapes',
    type: 'select',
    default: DEFAULT_SM_THEME,
    options: SM_THEMES.map((theme) => ({ label: theme.label, value: theme.value })),
    helpWhen: (config) => {
      const theme = SM_THEMES.find((t) => t.value === parseSmTheme(config.theme))!
      const count = smThemeShapes(theme.value).length
      return `${count} shapes — ${theme.examples}. Each journey starts at work and ends somewhere better.`
    },
  },
  {
    key: 'level',
    label: 'Puzzle level',
    type: 'select',
    default: DEFAULT_SM_LEVEL_ID,
    options: SM_LEVEL_OPTIONS,
    helpWhen: (config, layout) => smPrintNote({ level: parseSmLevel(config), page: layout, config }),
  },
]
