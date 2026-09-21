import type {
  StudioTemplateDefinition,
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
  StudioFabricObject,
} from '@/types/studio-template.types'
import type { ThemeWordsResponse } from '@/types/studio-theme-words.types'
import {
  createRng,
  packingBudget,
  resolveWordSearch,
  sanitizeWordEntries,
  type WordEntry,
} from '@/utils/puzzles/word-search-core'
import { contentBox, insetHorizontal, drawHeader } from '../studio-layout'
import type { StudioTag } from '../studio-fabric-builders'
import { STUDIO_CONTENT_SAFE_INSET_X } from '@/constants/studio.constants'
import {
  AI_THEME_MAX_LENGTH,
  CUSTOM_MIN_WORD_LETTERS,
  MAX_GRID,
  MAX_WORDS,
  MIN_GRID,
  MIN_WORD_LETTERS,
  MIN_WORDS,
  buildInstruction,
  categorySelectOptions,
  parseGridSize,
  parsePrintStyle,
  parseRetirementDifficulty,
  parseSource,
  parseWordCount,
  parseWriteOwnTheme,
  retirementMaxLetters,
  themeSelectOptions,
  toEngineDifficulty,
  validateRetirementWordSearchConfig,
} from './config'
import { drawWordSearchPuzzle } from './draw'
import { runWordSearchKdpPreflight } from './kdp-preflight'
import {
  retirementWordSearchPrefetch,
  WORD_SEARCH_AI_EMPTY_MESSAGE,
} from './prefetch'
import { parseRetirementCategory } from './retirement-themes'
import { filterSafeWordLines } from './content-quality'

export {
  buildWordSearch,
  sanitizeWords,
  sanitizeWordEntries,
  sanitizeWordEntry,
  resolveWordSearch,
  packingBudget,
  readWord,
  placementMatchesWord,
  countPuzzleMix,
  directionsForDifficulty,
  reverseWord,
} from '@/utils/puzzles/word-search-core'
export type {
  Placement,
  Dir,
  WordEntry,
  WordSearchPuzzle,
  WordSearchDifficulty,
} from '@/utils/puzzles/word-search-core'

function pickEntries(options: {
  config: StudioConfig
  ctx: StudioGenerateContext
  gridSize: number
  maxLetters: number
  wordCount: number
}): WordEntry[] {
  const { config, ctx, gridSize, maxLetters, wordCount } = options
  const source = parseSource(config.source)

  if (source === 'custom') {
    return sanitizeWordEntries(config.words ?? config.customWords, {
      gridSize,
      minLetters: CUSTOM_MIN_WORD_LETTERS,
      maxLetters,
    }).slice(0, packingBudget(gridSize))
  }

  const remote = ctx.remoteData as ThemeWordsResponse | undefined
  const safe = filterSafeWordLines(remote?.items ?? [])
  return sanitizeWordEntries(safe, {
    gridSize,
    minLetters: MIN_WORD_LETTERS,
    maxLetters,
  }).slice(0, wordCount)
}

function layoutPage(options: {
  config: StudioConfig
  ctx: StudioGenerateContext
  tag: StudioTag
  puzzle: ReturnType<typeof resolveWordSearch>
  instruction: string
  forAnswerKey?: boolean
}): StudioFabricObject[] {
  const { config, ctx, tag, puzzle, instruction, forAnswerKey = false } = options
  const font = String(config.fontFamily)
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const header = drawHeader(content, config, tag, instruction)
  return [
    ...header.objects,
    ...drawWordSearchPuzzle({
      field: header.body,
      puzzle,
      font,
      tag,
      forAnswerKey,
    }),
  ]
}

