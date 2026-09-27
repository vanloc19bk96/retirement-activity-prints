import type { StudioConfigField } from '@/types/studio-template.types'
import { STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import { DEFAULT_NEIGHBORS_LEVEL, NEIGHBORS_LEVELS, parseNeighborsLevel } from './content'
import { neighborsPrintNote } from './layout'

/**
 * One question: how hard a town.
 *
 * What the form deliberately does not ask:
 *
 * *Which street, which town* — every page builds a fresh town from the
 * seller's salt and the page seed, and the street's name is dealt so a book
 * works through every one before one returns. A picker would print one
 * Maple Lane thirty times.
 *
 * *How many numbers* — taken away until each one left counts, as far as
 * the level's steps still finish the town, and never below the level's
 * fair share. Fewer would need a guess; more would hand the reader the
 * answer.
 *
 * *Block sizes* — set by the level: Gentle towns keep more small blocks,
 * harder ones are mostly fours and fives, the blocks that make a reader
 * think.
 *
 * *House size* — set by the trim, as large as it allows and never below the
 * level's floor. The help line reports it for the page size in Settings.
 *
 * *A "no guessing" switch* — every town is proven to finish by logic alone
 * on its one answer; that is not something a seller should turn off.
 */
export const NEIGHBORS_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'level',
    label: 'Puzzle level',
    type: 'select',
    default: DEFAULT_NEIGHBORS_LEVEL,
    options: NEIGHBORS_LEVELS.map((level) => ({ label: level.label, value: level.value })),
    helpWhen: (config, layout) =>
      neighborsPrintNote({ page: layout, config, level: parseNeighborsLevel(config.level), font: String(config.fontFamily ?? STUDIO_DEFAULT_FONT) }),
  },
]
