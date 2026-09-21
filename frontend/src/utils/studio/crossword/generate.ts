import type {
  StudioTemplateDefinition,
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
  StudioFabricObject,
} from '@/types/studio-template.types'
import { createRng, type StudioRng } from '../studio-rng'
import { contentBox, insetHorizontal, drawHeader, boxCenterX } from '../studio-layout'
import { buildText, type StudioTag } from '../studio-fabric-builders'
import { STUDIO_CONTENT_SAFE_INSET_X, STUDIO_BODY_SIZE, STUDIO_DIGIT_FONT } from '@/constants/studio.constants'
import { kickOffFontFamilyLoading } from '@/utils/font-loader'
import { buildCrossword, maxGridForPlaceCount, numberEntries } from './construct'
import {
  AI_THEME_MAX_LENGTH,
  aiThemeLabel,
  answerCountSelectOptions,
  buildInstruction,
  categorySelectOptions,
  minimumPublishCount,
  parseAnswerCount,
  parsePrintStyle,
  parseRetirementDifficulty,
  parseWriteOwnTheme,
  themeSelectOptions,
  validateRetirementCrosswordConfig,
} from './config'
import { themeIpWarning } from './content-quality'
import { selectCrosswordCandidates } from './candidate-selector'
import { drawCrosswordPuzzle } from './draw'
import { crosswordPrefetch, CROSSWORD_AI_EMPTY_MESSAGE } from './prefetch'
import { parseRetirementCategory } from '../retirement-word-search/retirement-themes'
import type { CrosswordBuild, CrosswordEntry, CrosswordPair } from './types'

export {
  buildCrossword,
  maxGridForPlaceCount,
  numberEntries,
  readEntry,
  allCrossingsConsistent,
  whiteConnected,
  numberingValid,
  canPlace,
} from './construct'
export type { CrosswordEntry, CrosswordBuild, CrosswordPair, CrosswordDir } from './types'
export {
  packingBudget,
  parseRetirementDifficulty,
  parsePrintStyle,
  parseAnswerCount,
  letterBoundsForDifficulty,
  candidatePoolSize,
  aiThemeLabel,
  resolveAiThemePrompt,
  validateRetirementCrosswordConfig,
} from './config'
/** Kept for word-fit and legacy imports. */
export {
  resolveWordsAndClues,
  mergeClues,
  sanitizeCustomPairs,
  validateCustomWordLines,
  loadThemeEntries,
  listCrosswordThemeMeta,
  crosswordThemeLabel,
  isCustomWords,
  isCustomAiTheme,
  customThemeTitle,
  resolveCustomThemeText,
} from './words'

function withThemeTitle(config: StudioConfig): StudioConfig {
  if (String(config.title ?? '').trim()) return config
  const label = aiThemeLabel(config)
  return label ? { ...config, title: label } : config
}

function resolvePairs(config: StudioConfig, ctx: StudioGenerateContext): CrosswordPair[] {
  const remote = ctx.remoteData as CrosswordPair[] | undefined
  if (!remote?.length) {
    throw new Error(CROSSWORD_AI_EMPTY_MESSAGE)
  }
  const difficulty = parseRetirementDifficulty(config.difficulty)
  const printStyle = parsePrintStyle(config.printStyle)
  const target = parseAnswerCount(
    config.answerCount ?? config.wordCount,
    difficulty,
    printStyle,
  )
  return selectCrosswordCandidates(remote, target)
}

