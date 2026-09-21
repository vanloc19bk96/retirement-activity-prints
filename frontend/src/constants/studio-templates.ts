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
import { gridCopyTemplate } from '@/utils/studio/grid-copy/generate'
import { symbolHuntTemplate } from '@/utils/studio/symbol-hunt/generate'
import { symbolDigitCodingTemplate } from '@/utils/studio/symbol-digit-coding/generate'
import { trailMakingTemplate } from '@/utils/studio/trail-making/generate'
import { stroopSheetTemplate } from '@/utils/studio/stroop-sheet/generate'
import { countingStreamsTemplate } from '@/utils/studio/counting-streams/generate'
import { dualTaskGridTemplate } from '@/utils/studio/dual-task-grid/generate'
import { findThePairTemplate } from '@/utils/studio/find-the-pair/generate'
import { mentalMathLadderTemplate } from '@/utils/studio/mental-math-ladder/generate'
import { cardSumsTemplate } from '@/utils/studio/card-sums/generate'
import { nextCardTemplate } from '@/utils/studio/next-card/generate'
import { sudokuTemplate } from '@/utils/studio/sudoku/generate'
import { kakuroTemplate } from '@/utils/studio/kakuro/generate'
import { futoshikiTemplate } from '@/utils/studio/futoshiki/generate'
import { kenkenTemplate } from '@/utils/studio/kenken/generate'
import { nonogramTemplate } from '@/utils/studio/nonogram/generate'
import { hitoriTemplate } from '@/utils/studio/hitori/generate'
import { shikakuTemplate } from '@/utils/studio/shikaku/generate'
import { patternContinuationTemplate } from '@/utils/studio/pattern-continuation/generate'
import { magicSquareTemplate } from '@/utils/studio/magic-square/generate'
import { numberSnakeTemplate } from '@/utils/studio/number-snake/generate'
import { wordSearchTemplate } from '@/utils/studio/retirement-word-search/generate'
import { crosswordTemplate } from '@/utils/studio/crossword/generate'
import { categoryFluencyTemplate } from '@/utils/studio/category-fluency/generate'
import { firstLetterRecallTemplate } from '@/utils/studio/first-letter-recall/generate'
import { anagramSheetTemplate } from '@/utils/studio/anagram-sheet/generate'
import { retirementAnagramTemplate } from '@/utils/studio/retirement-anagram/generate'
import { missingVowelsTemplate } from '@/utils/studio/missing-vowels/generate'
import { wordLadderTemplate } from '@/utils/studio/word-ladder/generate'
import { wordFitTemplate } from '@/utils/studio/word-fit/generate'
import { cryptogramTemplate } from '@/utils/studio/cryptogram/generate'
import { shapeRotationMatchTemplate } from '@/utils/studio/shape-rotation-match/generate'
import { matrixReasoningTemplate } from '@/utils/studio/matrix-reasoning/generate'
import { mirrorDrawTemplate } from '@/utils/studio/mirror-draw/generate'
import { paperFoldingTemplate } from '@/utils/studio/paper-folding/generate'
import { mazeTemplate } from '@/utils/studio/maze/generate'
import { followTheRouteTemplate } from '@/utils/studio/follow-the-route/generate'
import { decadeTriviaTemplate } from '@/utils/studio/decade-trivia/generate'
import { lifeTimelineTemplate } from '@/utils/studio/life-timeline/generate'
import { memoryJournalPromptTemplate } from '@/utils/studio/memory-journal-prompt/generate'
import { familyNamesTemplate } from '@/utils/studio/family-names/generate'
import { titleCompleteTemplate } from '@/utils/studio/title-complete/generate'
import { spacedRepetitionLogTemplate } from '@/utils/studio/spaced-repetition-log/generate'
import { brainTrainingTrackerTemplate } from '@/utils/studio/brain-training-tracker/generate'

/**
 * Card order in the Studio panel. Grouped by category in the same order as
 * `STUDIO_CATEGORIES`, so the "All" grid reads like the tabs above it.
 */
const RAW_TEMPLATES: StudioTemplateDefinition[] = [
  // Focus
  symbolHuntTemplate,
  countingStreamsTemplate,
  symbolDigitCodingTemplate,
  trailMakingTemplate,
  stroopSheetTemplate,
  dualTaskGridTemplate,
  findThePairTemplate,

  // Logic
  sudokuTemplate,
  kakuroTemplate,
  kenkenTemplate,
  futoshikiTemplate,
  nonogramTemplate,
  hitoriTemplate,
  shikakuTemplate,
  numberSnakeTemplate,
  magicSquareTemplate,
  patternContinuationTemplate,
  matrixReasoningTemplate,
  mentalMathLadderTemplate,
  cardSumsTemplate,
  nextCardTemplate,

  // Word
  wordSearchTemplate,
  crosswordTemplate,
  cryptogramTemplate,
  retirementAnagramTemplate,
  anagramSheetTemplate,
  missingVowelsTemplate,
  categoryFluencyTemplate,
  firstLetterRecallTemplate,
  wordLadderTemplate,
  wordFitTemplate,

  // Spatial
  mazeTemplate,
  followTheRouteTemplate,
  mirrorDrawTemplate,
  paperFoldingTemplate,
  shapeRotationMatchTemplate,
  gridCopyTemplate,

  // Reminiscence
  decadeTriviaTemplate,
  titleCompleteTemplate,
  familyNamesTemplate,
  lifeTimelineTemplate,
  memoryJournalPromptTemplate,

  // Trackers
  spacedRepetitionLogTemplate,
  brainTrainingTrackerTemplate,
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
