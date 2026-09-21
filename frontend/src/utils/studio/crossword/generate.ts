import type {
  StudioTemplateDefinition,
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
  StudioConfigValidationError,
  StudioFabricObject,
} from '@/types/studio-template.types'
import { createRng, type StudioRng } from '../studio-rng'
import { contentBox, insetHorizontal, drawHeader, boxCenterX } from '../studio-layout'
import { buildText, type StudioTag } from '../studio-fabric-builders'
import { STUDIO_CONTENT_SAFE_INSET_X, STUDIO_BODY_SIZE, STUDIO_DIGIT_FONT } from '@/constants/studio.constants'
import { kickOffFontFamilyLoading } from '@/utils/font-loader'
import { buildCrossword, maxGridForPlaceCount, numberEntries } from './construct'
import {
  resolveWordsAndClues,
  sanitizeCustomPairs,
  validateCustomWordLines,
  rawCustomWordLines,
  crosswordThemeLabel,
  isCustomWords,
  isCustomAiTheme,
  customThemeTitle,
  resolveCustomThemeText,
  CUSTOM_THEME_MAX_LENGTH,
  parseWordCount,
  packingBudget,
  CROSSWORD_WORD_COUNT_DEFAULT,
  CROSSWORD_WORD_COUNT_MAX,
  CROSSWORD_WORD_COUNT_MIN,
} from './words'
import { drawCrosswordPuzzle } from './draw'
import { crosswordPrefetch } from './prefetch'
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
  resolveWordsAndClues,
  mergeClues,
  sanitizeCustomPairs,
  validateCustomWordLines,
  packingBudget,
  loadThemeEntries,
  listCrosswordThemeMeta,
  crosswordThemeLabel,
  isCustomWords,
  isCustomAiTheme,
  customThemeTitle,
  resolveCustomThemeText,
} from './words'

const INSTRUCTION =
  'Fill in the grid by solving the clues. Across answers read left to right; ' +
  'Down answers read top to bottom. Shared letters help you check your answers'

function withThemeTitle(config: StudioConfig): StudioConfig {
  if (String(config.title ?? '').trim()) return config
  if (isCustomWords(config)) return config
  if (isCustomAiTheme(config)) {
    const label = customThemeTitle(config)
    return label ? { ...config, title: label } : config
  }
  return { ...config, title: crosswordThemeLabel(String(config.theme ?? 'animals')) }
}

function resolvePairs(config: StudioConfig, ctx: StudioGenerateContext): CrosswordPair[] {
  const remote = ctx.remoteData as CrosswordPair[] | undefined
  if (remote?.length) return remote
  return resolveWordsAndClues(config, createRng(ctx.seed))
}

function requestedPlaceCount(config: StudioConfig, pairs: CrosswordPair[]): number {
  if (isCustomWords(config)) return pairs.length
  return parseWordCount(config.wordCount)
}

/** Prefer the requested count; theme mode may soften as a last resort. */
function buildCrosswordWithFallback(
  pairs: CrosswordPair[],
  rng: StudioRng,
  placeCount: number,
  options?: { requireExact?: boolean },
): ReturnType<typeof buildCrossword> {
  const requireExact = options?.requireExact === true
  const maxSize = maxGridForPlaceCount(placeCount)
  let best: ReturnType<typeof buildCrossword> = null
  // Custom lists have no substitute pool — spend more rng passes to place every word.
  const exactAttempts = requireExact ? 12 : 3

  for (let attempt = 0; attempt < exactAttempts; attempt++) {
    const built = buildCrossword(pairs, maxSize, rng, placeCount)
    if (!built) continue
    if (built.entries.length >= placeCount) return built
    if (!best || built.entries.length > best.entries.length) best = built
  }

  if (requireExact) {
    return best && best.entries.length >= placeCount ? best : null
  }

  const tryCounts = [placeCount - 1, placeCount - 2, 12, 8, 6]
  for (const count of tryCounts) {
    if (count < 4 || count >= placeCount) continue
    if (best && best.entries.length >= count) continue
    const built = buildCrossword(pairs, maxGridForPlaceCount(count), rng, count)
    if (!built) continue
    if (built.entries.length >= placeCount) return built
    if (!best || built.entries.length > best.entries.length) best = built
  }
  return best
}

