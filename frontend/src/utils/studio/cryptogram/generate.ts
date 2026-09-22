import type {
  StudioTemplateDefinition,
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
  StudioFabricObject,
} from '@/types/studio-template.types'
import {
  STUDIO_BODY_SIZE,
  STUDIO_DIGIT_FONT,
} from '@/constants/studio.constants'
import { kickOffFontFamilyLoading } from '@/utils/font-loader'
import type { CryptogramResponse } from '@/types/studio-cryptogram.types'
import { createRng, deriveSeed } from '../studio-rng'
import { boxCenterX, drawHeader } from '../studio-layout'
import { buildText, type StudioTag } from '../studio-fabric-builders'
import { resolveRetirementTheme } from '../_shared/retirement-theme-config'
import { buildCipher } from './cipher'
import {
  CRYPTOGRAM_CONFIG_SCHEMA,
  instructionFor,
  validateCryptogramConfig,
} from './config'
import { CRYPTOGRAM_AI_EMPTY_MESSAGE, selectAiSayings } from './content'
import { drawCryptograms, type CryptogramPuzzle } from './draw'
import { pickStarterLetters } from './hints'
import { runCryptogramKdpPreflight } from './kdp-preflight'
import {
  cryptogramBodyField,
  cryptogramContentBox,
  cryptogramWorstCasePlan,
  planCryptogramPage,
  type CryptogramPagePlan,
} from './layout'
import { parseCryptogramLevel, type CryptogramLevel } from './levels'
import { cryptogramPrefetch } from './prefetch'
import { CRYPTOGRAM_THEME_SALT } from './theme'

export { validateCryptogramConfig }

const PAGE_TOO_SMALL_MESSAGE =
  'This page size is too small for a cryptogram at this level. Pick a larger page in Settings, or a gentler level.'

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
    cryptogramContentBox(ctx),
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
 * One puzzle per saying: its own cipher, and the letters the level gives away.
 *
 * Each cipher is derived from the sheet's seed rather than drawn from one
 * stream, so puzzle 2 is the same puzzle whether or not puzzle 1 was dropped
 * for not fitting the page.
 */
function buildPuzzles(
  sayings: readonly string[],
  ctx: StudioGenerateContext,
  level: CryptogramLevel,
): CryptogramPuzzle[] {
  return sayings.map((plain, i) => ({
    plain,
    cipher: buildCipher(createRng(deriveSeed(ctx.seed, `cipher:${i}`))),
    starters: pickStarterLetters(plain, level.starterLetters),
  }))
}

function layoutPuzzlePage(options: {
  config: StudioConfig
  ctx: StudioGenerateContext
  tag: StudioTag
  plan: CryptogramPagePlan
  puzzles: readonly CryptogramPuzzle[]
  font: string
  instruction: string
  forAnswerKey?: boolean
}): StudioFabricObject[] {
  const { config, ctx, tag, plan, puzzles, font, instruction, forAnswerKey } = options
  const header = drawHeader(cryptogramContentBox(ctx), config, tag, instruction)
  const objects = [...header.objects]
  drawCryptograms(objects, {
    field: header.body,
    plan,
    puzzles,
    font,
    codeFont: STUDIO_DIGIT_FONT,
    tag,
    forAnswerKey,
  })
  return objects
}

