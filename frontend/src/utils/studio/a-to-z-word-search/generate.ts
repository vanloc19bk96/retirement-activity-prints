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
import { ATOZ_CONFIG_SCHEMA, validateAtoZConfig } from './config'
import {
  ATOZ_BUILD_FAILED_MESSAGE,
  ATOZ_DEFAULT_TITLE,
  ATOZ_PAGE_TOO_SMALL_MESSAGE,
} from './content'
import type { AtoZListPlan } from './draw'
import { runAtoZKdpPreflight } from './kdp-preflight'
import { atoZContentBox, planAtoZPage, type AtoZPagePlan } from './layout'
import { atoZInstruction, parseAtoZLevel } from './levels'
import { drawAtoZPuzzle, planAnswersBand, planLettersBand } from './page'
import { tryBuildAtoZPuzzle, type AtoZPuzzle } from './place'

export { validateAtoZConfig }

const TEMPLATE_KEY = 'a-to-z-word-search'

function errorPage(
  ctx: StudioGenerateContext,
  config: StudioConfig,
  tag: StudioTag,
  instruction: string,
  message: string,
): StudioPageOutput {
  const header = drawHeader(atoZContentBox(ctx), config, tag, instruction)
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
  plan: AtoZPagePlan
  puzzle: AtoZPuzzle
  list: AtoZListPlan
  instruction: string
}): StudioFabricObject[] {
  const { config, ctx, tag, plan, puzzle, list, instruction } = options
  const header = drawHeader(atoZContentBox(ctx), config, tag, instruction)
  return [
    ...header.objects,
    ...drawAtoZPuzzle({
      field: header.body,
      plan,
      puzzle,
      list,
      font: String(config.fontFamily ?? STUDIO_DEFAULT_FONT),
      tag,
    }),
  ]
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const level = parseAtoZLevel(config)
  const instruction = atoZInstruction(config)
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)

  const tag: StudioTag = {
    templateKey: TEMPLATE_KEY,
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }
  const fail = (message: string) => [errorPage(ctx, config, tag, instruction, message)]

  // Measured against the heading and instruction this page will really carry, so
  // the grid size and type sizes the form promised are the ones that print.
  const plan = planAtoZPage({ page: ctx, config, instruction, level })
  if (!plan) return fail(ATOZ_PAGE_TOO_SMALL_MESSAGE)

  const puzzle = tryBuildAtoZPuzzle({
    level,
    gridSide: plan.gridSide,
    maxWordLetters: plan.maxWordLetters,
    seed: ctx.seed,
  })
  if (!puzzle) return fail(ATOZ_BUILD_FAILED_MESSAGE)

  const header = drawHeader(atoZContentBox(ctx), config, tag, instruction)
  const bandWidth = header.body.width
  // Both bands are planned before either page is drawn. The solution's answers
  // are the taller block, and a puzzle whose own answer page will not fit is not
  // a puzzle this book can print — so it fails here rather than on the key.
  const lettersBand = planLettersBand({ plan, font, bandWidth })
  const answersBand = planAnswersBand({ plan, puzzle, font, bandWidth })
  if (!lettersBand || !answersBand) return fail(ATOZ_PAGE_TOO_SMALL_MESSAGE)

  const preflight = runAtoZKdpPreflight({
    puzzle,
    plan,
    level,
    lettersBand,
    answersBand,
  })
  if (!preflight.ok) return fail(preflight.errors[0] ?? ATOZ_BUILD_FAILED_MESSAGE)

  const shared = { config, ctx, tag, plan, puzzle }
  return [
    {
      pageRole: 'single',
      objects: layoutPage({ ...shared, list: lettersBand, instruction }),
      // The solution is the same grid with every word circled, and the alphabet
      // filled in: this is the only page in the pair that prints the words at
      // all, which is what makes it worth reading rather than just checking.
      answerSourceObjects: layoutPage({ ...shared, list: answersBand, instruction: '' }),
    },
  ]
}

export const atoZWordSearchTemplate: StudioTemplateDefinition = {
  key: TEMPLATE_KEY,
  label: 'A to Z Word Search',
  category: 'word',
  description:
    'Alphabet soup: twenty-six words are hidden in the grid, one beginning with each letter from A to Z — and the page prints only the letters, never the words. Pick a level; the grid size and type sizes are fitted to your page. The answer page reveals every letter’s word.',
  pageCount: 1,
  producesAnswerKey: true,
  defaultPageTitle: ATOZ_DEFAULT_TITLE,
  validateConfig: validateAtoZConfig,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g font-size="6" fill="currentColor" font-family="monospace" text-anchor="middle">
      <text x="32" y="10">Q U I L T R</text>
      <text x="32" y="19">Z E B R A N</text>
    </g>
    <g fill="none" stroke="currentColor" stroke-width="1.2">
      <rect x="8" y="4" width="34" height="8" rx="4"/>
    </g>
    <g font-size="6" fill="currentColor" font-family="sans-serif" text-anchor="middle" font-weight="bold">
      <text x="32" y="31">A B C D E F G</text>
      <text x="32" y="38">H I J … X Y Z</text>
    </g>
  </svg>`,
  configSchema: ATOZ_CONFIG_SCHEMA,
  generate,
}