export function validateCrosswordConfig(
  config: StudioConfig,
): StudioConfigValidationError | null {
  if (isCustomWords(config)) {
    const formatError = validateCustomWordLines(config.words)
    if (formatError) {
      return { field: 'words', message: formatError }
    }
    const pairs = sanitizeCustomPairs(config.words)
    const budget = packingBudget()
    if (pairs.length < CROSSWORD_WORD_COUNT_MIN) {
      return {
        field: 'words',
        message: `Enter at least ${CROSSWORD_WORD_COUNT_MIN} lines as WORD | clue (3–12 letters, A–Z).`,
      }
    }
    if (pairs.length > budget) {
      const extra = pairs.length - budget
      return {
        field: 'words',
        message: `A crossword fits at most ${budget} words. Remove ${extra} word${extra === 1 ? '' : 's'}.`,
      }
    }
    return null
  }

  if (!isCustomAiTheme(config)) return null
  const text = resolveCustomThemeText(config)
  if (!text) {
    return {
      field: 'customThemeText',
      message: 'Enter a custom theme, or turn off Custom theme.',
    }
  }
  if (String(config.customThemeText ?? '').trim().length > CUSTOM_THEME_MAX_LENGTH) {
    return {
      field: 'customThemeText',
      message: `Keep the custom theme under ${CUSTOM_THEME_MAX_LENGTH} characters.`,
    }
  }
  return null
}

