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
import { TTF_CONFIG_SCHEMA, instructionFor, validateTtfConfig } from './config'
import {
  TTF_AI_EMPTY_MESSAGE,
  TTF_BUILD_FAILED_MESSAGE,
  TTF_DEFAULT_TITLE,
  TTF_PAGE_TOO_SMALL_MESSAGE,
  TTF_TEMPLATE_KEY,
  parseTtfPayload,
  selectTtfSets,
} from './content'
import { drawTtfPage, type TtfDrawMode } from './draw'
import { fitTtfSets, type FittedTtfSet } from './fit'
import { runTtfKdpPreflight } from './kdp-preflight'
import { ttfContentBox, ttfWorstCasePlan, type TtfPagePlan } from './layout'
import { TTF_REQUEST_COUNT, twoTruthsFibPrefetch } from './prefetch'

export { validateTtfConfig }

function errorPage(
  ctx: StudioGenerateContext,
  config: StudioConfig,
  tag: StudioTag,
  message: string,
): StudioPageOutput {
  const header = drawHeader(ttfContentBox(ctx), config, tag, instructionFor(config))
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
  plan: TtfPagePlan
  sets: readonly FittedTtfSet[]
  font: string
  instruction: string
  mode: TtfDrawMode
}): StudioFabricObject[] {
  const { config, ctx, tag, plan, sets, font, instruction, mode } = options
  const header = drawHeader(ttfContentBox(ctx), config, tag, instruction)
  const objects = [...header.objects]
  drawTtfPage(objects, { field: header.body, plan, sets, font, tag, mode })
  return objects
}

/**
 * One page of Two Truths and a Fib puzzles, and its answer page.
 *
 * Measured first, filled second, checked third. The worst-case plan fixes the
 * puzzle count, type size and every set's line budget from the trim alone, so
 * the form's note is what prints and every page of a run matches. The
 * prefetched sets are validated again here — whatever reached `remoteData` —
 * then held to that plan; a set that will not fit is passed over for the next
 * one. Fib letters are dealt by the seed across the sets that print. The
 * preflight then re-proves the page before anything is returned.
 *
 * The answer page is drawn from the very same placed sets, so the ring and the
 * correction can only ever name the fib printed on the puzzle page, under the
 * same number and letter.
 */
function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)
  const instruction = instructionFor(config)
  const tag: StudioTag = {
    templateKey: TTF_TEMPLATE_KEY,
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }
  const fail = (message: string) => [errorPage(ctx, config, tag, message)]

  const promised = ttfWorstCasePlan({ page: ctx, config, instruction, font })
  if (!promised) return fail(TTF_PAGE_TOO_SMALL_MESSAGE)

  const sets = selectTtfSets(parseTtfPayload(ctx.remoteData), { cap: TTF_REQUEST_COUNT })
  if (sets.length === 0) return fail(TTF_AI_EMPTY_MESSAGE)

  const fitted = fitTtfSets(sets, promised, font, ctx.seed)
  if (!fitted) return fail(TTF_BUILD_FAILED_MESSAGE)

  const preflight = runTtfKdpPreflight({ sets: fitted.sets, plan: fitted.plan, font })
  if (!preflight.ok) return fail(preflight.errors[0] ?? TTF_BUILD_FAILED_MESSAGE)

  const shared = { config, ctx, tag, plan: fitted.plan, sets: fitted.sets, font }
  return [
    {
      pageRole: 'single',
      objects: layoutPage({ ...shared, instruction, mode: 'puzzle' }),
      // Same sets, same letters, the fib ringed and corrected. The how-to line
      // is dropped: a reader checking answers has already read it.
      answerSourceObjects: layoutPage({ ...shared, instruction: '', mode: 'answers' }),
    },
  ]
}

export const twoTruthsFibTemplate: StudioTemplateDefinition = {
  key: TTF_TEMPLATE_KEY,
  label: 'Two Truths and a Fib',
  category: 'word',
  description:
    'Retirement Edition: sets of three short statements about work, inventions, home life, travel, food and more — two are true and one is a fib. Circle the fib! Every fact is checked before it prints, and the answer page explains each fib. Pick a subject and level; puzzles per page and type size are fitted to your page. Fresh puzzles every page, never repeated within your book.',
  pageCount: 1,
  producesAnswerKey: true,
  defaultPageTitle: TTF_DEFAULT_TITLE,
  validateConfig: validateTtfConfig,
  prefetch: twoTruthsFibPrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g font-family="serif" font-size="4.2" font-weight="700" fill="currentColor">
      <text x="5" y="7">1.  Early Telephones</text>
    </g>
    <g font-family="serif" font-size="3.6" font-weight="700" fill="currentColor">
      <text x="6" y="15.3">A</text>
      <text x="6" y="25.3">B</text>
      <text x="6" y="35.3">C</text>
    </g>
    <circle cx="7.3" cy="24" r="3" fill="none" stroke="currentColor" stroke-width="0.7"/>
    <g stroke="currentColor" stroke-width="0.7" stroke-linecap="round" opacity="0.65">
      <path d="M13 14h44M13 18h30"/>
      <path d="M13 24h40M13 28h24"/>
      <path d="M13 34h46M13 38h18"/>
    </g>
  </svg>`,
  configSchema: TTF_CONFIG_SCHEMA,
  generate,
}
