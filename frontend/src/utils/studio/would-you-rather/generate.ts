import type {
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
  StudioTemplateDefinition,
} from '@/types/studio-template.types'
import { STUDIO_BODY_SIZE, STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import { boxCenterX, drawHeader } from '../studio-layout'
import { buildText, type StudioTag } from '../studio-fabric-builders'
import { WYR_CONFIG_SCHEMA, instructionFor, validateWyrConfig, wantsReasonLine } from './config'
import {
  WYR_AI_EMPTY_MESSAGE,
  WYR_BUILD_FAILED_MESSAGE,
  WYR_DEFAULT_TITLE,
  WYR_PAGE_TOO_SMALL_MESSAGE,
  WYR_TEMPLATE_KEY,
  parseWyrPayload,
  selectWyrPairs,
} from './content'
import { drawWyrPage } from './draw'
import { fitWyrPairs } from './fit'
import { runWyrKdpPreflight } from './kdp-preflight'
import { wyrContentBox, wyrWorstCasePlan } from './layout'
import { WYR_REQUEST_COUNT, wouldYouRatherPrefetch } from './prefetch'

export { validateWyrConfig }

function errorPage(
  ctx: StudioGenerateContext,
  config: StudioConfig,
  tag: StudioTag,
  message: string,
): StudioPageOutput {
  const header = drawHeader(wyrContentBox(ctx), config, tag, instructionFor(config))
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
 * One page of Would You Rather questions. No answer page: there is no right
 * answer, only the reader's.
 *
 * Measured first, filled second, checked third. The worst-case plan fixes the
 * question count and type size from the trim alone, so the form's
 * note is what prints and every page of a run matches. The prefetched pairs
 * are validated again here — whatever reached `remoteData` — then held to that
 * plan; a pair that will not fit is passed over for the next one. The
 * preflight then re-proves the page before anything is returned.
 */
function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)
  const instruction = instructionFor(config)
  const reasonLine = wantsReasonLine(config)
  const tag: StudioTag = {
    templateKey: WYR_TEMPLATE_KEY,
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }
  const fail = (message: string) => [errorPage(ctx, config, tag, message)]

  const promised = wyrWorstCasePlan({ page: ctx, config, instruction, font, reasonLine })
  if (!promised) return fail(WYR_PAGE_TOO_SMALL_MESSAGE)

  const pairs = selectWyrPairs(parseWyrPayload(ctx.remoteData), { cap: WYR_REQUEST_COUNT })
  if (pairs.length === 0) return fail(WYR_AI_EMPTY_MESSAGE)

  const fitted = fitWyrPairs(pairs, promised, font)
  if (!fitted) return fail(WYR_BUILD_FAILED_MESSAGE)

  const header = drawHeader(wyrContentBox(ctx), config, tag, instruction)
  const preflight = runWyrKdpPreflight({
    pairs: fitted.pairs,
    plan: fitted.plan,
    fieldHeight: header.body.height,
  })
  if (!preflight.ok) return fail(preflight.errors[0] ?? WYR_BUILD_FAILED_MESSAGE)

  const objects = [...header.objects]
  drawWyrPage(objects, { field: header.body, plan: fitted.plan, pairs: fitted.pairs, font, tag })
  return [{ pageRole: 'single', objects }]
}

export const wouldYouRatherTemplate: StudioTemplateDefinition = {
  key: WYR_TEMPLATE_KEY,
  label: 'Would You Rather',
  category: 'word',
  description:
    'Retirement Edition: two tempting choices from one scenario — “spend a spring weekend in a cottage by the sea” or “at a farmhouse in the hills” — with a box to tick. Great for conversation, couples and parties. Pick a theme and tone; questions per page and type size are fitted to your page. Fresh questions every page, never repeated within your book.',
  pageCount: 1,
  producesAnswerKey: false,
  defaultPageTitle: WYR_DEFAULT_TITLE,
  validateConfig: validateWyrConfig,
  prefetch: wouldYouRatherPrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g font-family="serif" font-size="4.6" font-weight="700" fill="currentColor">
      <text x="6" y="7">1. Would you rather…</text>
    </g>
    <g fill="none" stroke="currentColor" stroke-width="0.8">
      <rect x="6" y="10" width="52" height="9" rx="2"/>
      <rect x="6" y="28" width="52" height="9" rx="2"/>
      <rect x="9" y="12.8" width="3.4" height="3.4" rx="0.5"/>
      <rect x="9" y="30.8" width="3.4" height="3.4" rx="0.5"/>
      <circle cx="32" cy="23.5" r="3.4"/>
    </g>
    <g stroke="currentColor" stroke-width="0.6" stroke-linecap="round" opacity="0.6">
      <path d="M15 14.5h32M15 32.5h28M16 23.5h11M37 23.5h11"/>
    </g>
    <text x="32" y="24.8" font-family="sans-serif" font-size="3.2" font-weight="700" text-anchor="middle" fill="currentColor">OR</text>
  </svg>`,
  configSchema: WYR_CONFIG_SCHEMA,
  generate,
}
