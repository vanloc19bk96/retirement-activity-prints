import type { StudioConfigField } from '@/types/studio-template.types'
import { STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import { DEFAULT_TT_LEVEL, TT_LEVELS, parseTtLevel } from './content'
import { ttPrintNote } from './layout'

/**
 * One question: how big a board.
 *
 * What the form deliberately does not ask:
 *
 * *Which line, which route* — every page lays a fresh line from the
 * seller's salt and the page seed, and the line's name is dealt so a book
 * works through every one before one returns. A picker would print one
 * Lakeside Line thirty times.
 *
 * *How many pieces to print* — the level decides: the two end pieces, and
 * just the others the reader needs. A slider would let a seller print a
 * board with two answers.
 *
 * *Square size* — set by the trim, as large as it allows and never below
 * the level's floor. The help line reports it for the page size in
 * Settings.
 *
 * *A "no guessing" switch* — every board is proven to finish by logic
 * alone on its one answer; that is not something a seller should turn off.
 */
export const TT_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'level',
    label: 'Puzzle level',
    type: 'select',
    default: DEFAULT_TT_LEVEL,
    options: TT_LEVELS.map((level) => ({ label: level.label, value: level.value })),
    helpWhen: (config, layout) =>
      ttPrintNote({ page: layout, config, level: parseTtLevel(config.level), font: String(config.fontFamily ?? STUDIO_DEFAULT_FONT) }),
  },
]
