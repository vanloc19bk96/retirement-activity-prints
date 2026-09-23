import type { StudioConfig, StudioConfigField } from '@/types/studio-template.types'
import { wordWheelPrintNote } from './layout'
import {
  DEFAULT_WORD_WHEEL_LEVEL_ID,
  WORD_WHEEL_LEVEL_OPTIONS,
  parseWordWheelLevel,
  wordWheelInstruction,
} from './levels'

export { wordWheelInstruction as instructionFor }

/**
 * One question, and it is about the puzzle rather than the page.
 *
 * Almost everything a word wheel could be asked is already decided by what the
 * puzzle is. Nine letters is not a setting. Which nine they are is not one
 * either: the nine-letter answer is chosen first from a curated retirement list
 * and the wheel is made out of it, which is the only construction that cannot
 * print a page promising a long word the letters do not spell. The middle
 * letter is picked for the wheel that produces the most words, because a seller
 * choosing it by hand would be choosing how frustrating the page is without any
 * way of knowing. Wheel size, both letter sizes, how many lines there are to
 * write on and how many answers the solution prints all come from `layout.ts`,
 * which can see the trim in Settings.
 *
 * There is no theme picker, and that is a decision rather than an omission.
 * A theme would have to be filled with nine-letter words a reader recognises,
 * and few subjects hold enough of them — a "Gardening" wheel would be reaching
 * for vocabulary nobody would guess within three pages. The whole target list
 * is retirement vocabulary instead, so every page is on theme without the form
 * asking.
 *
 * What is left is one question a seller can answer without knowing any of that:
 * how hard should this page be.
 */
export const WORD_WHEEL_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'level',
    label: 'Puzzle level',
    type: 'select',
    default: DEFAULT_WORD_WHEEL_LEVEL_ID,
    options: WORD_WHEEL_LEVEL_OPTIONS,
    helpWhen: (config: StudioConfig, layout) =>
      wordWheelPrintNote(
        parseWordWheelLevel(config),
        layout,
        config,
        wordWheelInstruction(config),
      ),
  },
]
