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
import { TRIVIA_CONFIG_SCHEMA, validateTriviaConfig } from './config'
import {
  TRIVIA_AI_EMPTY_MESSAGE,
  TRIVIA_BUILD_FAILED_MESSAGE,
  TRIVIA_DEFAULT_TITLE,
  TRIVIA_PAGE_TOO_SMALL_MESSAGE,
  parseRemotePayload,
  selectTriviaEntries,
  type TriviaEntry,
} from './content'
import { listFontSpec, measureClueLines, type TriviaListPlan } from './draw'
import { runTriviaKdpPreflight } from './kdp-preflight'
import {
  planTriviaPage,
  triviaBodyField,
  triviaContentBox,
  triviaMaxClueLines,
  type TriviaPagePlan,
} from './layout'
import { parseTriviaLevel, triviaInstruction, type TriviaLevel } from './levels'
import { drawTriviaPuzzle, planAnswerBlock, planClueBlock } from './page'
import { tryBuildTriviaPuzzle, type TriviaPuzzle } from './place'
import { triviaCluesPrefetch } from './prefetch'
import { TRIVIA_THEME_SALT } from './theme'

export { validateTriviaConfig }

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
  const header = drawHeader(triviaContentBox(ctx), config, tag, instruction)
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
  plan: TriviaPagePlan
  puzzle: TriviaPuzzle
  list: TriviaListPlan
  instruction: string
  forAnswerKey?: boolean
}): StudioFabricObject[] {
  const { config, ctx, tag, plan, puzzle, list, instruction, forAnswerKey } = options
  const header = drawHeader(triviaContentBox(ctx), config, tag, instruction)
  return [
    ...header.objects,
    ...drawTriviaPuzzle({
      field: header.body,
      plan,
      puzzle,
      list,
      font: String(config.fontFamily ?? STUDIO_DEFAULT_FONT),
      tag,
      forAnswerKey,
    }),
  ]
}

interface BuiltPage {
  puzzle: TriviaPuzzle
  clueList: TriviaListPlan
  answerList: TriviaListPlan
}

/**
 * Build a puzzle whose clue block and answer block both provably fit.
 *
 * Three things can fail here and only one of them is worth an error page. The
 * answers may not interlock at this size; the real clues may set a line taller
 * than the page reserved; the solution's answer block may not fit the space the
 * clues vacated. Each is answered the same way — print one clue fewer — because
 * a page that lists nine clues where the note promised ten is a page nobody
 * notices, and an error page where a puzzle should be is a hole in the book.
 *
 * The count never falls below the level's floor. Below that the sheet is too
 * thin to sell, and saying so is better than printing it.
 */
