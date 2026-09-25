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
import { WL_CONFIG_SCHEMA, instructionFor } from './config'
import {
  WL_AI_EMPTY_MESSAGE,
  WL_BUILD_FAILED_MESSAGE,
  WL_DEFAULT_TITLE,
  WL_PAGE_TOO_SMALL_MESSAGE,
  WL_TEMPLATE_KEY,
  parseWlLevel,
  parseWlPayload,
  selectWlPairs,
} from './content'
import { drawWlPage, type WlDrawMode } from './draw'
import { fitWlPairs, type FittedWlPair } from './fit'
import { runWlKdpPreflight } from './kdp-preflight'
import { wlContentBox, wlWorstCasePlan, type WlPagePlan } from './layout'
import { workLingoPrefetch } from './prefetch'

function errorPage(
  ctx: StudioGenerateContext,
  config: StudioConfig,
  tag: StudioTag,
  message: string,
): StudioPageOutput {
  const header = drawHeader(wlContentBox(ctx), config, tag, instructionFor(config))
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
  plan: WlPagePlan
  pairs: readonly FittedWlPair[]
  font: string
  instruction: string
  mode: WlDrawMode
}): StudioFabricObject[] {
  const { config, ctx, tag, plan, pairs, font, instruction, mode } = options
  const header = drawHeader(wlContentBox(ctx), config, tag, instruction)
  const objects = [...header.objects]
  drawWlPage(objects, { field: header.body, plan, pairs, font, tag, mode })
  return objects
}

/**
 * One Work Lingo Match page, and its answer page.
 *
 * Measured first, filled second, checked third. The worst-case plan fixes the
 * pair count, type size and the page's line budgets from the trim and level
 * alone, so the form's note is what prints and every page of a run matches.
 * The prefetched pairs — all from one jointly checked response — are
 * validated again here, whatever reached `remoteData`, then held to that plan;
 * a pair that will not fit is passed over for the next one. The preflight
 * re-proves the page before anything is returned.
 *
 * The answer page is drawn from the very same fitted pairs, letters and
 * meanings included, so it can only ever show the puzzle's own answers.
 */
function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)
  const level = parseWlLevel(config.level)
  const instruction = instructionFor(config)
  const tag: StudioTag = {
    templateKey: WL_TEMPLATE_KEY,
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }
  const fail = (message: string) => [errorPage(ctx, config, tag, message)]

  const promised = wlWorstCasePlan({ page: ctx, config, instruction, font, level })
  if (!promised) return fail(WL_PAGE_TOO_SMALL_MESSAGE)

  const pairs = selectWlPairs(parseWlPayload(ctx.remoteData), { cap: Number.POSITIVE_INFINITY })
  if (pairs.length === 0) return fail(WL_AI_EMPTY_MESSAGE)

  const fitted = fitWlPairs(pairs, promised, font, ctx.seed)
  if (!fitted) return fail(WL_BUILD_FAILED_MESSAGE)

  const preflight = runWlKdpPreflight(fitted)
  if (!preflight.ok) return fail(preflight.errors[0] ?? WL_BUILD_FAILED_MESSAGE)

  const shared = { config, ctx, tag, plan: fitted.plan, pairs: fitted.pairs, font }
  return [
    {
      pageRole: 'single',
      objects: layoutPage({ ...shared, instruction, mode: 'puzzle' }),
      // Same numbers, each box holding its letter, each meaning under its
      // phrase. The how-to line is dropped: a reader checking answers has
      // already read it.
      answerSourceObjects: layoutPage({ ...shared, instruction: '', mode: 'answers' }),
    },
  ]
}

export const workLingoTemplate: StudioTemplateDefinition = {
  key: WL_TEMPLATE_KEY,
  label: 'Work Lingo Match',
  category: 'word',
  description:
    'Retirement Edition: how many of these workplace phrases do you remember? Match office classics like "circle back", "touch base" and "low-hanging fruit" to their plain-English meanings by writing a letter in each box. Every phrase is checked to be real, with one clear meaning on the page. Pick a level; the number of pairs and type size are fitted to your page. Fresh phrases every page, never repeated within your book.',
  pageCount: 1,
  producesAnswerKey: true,
  defaultPageTitle: WL_DEFAULT_TITLE,
  prefetch: workLingoPrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" stroke="currentColor" stroke-width="0.7">
      <rect x="5" y="4" width="4.6" height="4.6" rx="0.6"/>
      <rect x="5" y="11" width="4.6" height="4.6" rx="0.6"/>
      <rect x="5" y="18" width="4.6" height="4.6" rx="0.6"/>
    </g>
    <g font-family="serif" font-size="3.6" font-weight="700" fill="currentColor">
      <text x="11.5" y="7.8">1.</text>
      <text x="11.5" y="14.8">2.</text>
      <text x="11.5" y="21.8">3.</text>
      <text x="5.2" y="30.3">A.</text>
      <text x="5.2" y="36.3">B.</text>
    </g>
    <g stroke="currentColor" stroke-linecap="round">
      <path d="M17 6.4h22M17 13.4h28M17 20.4h18" stroke-width="1.4"/>
      <path d="M12 29h40M12 35h32" stroke-width="0.7" opacity="0.65"/>
    </g>
    <path d="M5 25.2h54" stroke="currentColor" stroke-width="0.4" opacity="0.35"/>
  </svg>`,
  configSchema: WL_CONFIG_SCHEMA,
  generate,
}
