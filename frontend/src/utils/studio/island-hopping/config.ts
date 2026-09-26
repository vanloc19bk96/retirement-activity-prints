import type { StudioConfigField } from '@/types/studio-template.types'
import { STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import { DEFAULT_IH_LEVEL, IH_LEVELS, parseIhLevel } from './content'
import { ihPrintNote } from './layout'

/**
 * One question: how big a sea.
 *
 * What the form deliberately does not ask:
 *
 * *Which island chain, which chart* — every page builds a fresh chart from
 * the seller's salt and the page seed, and the chain is dealt so a book
 * sails to every one before one returns. A picker would print one chain
 * thirty times.
 *
 * *Island and number size* — set by the trim, as large as it allows and
 * never below the level's floor (numbers never below 16 pt). The help line
 * reports both for the page size in Settings.
 *
 * *A "no guessing" switch* — every chart is proven to finish by logic alone
 * on its one answer; that is not something a seller should turn off.
 */
export const IH_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'level',
    label: 'Puzzle level',
    type: 'select',
    default: DEFAULT_IH_LEVEL,
    options: IH_LEVELS.map((level) => ({ label: level.label, value: level.value })),
    helpWhen: (config, layout) =>
      ihPrintNote({ page: layout, config, level: parseIhLevel(config.level), font: String(config.fontFamily ?? STUDIO_DEFAULT_FONT) }),
  },
]
