import type { StudioConfigField } from '@/types/studio-template.types'
import { STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import { DEFAULT_TY_LEVEL, TY_LEVELS, parseTyLevel } from './content'
import { tyPrintNote } from './layout'

/**
 * One question: how big a tangle.
 *
 * What the form deliberately does not ask:
 *
 * *Which project, which grid* — every page builds a fresh grid from the
 * seller's salt and the page seed, and the project is dealt so a book works
 * through every one before one returns. A picker would print one scarf
 * thirty times.
 *
 * *Square and letter size* — set by the trim, as large as it allows and
 * never below the level's floor (letters never below 16 pt). The help line
 * reports both for the page size in Settings.
 *
 * *A "no guessing" switch* — every grid is proven to finish by logic alone
 * on its one answer; that is not something a seller should turn off.
 */
export const TY_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'level',
    label: 'Puzzle level',
    type: 'select',
    default: DEFAULT_TY_LEVEL,
    options: TY_LEVELS.map((level) => ({ label: level.label, value: level.value })),
    helpWhen: (config, layout) =>
      tyPrintNote({ page: layout, config, level: parseTyLevel(config.level), font: String(config.fontFamily ?? STUDIO_DEFAULT_FONT) }),
  },
]