function buildCrosswordWithFallback(
  pairs: CrosswordPair[],
  rng: StudioRng,
  placeCount: number,
  minAcceptable: number,
): ReturnType<typeof buildCrossword> {
  const maxSize = maxGridForPlaceCount(placeCount)
  let best: ReturnType<typeof buildCrossword> = null

  for (let attempt = 0; attempt < 6; attempt++) {
    const built = buildCrossword(pairs, maxSize, rng, placeCount)
    if (!built) continue
    if (built.entries.length >= placeCount) return built
    if (!best || built.entries.length > best.entries.length) best = built
  }

  // Spec §41 — allow target − 1 only when still above publish minimum.
  const tryCounts = [placeCount - 1]
  for (const count of tryCounts) {
    if (count < minAcceptable) continue
    if (best && best.entries.length >= count) continue
    const built = buildCrossword(pairs, maxGridForPlaceCount(count), rng, count)
    if (!built) continue
    if (!best || built.entries.length > best.entries.length) best = built
  }

  if (best && best.entries.length >= minAcceptable) return best
  return null
}

export function validateCrosswordConfig(config: StudioConfig) {
  return validateRetirementCrosswordConfig(config)
}

function errorPage(
  ctx: StudioGenerateContext,
  config: StudioConfig,
  tag: StudioTag,
  message: string,
): StudioPageOutput {
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const header = drawHeader(content, config, tag, buildInstruction())
  const fontSize = STUDIO_BODY_SIZE - 4
  return {
    pageRole: 'single',
    objects: [
      ...header.objects,
      buildText(
        {
          left: boxCenterX(header.body),
          top: header.body.top + header.body.height * 0.35,
          text: message,
          fontFamily: String(config.fontFamily),
          fontSize,
          width: header.body.width * 0.85,
          textAlign: 'center',
          originX: 'center',
        },
        tag,
        'prompt',
      ),
    ],
  }
}

