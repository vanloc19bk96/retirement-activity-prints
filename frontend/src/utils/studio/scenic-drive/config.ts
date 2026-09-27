import type { StudioConfigField } from '@/types/studio-template.types'
import { STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import { DEFAULT_DRIVE_LEVEL, DRIVE_LEVELS, parseDriveLevel } from './content'
import { drivePrintNote } from './layout'

/**
 * One question: how hard a grid.
 *
 * What the form deliberately does not ask:
 *
 * *Which route, which grid* — every page builds a fresh grid from the
 * seller's salt and the page seed, and the route's name is dealt so a book
 * works through every one before one returns. A picker would print one
 * Blue Ridge Parkway thirty times.
 *
 * *Run lengths and gray squares* — set by the level: Gentle grids keep
 * their runs to four squares, harder ones stretch to six, the runs that
 * make a reader think.
 *
 * *Square size* — set by the trim, as large as it allows and never below
 * the level's floor. The help line reports it for the page size in
 * Settings.
 *
 * *A "no guessing" switch* — every grid is proven to finish by logic alone
 * on its one answer; that is not something a seller should turn off.
 */
export const DRIVE_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'level',
    label: 'Puzzle level',
    type: 'select',
    default: DEFAULT_DRIVE_LEVEL,
    options: DRIVE_LEVELS.map((level) => ({ label: level.label, value: level.value })),
    helpWhen: (config, layout) => drivePrintNote({ page: layout, config, level: parseDriveLevel(config.level), font: String(config.fontFamily ?? STUDIO_DEFAULT_FONT) }),
  },
]
