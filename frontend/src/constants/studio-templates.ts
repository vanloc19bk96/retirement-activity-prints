import type {
  StudioTemplateDefinition,
  StudioConfigField,
  StudioConfig,
} from '@/types/studio-template.types'
import {
  STUDIO_COMMON_FIELDS,
  STUDIO_DEFAULT_FONT,
} from '@/constants/studio.constants'
import { STUDIO_CATEGORIES } from '@/constants/studio-categories'
import { STARTER_STUDIO_TEMPLATE_KEYS } from '@/constants/studio-plan-access'
import { sudokuTemplate } from '@/utils/studio/sudoku/generate'
import { wordSearchTemplate } from '@/utils/studio/retirement-word-search/generate'
import { crosswordTemplate } from '@/utils/studio/crossword/generate'
import { retirementAnagramTemplate } from '@/utils/studio/retirement-anagram/generate'
import { riddleScrambleTemplate } from '@/utils/studio/riddle-scramble/generate'
import { missingVowelsTemplate } from '@/utils/studio/missing-vowels/generate'
import { cryptogramTemplate } from '@/utils/studio/cryptogram/generate'
import { fallenPhraseTemplate } from '@/utils/studio/fallen-phrase/generate'
import { phraseFinderTemplate } from '@/utils/studio/phrase-finder/generate'
import { codewordTemplate } from '@/utils/studio/codeword/generate'
import { mazeTemplate } from '@/utils/studio/maze/generate'
import { hiddenMessageWordSearchTemplate } from '@/utils/studio/hidden-message-word-search/generate'
import { triviaClueWordSearchTemplate } from '@/utils/studio/trivia-clue-word-search/generate'
import { atoZWordSearchTemplate } from '@/utils/studio/a-to-z-word-search/generate'

/**
 * Card order in the Studio panel. Grouped by category in the same order as
 * `STUDIO_CATEGORIES`, so the "All" grid reads like the tabs above it.
 */
const RAW_TEMPLATES: StudioTemplateDefinition[] = [
  // Logic
  sudokuTemplate,

  // Word
  wordSearchTemplate,
  hiddenMessageWordSearchTemplate,
  triviaClueWordSearchTemplate,
  atoZWordSearchTemplate,
  crosswordTemplate,
  codewordTemplate,
  cryptogramTemplate,
  fallenPhraseTemplate,
  phraseFinderTemplate,
  retirementAnagramTemplate,
  riddleScrambleTemplate,
  missingVowelsTemplate,

  // Spatial
  mazeTemplate,
]

function withCommonFields(def: StudioTemplateDefinition): StudioTemplateDefinition {
  const commonFields = def.defaultPageTitle
    ? STUDIO_COMMON_FIELDS.map((field) =>
        field.key === 'title'
          ? {
              ...field,
              help: `Leave blank to use “${def.defaultPageTitle}”, or type your own heading.`,
            }
          : field,
      )
    : STUDIO_COMMON_FIELDS
  const schema: StudioConfigField[] = [...commonFields, ...def.configSchema]
  return { ...def, configSchema: schema }
}

export const STUDIO_TEMPLATES: StudioTemplateDefinition[] =
  RAW_TEMPLATES.map(withCommonFields)

const TEMPLATE_INDEX = new Map(STUDIO_TEMPLATES.map((t) => [t.key, t]))

export function getStudioTemplate(key: string): StudioTemplateDefinition | undefined {
  return TEMPLATE_INDEX.get(key)
}

if (import.meta.env.DEV) {
  const seen = new Set<string>()
  for (const t of RAW_TEMPLATES) {
    if (seen.has(t.key)) throw new Error(`Duplicate studio template key: ${t.key}`)
    seen.add(t.key)
  }
  // Card order must stay grouped in tab order (one contiguous run per category).
  const tabOrder = STUDIO_CATEGORIES.map((c) => c.value)
  const runs = RAW_TEMPLATES.map((t) => t.category).filter(
    (c, i, all) => c !== all[i - 1],
  )
  for (let i = 1; i < runs.length; i++) {
    if (tabOrder.indexOf(runs[i]!) <= tabOrder.indexOf(runs[i - 1]!)) {
      throw new Error(
        `RAW_TEMPLATES is not grouped in STUDIO_CATEGORIES order: "${runs[i]}" ` +
          `appears after "${runs[i - 1]}"`,
      )
    }
  }
  // Starter selection must stay valid: real keys, and no empty category tab.
  const starterCategories = new Set<string>()
  for (const key of STARTER_STUDIO_TEMPLATE_KEYS) {
    const def = RAW_TEMPLATES.find((t) => t.key === key)
    if (!def) throw new Error(`Starter template key not in registry: ${key}`)
    starterCategories.add(def.category)
  }
  for (const c of STUDIO_CATEGORIES) {
    if (c.value === 'all' || starterCategories.has(c.value)) continue
    throw new Error(`Starter plan has no template in category "${c.value}"`)
  }

  for (const t of STUDIO_TEMPLATES) {
    const keys = new Set(t.configSchema.map((f) => f.key))
    if (keys.has('includeAnswerKey') || keys.has('answerKeyForAll')) {
      throw new Error(
        `Studio template "${t.key}" must not expose includeAnswerKey / answerKeyForAll — ` +
          `solution pages are added automatically when producesAnswerKey is true`,
      )
    }
  }
}

export function buildDefaultConfig(def: StudioTemplateDefinition): StudioConfig {
  const config: StudioConfig = { fontFamily: STUDIO_DEFAULT_FONT }
  for (const field of def.configSchema) {
    config[field.key] = field.default
  }
  return config
}
