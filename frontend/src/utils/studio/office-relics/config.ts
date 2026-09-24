import type { StudioConfig, StudioConfigField } from '@/types/studio-template.types'
import { STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import { DEFAULT_OR_LEVEL, OR_LEVELS, orInstruction, orInstructionOptions, parseOrLevel } from './content'
import { orPrintNote } from './layout'

/** Instruction text a page carries, in the seller's phrasing (`OrHouseStyle.instruction`). */
export const instructionFor = (config: StudioConfig, phrasing = 0) => orInstruction(config, phrasing)

/**
 * One question: how familiar should the objects be.
 *
 * What the form deliberately does not ask:
 *
 * *Which objects, or a theme* — the page chooses from the whole catalog, never
 * repeating an object the book already shows, and spreads each page across
 * the office (a phone, a filing thing, something to calculate with…). A picker
 * would print four telephones.
 *
 * *How many pictures, how big* — both fall out of the trim. The level's help
 * line reports what the page chose.
 *
 * *Word bank on or off* — that is the level, seen from the other side. The
 * gentle level lists every answer on the page; the others leave the reader to
 * remember.
 */
export const OR_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'level',
    label: 'Level',
    type: 'select',
    default: DEFAULT_OR_LEVEL,
    options: OR_LEVELS.map((level) => ({ label: level.label, value: level.value })),
    helpWhen: (config, layout) => {
      const note = orPrintNote({
        page: layout,
        config,
        level: parseOrLevel(config.level),
        instructions: orInstructionOptions(config),
        font: String(config.fontFamily ?? STUDIO_DEFAULT_FONT),
      })
      return `Clean line drawings of typewriters, rotary phones, punch clocks and more, from the 1940s to the 1990s. ${note}`
    },
  },
]
