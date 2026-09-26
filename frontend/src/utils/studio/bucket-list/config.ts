import type { StudioConfig, StudioConfigField } from '@/types/studio-template.types'
import { STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import {
  BL_COUNTS,
  BL_DEFAULT_COUNT,
  BL_FOCUSES,
  BL_INSTRUCTION,
  parseBlCount,
  parseBlFocus,
} from './content'
import { blPrintNote } from './layout'

/** Instruction text the first page will actually carry, for layout measurement. */
export function instructionFor(config: StudioConfig): string {
  return config.showInstructions === false ? '' : BL_INSTRUCTION
}

/**
 * Two questions: how long a list, and what kind of retirement it leans to.
 *
 * What the form deliberately does not ask:
 *
 * *Themes* — the list picks its own headings from a large bank, always with
 * at least one restful, one close-to-home, one going-places, one creative and
 * one people theme, so no seller has to design a balanced list by hand. The
 * mix only weights it.
 *
 * *Ideas per page, type size, pages, checkbox size* — all fall out of the
 * trim, at large print. The count's help line reports what came out.
 *
 * *Cost, mobility, travel budget* — every list mixes free and splurge, home
 * and away, solo and social, restful and adventurous, and never assumes a
 * spouse, grandchildren, a house or a car. A setting for it would only let a
 * list narrow itself by accident.
 */
export const BL_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'ideaCount',
    label: 'Number of ideas',
    type: 'select',
    default: BL_DEFAULT_COUNT,
    options: BL_COUNTS.map((count) => ({ label: `${count} ideas`, value: count })),
    helpWhen: (config, layout) =>
      blPrintNote({
        page: layout,
        config,
        instruction: instructionFor(config),
        font: String(config.fontFamily ?? STUDIO_DEFAULT_FONT),
        count: parseBlCount(config.ideaCount),
      }),
  },
  {
    key: 'focus',
    label: 'Mix of ideas',
    type: 'select',
    default: 'balanced',
    options: BL_FOCUSES.map((focus) => ({ label: focus.label, value: focus.value })),
    helpWhen: (config) => {
      const focus = BL_FOCUSES.find((f) => f.value === parseBlFocus(config.focus))!
      return `${focus.help} Fresh ideas every list, never repeated within your book.`
    },
  },
]
