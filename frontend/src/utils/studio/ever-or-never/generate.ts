import type {
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
  StudioTemplateDefinition,
} from '@/types/studio-template.types'
import { STUDIO_BODY_SIZE, STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import { boxCenterX, drawHeader } from '../studio-layout'
import { buildText, type StudioTag } from '../studio-fabric-builders'
import { EON_CONFIG_SCHEMA, instructionFor, validateEonConfig, wantsStoryLine } from './config'
import {
  EON_AI_EMPTY_MESSAGE,
  EON_BUILD_FAILED_MESSAGE,
  EON_DEFAULT_TITLE,
  EON_PAGE_TOO_SMALL_MESSAGE,
  EON_TEMPLATE_KEY,
  parseEonPayload,
  selectEonStatements,
} from './content'
import { drawEonPage } from './draw'
import { fitEonStatements } from './fit'
import { runEonKdpPreflight } from './kdp-preflight'
import { eonContentBox, eonWorstCasePlan } from './layout'
import { EON_REQUEST_COUNT, everOrNeverPrefetch } from './prefetch'

export { validateEonConfig }

function errorPage(
  ctx: StudioGenerateContext,
  config: StudioConfig,
  tag: StudioTag,
  message: string,
): StudioPageOutput {
  const header = drawHeader(eonContentBox(ctx), config, tag, instructionFor(config))
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
 * One page of Ever or Never statements. No answer page: there is no right
 * answer, only the reader's.
 *
 * Measured first, filled second, checked third. The worst-case plan fixes the
 * statement count, type size and arrangement from the trim alone, so the
 * form's note is what prints and every page of a run matches. The prefetched
 * statements are validated again here — whatever reached `remoteData` — then
 * held to that plan; one that will not fit is passed over for the next. The
 * preflight then re-proves the page before anything is returned.
 */
function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)
  const instruction = instructionFor(config)
  const storyLine = wantsStoryLine(config)
  const tag: StudioTag = {
    templateKey: EON_TEMPLATE_KEY,
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }
  const fail = (message: string) => [errorPage(ctx, config, tag, message)]

  const promised = eonWorstCasePlan({ page: ctx, config, instruction, font, storyLine })
  if (!promised) return fail(EON_PAGE_TOO_SMALL_MESSAGE)

  const items = selectEonStatements(parseEonPayload(ctx.remoteData), { cap: EON_REQUEST_COUNT })
  if (items.length === 0) return fail(EON_AI_EMPTY_MESSAGE)

  const fitted = fitEonStatements(items, promised, font)
  if (!fitted) return fail(EON_BUILD_FAILED_MESSAGE)

  const header = drawHeader(eonContentBox(ctx), config, tag, instruction)
  const preflight = runEonKdpPreflight({
    items: fitted.items,
    plan: fitted.plan,
    fieldHeight: header.body.height,
  })
  if (!preflight.ok) return fail(preflight.errors[0] ?? EON_BUILD_FAILED_MESSAGE)

  const objects = [...header.objects]
  drawEonPage(objects, { field: header.body, plan: fitted.plan, items: fitted.items, font, tag })
  return [{ pageRole: 'single', objects }]
}

export const everOrNeverTemplate: StudioTemplateDefinition = {
  key: EON_TEMPLATE_KEY,
  label: 'Ever or Never',
  category: 'word',
  description:
    'Retirement Edition: short, funny, relatable statements — “Ever taken a nap before lunch on a Tuesday?” — each with an Ever box and a Never box to tick, plus a tally to compare with friends. Great for parties, couples and keepsake books. Pick a theme and tone; statements per page and type size are fitted to your page. Fresh statements every page, never repeated within your book.',
  pageCount: 1,
  producesAnswerKey: false,
  defaultPageTitle: EON_DEFAULT_TITLE,
  validateConfig: validateEonConfig,
  prefetch: everOrNeverPrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g stroke="currentColor" stroke-width="0.4" opacity="0.5">
      <path d="M5 4.5h54M5 14.5h54M5 24.5h54M5 34.5h54"/>
    </g>
    <g font-family="serif" font-size="3.4" font-weight="700" fill="currentColor">
      <text x="5" y="10.8">1.</text>
      <text x="5" y="20.8">2.</text>
      <text x="5" y="30.8">3.</text>
    </g>
    <g stroke="currentColor" stroke-width="0.7" stroke-linecap="round" opacity="0.65">
      <path d="M10 9.7h22M10 19.7h18M10 29.7h24"/>
    </g>
    <g fill="none" stroke="currentColor" stroke-width="0.7">
      <rect x="37" y="7.8" width="3" height="3" rx="0.4"/>
      <rect x="48" y="7.8" width="3" height="3" rx="0.4"/>
      <rect x="37" y="17.8" width="3" height="3" rx="0.4"/>
      <rect x="48" y="17.8" width="3" height="3" rx="0.4"/>
      <rect x="37" y="27.8" width="3" height="3" rx="0.4"/>
      <rect x="48" y="27.8" width="3" height="3" rx="0.4"/>
    </g>
    <g font-family="sans-serif" font-size="2.6" font-weight="700" fill="currentColor">
      <text x="41" y="10.4">Ever</text>
      <text x="52" y="10.4">Never</text>
      <text x="41" y="20.4">Ever</text>
      <text x="52" y="20.4">Never</text>
      <text x="41" y="30.4">Ever</text>
      <text x="52" y="30.4">Never</text>
    </g>
  </svg>`,
  configSchema: EON_CONFIG_SCHEMA,
  generate,
}
