import type { StudioConfig, StudioConfigField } from '@/types/studio-template.types'
import { STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import { lgInstruction } from './content'
import { DEFAULT_LG_LEVEL, LG_LEVELS, parseLgLevel } from './levels'
import { lgPrintNote } from './layout'

/** Instruction text the page will actually carry, for layout measurement. */
export function instructionFor(config: StudioConfig): string {
  return config.showInstructions === false ? '' : lgInstruction()
}

const LEVEL_BLURBS: Record<string, string> = {
  gentle: 'Plain, direct clues — a relaxed first puzzle.',
  classic: 'A satisfying mix of clue types.',
  challenging: 'Fewer giveaways; more either/or, pairs and exact order.',
}

/**
 * One question: how hard the reasoning is.
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
]
