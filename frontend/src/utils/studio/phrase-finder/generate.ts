import type {
  StudioTemplateDefinition,
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
  StudioFabricObject,
} from '@/types/studio-template.types'
import type {
  PhraseFinderItem,
  PhraseFinderResponse,
} from '@/types/studio-phrase-finder.types'
import { STUDIO_BODY_SIZE } from '@/constants/studio.constants'
import { createRng, deriveSeed } from '../studio-rng'
import { boxCenterX, drawHeader } from '../studio-layout'
import { buildText, type StudioTag } from '../studio-fabric-builders'
import { resolveRetirementTheme } from '../_shared/retirement-theme-config'
import {
  PHRASE_FINDER_CONFIG_SCHEMA,
  instructionFor,
  validatePhraseFinderConfig,
} from './config'
import {
  PHRASE_FINDER_AI_EMPTY_MESSAGE,
  PHRASE_FINDER_DEFAULT_TITLE,
  PHRASE_FINDER_PAGE_TOO_SMALL_MESSAGE,
  selectAiItems,
} from './content'
import { drawPhraseFinderPuzzles, type PhraseFinderPuzzle } from './draw'
import { runPhraseFinderKdpPreflight } from './kdp-preflight'
import {
  phraseFinderBodyField,
  phraseFinderContentBox,
  phraseFinderPageLock,
  phraseFinderWorstCasePlan,
  planPhraseFinderPage,
  toPlanItems,
  type PhraseFinderPagePlan,
} from './layout'
import { parsePhraseFinderLevel, type PhraseFinderLevel } from './levels'
import { toPhraseModel } from './phrase'
import { phraseFinderPrefetch } from './prefetch'
import { planReveals } from './reveal'
import { PHRASE_FINDER_THEME_SALT } from './theme'

