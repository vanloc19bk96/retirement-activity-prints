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
import { parseRetireeName } from '../who-knows-retiree-best/content'
import { OA_CONFIG_SCHEMA, validateOaConfig } from './config'
import {
  OA_AI_EMPTY_MESSAGE,
  OA_BUILD_FAILED_MESSAGE,
  OA_DEFAULT_TITLE,
  OA_PAGE_TOO_SMALL_MESSAGE,
  OA_SHORT_MESSAGE,
  OA_TEMPLATE_KEY,
  cleanOaPool,
  numberOaSet,
  oaDisplayAward,
  oaInstruction,
  oaTitleFor,
  orderOaSet,
  parseOaCount,
  parseOaPayload,
  pickOaSet,
} from './content'
import { drawOaPage } from './draw'
import { runOaKdpPreflight } from './kdp-preflight'
import {
  MAX_AWARD_LINES,
  breakAward,
  fitOaAwards,
  oaContentBox,
  oaLayout,
  paginateOa,
  usableHeight,
} from './layout'
import { officeAwardsPrefetch } from './prefetch'

function errorPage(
  ctx: StudioGenerateContext,
  config: StudioConfig,
  tag: StudioTag,
  message: string,
): StudioPageOutput {
  const name = parseRetireeName(config.retireeName)
  const instruction = config.showInstructions === false ? '' : oaInstruction(name, config.reasonLine === true)
  const header = drawHeader(oaContentBox(ctx), { ...config, title: oaTitleFor(config.title, name) }, tag, instruction)
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
 * The award pages. No answer key: the winners are whoever the team says.
 *
 * Measured first, filled second, checked third. The type size comes from the
 * trim, so the form's note is what prints. The prefetched awards are
 * validated again here — whatever reached `remoteData` — an award that would
 * wrap past two lines (with the retiree's name in it) is passed over for a
 * spare, the set is picked whole and balanced and put in reading order by
 * seed, numbered once, and flowed over the pages card by card; the preflight
 * re-proves the set and every page before anything is returned.
 */
function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)
  const name = parseRetireeName(config.retireeName)
  const size = parseOaCount(config.awards)
  const seed = Number(config.seed ?? ctx.seed ?? 1)
  const tag: StudioTag = { templateKey: OA_TEMPLATE_KEY, instanceId: ctx.instanceId, pageRole: 'single' }
  const fail = (message: string) => [errorPage(ctx, config, tag, message)]

  const layout = oaLayout({ page: ctx, config, font, name, reasonLine: config.reasonLine === true })
  if (!layout) return fail(OA_PAGE_TOO_SMALL_MESSAGE)
  const { plan } = layout

  const pool = cleanOaPool(parseOaPayload(ctx.remoteData))
  if (pool.length === 0) return fail(OA_AI_EMPTY_MESSAGE)
  const fits = (a: { award: string }) => breakAward(oaDisplayAward(a.award, name), plan, font).length <= MAX_AWARD_LINES
  const { picks } = pickOaSet(pool, size, fits)
  if (!picks) return fail(OA_SHORT_MESSAGE)

  const awards = fitOaAwards(numberOaSet(orderOaSet(picks, seed)), plan, font, name)
  const usable = usableHeight(plan, layout.fields)
  const pages = paginateOa(awards, plan, usable)
  if (!pages) return fail(OA_PAGE_TOO_SMALL_MESSAGE)

  const content = oaContentBox(ctx)
  const preflight = runOaKdpPreflight({ awards, pages, plan, size, columnWidth: content.width, usable })
  if (!preflight.ok) return fail(preflight.errors[0] ?? OA_BUILD_FAILED_MESSAGE)

  return pages.map((page, index) => {
    // Every page keeps the heading so a page handed round is never
    // anonymous; only the first repeats the how-to.
    const header = drawHeader(content, { ...config, title: layout.title }, tag, index === 0 ? layout.instruction : '')
    const objects: StudioFabricObject[] = [...header.objects]
    drawOaPage(objects, { field: header.body, plan, page, font, tag })
    return { pageRole: 'single' as const, objects }
  })
}

export const officeAwardsTemplate: StudioTemplateDefinition = {
  key: OA_TEMPLATE_KEY,
  label: 'Office Awards: Retirement Edition',
  category: 'word',
  description:
    'A retirement-party favourite: light, warm workplace awards — “Keeper of the Spare Phone Charger”, “Calmest Voice on a Busy Shift” — and coworkers write the name of the colleague who deserves each one. A mix of playful and heartfelt, never mean: nothing about looks, age, health or money, and one award for the retiree’s farewell. Each award sits in its own framed card with a numbered rosette and a big “Winner:” line, plus an optional “Why:” line for keepsake books. No coworker names needed. Pick the workplace and how many awards; type size and pages are fitted to your trim. Fresh awards every time, never repeated within your book.',
  pageCount: 1,
  producesAnswerKey: false,
  defaultPageTitle: OA_DEFAULT_TITLE,
  pageTitleHelp:
    'Leave as “Office Awards” — with the retiree’s name set below, it reads “Linda’s Farewell Office Awards” — or type your own heading.',
  prefetch: officeAwardsPrefetch,
  validateConfig: validateOaConfig,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <text x="32" y="5.5" text-anchor="middle" font-family="serif" font-size="3.6" font-weight="700" fill="currentColor">Office Awards</text>
    <g fill="none" stroke="currentColor" stroke-width="0.5">
      <rect x="6" y="9" width="52" height="8.5" rx="1"/>
      <rect x="6" y="20" width="52" height="8.5" rx="1"/>
      <rect x="6" y="31" width="52" height="8" rx="1"/>
    </g>
    <g fill="none" stroke="currentColor" stroke-width="0.6">
      <circle cx="10.5" cy="12.6" r="2.4"/>
      <circle cx="10.5" cy="23.6" r="2.4"/>
      <circle cx="10.5" cy="34.6" r="2.4"/>
      <path d="M9.3 14.8l-0.8 2 1.2-0.6 0.8 0.9M11.7 14.8l0.8 2-1.2-0.6-0.8 0.9"/>
      <path d="M9.3 25.8l-0.8 2 1.2-0.6 0.8 0.9M11.7 25.8l0.8 2-1.2-0.6-0.8 0.9"/>
    </g>
    <g stroke="currentColor" stroke-linecap="round">
      <path d="M16 12h26M16 23h32M16 34h22" stroke-width="1" opacity="0.8"/>
      <path d="M16 15.8h7M16 26.8h7M16 37.4h7" stroke-width="0.5" opacity="0.7"/>
      <path d="M24.5 15.8h30M24.5 26.8h30M24.5 37.4h30" stroke-width="0.4" opacity="0.45"/>
    </g>
  </svg>`,
  configSchema: OA_CONFIG_SCHEMA,
  generate,
}
