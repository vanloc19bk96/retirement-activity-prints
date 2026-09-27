import type { StudioConfigField } from '@/types/studio-template.types'
import { STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import { DEFAULT_GN_LEVEL, GN_LEVELS, parseGnLevel } from './content'
import { gnPrintNote } from './layout'

/**
 * One question: how hard a grid.
 *
 * What the form deliberately does not ask:
 *
 * *Which night, which grid* — every page builds a fresh grid from the
 * seller's salt and the page seed, and the night's name is dealt so a book
 * works through every one before one returns. A picker would print one
 * Tuesday Canasta Club thirty times.
 *
 * *Which signs* — set by the level: Gentle adds and takes away, Classic and
 * Challenging use all four. A beginner's book and a seasoned solver's book
 * are the levels, not a row of switches.
 *
 * *Square size* — set by the trim, as large as it allows and never below
 * the level's floor. The help line reports it for the page size in
 * Settings.
 *
 * *A "no guessing" switch* — every grid is proven to finish by logic alone
 * on its one answer; that is not something a seller should turn off.
 */
export const GN_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'level',
    label: 'Puzzle level',
    type: 'select',
    default: DEFAULT_GN_LEVEL,
    options: GN_LEVELS.map((level) => ({ label: level.label, value: level.value })),
    helpWhen: (config, layout) => gnPrintNote({ page: layout, config, level: parseGnLevel(config.level), font: String(config.fontFamily ?? STUDIO_DEFAULT_FONT) }),
  },
]
