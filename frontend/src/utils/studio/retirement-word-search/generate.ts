import type {
  StudioConfig,
  StudioFabricObject,
  StudioGenerateContext,
  StudioPageOutput,
  StudioTemplateDefinition,
} from '@/types/studio-template.types'
import type { WordEntry } from '@/utils/puzzles/word-search-core'
import { contentBox, drawHeader, insetHorizontal } from '../studio-layout'
import type { StudioTag } from '../studio-fabric-builders'
import { STUDIO_CONTENT_SAFE_INSET_X } from '@/constants/studio.constants'
import {
  WORD_SEARCH_CONFIG_SCHEMA,
  validateRetirementWordSearchConfig,
} from './config'
import {
  WORD_SEARCH_BUILD_ERROR,
  WORD_SEARCH_DEFAULT_TITLE,
  WORD_SEARCH_INSTRUCTION,
  difficultyPreset,
  filterWordPool,
  hasCustomWords,
  parseDifficulty,
  parsePrintStyle,
  parseShape,
  validatePayload,
} from './content'
import { drawWordSearchPuzzle } from './draw'
import { buildClassicWordSearch } from './place'
import { retirementWordSearchPrefetch } from './prefetch'

export {
  buildMaskedWordSearch,
  buildWordSearch,
  countPuzzleMix,
  directionsForDifficulty,
  packingBudget,
  placementMatchesWord,
  readWord,
  resolveWordSearch,
  reverseWord,
  sanitizeWordEntries,
  sanitizeWordEntry,
  sanitizeWords,
} from '@/utils/puzzles/word-search-core'
export type {
  Dir,
  Placement,
  WordEntry,
  WordSearchDifficulty,
  WordSearchPuzzle,
} from '@/utils/puzzles/word-search-core'

function resolveEntries(config: StudioConfig, ctx: StudioGenerateContext): {
  entries: WordEntry[]
  custom: boolean
} {
  const difficulty = parseDifficulty(config.difficulty)
  const printStyle = parsePrintStyle(config.printStyle)
  const preset = difficultyPreset(difficulty, printStyle)
  const custom = hasCustomWords(config.customWords)
  if (custom) {
    return {
      entries: filterWordPool(config.customWords, preset.gridSize),
      custom: true,
    }
  }
  const entries = validatePayload(ctx.remoteData, difficulty, printStyle)
  if (!entries) throw new Error(WORD_SEARCH_BUILD_ERROR)
  return { entries, custom: false }
}

function layoutPage(options: {
  config: StudioConfig
  ctx: StudioGenerateContext
  tag: StudioTag
  puzzle: ReturnType<typeof buildClassicWordSearch>
  instruction: string
  printStyle: ReturnType<typeof parsePrintStyle>
  forAnswerKey?: boolean
}): StudioFabricObject[] {
  const { config, ctx, tag, puzzle, instruction, printStyle, forAnswerKey = false } = options
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const header = drawHeader(content, config, tag, instruction)
  return [
    ...header.objects,
    ...drawWordSearchPuzzle({
      field: header.body,
      puzzle,
      font: String(config.fontFamily),
      tag,
      printStyle,
      forAnswerKey,
    }),
  ]
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const difficulty = parseDifficulty(config.difficulty)
  const printStyle = parsePrintStyle(config.printStyle)
  const shape = parseShape(config.shape)
  const { entries, custom } = resolveEntries(config, ctx)
  const puzzle = buildClassicWordSearch({
    entries,
    difficulty,
    printStyle,
    shape,
    seed: ctx.seed,
    custom,
  })
  const tag: StudioTag = {
    templateKey: 'word-search',
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }
  const instruction = config.showInstructions === false ? '' : WORD_SEARCH_INSTRUCTION
  const layout = { config, ctx, tag, puzzle, printStyle }
  return [
    {
      pageRole: 'single',
      objects: layoutPage({ ...layout, instruction }),
      answerSourceObjects: layoutPage({
        ...layout,
        instruction: '',
        forAnswerKey: true,
      }),
    },
  ]
}

export const wordSearchTemplate: StudioTemplateDefinition = {
  key: 'word-search',
  label: 'Word Search',
  category: 'word',
  description:
    'A retirement-themed word search with large-print and standard layouts, optional puzzle shapes, and an automatic answer key.',
  pageCount: 1,
  producesAnswerKey: true,
  defaultPageTitle: WORD_SEARCH_DEFAULT_TITLE,
  validateConfig: validateRetirementWordSearchConfig,
  prefetch: async (config, signal) => {
    if (hasCustomWords(config.customWords)) return undefined
    return retirementWordSearchPrefetch(config, signal)
  },
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g font-size="5.5" fill="currentColor" font-family="monospace" text-anchor="middle">
      <text x="32" y="10">T R A V E</text>
      <text x="32" y="17">R E L A X</text>
      <text x="32" y="24">G A R D N</text>
    </g>
    <g fill="none" stroke="currentColor" stroke-width="1">
      <rect x="14" y="4" width="36" height="8" rx="4"/>
    </g>
    <g font-size="4" fill="currentColor" font-family="sans-serif" text-anchor="middle">
      <text x="22" y="35">Travel</text>
      <text x="42" y="35">Relax</text>
    </g>
  </svg>`,
  configSchema: WORD_SEARCH_CONFIG_SCHEMA,
  generate,
}
