import type { StudioConfigField } from '@/types/studio-template.types'
import { STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import { DEFAULT_PQ_LEVEL, PQ_LEVELS, parsePqLevel } from './content'
import { pqPrintNote } from './layout'

/**
 * One question: how big a quilt.
 *
 * What the form deliberately does not ask:
 *
 * *Which quilt, which patches* — every page pieces a fresh quilt from the
 * seller's salt and the page seed, and the quilt's name is dealt so a book
 * works through every one before one returns. A picker would print one log
 * cabin thirty times.
 *
 * *Square size* — set by the trim, as large as it allows and never below
 * the level's floor. The help line reports it for the page size in
 * Settings.
 *
 * *Fabrics on the answer page* — grays and prints chosen so no two
 * neighbouring patches match, pale enough to read the numbers on any
 * interior.
 *
 * *A "no guessing" switch* — every quilt is proven to finish by logic alone
 * on its one answer; that is not something a seller should turn off.
 */
export const PQ_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'level',
    label: 'Puzzle level',
    type: 'select',
    default: DEFAULT_PQ_LEVEL,
    options: PQ_LEVELS.map((level) => ({ label: level.label, value: level.value })),
    helpWhen: (config, layout) =>
      pqPrintNote({ page: layout, config, level: parsePqLevel(config.level), font: String(config.fontFamily ?? STUDIO_DEFAULT_FONT) }),
  },
]
