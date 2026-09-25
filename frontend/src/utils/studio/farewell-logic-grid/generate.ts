import type {
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
  StudioTemplateDefinition,
} from '@/types/studio-template.types'
import { STUDIO_BODY_SIZE, STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import { boxCenterX, drawHeader } from '../studio-layout'
import { buildText, type StudioTag } from '../studio-fabric-builders'
import { deriveSeed } from '../studio-rng'
import { LG_CONFIG_SCHEMA, instructionFor } from './config'
import {
  LG_BUILD_FAILED_MESSAGE,
  LG_DEFAULT_TITLE,
  LG_PAGE_TOO_SMALL_MESSAGE,
  LG_TEMPLATE_KEY,
} from './content'
import { runLgKdpPreflight } from './kdp-preflight'
import {
  MAX_CLUE_LINES,
  clueBudget,
  clueSlotHeight,
  lgContentBox,
  planLgPage,
  textSpec,
  wrapLines,
} from './layout'
import { parseLgLevel } from './levels'
import { layoutLgPuzzle } from './pages'
import { farewellLogicGridPrefetch, parseLgRemoteData } from './prefetch'
import { buildLgPuzzle, lgAvoidFromLabels } from './puzzle'

/** Fresh draws when a built puzzle does not survive layout or preflight. */
const REBUILDS = 4

function errorPage(
  ctx: StudioGenerateContext,
  config: StudioConfig,
  tag: StudioTag,
  message: string,
): StudioPageOutput {
  const header = drawHeader(lgContentBox(ctx), config, tag, instructionFor(config))
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
 * One Farewell Party logic grid, and its answer page.
 *
 * Planned first, built second, proved third. The plan fixes the grid shape,
 * type size, square size and page count from the level and trim alone, so the
 * form's note is what prints. The builder then makes a puzzle whose clues fit
 * that plan, and which a reader can finish by deduction with exactly one
 * answer. The preflight re-proves the logic and the print before anything is
 * returned; a puzzle that fails any check is thrown away, never printed.
 *
 * Clues, grid and answer page are all drawn from one puzzle object, so the
 * answer can only ever be the one the clues lead to.
 */
function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)
  const level = parseLgLevel(config.level)
  const instruction = instructionFor(config)
  const tag: StudioTag = { templateKey: LG_TEMPLATE_KEY, instanceId: ctx.instanceId, pageRole: 'single' }
  const fail = (message: string) => [errorPage(ctx, config, tag, message)]

  const plan = planLgPage({ page: ctx, config, instruction, font, level })
  if (!plan) return fail(LG_PAGE_TOO_SMALL_MESSAGE)

  const avoid = lgAvoidFromLabels(parseLgRemoteData(ctx.remoteData).bookLabels)
  const measureClue = (text: string) => {
    const lines = wrapLines(text, plan.textWidth, plan.text.font, textSpec(font)).length
    return { lines, height: clueSlotHeight(lines, plan.text) }
  }

  for (let attempt = 0; attempt < REBUILDS; attempt++) {
    const puzzle = buildLgPuzzle({
      level,
      shape: plan.shape,
      seed: attempt === 0 ? ctx.seed : deriveSeed(ctx.seed, `rebuild:${attempt}`),
      avoid,
      measureClue,
      maxLinesPerClue: MAX_CLUE_LINES,
      maxClueHeight: clueBudget(plan),
    })
    if (!puzzle) continue
    const laid = layoutLgPuzzle({ puzzle, plan, config, ctx, font, instruction, tag })
    if (!laid) continue
    if (!runLgKdpPreflight({ puzzle, laid, level }).ok) continue
    return laid.outputs
  }
  return fail(LG_BUILD_FAILED_MESSAGE)
}

export const farewellLogicGridTemplate: StudioTemplateDefinition = {
  key: LG_TEMPLATE_KEY,
  label: 'Logic Grid: Farewell Party',
  category: 'logic',
  description:
    'A classic logic grid puzzle set at a retirement party. Read a short story and a handful of clues — who brought which dish, who retired first, who is taking up pottery — then mark X and dots in the grid until every match is found. Every puzzle has exactly one answer, reached by reasoning alone with no guessing, and gets its own answer page. Pick a level; the grid, type size and pages are fitted to your trim. Scenes, people and clues are fresh every time, never repeating a puzzle already in your book.',
  pageCount: 1,
  producesAnswerKey: true,
  defaultPageTitle: LG_DEFAULT_TITLE,
  prefetch: farewellLogicGridPrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g stroke="currentColor" stroke-width="0.35" opacity="0.7">
      <path d="M28 5v31M36 5v23M44 5v15M17 16h31M17 24h23M17 32h15"/>
    </g>
    <g stroke="currentColor" stroke-width="1" stroke-linecap="square">
      <path d="M24 4v32M32 4v32M40 4v24M48 4v16M24 4h24M16 12h32M16 20h32M16 28h24M16 36h16M16 12v24"/>
    </g>
    <g stroke="currentColor" stroke-width="0.8" stroke-linecap="round" opacity="0.55">
      <path d="M26 6.5v4M30 6.5v4M34 6.5v4M38 6.5v4M42 6.5v4M46 6.5v4M18 14h4M18 18h4M18 22h4M18 26h4M18 30h4M18 34h4"/>
    </g>
    <g stroke="currentColor" stroke-width="0.6" stroke-linecap="round">
      <path d="M25 13l2 2M27 13l-2 2M33 17l2 2M35 17l-2 2M41 13l2 2M43 13l-2 2M25 29l2 2M27 29l-2 2M37 21l2 2M39 21l-2 2"/>
    </g>
    <g fill="currentColor">
      <circle cx="30" cy="14" r="0.9"/>
      <circle cx="26" cy="18" r="0.9"/>
      <circle cx="46" cy="18" r="0.9"/>
      <circle cx="34" cy="22" r="0.9"/>
      <circle cx="30" cy="34" r="0.9"/>
    </g>
    <g stroke="currentColor" stroke-width="0.7" stroke-linecap="round" opacity="0.6">
      <path d="M43 30h17M43 33h14M43 36h16"/>
    </g>
  </svg>`,
  configSchema: LG_CONFIG_SCHEMA,
  generate,
}
