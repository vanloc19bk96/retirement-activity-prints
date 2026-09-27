import type { StudioConfigField } from '@/types/studio-template.types'
import { STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import { DEFAULT_FENCE_LEVEL, FENCE_LEVELS, parseFenceLevel } from './content'
import { fencePrintNote } from './layout'

/**
 * One question: how big a field.
 *
 * What the form deliberately does not ask:
 *
 * *Which pasture, which fence* — every page builds a fresh field from the
 * seller's salt and the page seed, and the pasture's name is dealt so a
 * book works through every one before one returns. A picker would print
 * one Sunny Acres thirty times.
 *
 * *How many numbers* — taken away until each one left counts, as far as
 * the level's steps still finish the field. Fewer would need a guess; more
 * would hand the reader the fence.
 *
 * *Square size* — set by the trim, as large as it allows and never below
 * the level's floor. The help line reports it for the page size in
 * Settings.
 *
 * *A "no guessing" switch* — every field is proven to finish by logic alone
 * on its one fence; that is not something a seller should turn off.
 */
export const FENCE_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'level',
    label: 'Puzzle level',
    type: 'select',
    default: DEFAULT_FENCE_LEVEL,
    options: FENCE_LEVELS.map((level) => ({ label: level.label, value: level.value })),
    helpWhen: (config, layout) =>
      fencePrintNote({ page: layout, config, level: parseFenceLevel(config.level), font: String(config.fontFamily ?? STUDIO_DEFAULT_FONT) }),
  },
]
