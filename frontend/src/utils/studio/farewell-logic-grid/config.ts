import type { StudioConfig, StudioConfigField } from '@/types/studio-template.types'
import { STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import { lgInstruction } from './content'
import { DEFAULT_LG_LEVEL, LG_LEVELS, parseLgLevel } from './levels'
import { lgPrintNote } from './layout'

/** Instruction text the page will actually carry, for layout measurement. */
export function instructionFor(config: StudioConfig): string {
  return config.showInstructions === false ? '' : lgInstruction()
}

/**
 * How the answer page marks its grid. Checks alone is the original look;
 * many solvers keep their own grid in X and O (or X and checks) and compare
 * square by square, so they ask for the key in the same marks.
 */
export type LgAnswerMarks = 'check' | 'check-x' | 'o-x'
export const DEFAULT_LG_ANSWER_MARKS: LgAnswerMarks = 'check'

export function parseLgAnswerMarks(value: unknown): LgAnswerMarks {
  return value === 'check-x' || value === 'o-x' ? value : DEFAULT_LG_ANSWER_MARKS
}

const LEVEL_BLURBS: Record<string, string> = {
  gentle: 'Plain, direct clues for a relaxed first puzzle.',
  classic: 'A satisfying mix of clue types.',
  challenging: 'Fewer giveaways; more either/or, pairs and exact order.',
}

/**
 * Two questions: how hard the reasoning is, and how the answer grid is marked.
 *
 * What the form deliberately does not ask:
 *
 * *People, categories, clue count* — they follow from the level, and a clue
 * count is not a difficulty: the builder keeps exactly the clues the puzzle
 * needs, no more.
 *
 * *Scene or names* — every puzzle draws its own party, people and categories,
 * spread across the book so no two feel alike. A picker would only narrow
 * that.
 *
 * *Type size, grid size, pages* — all fall out of the trim. The level's help
 * line reports what the page chose.
 */
export const LG_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'level',
    label: 'Level',
    type: 'select',
    default: DEFAULT_LG_LEVEL,
    options: LG_LEVELS.map((level) => ({ label: level.label, value: level.value })),
    helpWhen: (config, layout) => {
      const level = parseLgLevel(config.level)
      const note = lgPrintNote({
        page: layout,
        config,
        instruction: instructionFor(config),
        font: String(config.fontFamily ?? STUDIO_DEFAULT_FONT),
        level,
      })
      return `${LEVEL_BLURBS[level.value]} ${note}`
    },
  },
  {
    key: 'answerMarks',
    label: 'Answer grid marks',
    type: 'select',
    default: DEFAULT_LG_ANSWER_MARKS,
    options: [
      { label: 'Checkmarks', value: 'check' },
      { label: 'Checkmarks and X', value: 'check-x' },
      { label: 'O and X', value: 'o-x' },
    ],
    help: 'How the answer page marks its grid. With X, every square that is not a match is crossed out, so a reader can compare their grid square by square.',
  },
]
