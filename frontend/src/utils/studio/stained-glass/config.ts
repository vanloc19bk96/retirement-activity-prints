import type { StudioConfigField } from '@/types/studio-template.types'
import { DEFAULT_SG_LEVEL, DEFAULT_SG_THEME, SG_LEVELS, SG_THEMES, parseSgLevel, parseSgTheme, themeSubjects } from './content'
import { sgPrintNote } from './layout'

/**
 * Two questions: what the pictures are about, and how big the pieces are.
 *
 * What the form deliberately does not ask:
 *
 * *Which subject* — a book wants variety, and the page deals it: subjects the
 * book already shows wait their turn, and a returning subject comes back as a
 * different version in a different window. A picker would print six teacups.
 *
 * *Frame, border, background pattern, scenery* — these are the design, and
 * the design is what the page is for. Each page deals its own, suited to its
 * subject (a sun and hills outdoors, a medallion behind a teapot).
 *
 * *Line weight, piece count, margins* — fixed for print: every line is heavy
 * enough for a 300 dpi press and every piece wide enough for a pencil tip.
 * The level's help line reports roughly how many pieces the trim holds.
 */
export const SG_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'theme',
    label: 'Theme',
    type: 'select',
    default: DEFAULT_SG_THEME,
    options: SG_THEMES.map((theme) => ({ label: theme.label, value: theme.value })),
    helpWhen: (config) => {
      const theme = SG_THEMES.find((t) => t.value === parseSgTheme(config.theme))!
      const count = themeSubjects(theme.value).length
      return `${count} subjects: ${theme.examples}. Each page gets a fresh design.`
    },
  },
  {
    key: 'level',
    label: 'Piece size',
    type: 'select',
    default: DEFAULT_SG_LEVEL,
    options: SG_LEVELS.map((level) => ({ label: level.label, value: level.value })),
    helpWhen: (config, layout) => sgPrintNote({ page: layout, config, level: parseSgLevel(config.level) }),
  },
]
