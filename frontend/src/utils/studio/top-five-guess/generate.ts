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
import { TOP_FIVE_CONFIG_SCHEMA, instructionFor, validateTopFiveConfig } from './config'
import {
  TOP_FIVE_AI_EMPTY_MESSAGE,
  TOP_FIVE_BUILD_FAILED_MESSAGE,
  TOP_FIVE_DEFAULT_TITLE,
  TOP_FIVE_PAGE_TOO_SMALL_MESSAGE,
  TOP_FIVE_TEMPLATE_KEY,
  parseTopFivePayload,
  selectTopFiveSets,
} from './content'
import { drawTopFivePage, type TopFiveDrawMode } from './draw'
import { fitTopFiveSets, type FittedTopFiveSet } from './fit'
import { runTopFiveKdpPreflight } from './kdp-preflight'
import {
  topFiveContentBox,
  topFiveWorstCasePlan,
  type TopFivePagePlan,
} from './layout'
import { TOP_FIVE_REQUEST_COUNT, topFiveGuessPrefetch } from './prefetch'

export { validateTopFiveConfig }

function errorPage(
  ctx: StudioGenerateContext,
  config: StudioConfig,
  tag: StudioTag,
  message: string,
): StudioPageOutput {
  const header = drawHeader(topFiveContentBox(ctx), config, tag, instructionFor(config))
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
  plan: TopFivePagePlan
  sets: readonly FittedTopFiveSet[]
  font: string
  instruction: string
  mode: TopFiveDrawMode
}): StudioFabricObject[] {
  const { config, ctx, tag, plan, sets, font, instruction, mode } = options
  const header = drawHeader(topFiveContentBox(ctx), config, tag, instruction)
  const objects = [...header.objects]
  drawTopFivePage(objects, { field: header.body, plan, sets, font, tag, mode })
  return objects
}

/**
 * One page of Top Five Guess questions, and its answer page.
 *
 * Measured first, filled second, checked third. The worst-case plan fixes the
 * question count, line pitch and type sizes from the trim alone, so the form's
 * note is what prints and every page of a run matches. The prefetched sets are
 * validated again here — whatever reached `remoteData` — then held to that
 * plan; a set that will not fit is passed over for the next one. The preflight
 * then re-proves the page before anything is returned.
 *
 * The answer page is drawn from the very same fitted sets, so the key can only
 * ever answer the questions on the puzzle page, in the order they were ranked.
 */
function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)
  const instruction = instructionFor(config)
  const tag: StudioTag = {
    templateKey: TOP_FIVE_TEMPLATE_KEY,
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }
  const fail = (message: string) => [errorPage(ctx, config, tag, message)]

  const promised = topFiveWorstCasePlan({ page: ctx, config, instruction, font })
  if (!promised) return fail(TOP_FIVE_PAGE_TOO_SMALL_MESSAGE)

  const sets = selectTopFiveSets(parseTopFivePayload(ctx.remoteData), {
    cap: TOP_FIVE_REQUEST_COUNT,
  })
  if (sets.length === 0) return fail(TOP_FIVE_AI_EMPTY_MESSAGE)

  const fitted = fitTopFiveSets(sets, promised, font)
  if (!fitted) return fail(TOP_FIVE_BUILD_FAILED_MESSAGE)

  const preflight = runTopFiveKdpPreflight({ sets: fitted.sets, plan: fitted.plan, font })
  if (!preflight.ok) return fail(preflight.errors[0] ?? TOP_FIVE_BUILD_FAILED_MESSAGE)

  const shared = { config, ctx, tag, plan: fitted.plan, sets: fitted.sets, font }
  return [
    {
      pageRole: 'single',
      objects: layoutPage({ ...shared, instruction, mode: 'puzzle' }),
      // Same questions, same order, answers and points written onto the lines.
      // The how-to line is dropped: a reader checking answers has already read it.
      answerSourceObjects: layoutPage({ ...shared, instruction: '', mode: 'answers' }),
    },
  ]
}

export const topFiveGuessTemplate: StudioTemplateDefinition = {
  key: TOP_FIVE_TEMPLATE_KEY,
  label: 'Top Five Guess',
  category: 'word',
  description:
    'Light retirement questions — “Name something you will never miss about the office” — with five lines to guess the most likely answers. The top answer scores 5 points, down to 1 for the fifth. Pick a theme; the number of questions, line spacing and type sizes are fitted to your page. Fresh questions every page. Includes an answer page.',
  pageCount: 1,
  producesAnswerKey: true,
  defaultPageTitle: TOP_FIVE_DEFAULT_TITLE,
  validateConfig: validateTopFiveConfig,
  prefetch: topFiveGuessPrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g font-family="serif" font-size="5" font-weight="700" fill="currentColor">
      <text x="8" y="8">Name something you love…</text>
    </g>
    <g stroke="currentColor" stroke-linecap="round">
      <path stroke-width="0.9" d="M8 14h32M8 20h32M8 26h32M8 32h32M8 38h32"/>
      <path stroke-width="0.9" d="M45 14h7M45 20h7M45 26h7M45 32h7M45 38h7"/>
    </g>
    <g font-family="sans-serif" font-size="3.4" fill="currentColor" opacity="0.6">
      <text x="53.5" y="13.6">pts</text><text x="53.5" y="19.6">pts</text>
      <text x="53.5" y="25.6">pts</text><text x="53.5" y="31.6">pts</text>
      <text x="53.5" y="37.6">pts</text>
    </g>
  </svg>`,
  configSchema: TOP_FIVE_CONFIG_SCHEMA,
  generate,
}
