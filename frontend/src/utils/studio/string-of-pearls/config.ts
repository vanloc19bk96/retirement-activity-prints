import type { StudioConfigField } from '@/types/studio-template.types'
import { STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import { DEFAULT_PEARL_LEVEL, PEARL_LEVELS, parsePearlLevel } from './content'
import { pearlPrintNote } from './layout'

/**
 * One question: how big a board.
 *
 * What the form deliberately does not ask:
 *
 * *Which necklace, which loop* — every page builds a fresh board from the
 * seller's salt and the page seed, and the necklace's name is dealt so a
 * book works through every one before one returns. A picker would print one
 * golden anniversary thirty times.
 *
 * *How many pearls* — taken away until each one left counts, as far as the
 * level's steps still finish the board. Fewer would need a guess; more
 * would hand the reader the loop.
 *
 * *Square size* — set by the trim, as large as it allows and never below
 * the level's floor. The help line reports it for the page size in
 * Settings.
 *
 * *A "no guessing" switch* — every board is proven to finish by logic alone
 * on its one necklace; that is not something a seller should turn off.
 */
export const PEARL_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'level',
    label: 'Puzzle level',
    type: 'select',
    default: DEFAULT_PEARL_LEVEL,
    options: PEARL_LEVELS.map((level) => ({ label: level.label, value: level.value })),
    helpWhen: (config, layout) =>
      pearlPrintNote({ page: layout, config, level: parsePearlLevel(config.level), font: String(config.fontFamily ?? STUDIO_DEFAULT_FONT) }),
  },
]
