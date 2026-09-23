import type {
  StudioConfig,
  StudioFabricObject,
  StudioGenerateContext,
  StudioPageOutput,
  StudioTemplateDefinition,
} from '@/types/studio-template.types'
import {
  STUDIO_BODY_SIZE,
  STUDIO_DEFAULT_FONT,
  STUDIO_DIGIT_FONT,
} from '@/constants/studio.constants'
import { kickOffFontFamilyLoading } from '@/utils/font-loader'
import { createRng, deriveSeed } from '../studio-rng'
import { boxCenterX, drawHeader } from '../studio-layout'
import { buildText, type StudioTag } from '../studio-fabric-builders'
import { buildCodewordPuzzle, type CodewordPuzzle } from './build'
import { CODEWORD_CONFIG_SCHEMA, validateCodewordConfig } from './config'
import {
  CODEWORD_BUILD_FAILED_MESSAGE,
  CODEWORD_PAGE_TOO_SMALL_MESSAGE,
  codewordWordPool,
  resolveCodewordTheme,
} from './content'
import { drawCodewordPuzzle, type CodewordDrawnPage } from './draw'
import { runCodewordKdpPreflight } from './kdp-preflight'
import {
  codewordContentBox,
  planCodewordPage,
  type CodewordPagePlan,
} from './layout'
import { codewordInstruction, parseCodewordLevel } from './levels'

export { validateCodewordConfig }

const TEMPLATE_KEY = 'codeword'

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
  const header = drawHeader(codewordContentBox(ctx), config, tag, instruction)
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
  plan: CodewordPagePlan
  puzzle: CodewordPuzzle
  instruction: string
  forAnswerKey?: boolean
}): { objects: StudioFabricObject[]; drawn: CodewordDrawnPage } | null {
  const { config, ctx, tag, plan, puzzle, instruction, forAnswerKey } = options
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)
  const header = drawHeader(codewordContentBox(ctx), config, tag, instruction)
  const drawn = drawCodewordPuzzle({
    field: header.body,
    puzzle,
    font,
    tag,
    maxCell: plan.gridCell,
    minCell: plan.minGridCell,
    forAnswerKey,
  })
  if (!drawn) return null
  return { objects: [...header.objects, ...drawn.objects], drawn }
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  void kickOffFontFamilyLoading(STUDIO_DIGIT_FONT)

  const level = parseCodewordLevel(config)
  const theme = resolveCodewordTheme(config, ctx.seed)
  const pageConfig = withThemeTitle(config, theme.label)
  const instruction = codewordInstruction(pageConfig)

  const tag: StudioTag = {
    templateKey: TEMPLATE_KEY,
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }
  const fail = (message: string) => [
    errorPage(ctx, pageConfig, tag, instruction, message),
  ]

  // Measured against the heading and instruction this page will really carry,
  // so the grid the form promised is the grid that prints.
  const plan = planCodewordPage({ page: ctx, config: pageConfig, instruction, level })
  if (!plan) return fail(CODEWORD_PAGE_TOO_SMALL_MESSAGE)

  const puzzle = buildCodewordPuzzle({
    pool: codewordWordPool(theme.id, {
      minLetters: level.minLetters,
      maxLetters: Math.min(level.maxLetters, plan.maxGridSide),
    }),
    level,
    maxGridSide: plan.maxGridSide,
    targetWords: plan.targetWords,
    rng: createRng(deriveSeed(ctx.seed, TEMPLATE_KEY)),
  })
  if (!puzzle) return fail(CODEWORD_BUILD_FAILED_MESSAGE)

  const shared = { config: pageConfig, ctx, tag, plan, puzzle }
  const page = layoutPage({ ...shared, instruction })
  // The solution carries no instruction strip, so its column is the taller of
  // the two — but it is also the page that has to hold the whole code, so it is
  // laid out and checked rather than assumed to fit because the puzzle did.
  const solution = layoutPage({ ...shared, instruction: '', forAnswerKey: true })
  if (!page || !solution) return fail(CODEWORD_PAGE_TOO_SMALL_MESSAGE)

  const preflight = runCodewordKdpPreflight({
    puzzle,
    level,
    key: page.drawn.key,
    gridCell: page.drawn.gridCell,
    starterCaption: page.drawn.starterCaption,
  })
  if (!preflight.ok) return fail(preflight.errors[0] ?? CODEWORD_BUILD_FAILED_MESSAGE)

  return [
    {
      pageRole: 'single',
      objects: page.objects,
      answerSourceObjects: solution.objects,
    },
  ]
}

export const codewordTemplate: StudioTemplateDefinition = {
  key: TEMPLATE_KEY,
  label: 'Codeword',
  category: 'word',
  description:
    'A crossword grid with no clues: every letter is replaced by a number, and the same number is always the same letter. Two or three letters are given to start; the rest of the code is worked out from the words themselves. Pick a theme and a level — grid size, number size and the key strip are fitted to your page. The solution page shows the finished grid and the whole code.',
  pageCount: 1,
  producesAnswerKey: true,
  validateConfig: validateCodewordConfig,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" stroke="currentColor" stroke-width="0.8">
      <rect x="14" y="3" width="9" height="9"/><rect x="23" y="3" width="9" height="9"/>
      <rect x="32" y="3" width="9" height="9"/><rect x="41" y="3" width="9" height="9"/>
      <rect x="32" y="12" width="9" height="9"/>
      <rect x="14" y="21" width="9" height="9"/><rect x="23" y="21" width="9" height="9"/>
      <rect x="32" y="21" width="9" height="9"/><rect x="41" y="21" width="9" height="9"/>
      <rect x="50" y="21" width="9" height="9"/>
      <rect x="32" y="30" width="9" height="9"/>
    </g>
    <g font-family="sans-serif" font-size="4.5" fill="currentColor" text-anchor="middle">
      <text x="18.5" y="11">7</text><text x="27.5" y="11">12</text>
      <text x="36.5" y="11">3</text><text x="45.5" y="11">19</text>
      <text x="36.5" y="20">5</text>
      <text x="18.5" y="29">3</text><text x="27.5" y="29">9</text>
      <text x="36.5" y="29">14</text><text x="45.5" y="29">3</text><text x="54.5" y="29">7</text>
      <text x="36.5" y="38">21</text>
    </g>
    <g font-family="serif" font-size="5" font-weight="bold" fill="currentColor" text-anchor="middle">
      <text x="36.5" y="9.5">A</text><text x="45.5" y="27.5">A</text><text x="18.5" y="27.5">A</text>
    </g>
  </svg>`,
  configSchema: CODEWORD_CONFIG_SCHEMA,
  generate,
}
