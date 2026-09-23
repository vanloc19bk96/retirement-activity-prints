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
import { WORD_WHEEL_CONFIG_SCHEMA } from './config'
import {
  WORD_WHEEL_BUILD_FAILED_MESSAGE,
  WORD_WHEEL_DEFAULT_TITLE,
  WORD_WHEEL_PAGE_TOO_SMALL_MESSAGE,
  buildWordWheelPuzzle,
  type WordWheelPuzzle,
} from './content'
import { runWordWheelKdpPreflight } from './kdp-preflight'
import {
  planWordWheelPage,
  wordWheelBodyField,
  wordWheelContentBox,
  type WordWheelPagePlan,
} from './layout'
import { parseWordWheelLevel, wordWheelInstruction, type WordWheelLevel } from './levels'
import {
  drawWordWheelPuzzlePage,
  drawWordWheelSolutionPage,
  planWordWheelSheet,
  type WordWheelSheet,
} from './page'

const TEMPLATE_KEY = 'word-wheel'

function errorPage(
  ctx: StudioGenerateContext,
  config: StudioConfig,
  tag: StudioTag,
  instruction: string,
  message: string,
): StudioPageOutput {
  const header = drawHeader(wordWheelContentBox(ctx), config, tag, instruction)
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

interface SheetOptions {
  config: StudioConfig
  ctx: StudioGenerateContext
  tag: StudioTag
  plan: WordWheelPagePlan
  puzzle: WordWheelPuzzle
  sheet: WordWheelSheet
  level: WordWheelLevel
  font: string
}

/**
 * Draw one page: the heading it carries, and the blocks in the body column.
 *
 * `instruction` is what this page prints under its heading; `bodyInstruction`
 * is what the *puzzle* page prints, and the body column is measured from that
 * one on both pages. Without the split the solution page — which carries no
 * instruction — would start its column two lines higher and print the wheel
 * somewhere else, which is the one thing a reader flipping between a puzzle and
 * its answer cannot afford. The solution simply carries that space as air under
 * its heading instead.
 */
function layoutPage(
  options: SheetOptions & {
    instruction: string
    bodyInstruction: string
    draw: typeof drawWordWheelPuzzlePage
  },
): StudioFabricObject[] {
  const { config, ctx, tag, instruction, bodyInstruction, draw, ...rest } = options
  const header = drawHeader(wordWheelContentBox(ctx), config, tag, instruction)
  const field = wordWheelBodyField(ctx, config, bodyInstruction)
  return [...header.objects, ...draw({ ...rest, field, tag })]
}

/**
 * One word wheel, and the solution page that answers it.
 *
 * The order matters and is the whole reliability story of this game. The puzzle
 * is built first and entirely without reference to the page, because nine
 * letters that spell a real word are a fact about the words, not about the
 * trim. The page is then laid out around it, the two lower blocks are fitted,
 * and only then is the number the puzzle page prints worked out — from the list
 * that survived, so the promise and the answer page cannot disagree. Preflight
 * re-checks all of it against the built puzzle before a single object is kept.
 */
function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const level = parseWordWheelLevel(config)
  const instruction = wordWheelInstruction(config)
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)

  const tag: StudioTag = {
    templateKey: TEMPLATE_KEY,
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }
  const fail = (message: string) => [errorPage(ctx, config, tag, instruction, message)]

  const plan = planWordWheelPage({ page: ctx, config, instruction })
  if (!plan) return fail(WORD_WHEEL_PAGE_TOO_SMALL_MESSAGE)

  const puzzle = buildWordWheelPuzzle({ level, seed: ctx.seed })
  if (!puzzle) return fail(WORD_WHEEL_BUILD_FAILED_MESSAGE)

  const bandWidth = wordWheelBodyField(ctx, config, instruction).width
  const sheet = planWordWheelSheet({ plan, puzzle, level, bandWidth, font })
  if (!sheet) return fail(WORD_WHEEL_PAGE_TOO_SMALL_MESSAGE)

  const preflight = runWordWheelKdpPreflight({ puzzle, plan, sheet, level, bandWidth })
  if (!preflight.ok) return fail(preflight.errors[0] ?? WORD_WHEEL_BUILD_FAILED_MESSAGE)

  const shared = { config, ctx, tag, plan, puzzle, sheet, level, font }
  return [
    {
      pageRole: 'single',
      objects: layoutPage({
        ...shared,
        instruction,
        bodyInstruction: instruction,
        draw: drawWordWheelPuzzlePage,
      }),
      // The solution is the same wheel in the same place with the nine-letter
      // word written onto its slots, and the blank lines replaced by the words
      // this book found. A reader checking an answer is looking at the page they
      // just worked on rather than at a bare list they have to match up.
      answerSourceObjects: layoutPage({
        ...shared,
        instruction: '',
        bodyInstruction: instruction,
        draw: drawWordWheelSolutionPage,
      }),
    },
  ]
}

export const wordWheelTemplate: StudioTemplateDefinition = {
  key: TEMPLATE_KEY,
  label: 'Word Wheel',
  category: 'word',
  description:
    'Nine big letters in a wheel: make as many words as you can, and every one must use the letter in the middle. One word uses all nine — a retirement word hidden in the ring. Pick a level; the wheel size, letter size and answer lines are fitted to your page. The answer page reveals the nine-letter word and lists the rest.',
  pageCount: 1,
  producesAnswerKey: true,
  defaultPageTitle: WORD_WHEEL_DEFAULT_TITLE,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" stroke="currentColor" stroke-width="1.1">
      <circle cx="32" cy="18" r="15"/>
      <circle cx="32" cy="18" r="5.4" stroke-width="2.2"/>
      <circle cx="32" cy="18" r="4"/>
      <path d="M34 13.3 36.8 8.2M37.9 16 43.3 14.6M37.9 20 43.3 21.4M34 22.7 36.8 27.8M30 22.7 27.2 27.8M26.1 20 20.7 21.4M26.1 16 20.7 14.6M30 13.3 27.2 8.2"/>
    </g>
    <g font-size="5" fill="currentColor" font-family="serif" text-anchor="middle">
      <text x="32" y="8">G</text><text x="39.5" y="11.5">A</text><text x="42.5" y="19.5">R</text>
      <text x="39.5" y="27">D</text><text x="32" y="30.5">E</text><text x="24.5" y="27">I</text>
      <text x="21.5" y="19.5">N</text><text x="24.5" y="11.5">G</text>
    </g>
    <text x="32" y="20.4" font-size="6.5" font-weight="bold" fill="currentColor" font-family="serif" text-anchor="middle">N</text>
    <g stroke="currentColor" stroke-width="1" stroke-linecap="round">
      <path d="M10 37h13M27 37h13M44 37h10"/>
    </g>
  </svg>`,
  configSchema: WORD_WHEEL_CONFIG_SCHEMA,
  generate,
}