function generatePages(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const difficulty = parseRetirementDifficulty(config.difficulty)
  const printStyle = parsePrintStyle(config.printStyle)
  const gridSize = parseGridSize(config.gridSize, difficulty, printStyle)
  const maxLetters = Math.min(gridSize, retirementMaxLetters(difficulty, printStyle))
  const wordCount = parseWordCount(config.wordCount, difficulty, gridSize)
  const rng = createRng(ctx.seed)
  const entries = pickEntries({ config, ctx, gridSize, maxLetters, wordCount })

  if (entries.length === 0) {
    if (parseSource(config.source) === 'ai') {
      throw new Error(WORD_SEARCH_AI_EMPTY_MESSAGE)
    }
    throw new Error(
      `Need at least 3 words that fit the ${gridSize}×${gridSize} grid (${MIN_WORD_LETTERS}–${maxLetters} letters, A–Z).`,
    )
  }

  const displaysByToken = new Map(entries.map((e) => [e.token, e.display]))
  const puzzle = resolveWordSearch({
    words: entries.map((e) => e.token),
    gridSize,
    difficulty: toEngineDifficulty(difficulty),
    rng,
    displaysByToken,
  })

  const preflight = runWordSearchKdpPreflight({ puzzle, gridSize, printStyle })
  if (!preflight.ok) {
    throw new Error(preflight.errors[0] ?? 'Word search failed print preflight.')
  }

  const tag: StudioTag = {
    templateKey: 'word-search',
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }

  const showInstructions = config.showInstructions !== false
  const instruction = showInstructions ? buildInstruction(difficulty) : ''
  const layout = { config, ctx, tag, puzzle }
  const objects = layoutPage({ ...layout, instruction })
  const answerSourceObjects = layoutPage({
    ...layout,
    instruction: '',
    forAnswerKey: true,
  })

  return [{ pageRole: 'single', objects, answerSourceObjects }]
}

