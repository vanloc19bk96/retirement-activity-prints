import type {
  StudioConfig,
  StudioFabricObject,
  StudioGenerateContext,
  StudioPageOutput,
  StudioTemplateDefinition,
} from '@/types/studio-template.types'
import { STUDIO_BODY_SIZE, STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import type { WordSearchPuzzle } from '@/utils/puzzles/word-search-core'
import { boxCenterX, drawHeader } from '../studio-layout'
import { buildText, type StudioTag } from '../studio-fabric-builders'
import { resolveRetirementTheme } from '../_shared/retirement-theme-config'
import { WORD_SEARCH_CONFIG_SCHEMA, validateWordSearchConfig } from './config'
import {
  WORD_SEARCH_AI_EMPTY_MESSAGE,
  WORD_SEARCH_PAGE_TOO_SMALL_MESSAGE,
  parseRemotePayload,
  selectWordEntries,
} from './content'
import { runWordSearchKdpPreflight } from './kdp-preflight'
import {
  planWordSearchPage,
  wordSearchContentBox,
  type WordSearchPagePlan,
} from './layout'
import { parseWordSearchLevel, wordSearchInstruction } from './levels'
import { drawWordSearchPuzzle } from './page'
import { tryBuildWordSearch } from './place'
import { wordSearchPrefetch } from './prefetch'
import { WORD_SEARCH_THEME_SALT } from './theme'

export { validateWordSearchConfig }

const BUILD_FAILED_MESSAGE =
  'Could not fit these words into a grid. Try again, or pick a broader theme.'

/**
 * Blank heading falls back to the theme, so a seller sees what the page is.
 *
 * Only when the page is meant to carry a heading at all: turning "Page title"
 * off hands generate a blank title, and a blank title is not an invitation to
 * supply one.
 */
function withThemeTitle(config: StudioConfig, themeLabel: string): StudioConfig {
  if (config.showTitle === false) return config
  if (String(config.title ?? '').trim()) return config
  return themeLabel ? { ...config, title: themeLabel } : config
}

function errorPage(
  ctx: StudioGenerateContext,
  config: StudioConfig,
  tag: StudioTag,
  instruction: string,
  message: string,
): StudioPageOutput {
  const header = drawHeader(wordSearchContentBox(ctx), config, tag, instruction)
  return {
    pageRole: 'single',
    objects: [
      ...header.objects,
      buildText(
        {
          left: boxCenterX(header.body),
          top: header.body.top + header.body.height * 0.35,
          text: message,
          fontFamily: String(config.fontFamily ?? STUDIO_DEFAULT_FONT),
          fontSize: STUDIO_BODY_SIZE - 4,
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

function layoutPage(options: {
  config: StudioConfig
  ctx: StudioGenerateContext
  tag: StudioTag
  plan: WordSearchPagePlan
  puzzle: WordSearchPuzzle
  instruction: string
  forAnswerKey?: boolean
}): StudioFabricObject[] {
  const { config, ctx, tag, plan, puzzle, instruction, forAnswerKey } = options
  const header = drawHeader(wordSearchContentBox(ctx), config, tag, instruction)
  return [
    ...header.objects,
    ...drawWordSearchPuzzle({
      field: header.body,
      plan,
      puzzle,
      font: String(config.fontFamily ?? STUDIO_DEFAULT_FONT),
      tag,
      forAnswerKey,
    }),
  ]
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const level = parseWordSearchLevel(config)
  const theme = resolveRetirementTheme(config, ctx.seed, WORD_SEARCH_THEME_SALT)
  const pageConfig = withThemeTitle(config, theme.label)
  const instruction = wordSearchInstruction(pageConfig)

  const tag: StudioTag = {
    templateKey: 'word-search',
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }
  const fail = (message: string) => [
    errorPage(ctx, pageConfig, tag, instruction, message),
  ]

  // Measured against the heading and instruction this page will really carry,
  // so the grid and word count the form promised are the ones that print.
  const plan = planWordSearchPage({
    page: ctx,
    config: pageConfig,
    instruction,
    level,
  })
  if (!plan) return fail(WORD_SEARCH_PAGE_TOO_SMALL_MESSAGE)

  const pool = parseRemotePayload(ctx.remoteData)
  if (!pool) return fail(WORD_SEARCH_AI_EMPTY_MESSAGE)

  // The page's own ceiling, not the level's: a word cannot be longer than the
  // grid is wide, and it cannot print wider than the bank column it sits in.
  const entries = selectWordEntries(pool.words, {
    minLetters: level.minLetters,
    maxLetters: plan.maxWordLetters,
    maxDisplayWidth: plan.maxEntryWidth,
    bankFontSize: plan.bank.minFont,
    font: {
      fontFamily: String(pageConfig.fontFamily ?? STUDIO_DEFAULT_FONT),
      fontWeight: 'normal',
    },
  })
  if (entries.length < level.minWords) return fail(WORD_SEARCH_AI_EMPTY_MESSAGE)

  const puzzle = tryBuildWordSearch({
    entries,
    wordCount: plan.wordCount,
    gridSide: plan.gridSide,
    level,
    seed: ctx.seed,
  })
  if (!puzzle) return fail(BUILD_FAILED_MESSAGE)

  const preflight = runWordSearchKdpPreflight({ puzzle, plan })
  if (!preflight.ok) return fail(preflight.errors[0] ?? BUILD_FAILED_MESSAGE)

  const shared = { config: pageConfig, ctx, tag, plan, puzzle }
  return [
    {
      pageRole: 'single',
      objects: layoutPage({ ...shared, instruction }),
      // The solution is the same grid with every word circled. The bank is not
      // repeated: a key that reprints the list adds nothing a reader needs and
      // costs the circles the room to be seen.
      answerSourceObjects: layoutPage({
        ...shared,
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
    'A large-print retirement word search: pick a theme and a level, and the grid size, word count and letter size are sized for your page. Includes an answer page.',
  pageCount: 1,
  producesAnswerKey: true,
  prefetch: wordSearchPrefetch,
  validateConfig: validateWordSearchConfig,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g font-size="6" fill="currentColor" font-family="monospace" text-anchor="middle">
      <text x="32" y="10">T R A V E L</text>
      <text x="32" y="19">R E L A X N</text>
      <text x="32" y="28">G A R D E N</text>
    </g>
    <g fill="none" stroke="currentColor" stroke-width="1.2">
      <rect x="9" y="4" width="46" height="8" rx="4"/>
    </g>
    <g font-size="4.5" fill="currentColor" font-family="sans-serif" text-anchor="middle">
      <text x="21" y="37">Travel</text>
      <text x="43" y="37">Garden</text>
    </g>
  </svg>`,
  configSchema: WORD_SEARCH_CONFIG_SCHEMA,
  generate,
}
