import type { StudioConfig, StudioConfigField } from '@/types/studio-template.types'
import { STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import { RD_FOCUSES, RD_INSTRUCTION, parseRdFocus } from './content'
import { rdPrintNote } from './layout'

/** Instruction text the page will actually carry, for layout measurement. */
export function instructionFor(config: StudioConfig): string {
  return config.showInstructions === false ? '' : RD_INSTRUCTION
}

/**
 * One question: what kind of days the table leans to.
 *
 * What the form deliberately does not ask:
 *
 * *Activities, dice, rows* — six faces and two rolls are the game. Every table
 * writes its own ideas, and each side always mixes rest, gentle movement,
 * making and people, so no seller has to balance a table by hand. The mix only
 * weights the two extra kinds on each side.
 *
 * *Type size, write-in line, layout* — all fall out of the trim, at large
 * print. The help line reports what came out.
 *
 * *Cost, mobility, travel, theme* — every table keeps to low-cost, half-day
 * ideas that assume no car, big budget or great fitness. A setting for it
 * would only let a table narrow itself by accident, and a single theme (all
 * golf, all gardening) would make the 36 days repeat each other.
 */
export const RD_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'focus',
    label: 'Mix of ideas',
    type: 'select',
    default: 'balanced',
    options: RD_FOCUSES.map((focus) => ({ label: focus.label, value: focus.value })),
    helpWhen: (config, layout) => {
      const focus = RD_FOCUSES.find((f) => f.value === parseRdFocus(config.focus))!
      const note = rdPrintNote({
        page: layout,
        config,
        instruction: instructionFor(config),
        font: String(config.fontFamily ?? STUDIO_DEFAULT_FONT),
      })
      return `${focus.help} ${note} Fresh ideas every page, never repeated within your book.`
    },
  },
]
