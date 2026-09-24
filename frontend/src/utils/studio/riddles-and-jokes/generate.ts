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
import { RJ_CONFIG_SCHEMA, instructionFor, validateRjConfig } from './config'
import {
  RJ_AI_EMPTY_MESSAGE,
  RJ_BUILD_FAILED_MESSAGE,
  RJ_DEFAULT_TITLE,
  RJ_PAGE_TOO_SMALL_MESSAGE,
  RJ_TEMPLATE_KEY,
  parseRjMix,
  parseRjPayload,
  selectRjItems,
} from './content'
import { drawRjPage, type RjDrawMode } from './draw'
import { fitRjItems, type FittedRjItem } from './fit'
import { runRjKdpPreflight } from './kdp-preflight'
import { rjContentBox, rjWorstCasePlan, type RjPagePlan } from './layout'
import { RJ_REQUEST_COUNT, riddlesJokesPrefetch } from './prefetch'

export { validateRjConfig }

function errorPage(
  ctx: StudioGenerateContext,
  config: StudioConfig,
  tag: StudioTag,
  message: string,
): StudioPageOutput {
  const header = drawHeader(rjContentBox(ctx), config, tag, instructionFor(config))
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
  plan: RjPagePlan
  items: readonly FittedRjItem[]
  font: string
  instruction: string
  mode: RjDrawMode
}): StudioFabricObject[] {
  const { config, ctx, tag, plan, items, font, instruction, mode } = options
  const header = drawHeader(rjContentBox(ctx), config, tag, instruction)
  const objects = [...header.objects]
  drawRjPage(objects, { field: header.body, plan, items, font, tag, mode })
  return objects
}

/**
 * One page of retirement riddles and jokes, and its answer page.
 *
 * Measured first, filled second, checked third. The worst-case plan fixes the
 * item count, type size and the page's line budget from the trim alone, so
 * the form's note is what prints and every page of a run matches. The
 * prefetched items are validated again here — whatever reached `remoteData` —
 * then held to that plan; an item that will not fit is passed over for the
 * next one. The preflight re-proves the page before anything is returned.
 *
 * The answer page is drawn from the very same fitted items in the same order,
 * so each answer can only ever print under its own question's number.
 */
function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)
  const mix = parseRjMix(config.mix)
  const instruction = instructionFor(config)
  const tag: StudioTag = {
    templateKey: RJ_TEMPLATE_KEY,
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }
  const fail = (message: string) => [errorPage(ctx, config, tag, message)]

  const promised = rjWorstCasePlan({ page: ctx, config, instruction, font })
  if (!promised) return fail(RJ_PAGE_TOO_SMALL_MESSAGE)

  const items = selectRjItems(parseRjPayload(ctx.remoteData), { cap: RJ_REQUEST_COUNT, mix })
  if (items.length === 0) return fail(RJ_AI_EMPTY_MESSAGE)

  const fitted = fitRjItems(items, promised, font, ctx.seed)
  if (!fitted) return fail(RJ_BUILD_FAILED_MESSAGE)

  const preflight = runRjKdpPreflight({ items: fitted.items, plan: fitted.plan, mix })
  if (!preflight.ok) return fail(preflight.errors[0] ?? RJ_BUILD_FAILED_MESSAGE)

  const shared = { config, ctx, tag, plan: fitted.plan, items: fitted.items, font }
  return [
    {
      pageRole: 'single',
      objects: layoutPage({ ...shared, instruction, mode: 'puzzle' }),
      // Same numbers, each with its answer. The how-to line is dropped: a
      // reader checking answers has already read it.
      answerSourceObjects: layoutPage({ ...shared, instruction: '', mode: 'answers' }),
    },
  ]
}

export const riddlesJokesTemplate: StudioTemplateDefinition = {
  key: RJ_TEMPLATE_KEY,
  label: 'Riddles & Jokes',
  category: 'word',
  description:
    'Retirement Edition: about eight short, clean riddles and jokes a page — naps, golf, gardening, coffee, travel, retirement parties and life without alarm clocks. Guess each answer, then check the answer page. Every item is checked for a clear answer and a real punchline before it prints. Pick a theme and the mix; items per page and type size are fitted to your page. Fresh, original items every page, never repeated within your book.',
  pageCount: 1,
  producesAnswerKey: true,
  defaultPageTitle: RJ_DEFAULT_TITLE,
  validateConfig: validateRjConfig,
  prefetch: riddlesJokesPrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g font-family="serif" font-size="3.8" font-weight="700" fill="currentColor">
      <text x="5" y="8">1.</text>
      <text x="5" y="19">2.</text>
      <text x="5" y="30">3.</text>
    </g>
    <g stroke="currentColor" stroke-width="0.7" stroke-linecap="round" opacity="0.65">
      <path d="M12 7h42M12 11h26"/>
      <path d="M12 18h38"/>
      <path d="M12 29h44M12 33h20"/>
    </g>
    <g font-family="serif" font-size="4.2" font-weight="700" fill="currentColor">
      <text x="40" y="12.3">?</text>
      <text x="52" y="19.3">?</text>
      <text x="34" y="34.3">?</text>
    </g>
    <g stroke="currentColor" stroke-width="0.4" opacity="0.35">
      <path d="M5 14.5h54M5 25.5h54"/>
    </g>
  </svg>`,
  configSchema: RJ_CONFIG_SCHEMA,
  generate,
}
