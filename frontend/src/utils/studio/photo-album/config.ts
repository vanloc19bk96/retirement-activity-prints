import type { StudioConfigField } from '@/types/studio-template.types'
import { STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import { DEFAULT_PA_LEVEL, PA_LEVELS, parsePaLevel } from './content'
import { paPrintNote } from './layout'

/**
 * One question: how hard a grid.
 *
 * What the form deliberately does not ask:
 *
 * *Which snapshot* — pictures are dealt so a book shows every one of its
 * level before one returns (the other way round when it can). A picker
 * would print the same teddy bear thirty times.
 *
 * *How many numbers* — set by the level: Gentle keeps plenty to start from,
 * Classic fewer, Challenging only the ones it cannot do without. Every
 * grid's numbers are chosen fresh from the seller's salt and the page seed.
 *
 * *Square size* — set by the trim, as large as it allows and never below
 * the level's floor. The help line reports it for the page size in
 * Settings.
 *
 * *A "no guessing" switch* — every grid is proven to finish by logic alone
 * on its one picture; that is not something a seller should turn off.
 */
export const PA_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'level',
    label: 'Puzzle level',
    type: 'select',
    default: DEFAULT_PA_LEVEL,
    options: PA_LEVELS.map((level) => ({ label: level.label, value: level.value })),
    helpWhen: (config, layout) => paPrintNote({ page: layout, config, level: parsePaLevel(config.level), font: String(config.fontFamily ?? STUDIO_DEFAULT_FONT) }),
  },
]
