import type { StudioConfigField } from '@/types/studio-template.types'
import { STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import { DEFAULT_LAMP_LEVEL, LAMP_LEVELS, parseLampLevel } from './content'
import { lampPrintNote } from './layout'

/**
 * One question: how big a house.
 *
 * What the form deliberately does not ask:
 *
 * *Which home, which walls* — every page builds a fresh house from the
 * seller's salt and the page seed, and the home's name is dealt so a book
 * works through every one before one returns. A picker would print one
 * lakeside cabin thirty times.
 *
 * *How many numbers* — rubbed out until each one left counts, as far as the
 * level's steps still finish the house. Fewer would need a guess; more
 * would hand the reader the answer.
 *
 * *Square size* — set by the trim, as large as it allows and never below
 * the level's floor. The help line reports it for the page size in
 * Settings.
 *
 * *A "no guessing" switch* — every house is proven to finish by logic alone
 * on its one answer; that is not something a seller should turn off.
 */
export const LAMP_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'level',
    label: 'Puzzle level',
    type: 'select',
    default: DEFAULT_LAMP_LEVEL,
    options: LAMP_LEVELS.map((level) => ({ label: level.label, value: level.value })),
    helpWhen: (config, layout) =>
      lampPrintNote({ page: layout, config, level: parseLampLevel(config.level), font: String(config.fontFamily ?? STUDIO_DEFAULT_FONT) }),
  },
]
