import type { StudioConfigField } from '@/types/studio-template.types'
import { STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import { DEFAULT_HC_LEVEL, HC_LEVELS, parseHcLevel } from './content'
import { hcPrintNote } from './layout'

/**
 * One question: how big a campground.
 *
 * What the form deliberately does not ask:
 *
 * *Which campground, which grid* — every page builds a fresh grid from the
 * seller's salt and the page seed, and the campground is dealt so a book
 * walks every name before one returns. A picker would print one campground
 * thirty times.
 *
 * *Square and number size* — set by the trim, as large as it allows and
 * never below the level's floor (numbers never below 16 pt). The help line
 * reports both for the page size in Settings.
 *
 * *A "no guessing" switch* — every grid is proven to finish by logic alone
 * on its one answer; that is not something a seller should turn off.
 */
export const HC_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'level',
    label: 'Puzzle level',
    type: 'select',
    default: DEFAULT_HC_LEVEL,
    options: HC_LEVELS.map((level) => ({ label: level.label, value: level.value })),
    helpWhen: (config, layout) =>
      hcPrintNote({ page: layout, config, level: parseHcLevel(config.level), font: String(config.fontFamily ?? STUDIO_DEFAULT_FONT) }),
  },
]