export const wordSearchTemplate: StudioTemplateDefinition = {
  key: 'word-search',
  label: 'Word Search',
  category: 'word',
  description:
    'Large-print retirement word search. Hide AI-written words on any theme, or your own list, in a letter grid. Includes an answer key marking every word.',
  pageCount: 1,
  producesAnswerKey: true,
  generate: generatePages,
  validateConfig: validateRetirementWordSearchConfig,
  prefetch: async (config, signal) => {
    if (parseSource(config.source) !== 'ai') return undefined
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
  configSchema: [
    {
      key: 'source',
      label: 'Words from',
      type: 'select',
      default: 'ai',
      options: [
        { label: 'AI theme (fresh, never repeats)', value: 'ai' },
        { label: 'My own words', value: 'custom' },
      ],
    },
    {
      key: 'writeOwnTheme',
      label: 'Write my own theme',
      type: 'toggle',
      default: false,
      visibleWhen: (c) => parseSource(c.source) === 'ai',
      help: 'Off: pick a retirement category and theme. On: type any theme for AI.',
    },
    {
      key: 'retirementCategory',
      label: 'Category',
      type: 'select',
      default: 'retirement-life',
      options: categorySelectOptions(),
      visibleWhen: (c) =>
        parseSource(c.source) === 'ai' && !parseWriteOwnTheme(c.writeOwnTheme),
    },
    {
      key: 'presetThemeId',
      label: 'Theme',
      type: 'select',
      default: 'life-after-work',
      options: themeSelectOptions('retirement-life'),
      optionsWhen: (c) =>
        themeSelectOptions(parseRetirementCategory(c.retirementCategory)),
      visibleWhen: (c) =>
        parseSource(c.source) === 'ai' && !parseWriteOwnTheme(c.writeOwnTheme),
      help: 'AI writes a fresh word list for this retirement theme each time.',
    },
    {
      key: 'customTheme',
      label: 'Describe a theme',
      type: 'text',
      default: '',
      max: AI_THEME_MAX_LENGTH,
      visibleWhen: (c) =>
        parseSource(c.source) === 'ai' && parseWriteOwnTheme(c.writeOwnTheme),
      help:
        'Optional — leave blank for “retirement lifestyle hobbies”, or describe one (e.g. “gardening on a sunny porch”).',
    },
    {
      key: 'words',
      label: 'Your words (one per line)',
      type: 'wordList',
      default: [],
      visibleWhen: (c) => parseSource(c.source) === 'custom',
      helpWhen: (c) => {
        const difficulty = parseRetirementDifficulty(c.difficulty)
        const printStyle = parsePrintStyle(c.printStyle)
        const gridSize = parseGridSize(c.gridSize, difficulty, printStyle)
        const maxLetters = Math.min(gridSize, retirementMaxLetters(difficulty, printStyle))
        const budget = packingBudget(gridSize)
        const usable = sanitizeWordEntries(c.words, {
          gridSize,
          minLetters: CUSTOM_MIN_WORD_LETTERS,
          maxLetters,
        }).length
        return `One word or short phrase per line (${CUSTOM_MIN_WORD_LETTERS}–${maxLetters} letters). ${usable}/${budget} for a ${gridSize}×${gridSize} grid.`
      },
      warningWhen: (c) => {
        const difficulty = parseRetirementDifficulty(c.difficulty)
        const printStyle = parsePrintStyle(c.printStyle)
        const gridSize = parseGridSize(c.gridSize, difficulty, printStyle)
        const maxLetters = Math.min(gridSize, retirementMaxLetters(difficulty, printStyle))
        const rawLines = Array.isArray(c.words)
          ? c.words.map((w) => String(w).trim()).filter(Boolean)
          : String(c.words ?? '')
              .split(/[\n,]+/)
              .map((w) => w.trim())
              .filter(Boolean)
        const usable = sanitizeWordEntries(c.words, {
          gridSize,
          minLetters: CUSTOM_MIN_WORD_LETTERS,
          maxLetters,
        })
        const shortCount = rawLines.filter((line) => {
          const token = line.toUpperCase().replace(/[^A-Z]/g, '')
          return token.length === 3
        }).length
        if (shortCount > 0) {
          return 'Short words may appear multiple times accidentally and can reduce puzzle quality.'
        }
        if (rawLines.length === 0) {
          return `Each entry must be ${CUSTOM_MIN_WORD_LETTERS}–${maxLetters} letters, A–Z (spaces ok in phrases).`
        }
        const skippedInvalid = rawLines.length - usable.length
        if (skippedInvalid <= 0) return null
        return `${skippedInvalid} line${skippedInvalid === 1 ? '' : 's'} skipped (need ${CUSTOM_MIN_WORD_LETTERS}–${maxLetters} letters, A–Z).`
      },
    },
    {
      key: 'difficulty',
      label: 'Difficulty',
      type: 'select',
      default: 'classic',
      options: [
        { label: 'Relaxed (across & down)', value: 'relaxed' },
        { label: 'Classic (+ diagonals)', value: 'classic' },
        { label: 'Challenge (all directions + backwards)', value: 'challenge' },
      ],
    },
    {
      key: 'printStyle',
      label: 'Print style',
      type: 'select',
      default: 'large-print',
      options: [
        { label: 'Large print (default)', value: 'large-print' },
        { label: 'Standard', value: 'standard' },
      ],
      help: 'Large print uses a slightly smaller grid so letters stay readable.',
    },
    {
      key: 'gridSize',
      label: 'Grid size (advanced)',
      type: 'select',
      default: 'auto',
      options: [
        { label: 'Auto (from difficulty)', value: 'auto' },
        ...Array.from({ length: MAX_GRID - MIN_GRID + 1 }, (_, i) => {
          const n = MIN_GRID + i
          return { label: `${n}×${n}`, value: n }
        }),
      ],
      helpWhen: (c) => {
        const difficulty = parseRetirementDifficulty(c.difficulty)
        const printStyle = parsePrintStyle(c.printStyle)
        const gridSize = parseGridSize(c.gridSize, difficulty, printStyle)
        const budget = packingBudget(gridSize)
        return `Auto follows difficulty + print style. Override 8–15. Fits at most ${budget} words at ${gridSize}×${gridSize}.`
      },
    },
    {
      key: 'wordCount',
      label: 'Number of words (advanced)',
      type: 'select',
      default: 'auto',
      options: [
        { label: 'Auto (from difficulty)', value: 'auto' },
        ...Array.from({ length: MAX_WORDS - MIN_WORDS + 1 }, (_, i) => {
          const n = MIN_WORDS + i
          return { label: String(n), value: n }
        }),
      ],
      visibleWhen: (c) => parseSource(c.source) !== 'custom',
      help: 'Relaxed 8 · Classic 12 · Challenge 14 (capped by grid packing).',
    },
  ],
}