function layoutCrosswordPage(options: {
  config: StudioConfig
  ctx: StudioGenerateContext
  tag: StudioTag
  built: CrosswordBuild
  entries: CrosswordEntry[]
  font: string
  instruction: string
  forAnswerKey?: boolean
  minClueFontSize: number
}): StudioFabricObject[] {
  const content = insetHorizontal(contentBox(options.ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const header = drawHeader(content, options.config, options.tag, options.instruction)
  const drawn = drawCrosswordPuzzle({
    field: header.body,
    built: options.built,
    entries: options.entries,
    font: options.font,
    tag: options.tag,
    forAnswerKey: options.forAnswerKey,
    minClueFontSize: options.minClueFontSize,
  })
  return [...header.objects, ...drawn.objects]
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const font = String(config.fontFamily)
  void kickOffFontFamilyLoading(STUDIO_DIGIT_FONT)
  const rng = createRng(ctx.seed ^ 0x9e3779b9)
  const difficulty = parseRetirementDifficulty(config.difficulty)
  const printStyle = parsePrintStyle(config.printStyle)
  const placeCount = parseAnswerCount(
    config.answerCount ?? config.wordCount,
    difficulty,
    printStyle,
  )
  // Spec §41–§42: allow target−1, never below the difficulty floor unless the
  // user explicitly requested fewer answers than that floor.
  const minAcceptable = Math.min(
    placeCount,
    Math.max(minimumPublishCount(difficulty), placeCount - 1),
  )
  const minClueFontSize = printStyle === 'large-print' ? 12 : 8
  const showInstructions = config.showInstructions !== false
  const instruction = showInstructions ? buildInstruction() : ''

  const tag: StudioTag = {
    templateKey: 'crossword',
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }

  const pageConfig = withThemeTitle(config)

  let pairs: CrosswordPair[]
  try {
    pairs = resolvePairs(config, ctx)
  } catch {
    return [errorPage(ctx, pageConfig, tag, CROSSWORD_AI_EMPTY_MESSAGE)]
  }

  if (pairs.length < 4) {
    return [errorPage(ctx, pageConfig, tag, CROSSWORD_AI_EMPTY_MESSAGE)]
  }

  const built = buildCrosswordWithFallback(pairs, rng, placeCount, minAcceptable)
  if (!built || built.entries.length < minAcceptable) {
    return [
      errorPage(
        ctx,
        pageConfig,
        tag,
        'Unable to generate crossword. Try again or choose a broader retirement theme.',
      ),
    ]
  }

  const entries = numberEntries(built.entries, built.grid, built.size)
  const layout = {
    config: pageConfig,
    ctx,
    tag,
    built,
    entries,
    font,
    minClueFontSize,
  }

  return [
    {
      pageRole: 'single',
      objects: layoutCrosswordPage({ ...layout, instruction }),
      answerSourceObjects: layoutCrosswordPage({
        ...layout,
        instruction: '',
        forAnswerKey: true,
      }),
    },
  ]
}

export const crosswordTemplate: StudioTemplateDefinition = {
  key: 'crossword',
  label: 'Crossword',
  category: 'word',
  description:
    'Large-print retirement crossword. AI writes fresh answers and clues for any retirement theme. Includes an answer key.',
  pageCount: 1,
  producesAnswerKey: true,
  prefetch: crosswordPrefetch,
  validateConfig: validateCrosswordConfig,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" stroke="currentColor" stroke-width="0.7">
      <rect x="16" y="4" width="32" height="32"/><path d="M24 4v32M32 4v32M40 4v32M16 12h32M16 20h32M16 28h32"/>
    </g>
    <g fill="currentColor"><rect x="32" y="4" width="8" height="8"/><rect x="16" y="20" width="8" height="8"/>
      <rect x="40" y="28" width="8" height="8"/></g>
    <g font-size="4" fill="currentColor" font-family="sans-serif"><text x="17" y="9">1</text><text x="25" y="9">2</text></g>
  </svg>`,
  configSchema: [
    {
      key: 'writeOwnTheme',
      label: 'Write my own theme',
      type: 'toggle',
      default: false,
      help: 'Off: pick a retirement category and theme. On: type any theme for AI.',
    },
    {
      key: 'retirementCategory',
      label: 'Category',
      type: 'select',
      default: 'retirement-life',
      options: categorySelectOptions(),
      visibleWhen: (c) => !parseWriteOwnTheme(c.writeOwnTheme),
    },
    {
      key: 'presetThemeId',
      label: 'Theme',
      type: 'select',
      default: 'life-after-work',
      options: themeSelectOptions('retirement-life'),
      optionsWhen: (c) =>
        themeSelectOptions(parseRetirementCategory(c.retirementCategory)),
      visibleWhen: (c) => !parseWriteOwnTheme(c.writeOwnTheme),
      help: 'AI invents fresh answers and clues for this retirement theme each time.',
    },
    {
      key: 'customTheme',
      label: 'Custom retirement theme',
      type: 'text',
      default: '',
      max: AI_THEME_MAX_LENGTH,
      visibleWhen: (c) => parseWriteOwnTheme(c.writeOwnTheme),
      help: 'Theme only — AI writes the answers (e.g. Retirement Gardening). Max 120 characters.',
      warningWhen: (c) =>
        themeIpWarning(String(c.customTheme ?? c.customThemeText ?? '')),
    },
    {
      key: 'difficulty',
      label: 'Difficulty',
      type: 'select',
      default: 'classic',
      options: [
        { label: 'Relaxed (direct clues, shorter words)', value: 'relaxed' },
        { label: 'Classic', value: 'classic' },
        { label: 'Challenge (fair but trickier)', value: 'challenge' },
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
      help: 'Large print keeps clue text at least 12 pt and a modest answer count.',
    },
    {
      key: 'answerCount',
      label: 'Number of answers (advanced)',
      type: 'select',
      default: 'auto',
      options: answerCountSelectOptions(),
      helpWhen: (c) => {
        const difficulty = parseRetirementDifficulty(c.difficulty)
        const printStyle = parsePrintStyle(c.printStyle)
        const n = parseAnswerCount(c.answerCount, difficulty, printStyle)
        return `Auto follows difficulty + print style (currently ${n}).`
      },
    },
  ],
  generate,
}
