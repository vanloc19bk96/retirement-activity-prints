import type { StudioConfig, StudioConfigField } from '@/types/studio-template.types'
import { STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import { WF_FOCUSES, WF_INSTRUCTION, parseWfFocus } from './content'
import { WF_WRITING_SPACES, parseWfSpace, wfPrintNote } from './layout'

/** Instruction text the first page will actually carry, for layout measurement. */
export function instructionFor(config: StudioConfig): string {
  return config.showInstructions === false ? '' : WF_INSTRUCTION
}

/**
 * Two questions: what kind of year, and how much room to write.
 *
 * What the form deliberately does not ask:
 *
 * *Number of weeks* — it is 52 Weeks of Firsts; the year is always whole.
 *
 * *Categories* — every year draws on eighteen areas of life (food, nature,
 * making, learning, people, culture, rest, small adventures...), each for two
 * to four weeks, so no seller has to balance a year by hand. The mix only
 * weights it.
 *
 * *Weeks per page, type size, line spacing* — all fall out of the trim and
 * the writing space, at large print. The writing space's help line reports
 * what came out.
 *
 * *Start date, cost, mobility, travel* — the weeks are numbered, not dated,
 * so a reader starts whenever they like; every year stays mostly free,
 * nearby and gentle, with only a few bigger outings, and never assumes a
 * spouse, grandchildren, a house or a car.
 */
export const WF_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'focus',
    label: 'Mix of ideas',
    type: 'select',
    default: 'balanced',
    options: WF_FOCUSES.map((focus) => ({ label: focus.label, value: focus.value })),
    helpWhen: (config) => {
      const focus = WF_FOCUSES.find((f) => f.value === parseWfFocus(config.focus))!
      return `${focus.help} Fresh ideas every year, never repeated within your book.`
    },
  },
  {
    key: 'writingSpace',
    label: 'Writing space',
    type: 'select',
    default: 'comfortable',
    options: WF_WRITING_SPACES.map((space) => ({ label: space.label, value: space.value })),
    helpWhen: (config, layout) =>
      wfPrintNote({
        page: layout,
        config,
        instruction: instructionFor(config),
        font: String(config.fontFamily ?? STUDIO_DEFAULT_FONT),
        space: parseWfSpace(config.writingSpace),
      }),
  },
]
