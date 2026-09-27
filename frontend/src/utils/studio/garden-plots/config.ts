import type { StudioConfigField } from '@/types/studio-template.types'
import { STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import { DEFAULT_GP_LEVEL, GP_LEVELS, parseGpLevel } from './content'
import { gpPrintNote } from './layout'

/**
 * One question: how big a garden.
 *
 * What the form deliberately does not ask:
 *
 * *Which garden, which beds* — every page grows a fresh garden from the
 * seller's salt and the page seed, and the garden's name is dealt so a book
 * works through every one before one returns. A picker would print one
 * rose garden thirty times.
 *
 * *Square size* — set by the trim, as large as it allows and never below
 * the level's floor. The help line reports it for the page size in
 * Settings.
 *
 * *Tints on or off* — the heavy walls carry the puzzle and the grays only
 * help the eye, pale enough for pencil marks and any interior.
 *
 * *A "no guessing" switch* — every garden is proven to finish by logic
 * alone on its one answer; that is not something a seller should turn off.
 */
export const GP_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'level',
    label: 'Puzzle level',
    type: 'select',
    default: DEFAULT_GP_LEVEL,
    options: GP_LEVELS.map((level) => ({ label: level.label, value: level.value })),
    helpWhen: (config, layout) =>
      gpPrintNote({ page: layout, config, level: parseGpLevel(config.level), font: String(config.fontFamily ?? STUDIO_DEFAULT_FONT) }),
  },
]
