import type { StudioConfig, StudioConfigField } from '@/types/studio-template.types'
import { STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import { TWM_DEFAULT_MODE, TWM_INSTRUCTION, TWM_MODES, parseTwmMode, twmModeSpec } from './content'
import { TWM_SPACES, parseTwmSpace, twmPrintNote } from './layout'

/** Instruction text the first page will actually carry, for layout measurement. */
export function instructionFor(config: StudioConfig): string {
  return config.showInstructions === false ? '' : TWM_INSTRUCTION
}

/**
 * Two questions: which places, and how much room to write.
 *
 * What the form deliberately does not ask:
 *
 * *How many destinations* — a fixed list is complete (all 50 states, every
 * region), and a sampled one is a size that spans the globe without turning
 * into a gazetteer. The help line reports what the trim prints.
 *
 * *Which countries or continents* — every country list draws a share from
 * each continent, dealt fresh per list against the book and the seller's
 * recent lists, so no seller has to balance one by hand.
 *
 * *Entries per page, type size, checkbox size, line spacing* — all fall out
 * of the trim at large print. Nothing is squeezed to save a page.
 *
 * *A map* — a real map is either too small to write on or a copyrighted
 * artwork; the headings do a map's job of saying where a place is.
 */
export const TWM_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'destinations',
    label: 'Destinations',
    type: 'select',
    default: TWM_DEFAULT_MODE,
    options: TWM_MODES.map((mode) => ({ label: mode.label, value: mode.value })),
    helpWhen: (config) => twmModeSpec(parseTwmMode(config.destinations)).help,
  },
  {
    key: 'writingSpace',
    label: 'Room to write',
    type: 'select',
    default: 'standard',
    options: TWM_SPACES.map((space) => ({ label: space.label, value: space.value })),
    helpWhen: (config, layout) =>
      twmPrintNote({
        page: layout,
        config,
        instruction: instructionFor(config),
        font: String(config.fontFamily ?? STUDIO_DEFAULT_FONT),
        mode: parseTwmMode(config.destinations),
        space: parseTwmSpace(config.writingSpace),
      }),
  },
]
