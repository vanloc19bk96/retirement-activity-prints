import type { StudioConfigField } from '@/types/studio-template.types'
import { STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import { CF_LEVELS, DEFAULT_CF_LEVEL, parseCfLevel } from './content'
import { cfPrintNote } from './layout'

/**
 * One question: how big a harbor.
 *
 * What the form deliberately does not ask:
 *
 * *Which harbor, which fleet* — every page hides a fresh fleet from the
 * seller's salt and the page seed, and the harbor's name is dealt so a book
 * works through every one before one returns. A picker would print one
 * Sunset Harbor thirty times.
 *
 * *How many squares to show* — the level decides: just the squares the
 * reader needs, and a few more at Gentle. A slider would let a seller print
 * a harbor with two answers.
 *
 * *Square size* — set by the trim, as large as it allows and never below
 * the level's floor. The help line reports it for the page size in
 * Settings.
 *
 * *A "no guessing" switch* — every harbor is proven to finish by logic
 * alone on its one answer; that is not something a seller should turn off.
 */
export const CF_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'level',
    label: 'Puzzle level',
    type: 'select',
    default: DEFAULT_CF_LEVEL,
    options: CF_LEVELS.map((level) => ({ label: level.label, value: level.value })),
    helpWhen: (config, layout) =>
      cfPrintNote({ page: layout, config, level: parseCfLevel(config.level), font: String(config.fontFamily ?? STUDIO_DEFAULT_FONT) }),
  },
]
