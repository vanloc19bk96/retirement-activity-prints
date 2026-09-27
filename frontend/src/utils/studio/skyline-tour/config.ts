import type { StudioConfigField } from '@/types/studio-template.types'
import { STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import { DEFAULT_SKY_LEVEL, SKY_LEVELS, parseSkyLevel } from './content'
import { skyPrintNote } from './layout'

/**
 * One question: how big a city.
 *
 * What the form deliberately does not ask:
 *
 * *Which skyline, which city* — every page builds a fresh city from the
 * seller's salt and the page seed, and the skyline's name is dealt so a
 * book works through every one before one returns. A picker would print
 * one Chicago lakefront thirty times.
 *
 * *How many clues, how many given plots* — clues are rubbed out until each
 * one left counts, and plots are handed over only where the level's steps
 * would otherwise get stuck. Fewer would need a guess; more would hand the
 * reader the answer.
 *
 * *Plot size* — set by the trim, as large as it allows and never below the
 * level's floor. The help line reports it for the page size in Settings.
 *
 * *A "no guessing" switch* — every city is proven to finish by logic alone
 * on its one answer; that is not something a seller should turn off.
 */
export const SKY_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'level',
    label: 'Puzzle level',
    type: 'select',
    default: DEFAULT_SKY_LEVEL,
    options: SKY_LEVELS.map((level) => ({ label: level.label, value: level.value })),
    helpWhen: (config, layout) =>
      skyPrintNote({ page: layout, config, level: parseSkyLevel(config.level), font: String(config.fontFamily ?? STUDIO_DEFAULT_FONT) }),
  },
]