function buildPage(options: {
  entries: readonly TriviaEntry[]
  plan: TriviaPagePlan
  level: TriviaLevel
  field: { left: number; top: number; width: number; height: number }
  font: string
  seed: number
}): BuiltPage | null {
  const { entries, plan, level, field, font, seed } = options
  const ceiling = Math.min(plan.clueCount, entries.length)

  for (let clueCount = ceiling; clueCount >= level.minClues; clueCount--) {
    const puzzle = tryBuildTriviaPuzzle({
      entries,
      clueCount,
      gridSide: plan.gridSide,
      level,
      seed,
    })
    if (!puzzle) continue

    const clueList = planClueBlock({ field, plan, puzzle, font })
    if (!clueList) continue
    const answerList = planAnswerBlock({ field, plan, puzzle, font })
    if (!answerList) continue

    return { puzzle, clueList, answerList }
  }
  return null
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const level = parseTriviaLevel(config)
  const theme = resolveRetirementTheme(config, ctx.seed, TRIVIA_THEME_SALT)
  const pageConfig = withThemeTitle(config, theme.label)
  const instruction = triviaInstruction(pageConfig)
  const font = String(pageConfig.fontFamily ?? STUDIO_DEFAULT_FONT)

  const tag: StudioTag = {
    templateKey: 'trivia-clue-word-search',
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }
  const fail = (message: string) => [
    errorPage(ctx, pageConfig, tag, instruction, message),
  ]

  // Measured against the heading and instruction this page will really carry,
  // so the grid, clue count and type sizes the form promised are the ones that
  // print.
  const plan = planTriviaPage({ page: ctx, config: pageConfig, instruction, level })
  if (!plan) return fail(TRIVIA_PAGE_TOO_SMALL_MESSAGE)

  const payload = parseRemotePayload(ctx.remoteData)
  if (!payload) return fail(TRIVIA_AI_EMPTY_MESSAGE)

  // The page's own ceilings, not the level's: an answer cannot be longer than
  // the grid is wide, and a clue cannot run more lines than the band reserved.
  const spec = listFontSpec(font)
  const entries = selectTriviaEntries(payload.items, {
    minLetters: level.minLetters,
    maxLetters: plan.maxAnswerLetters,
    maxClueChars: level.clueMaxChars,
    maxClueLines: triviaMaxClueLines,
    clueLines: (clue) =>
      // Numbered and length-hinted, because that is what has to fit the column.
      measureClueLines(`88. ${clue} (99)`, plan.clueFontSize, plan.clueWrapWidth, spec),
  })
  if (entries.length < level.minClues) return fail(TRIVIA_AI_EMPTY_MESSAGE)

  const header = drawHeader(triviaContentBox(ctx), pageConfig, tag, instruction)
  const built = buildPage({
    entries,
    plan,
    level,
    field: header.body,
    font,
    seed: ctx.seed,
  })
  if (!built) return fail(TRIVIA_BUILD_FAILED_MESSAGE)

  const preflight = runTriviaKdpPreflight({
    puzzle: built.puzzle,
    plan,
    level,
    field: triviaBodyField(ctx, pageConfig, instruction),
    clueList: built.clueList,
    answerList: built.answerList,
  })
  if (!preflight.ok) return fail(preflight.errors[0] ?? TRIVIA_BUILD_FAILED_MESSAGE)

  const shared = { config: pageConfig, ctx, tag, plan, puzzle: built.puzzle }
  return [
    {
      pageRole: 'single',
      objects: layoutPage({ ...shared, list: built.clueList, instruction }),
      // The solution is the same grid with every answer circled, plus the
      // numbered answers in the clues' place. The clues are not reprinted:
      // a reader checking their work has the puzzle page open beside this one,
      // and reprinting them costs the circles the room to be seen.
      answerSourceObjects: layoutPage({
        ...shared,
        list: built.answerList,
        instruction: '',
        forAnswerKey: true,
      }),
    },
  ]
}

export const triviaClueWordSearchTemplate: StudioTemplateDefinition = {
  key: 'trivia-clue-word-search',
  label: 'Trivia Clue Word Search',
  category: 'word',
  description:
    'A large-print retirement word search with a trivia clue for every answer: work out the answer, then find it in the grid. Pick a theme and a level — the grid size, clue count and type sizes are fitted to your page. Includes an answer page.',
  pageCount: 1,
  producesAnswerKey: true,
  defaultPageTitle: TRIVIA_DEFAULT_TITLE,
  validateConfig: validateTriviaConfig,
  prefetch: triviaCluesPrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g font-size="6" fill="currentColor" font-family="monospace" text-anchor="middle">
      <text x="32" y="9">G A R D E N</text>
      <text x="32" y="18">T R A V E L</text>
    </g>
    <g fill="none" stroke="currentColor" stroke-width="1.2">
      <rect x="9" y="3" width="46" height="8" rx="4"/>
    </g>
    <g font-size="5" fill="currentColor" font-family="sans-serif" text-anchor="start">
      <text x="9" y="29">1. Where roses grow</text>
      <text x="9" y="37">2. To journey far</text>
    </g>
  </svg>`,
  configSchema: TRIVIA_CONFIG_SCHEMA,
  generate,
}