export { validatePhraseFinderConfig }

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
  message: string,
): StudioPageOutput {
  const header = drawHeader(
    phraseFinderContentBox(ctx),
    config,
    tag,
    instructionFor(config),
  )
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

/**
 * One puzzle per phrase, each with the letters its level gives away.
 *
 * The reveal stream is derived per puzzle rather than drawn from one shared
 * RNG, so puzzle 2 keeps its own letters whether or not puzzle 1 was dropped
 * for not fitting the page — a sheet that changes its second puzzle because its
 * first one was too long is a sheet nobody can reproduce.
 */
function buildPuzzles(
  items: readonly PhraseFinderItem[],
  ctx: StudioGenerateContext,
  level: PhraseFinderLevel,
): PhraseFinderPuzzle[] {
  return items.map((item, i) => {
    const model = toPhraseModel(item.text)
    return {
      model,
      clue: item.clue,
      revealed: planReveals(
        model,
        level.revealShare,
        createRng(deriveSeed(ctx.seed, `reveal:${i}`)),
      ),
    }
  })
}

function layoutPuzzlePage(options: {
  config: StudioConfig
  ctx: StudioGenerateContext
  tag: StudioTag
  plan: PhraseFinderPagePlan
  puzzles: readonly PhraseFinderPuzzle[]
  font: string
  instruction: string
}): StudioFabricObject[] {
  const { config, ctx, tag, plan, puzzles, font, instruction } = options
  const header = drawHeader(phraseFinderContentBox(ctx), config, tag, instruction)
  const objects = [...header.objects]
  drawPhraseFinderPuzzles(objects, {
    field: header.body,
    plan,
    puzzles,
    font,
    tag,
  })
  return objects
}

/**
 * The solution: the same rows with every letter written onto its own blank.
 *
 * Built by handing the layout an empty given-letter set, which makes every
 * letter a hidden `answer` object — and the answer key then reveals all of
 * them. So the key is the puzzle page with its blanks filled at the exact
 * positions the blanks were, and it cannot say anything the puzzle did not ask.
 * A page of numbered sentences somewhere else in the book would leave a reader
 * matching line numbers instead of checking the row they solved.
 *
 * The clues come with it — they are `prompt` objects, not answers — because a
 * reader checking a row wants to see the question it answered, and because a
 * clue and a solution printed side by side is how a solver learns to read the
 * next one.
 */
function layoutSolutionPage(options: {
  config: StudioConfig
  ctx: StudioGenerateContext
  tag: StudioTag
  plan: PhraseFinderPagePlan
  puzzles: readonly PhraseFinderPuzzle[]
  font: string
}): StudioFabricObject[] {
  return layoutPuzzlePage({
    ...options,
    instruction: '',
    puzzles: options.puzzles.map((puzzle) => ({
      ...puzzle,
      revealed: new Set<number>(),
    })),
  })
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const font = String(config.fontFamily)
  const level = parsePhraseFinderLevel(config)
  const theme = resolveRetirementTheme(config, ctx.seed, PHRASE_FINDER_THEME_SALT)
  const pageConfig = withThemeTitle(config, theme.label)
  const instruction = instructionFor(pageConfig)

  const tag: StudioTag = {
    templateKey: 'phrase-finder',
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }

  const remote = ctx.remoteData as PhraseFinderResponse | undefined
  const items = selectAiItems(remote?.items, {
    count: level.targetPuzzles,
    length: level.length,
  })
  if (items.length === 0) {
    return [errorPage(ctx, pageConfig, tag, PHRASE_FINDER_AI_EMPTY_MESSAGE)]
  }

  // Measured against the heading and instruction this page will really carry,
  // so the count the form promised is the count the page prints — and so every
  // page of one book run holds the same number of puzzles at the same pitch,
  // whether its phrases came back long or short.
  const promised = phraseFinderWorstCasePlan({
    level,
    page: ctx,
    config: pageConfig,
    instruction,
    font,
  })
  if (!promised) {
    return [errorPage(ctx, pageConfig, tag, PHRASE_FINDER_PAGE_TOO_SMALL_MESSAGE)]
  }

  const plan = planPhraseFinderPage({
    field: phraseFinderBodyField(ctx, pageConfig, instruction),
    items: toPlanItems(items),
    target: promised.puzzleCount,
    spec: { fontFamily: font },
    lock: phraseFinderPageLock(promised),
  })
  if (!plan) {
    return [errorPage(ctx, pageConfig, tag, PHRASE_FINDER_PAGE_TOO_SMALL_MESSAGE)]
  }

  const puzzles = buildPuzzles(items.slice(0, plan.puzzleCount), ctx, level)

  const preflight = runPhraseFinderKdpPreflight({
    puzzles,
    length: level.length,
    metrics: plan.metrics,
  })
  if (!preflight.ok) {
    return [
      errorPage(
        ctx,
        pageConfig,
        tag,
        preflight.errors[0] ?? PHRASE_FINDER_AI_EMPTY_MESSAGE,
      ),
    ]
  }

  const shared = { config: pageConfig, ctx, tag, plan, puzzles, font }
  return [
    {
      pageRole: 'single',
      objects: layoutPuzzlePage({ ...shared, instruction }),
      answerSourceObjects: layoutSolutionPage(shared),
    },
  ]
}

export const phraseFinderTemplate: StudioTemplateDefinition = {
  key: 'phrase-finder',
  label: 'Phrase Finder',
  category: 'word',
  description:
    'A retirement saying shown as blanks with a few letters filled in, under a short clue that points to it. Pick a theme and a level, and the phrase length, letter size and number of puzzles are sized for your page. Includes an answer page.',
  pageCount: 1,
  producesAnswerKey: true,
  defaultPageTitle: PHRASE_FINDER_DEFAULT_TITLE,
  prefetch: phraseFinderPrefetch,
  validateConfig: validatePhraseFinderConfig,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g stroke="currentColor" stroke-width="1.4" stroke-linecap="round">
      <path d="M5 16h6M13 16h6M21 16h6M34 16h6M42 16h6M50 16h6"/>
      <path d="M11 32h6M19 32h6M27 32h6M40 32h6M48 32h6"/>
    </g>
    <g font-family="serif" font-size="8" fill="currentColor" text-anchor="middle">
      <text x="16" y="14">A</text>
      <text x="53" y="14">Y</text>
      <text x="22" y="30">E</text>
      <text x="51" y="30">R</text>
    </g>
  </svg>`,
  configSchema: PHRASE_FINDER_CONFIG_SCHEMA,
  generate,
}