function errorPage(
  ctx: StudioGenerateContext,
  config: StudioConfig,
  tag: StudioTag,
): StudioPageOutput {
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const header = drawHeader(content, config, tag, INSTRUCTION)
  const customCount = isCustomWords(config) ? sanitizeCustomPairs(config.words).length : 0
  const msg =
    customCount > 0
      ? `Could not interlock all ${customCount} words into one crossword. ` +
        'Remove a few answers, or use shorter words, then try again.'
      : 'Could not build an interlocking crossword from these words. ' +
        'Try fewer or shorter words, or pick a different theme.'
  const fontSize = STUDIO_BODY_SIZE - 4
  return {
    pageRole: 'single',
    objects: [
      ...header.objects,
      buildText(
        {
          left: boxCenterX(header.body),
          top: header.body.top + header.body.height * 0.35,
          text: msg,
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
  })
  return [...header.objects, ...drawn.objects]
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const font = String(config.fontFamily)
  void kickOffFontFamilyLoading(STUDIO_DIGIT_FONT)
  const rng = createRng(ctx.seed ^ 0x9e3779b9)
  const pairs = resolvePairs(config, ctx)

  const tag: StudioTag = {
    templateKey: 'crossword',
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }

  const pageConfig = withThemeTitle(config)

  if (pairs.length < 4) {
    return [errorPage(ctx, pageConfig, tag)]
  }

  const placeCount = requestedPlaceCount(config, pairs)
  const built = buildCrosswordWithFallback(pairs, rng, placeCount, {
    // Own-words lists must place every answer — never silently drop 2–3 words.
    requireExact: isCustomWords(config),
  })
  if (!built || (isCustomWords(config) && built.entries.length < placeCount)) {
    return [errorPage(ctx, pageConfig, tag)]
  }

  const entries = numberEntries(built.entries, built.grid, built.size)
  const layout = { config: pageConfig, ctx, tag, built, entries, font }

  return [
    {
      pageRole: 'single',
      objects: layoutCrosswordPage({ ...layout, instruction: INSTRUCTION }),
      // Solution: no how-to / clue lists — taller body, grid centered and larger.
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
    'A classic crossword. Solve the clues to fill interlocking words. Pick a theme and let AI write the answers and clues, or supply your own words. Includes an answer key.',
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
      key: 'source',
      label: 'Words from',
      type: 'select',
      default: 'theme',
      options: [
        { label: 'A theme (pick for me)', value: 'theme' },
        { label: 'My own words', value: 'custom' },
      ],
    },
    {
      key: 'customTheme',
      label: 'Custom theme',
      type: 'toggle',
      default: false,
      visibleWhen: (c) => c.source !== 'custom',
      help: 'Turn on to type a theme; AI invents fresh answer words and clues for it.',
    },
    {
      key: 'theme',
      label: 'Theme',
      type: 'select',
      default: 'animals',
      options: [
        { label: 'Animals', value: 'animals' },
        { label: 'Food', value: 'food' },
        { label: 'Nature', value: 'nature' },
        { label: 'Household', value: 'household' },
        { label: 'Body', value: 'body' },
        { label: 'Sports', value: 'sports' },
        { label: 'Travel', value: 'travel' },
        { label: 'School', value: 'school' },
        { label: 'Music', value: 'music' },
        { label: 'Space', value: 'space' },
      ],
      visibleWhen: (c) => c.source !== 'custom' && c.customTheme !== true,
    },
    {
      key: 'customThemeText',
      label: 'Your theme',
      type: 'text',
      default: 'things at the beach',
      max: CUSTOM_THEME_MAX_LENGTH,
      visibleWhen: (c) => c.source !== 'custom' && c.customTheme === true,
      help: 'Short phrase for AI answers + clues (e.g. camping trip, bakery). Max 120 characters.',
    },
    {
      key: 'words',
      label: 'Your words (one per line)',
      type: 'wordList',
      default: [],
      visibleWhen: (c) => c.source === 'custom',
      placeholder: 'TIGER | Big striped cat\nEAGLE | Bird of prey\nHORSE | Farm animal you ride',
      helpWhen: (c) => {
        const budget = packingBudget()
        const usable = sanitizeCustomPairs(c.words).length
        return (
          `One answer per line as WORD | clue (e.g. TIGER | Big striped cat). ` +
          `Every line needs the | (or :). Blank clues are written by AI. ` +
          `Import a .txt with the same format. ${usable}/${budget} words.`
        )
      },
      warningWhen: (c) => {
        const budget = packingBudget()
        const rawLines = rawCustomWordLines(c.words)
        const usable = sanitizeCustomPairs(c.words)
        if (rawLines.length === 0) {
          return `Each line needs WORD | clue (3–12 letters, A–Z). Max ${budget} words.`
        }
        // Over-budget is a blocking validateConfig error — only soft-warn skipped lines here.
        const skippedInvalid = rawLines.length - usable.length
        if (skippedInvalid <= 0) return null
        return `${skippedInvalid} line${skippedInvalid === 1 ? '' : 's'} skipped (need WORD | clue, 3–12 letters, A–Z).`
      },
    },
    {
      key: 'wordCount',
      label: 'Number of words',
      type: 'number',
      default: CROSSWORD_WORD_COUNT_DEFAULT,
      min: CROSSWORD_WORD_COUNT_MIN,
      max: CROSSWORD_WORD_COUNT_MAX,
      step: 1,
      visibleWhen: (c) => c.source !== 'custom',
      helpWhen: () =>
        `How many interlocking answers to place. Max ${CROSSWORD_WORD_COUNT_MAX} for a theme crossword.`,
    },
    {
      key: 'difficulty',
      label: 'Difficulty',
      type: 'select',
      default: 'medium',
      options: [
        { label: 'Easy (short, common words)', value: 'easy' },
        { label: 'Medium', value: 'medium' },
        { label: 'Hard (longer, trickier)', value: 'hard' },
      ],
    },
  ],
  generate,
}
