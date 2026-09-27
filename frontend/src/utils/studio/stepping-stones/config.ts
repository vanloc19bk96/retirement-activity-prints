import type { StudioConfigField } from '@/types/studio-template.types'
import { STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import { DEFAULT_STONES_LEVEL, STONES_LEVELS, parseStonesLevel } from './content'
import { stonesPrintNote } from './layout'

/**
 * One question: how long a walk.
 *
 * What the form deliberately does not ask:
 *
 * *Which walk, which path* — every page builds a fresh path from the
 * seller's salt and the page seed, and the walk's name is dealt so a book
 * works through every one before one returns. A picker would print one
 * Rose Garden Path thirty times.
 *
 * *How many numbers* — taken away until each one left counts, as far as
 * the level's steps still finish the path, and never below the level's
 * fair share. Fewer would need a guess; more would hand the reader the
 * walk.
 *
 * *Stone size* — set by the trim, as large as it allows and never below
 * the level's floor. The help line reports it for the page size in
 * Settings.
 *
 * *A "no guessing" switch* — every path is proven to finish by logic alone
 * on its one walk; that is not something a seller should turn off.
 */
export const STONES_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'level',
    label: 'Puzzle level',
    type: 'select',
    default: DEFAULT_STONES_LEVEL,
    options: STONES_LEVELS.map((level) => ({ label: level.label, value: level.value })),
    helpWhen: (config, layout) =>
      stonesPrintNote({ page: layout, config, level: parseStonesLevel(config.level), font: String(config.fontFamily ?? STUDIO_DEFAULT_FONT) }),
  },
]
