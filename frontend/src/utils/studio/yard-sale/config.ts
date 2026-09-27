import type { StudioConfigField } from '@/types/studio-template.types'
import { STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import { DEFAULT_YS_LEVEL, YS_LEVELS, parseYsLevel } from './content'
import { ysPrintNote } from './layout'

/**
 * One question: how hard a grid.
 *
 * What the form deliberately does not ask:
 *
 * *Which sale, which grid* — every page builds a fresh grid from the
 * seller's salt and the page seed, and the sale's name is dealt so a book
 * works through every one before one returns. A picker would print one
 * Attic Treasures Sale thirty times.
 *
 * *How many squares to shade* — set by the level: every answer shades about
 * a third of the squares or a little less, the share puzzle books print.
 *
 * *Square size* — set by the trim, as large as it allows and never below
 * the level's floor. The help line reports it for the page size in
 * Settings.
 *
 * *A "no guessing" switch* — every grid is proven to finish by logic alone
 * on its one answer; that is not something a seller should turn off.
 */
export const YS_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'level',
    label: 'Puzzle level',
    type: 'select',
    default: DEFAULT_YS_LEVEL,
    options: YS_LEVELS.map((level) => ({ label: level.label, value: level.value })),
    helpWhen: (config, layout) => ysPrintNote({ page: layout, config, level: parseYsLevel(config.level), font: String(config.fontFamily ?? STUDIO_DEFAULT_FONT) }),
  },
]
