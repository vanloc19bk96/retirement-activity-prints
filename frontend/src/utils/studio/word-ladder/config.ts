import type { StudioConfigField } from '@/types/studio-template.types'
import { STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import { DEFAULT_WL_LEVEL, WL_LEVELS, parseWlLevel } from './content'
import { wlPrintNote } from './layout'

/**
 * One question: how far apart the two words are.
 *
 * What the form deliberately does not ask:
 *
 * *Which words* — every ladder is written and clued by hand and proven one
 * letter at a time; a seller's own pair would have no clues and often no
 * ladder at all through everyday words.
 *
 * *Ladders per page, square and type size* — set by the trim: as many
 * ladders (up to three) as fit at large print, squares as big as the page
 * allows. The help line reports what the page chose.
 *
 * *Clues on or off* — a rung with no clue has many right answers, and an
 * answer page that disagrees with the reader's fair word is a refund.
 */
export const WL_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'level',
    label: 'Puzzle level',
    type: 'select',
    default: DEFAULT_WL_LEVEL,
    options: WL_LEVELS.map((level) => ({ label: level.label, value: level.value })),
    helpWhen: (config, layout) =>
      wlPrintNote({ page: layout, config, level: parseWlLevel(config.level), font: String(config.fontFamily ?? STUDIO_DEFAULT_FONT) }),
  },
]
