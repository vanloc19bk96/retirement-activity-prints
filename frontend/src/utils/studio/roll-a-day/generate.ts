import type {
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
  StudioTemplateDefinition,
} from '@/types/studio-template.types'
import { STUDIO_BODY_SIZE, STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import { boxCenterX, drawHeader } from '../studio-layout'
import { buildText, type StudioTag } from '../studio-fabric-builders'
import { RD_CONFIG_SCHEMA, instructionFor } from './config'
import {
  RD_AI_EMPTY_MESSAGE,
  RD_BUILD_FAILED_MESSAGE,
  RD_DEFAULT_TITLE,
  RD_PAGE_TOO_SMALL_MESSAGE,
  RD_TEMPLATE_KEY,
  buildRdTable,
  cleanRdPools,
  parseRdPayload,
  sideCanFill,
} from './content'
import { drawRdPage } from './draw'
import { runRdKdpPreflight } from './kdp-preflight'
import { breakActivity, rdContentBox, rdWorstCasePlan } from './layout'
import { rollADayPrefetch } from './prefetch'

function errorPage(
  ctx: StudioGenerateContext,
  config: StudioConfig,
  tag: StudioTag,
  message: string,
): StudioPageOutput {
  const header = drawHeader(rdContentBox(ctx), config, tag, instructionFor(config))
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
 * One Roll-a-Day page. No answer page: every roll is a right answer.
 *
 * Measured first, filled second, checked third. The worst-case plan fixes the
 * type size and the write-in from the trim alone, so the form's note is what
 * prints. The prefetched activities are validated again here — whatever
 * reached `remoteData` — as one set, then held to that plan: an activity that
 * wraps past its row is passed over for a spare. The table is printed whole
 * (six mornings, six afternoons) or not at all, and the preflight re-proves
 * the page before anything is returned.
 */
function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)
  const instruction = instructionFor(config)
  const tag: StudioTag = { templateKey: RD_TEMPLATE_KEY, instanceId: ctx.instanceId, pageRole: 'single' }
  const fail = (message: string) => [errorPage(ctx, config, tag, message)]

  const plan = rdWorstCasePlan({ page: ctx, config, instruction, font })
  if (!plan) return fail(RD_PAGE_TOO_SMALL_MESSAGE)

  const pools = cleanRdPools(parseRdPayload(ctx.remoteData))
  if (!sideCanFill(pools.morning) || !sideCanFill(pools.afternoon)) return fail(RD_AI_EMPTY_MESSAGE)
  const table = buildRdTable(pools, (activity) => breakActivity(activity, plan, font).length <= plan.lines)
  if (!table) return fail(RD_BUILD_FAILED_MESSAGE)

  const header = drawHeader(rdContentBox(ctx), config, tag, instruction)
  const preflight = runRdKdpPreflight({ table, plan, field: header.body, font })
  if (!preflight.ok) return fail(preflight.errors[0] ?? RD_BUILD_FAILED_MESSAGE)

  const objects = [...header.objects]
  drawRdPage(objects, { field: header.body, plan, table, font, tag })
  return [{ pageRole: 'single', objects }]
}

export const rollADayTemplate: StudioTemplateDefinition = {
  key: RD_TEMPLATE_KEY,
  label: 'Roll-a-Day: Retirement Edition',
  category: 'word',
  description:
    'A playful plan-your-day game for retirement books: roll a die for your morning, roll again for your afternoon, and put the two together — “Take a slow walk and grab a coffee” + “Bake a small batch of scones”. Six morning and six afternoon ideas beside their die faces make 36 possible days, and every pairing works. Each side mixes calm and active, home and out, solo and social, and never assumes a car, a big budget or great fitness. Pick the mix; type size is fitted to your page. Fresh ideas every page, never repeated within your book.',
  pageCount: 1,
  producesAnswerKey: false,
  defaultPageTitle: RD_DEFAULT_TITLE,
  prefetch: rollADayPrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g font-family="serif" font-size="3.4" font-weight="700" fill="currentColor">
      <text x="5" y="6">Roll #1: Morning</text>
      <text x="5" y="23.5">Roll #2: Afternoon</text>
    </g>
    <path d="M5 7.6h54M5 25.1h54" stroke="currentColor" stroke-width="0.6"/>
    <g fill="none" stroke="currentColor" stroke-width="0.6">
      <rect x="5" y="9.6" width="4.6" height="4.6" rx="0.9"/>
      <rect x="5" y="15.6" width="4.6" height="4.6" rx="0.9"/>
      <rect x="5" y="27.1" width="4.6" height="4.6" rx="0.9"/>
      <rect x="5" y="33.1" width="4.6" height="4.6" rx="0.9"/>
    </g>
    <g fill="currentColor">
      <circle cx="7.3" cy="11.9" r="0.55"/>
      <circle cx="6.2" cy="16.8" r="0.55"/><circle cx="8.4" cy="19" r="0.55"/>
      <circle cx="6.2" cy="28.3" r="0.55"/><circle cx="7.3" cy="29.4" r="0.55"/><circle cx="8.4" cy="30.5" r="0.55"/>
      <circle cx="6.2" cy="34.3" r="0.55"/><circle cx="8.4" cy="34.3" r="0.55"/><circle cx="6.2" cy="36.5" r="0.55"/><circle cx="8.4" cy="36.5" r="0.55"/>
    </g>
    <g stroke="currentColor" stroke-width="0.7" stroke-linecap="round" opacity="0.65">
      <path d="M12.5 11.9h34M12.5 17.9h28M12.5 29.4h31M12.5 35.4h36"/>
    </g>
  </svg>`,
  configSchema: RD_CONFIG_SCHEMA,
  generate,
}
