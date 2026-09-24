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
import { deriveSeed } from '../studio-rng'
import { RETIREMENT_BINGO_CONFIG_SCHEMA } from './config'
import {
  RETIREMENT_BINGO_BUILD_FAILED_MESSAGE,
  RETIREMENT_BINGO_DEFAULT_TITLE,
  RETIREMENT_BINGO_PAGE_TOO_SMALL_MESSAGE,
  selectRetirementBingoMoments,
  type RetirementBingoMoment,
} from './content'
import { drawRetirementBingoCard } from './draw'
import { runRetirementBingoKdpPreflight } from './kdp-preflight'
import { planRetirementBingoPage, retirementBingoContentBox } from './layout'
import { parseRetirementBingoTheme, retirementBingoInstruction } from './themes'

const TEMPLATE_KEY = 'retirement-bingo'

/**
 * Fresh draws a card gets before the page is refused. The draw only fails when
 * the pool is nearly exhausted by family rules, and a second shuffle almost
 * always clears it; past a handful, the problem is the pool, not the luck.
 */
const MAX_DRAWS = 6

function errorPage(
  ctx: StudioGenerateContext,
  config: StudioConfig,
  tag: StudioTag,
  instruction: string,
  message: string,
): StudioPageOutput {
  const header = drawHeader(retirementBingoContentBox(ctx), config, tag, instruction)
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
 * One bingo card on one page.
 *
 * Measured first, dealt second, checked third. The page plan fixes the square
 * and the type size against the whole theme, so every card in a book prints the
 * same way; only then are 24 moments dealt from what fits, and the finished
 * card goes through preflight. A card that fails is redealt from a derived
 * seed rather than printed — still deterministic, so regenerating a sheet with
 * the same seed gives the same card.
 *
 * There is no answer page. Bingo has nothing to solve; the card is the
 * reader's own record of their year.
 */
function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const theme = parseRetirementBingoTheme(config)
  const instruction = retirementBingoInstruction(config)
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)

  const tag: StudioTag = {
    templateKey: TEMPLATE_KEY,
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }
  const fail = (message: string) => [errorPage(ctx, config, tag, instruction, message)]

  const plan = planRetirementBingoPage({ page: ctx, config, theme, instruction, font })
  if (!plan) return fail(RETIREMENT_BINGO_PAGE_TOO_SMALL_MESSAGE)

  let moments: RetirementBingoMoment[] | null = null
  let lastError = RETIREMENT_BINGO_BUILD_FAILED_MESSAGE
  for (let draw = 0; draw < MAX_DRAWS && !moments; draw++) {
    const candidate = selectRetirementBingoMoments({
      pool: plan.pool,
      seed: draw === 0 ? ctx.seed : deriveSeed(ctx.seed, `redeal:${draw}`),
      themeId: theme.id,
    })
    const preflight = runRetirementBingoKdpPreflight({ moments: candidate, plan, font })
    if (preflight.ok) moments = candidate
    else lastError = preflight.errors[0] ?? lastError
  }
  if (!moments) return fail(lastError)

  const header = drawHeader(retirementBingoContentBox(ctx), config, tag, instruction)
  const objects: StudioFabricObject[] = [...header.objects]
  drawRetirementBingoCard(objects, { moments, plan, font, tag })

  return [{ pageRole: 'single', objects }]
}

export const retirementBingoTemplate: StudioTemplateDefinition = {
  key: TEMPLATE_KEY,
  label: 'Retirement Bingo',
  category: 'word',
  description:
    'A 5 x 5 bingo card of everyday retirement moments — “Slept past 9”, “Had coffee with no rush”, “Started a new hobby” — with a free NAP square in the middle. Readers cross off each moment as it happens. Every card draws its own mix, so cards in a book stay different, and square and type sizes are fitted to your page. Double-click any square on the page to reword it.',
  pageCount: 1,
  producesAnswerKey: false,
  defaultPageTitle: RETIREMENT_BINGO_DEFAULT_TITLE,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g font-size="4.4" font-weight="700" fill="currentColor" font-family="serif" text-anchor="middle">
      <text x="22" y="8">B</text><text x="27" y="8">I</text><text x="32" y="8">N</text><text x="37" y="8">G</text><text x="42" y="8">O</text>
    </g>
    <rect x="30" y="20" width="4" height="4" fill="currentColor" opacity="0.25"/>
    <g fill="none" stroke="currentColor" stroke-linecap="round">
      <rect x="19.5" y="9.5" width="25" height="25" stroke-width="1.3"/>
      <path stroke-width="0.7" d="M24.5 9.5v25M29.5 9.5v25M34.5 9.5v25M39.5 9.5v25M19.5 14.5h25M19.5 19.5h25M19.5 24.5h25M19.5 29.5h25"/>
      <path stroke-width="0.9" d="M20.8 10.8l2.4 2.4M23.2 10.8l-2.4 2.4M35.8 15.8l2.4 2.4M38.2 15.8l-2.4 2.4M25.8 25.8l2.4 2.4M28.2 25.8l-2.4 2.4M40.8 30.8l2.4 2.4M43.2 30.8l-2.4 2.4"/>
    </g>
  </svg>`,
  configSchema: RETIREMENT_BINGO_CONFIG_SCHEMA,
  generate,
}