function layoutSolutionPage(options: {
  config: StudioConfig
  ctx: StudioGenerateContext
  tag: StudioTag
  plan: CryptogramPagePlan
  puzzles: readonly CryptogramPuzzle[]
  font: string
}): StudioFabricObject[] {
  // Same slot grid as the puzzle, every letter filled — a page of numbered
  // sentences leaves most of the sheet empty.
  return layoutPuzzlePage({
    ...options,
    instruction: '',
    forAnswerKey: true,
    puzzles: options.puzzles.map((puzzle) => ({
      ...puzzle,
      starters: new Set<string>(),
    })),
  })
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const font = String(config.fontFamily)
  void kickOffFontFamilyLoading(STUDIO_DIGIT_FONT)

  const level = parseCryptogramLevel(config)
  const theme = resolveRetirementTheme(config, ctx.seed, CRYPTOGRAM_THEME_SALT)
  const pageConfig = withThemeTitle(config, theme.label)
  const instruction = instructionFor(pageConfig)

  const tag: StudioTag = {
    templateKey: 'cryptogram',
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }

  const remote = ctx.remoteData as CryptogramResponse | undefined
  const sayings = selectAiSayings(remote?.items, {
    count: level.targetPuzzles,
    length: level.length,
  })
  if (sayings.length === 0) {
    return [errorPage(ctx, pageConfig, tag, CRYPTOGRAM_AI_EMPTY_MESSAGE)]
  }

  // Measured against the heading and instruction this page will really carry,
  // so the count the form promised is the count the page prints — and so every
  // page of one book run holds the same number of puzzles, whether its sayings
  // came back long or short.
  const promised = cryptogramWorstCasePlan({
    level,
    page: ctx,
    config: pageConfig,
    instruction,
  })
  if (!promised) {
    return [errorPage(ctx, pageConfig, tag, PAGE_TOO_SMALL_MESSAGE)]
  }

  const plan = planCryptogramPage({
    field: cryptogramBodyField(ctx, pageConfig, instruction),
    sayings,
    target: promised.puzzleCount,
  })
  if (!plan) {
    return [errorPage(ctx, pageConfig, tag, PAGE_TOO_SMALL_MESSAGE)]
  }

  const puzzles = buildPuzzles(sayings.slice(0, plan.puzzleCount), ctx, level)

  const preflight = runCryptogramKdpPreflight({
    puzzles,
    length: level.length,
    metrics: plan.metrics,
  })
  if (!preflight.ok) {
    return [
      errorPage(ctx, pageConfig, tag, preflight.errors[0] ?? CRYPTOGRAM_AI_EMPTY_MESSAGE),
    ]
  }

  return [
    {
      pageRole: 'single',
      objects: layoutPuzzlePage({
        config: pageConfig,
        ctx,
        tag,
        plan,
        puzzles,
        font,
        instruction,
      }),
      answerSourceObjects: layoutSolutionPage({
        config: pageConfig,
        ctx,
        tag,
        plan,
        puzzles,
        font,
      }),
    },
  ]
}

export const cryptogramTemplate: StudioTemplateDefinition = {
  key: 'cryptogram',
  label: 'Cryptogram',
  category: 'word',
  description:
    'A large-print retirement cryptogram: pick a theme and a level, and the saying length, letter size and number of puzzles are sized for your page. Includes an answer page.',
  pageCount: 1,
  producesAnswerKey: true,
  prefetch: cryptogramPrefetch,
  validateConfig: validateCryptogramConfig,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g stroke="currentColor" stroke-width="1" stroke-linecap="round">
      <path d="M6 16h7M16 16h7M26 16h7M40 16h7M50 16h7"/>
      <path d="M6 30h7M16 30h7M26 30h7M36 30h7M46 30h7"/>
    </g>
    <g font-family="sans-serif" font-size="6" fill="currentColor" text-anchor="middle">
      <text x="9.5" y="24">Q</text><text x="19.5" y="24">M</text><text x="29.5" y="24">B</text>
      <text x="43.5" y="24">X</text><text x="53.5" y="24">K</text>
      <text x="9.5" y="38">F</text><text x="19.5" y="38">T</text><text x="29.5" y="38">R</text>
      <text x="39.5" y="38">W</text><text x="49.5" y="38">P</text>
    </g>
    <g font-family="serif" font-size="7" fill="currentColor" text-anchor="middle">
      <text x="19.5" y="14">E</text><text x="53.5" y="14">E</text>
    </g>
  </svg>`,
  configSchema: CRYPTOGRAM_CONFIG_SCHEMA,
  generate,
}
