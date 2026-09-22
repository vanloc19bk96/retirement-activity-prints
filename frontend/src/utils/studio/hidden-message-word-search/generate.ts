import type {
  StudioConfig,
  StudioFabricObject,
  StudioGenerateContext,
  StudioPageOutput,
  StudioTemplateDefinition,
} from '@/types/studio-template.types'
import { STUDIO_BODY_SIZE, STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import { boxCenterX, drawHeader } from '../studio-layout'
import { buildText, type StudioTag } from '../studio-fabric-builders'
import { resolveRetirementTheme } from '../_shared/retirement-theme-config'
import { HIDDEN_MESSAGE_CONFIG_SCHEMA, validateHiddenMessageConfig } from './config'
import {
  HIDDEN_MESSAGE_AI_EMPTY_MESSAGE,
  HIDDEN_MESSAGE_BUILD_FAILED_MESSAGE,
  HIDDEN_MESSAGE_DEFAULT_TITLE,
  HIDDEN_MESSAGE_PAGE_TOO_SMALL_MESSAGE,
  hasCustomMessage,
  normalizeMessage,
  resolveTypedMessage,
  parseRemotePayload,
  selectHiddenMessageWords,
} from './content'
import { runHiddenMessageKdpPreflight } from './kdp-preflight'
import {
  hiddenMessageContentBox,
  planHiddenMessagePage,
  type HiddenMessagePagePlan,
} from './layout'
import { hiddenMessageInstruction, parseHiddenMessageLevel } from './levels'
import { drawHiddenMessagePuzzle } from './page'
import { tryBuildHiddenMessagePuzzle, type HiddenMessagePuzzle } from './place'
import { hiddenMessagePrefetch } from './prefetch'
import { HIDDEN_MESSAGE_THEME_SALT } from './theme'

export { validateHiddenMessageConfig }

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
  const header = drawHeader(hiddenMessageContentBox(ctx), config, tag, instruction)
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
  plan: HiddenMessagePagePlan
  puzzle: HiddenMessagePuzzle
  instruction: string
  forAnswerKey?: boolean
}): StudioFabricObject[] {
  const { config, ctx, tag, plan, puzzle, instruction, forAnswerKey } = options
  const header = drawHeader(hiddenMessageContentBox(ctx), config, tag, instruction)
  return [
    ...header.objects,
    ...drawHiddenMessagePuzzle({
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
  const level = parseHiddenMessageLevel(config)
  const theme = resolveRetirementTheme(config, ctx.seed, HIDDEN_MESSAGE_THEME_SALT)
  const pageConfig = withThemeTitle(config, theme.label)
  const instruction = hiddenMessageInstruction(pageConfig)

  const tag: StudioTag = {
    templateKey: 'hidden-message-word-search',
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }
  const fail = (message: string) => [
    errorPage(ctx, pageConfig, tag, instruction, message),
  ]

  // Measured against the heading and instruction this page will really carry,
  // so the grid and letter size the form promised are the ones that print.
  const plan = planHiddenMessagePage({
    page: ctx,
    config: pageConfig,
    instruction,
    level,
  })
  if (!plan) return fail(HIDDEN_MESSAGE_PAGE_TOO_SMALL_MESSAGE)

  const payload = parseRemotePayload(ctx.remoteData)
  if (!payload) return fail(HIDDEN_MESSAGE_AI_EMPTY_MESSAGE)

  // A message the seller typed wins over the one the writer sent, but it still
  // has to be a length this level's grid can leave exactly free.
  const typed = resolveTypedMessage(pageConfig)
  const message = normalizeMessage(
    hasCustomMessage(typed) ? typed : payload.message,
    level,
  )
  if (!message) return fail(HIDDEN_MESSAGE_AI_EMPTY_MESSAGE)

  // The page's own ceilings, not the level's: a word cannot be longer than the
  // grid is wide, and it cannot print wider than the bank column it sits in.
  const entries = selectHiddenMessageWords(payload.words, {
    level,
    maxLetters: plan.maxWordLetters,
    maxDisplayWidth: plan.maxEntryWidth,
    bankFontSize: plan.bank.minFont,
    font: {
      fontFamily: String(pageConfig.fontFamily ?? STUDIO_DEFAULT_FONT),
      fontWeight: 'normal',
    },
  })
  if (entries.length < level.minWords) return fail(HIDDEN_MESSAGE_AI_EMPTY_MESSAGE)

  const puzzle = tryBuildHiddenMessagePuzzle({
    message,
    words: entries,
    level,
    gridSide: plan.gridSide,
    maxWords: plan.maxWords,
    seed: ctx.seed,
  })
  if (!puzzle) return fail(HIDDEN_MESSAGE_BUILD_FAILED_MESSAGE)

  const header = drawHeader(hiddenMessageContentBox(ctx), pageConfig, tag, instruction)
  const preflight = runHiddenMessageKdpPreflight({
    puzzle,
    plan,
    level,
    field: header.body,
  })
  if (!preflight.ok) return fail(preflight.errors[0] ?? HIDDEN_MESSAGE_BUILD_FAILED_MESSAGE)

  const shared = { config: pageConfig, ctx, tag, plan, puzzle }
  return [
    {
      pageRole: 'single',
      objects: layoutPage({ ...shared, instruction }),
      // The solution is the same grid with every word circled and the saying's
      // cells tinted, plus the saying in plain text. The bank is not reprinted:
      // it adds nothing a reader checking their work needs, and it costs the
      // circles the room to be seen.
      answerSourceObjects: layoutPage({
        ...shared,
        instruction: '',
        forAnswerKey: true,
      }),
    },
  ]
}

export const hiddenMessageWordSearchTemplate: StudioTemplateDefinition = {
  key: 'hidden-message-word-search',
  label: 'Hidden Message Word Search',
  category: 'word',
  description:
    'A large-print retirement word search with a saying hidden in it: find every word, then read the leftover letters. Pick a theme and a level — the grid size, word count and letter size are sized for your page. Includes an answer page.',
  pageCount: 1,
  producesAnswerKey: true,
  defaultPageTitle: HIDDEN_MESSAGE_DEFAULT_TITLE,
  validateConfig: validateHiddenMessageConfig,
  prefetch: hiddenMessagePrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g font-size="6" fill="currentColor" font-family="monospace" text-anchor="middle">
      <text x="32" y="10">R E L A X E</text>
      <text x="32" y="19">E V E R Y D</text>
      <text x="32" y="28">G A R D E N</text>
    </g>
    <g fill="none" stroke="currentColor" stroke-width="1.2">
      <rect x="9" y="22" width="46" height="8" rx="4"/>
    </g>
    <g stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
      <line x1="13" y1="36" x2="18" y2="36"/>
      <line x1="20" y1="36" x2="25" y2="36"/>
      <line x1="27" y1="36" x2="32" y2="36"/>
      <line x1="37" y1="36" x2="42" y2="36"/>
      <line x1="44" y1="36" x2="49" y2="36"/>
    </g>
  </svg>`,
  configSchema: HIDDEN_MESSAGE_CONFIG_SCHEMA,
  generate,
}
