import type { StudioConfigField } from '@/types/studio-template.types'
import { DEFAULT_PL_LEVEL, PL_LEVELS, parsePlLevel } from './content'
import { plFitWarning, plPrintNote } from './layout'

/**
 * One question: how big a grid.
 *
 * What the form deliberately does not ask:
 *
 * *Which picture* — a book wants variety, and the page deals it: pictures
 * the book already shows wait their turn, and one that returns comes back
 * the other way round. A picker would print six teacups.
 *
 * *Square size, number size* — set by the trim, as large as it allows and
 * never below the level's floor (numbers never below 12 pt). The help line
 * reports both for the page size in Settings.
 *
 * *A "no guessing" switch* — every picture is proven to solve one line at a
 * time; that is not something a seller should be able to turn off.
 */
export const PL_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'level',
    label: 'Puzzle level',
    type: 'select',
    default: DEFAULT_PL_LEVEL,
    options: PL_LEVELS.map((level) => ({ label: level.label, value: level.value })),
    helpWhen: (config, layout) => plPrintNote({ page: layout, config, level: parsePlLevel(config.level) }),
    warningWhen: (config, layout) => plFitWarning({ page: layout, config, level: parsePlLevel(config.level) }),
  },
]
