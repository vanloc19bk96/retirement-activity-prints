import type { StudioConfigField } from '@/types/studio-template.types'
import { STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import { DEFAULT_SM_LEVEL, SM_LEVELS, parseSmLevel } from './content'
import { smPrintNote } from './layout'

/**
 * One question: how hard a grid.
 *
 * What the form deliberately does not ask:
 *
 * *Which day, which grid* — every page builds a fresh grid from the
 * seller's salt and the page seed, and the day's name is dealt so a book
 * works through every one before one returns. A picker would print one
 * Sunrise at the Lake thirty times.
 *
 * *How many signs and printed squares* — set by the level: every grid keeps
 * only the clues its level needs, and both kinds are always there.
 *
 * *Square size* — set by the trim, as large as it allows and never below
 * the level's floor. The help line reports it for the page size in
 * Settings.
 *
 * *A "no guessing" switch* — every grid is proven to finish by logic alone
 * on its one answer; that is not something a seller should turn off.
 */
export const SM_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'level',
    label: 'Puzzle level',
    type: 'select',
    default: DEFAULT_SM_LEVEL,
    options: SM_LEVELS.map((level) => ({ label: level.label, value: level.value })),
    helpWhen: (config, layout) => smPrintNote({ page: layout, config, level: parseSmLevel(config.level), font: String(config.fontFamily ?? STUDIO_DEFAULT_FONT) }),
  },
]
