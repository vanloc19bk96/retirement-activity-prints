import type { StudioConfig, StudioConfigField } from '@/types/studio-template.types'
import { STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import { PC_LEVELS, pcInstruction } from './content'
import { pcPrintNote } from './layout'

/** Instruction text the page will actually carry, for layout measurement. */
export function instructionFor(config: StudioConfig): string {
  return config.showInstructions === false ? '' : pcInstruction()
}

/**
 * One question: how close together the four prices sit.
 *
 * What the form deliberately does not ask:
 *
 * *Country, currency, units* — the book is built on U.S. prices in U.S.
 * dollars, from published national figures. A picker would invite a page that
 * mixes markets, and there is no second market whose history is as well kept.
 *
 * *Years or items* — every page walks across 1950 to 2000 on its own, a
 * different item for every question. A decade picker would leave the 1950s
 * with three things to ask about (stamps, gas, the movies), which is one
 * question told five times.
 *
 * *Questions per page, type size* — both fall out of the trim. The level's help
 * line reports what the page chose.
 */
export const PC_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'level',
    label: 'Level',
    type: 'select',
    default: 'gentle',
    options: PC_LEVELS.map((level) => ({ label: level.label, value: level.value })),
    helpWhen: (config, layout) => {
      const note = pcPrintNote({
        page: layout,
        config,
        instruction: instructionFor(config),
        font: String(config.fontFamily ?? STUDIO_DEFAULT_FONT),
      })
      return `Real U.S. prices from 1950 to 2000 — groceries, gas, stamps and movie tickets. ${note}`
    },
  },
]
