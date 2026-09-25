import type { StudioConfig, StudioConfigField } from '@/types/studio-template.types'
import { STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import { WL_LEVELS, parseWlLevel, wlInstruction } from './content'
import { wlPrintNote } from './layout'

/** Instruction text the page will actually carry, for layout measurement. */
export function instructionFor(config: StudioConfig): string {
  return config.showInstructions === false ? '' : wlInstruction()
}

/**
 * One question: how familiar the phrases should be.
 *
 * What the form deliberately does not ask:
 *
 * *A workplace area or theme* — a page that is all meetings is ten ways to say
 * "let's talk later", which is exactly the look-alike meanings that make a
 * matching puzzle unfair. Every page ranges across meetings, deadlines, sales,
 * teamwork and the rest by itself.
 *
 * *Pairs per page, type size* — both fall out of the trim and the level. A
 * seller setting them by hand gets small type or a meaning running into the
 * next. The level's help line reports what the page chose.
 *
 * *Where the answers go, extra decoy meanings* — every page gets an answer
 * page, placed by the book's own solutions setting. Decoys would add a second
 * way for a meaning to fit a phrase, which is the one thing this puzzle must
 * never have.
 */
export const WL_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'level',
    label: 'Level',
    type: 'select',
    default: 'classic',
    options: WL_LEVELS.map((level) => ({ label: level.label, value: level.value })),
    helpWhen: (config, layout) => {
      const note = wlPrintNote({
        page: layout,
        config,
        instruction: instructionFor(config),
        font: String(config.fontFamily ?? STUDIO_DEFAULT_FONT),
        level: parseWlLevel(config.level),
      })
      return `Phrases from meetings, memos, deadlines, sales and teamwork, each checked to have one clear meaning. ${note}`
    },
  },
]
