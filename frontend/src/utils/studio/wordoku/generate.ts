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
import { createRng } from '../studio-rng'
import { boxCenterX, drawHeader } from '../studio-layout'
import { buildText, type StudioTag } from '../studio-fabric-builders'
import { WORDOKU_CONFIG_SCHEMA } from './config'
import {
  WORDOKU_BUILD_FAILED_MESSAGE,
  WORDOKU_DEFAULT_TITLE,
  WORDOKU_PAGE_TOO_SMALL_MESSAGE,
  rememberWordokuTarget,
  wordokuTargetCandidates,
} from './content'
import { drawWordokuBody } from './draw'
import { runWordokuKdpPreflight } from './kdp-preflight'
import { planWordokuPage, wordokuBodyField, wordokuContentBox } from './layout'
import { parseWordokuLevel, wordokuInstruction } from './levels'
import { buildWordokuPuzzle, type WordokuPuzzle } from './puzzle'

const TEMPLATE_KEY = 'wordoku'

/**
 * How many words a page tries before it gives up. Every curated word carves at
 * every level in practice; the cap only bounds the worst case so a pathological
 * seed cannot stall a forty-page book.
 */
const MAX_TARGET_TRIES = 6

function errorPage(
  ctx: StudioGenerateContext,
  config: StudioConfig,
  tag: StudioTag,
  instruction: string,
  message: string,
): StudioPageOutput {
  const header = drawHeader(wordokuContentBox(ctx), config, tag, instruction)
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

/**
 * One Word-oku, and the solution page that answers it.
 *
 * The page is planned before the puzzle is built, because the plan decides
 * whether this trim can carry large-print letters at all — there is no point
 * carving a grid for a page that will refuse it. The puzzle is then built from
 * the first word that carves, preflight re-checks word, grid and layout
 * together, and only a page that passes every check is drawn. Anything else
 * becomes a plain message on the page rather than a broken puzzle in the book.
 */
function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const level = parseWordokuLevel(config)
  const instruction = wordokuInstruction(config)
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)
  void kickOffFontFamilyLoading(STUDIO_DIGIT_FONT)

  const tag: StudioTag = {
    templateKey: TEMPLATE_KEY,
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }
  const fail = (message: string) => [errorPage(ctx, config, tag, instruction, message)]

  const field = wordokuBodyField(ctx, config, instruction)
  const plan = planWordokuPage({ field, pageWidth: ctx.pageWidth })
  if (!plan) return fail(WORDOKU_PAGE_TOO_SMALL_MESSAGE)

  const rng = createRng(ctx.seed)
  let built: WordokuPuzzle | null = null
  for (const target of wordokuTargetCandidates(ctx.seed).slice(0, MAX_TARGET_TRIES)) {
    built = buildWordokuPuzzle({ target, level, rng })
    if (built) break
  }
  if (!built) return fail(WORDOKU_BUILD_FAILED_MESSAGE)
  const puzzle = built

  const preflight = runWordokuKdpPreflight({ puzzle, level, plan, field })
  if (!preflight.ok) return fail(preflight.errors[0] ?? WORDOKU_BUILD_FAILED_MESSAGE)
  rememberWordokuTarget(puzzle.target.word)

  const page = (pageInstruction: string): StudioFabricObject[] => {
    // The header carries this page's own instruction (none on the solution),
    // but the body always sits where the puzzle page's plan put it.
    const header = drawHeader(wordokuContentBox(ctx), config, tag, pageInstruction)
    return [...header.objects, ...drawWordokuBody({ plan, puzzle, tag, font })]
  }

  return [
    {
      pageRole: 'single',
      objects: page(instruction),
      // Same body, drawn afresh: the key reveals its answers — every blank
      // cell and the nine hidden-word boxes — without the how-to line.
      answerSourceObjects: page(''),
    },
  ]
}

export const wordokuTemplate: StudioTemplateDefinition = {
  key: TEMPLATE_KEY,
  label: 'Word-oku',
  category: 'logic',
  description:
    'Sudoku with nine letters instead of numbers. Solve it and the shaded diagonal spells a hidden retirement word. Large-print letters, one puzzle to a page, a letter bank and a gentle hint — pick a level and every page has exactly one solution, plus its own answer page.',
  pageCount: 1,
  producesAnswerKey: true,
  defaultPageTitle: WORDOKU_DEFAULT_TITLE,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g transform="translate(17 5)">
      <g fill="currentColor" fill-opacity="0.22">
        <rect x="0" y="0" width="10" height="10"/>
        <rect x="10" y="10" width="10" height="10"/>
        <rect x="20" y="20" width="10" height="10"/>
      </g>
      <g fill="none" stroke="currentColor">
        <rect x="0" y="0" width="30" height="30" stroke-width="1.6"/>
        <path d="M10 0v30M20 0v30M0 10h30M0 20h30" stroke-width="1"/>
      </g>
    </g>
    <g font-size="7.5" font-weight="bold" fill="currentColor" font-family="sans-serif" text-anchor="middle" dominant-baseline="central">
      <text x="22" y="10">W</text>
      <text x="32" y="20">O</text>
      <text x="42" y="30">R</text>
      <text x="42" y="10">K</text>
      <text x="22" y="30">D</text>
    </g>
  </svg>`,
  configSchema: WORDOKU_CONFIG_SCHEMA,
  generate,
}
