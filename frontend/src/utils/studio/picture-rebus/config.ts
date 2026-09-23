import type { StudioConfig, StudioConfigField } from '@/types/studio-template.types'
import { STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import { pictureRebusPrintNote } from './layout'
import {
  DEFAULT_PICTURE_REBUS_LEVEL_ID,
  PICTURE_REBUS_LEVEL_OPTIONS,
  parsePictureRebusLevel,
  pictureRebusInstruction,
} from './levels'

export { pictureRebusInstruction as instructionFor }

/**
 * One question, and it is about the puzzle rather than the page.
 *
 * What this form deliberately does not ask for is worth listing, because every
 * item on it was a plausible field.
 *
 * *How many puzzles a page* — not answerable without knowing the trim, the
 * heading and the longest answer in the level. The page works it out and the
 * help line reports the number.
 *
 * *How big the pictures print* — the same, and worse: a seller who sets it too
 * large gets three puzzles on a page and no explanation.
 *
 * *Which pictures to use* — a picture is not chosen, it is entailed. The
 * pictures are whatever spells the answer, which is the only construction that
 * cannot print a puzzle its own pictures contradict.
 *
 * *A theme* — a picture rebus can only use words the icon set can draw, and
 * cutting that vocabulary into themes leaves a page reaching. The whole bank is
 * written for a retirement audience instead.
 *
 * *Whether to show hints* — that is the level, seen from the other side. A hint
 * beside a puzzle that needs one is help; beside a puzzle that does not, it is
 * the answer.
 *
 * What is left is one question anyone can answer without knowing any of that:
 * how much of a leap should the pictures ask for.
 */
export const PICTURE_REBUS_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'level',
    label: 'Puzzle level',
    type: 'select',
    default: DEFAULT_PICTURE_REBUS_LEVEL_ID,
    options: PICTURE_REBUS_LEVEL_OPTIONS,
    helpWhen: (config: StudioConfig, layout) =>
      pictureRebusPrintNote({
        level: parsePictureRebusLevel(config),
        page: layout,
        config,
        instruction: pictureRebusInstruction(config),
        font: String(config.fontFamily ?? STUDIO_DEFAULT_FONT),
      }),
  },
]
