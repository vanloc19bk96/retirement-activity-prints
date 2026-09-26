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
import { BL_CONFIG_SCHEMA, instructionFor } from './config'
import {
  BL_AI_EMPTY_MESSAGE,
  BL_BUILD_FAILED_MESSAGE,
  BL_DEFAULT_TITLE,
  BL_PAGE_TOO_SMALL_MESSAGE,
  BL_SHORT_MESSAGE,
  BL_TEMPLATE_KEY,
  balanceBlSections,
  cleanBlSections,
  parseBlCount,
  parseBlPayload,
} from './content'
import { drawBlPage } from './draw'
import { runBlKdpPreflight } from './kdp-preflight'
import {
  blContentBox,
  blFields,
  blWorstCasePlan,
  breakIdea,
  numberBlSections,
  paginateBucketList,
  usableHeight,
} from './layout'
import { bucketListPrefetch } from './prefetch'

function errorPage(
  ctx: StudioGenerateContext,
  config: StudioConfig,
  tag: StudioTag,
  message: string,
): StudioPageOutput {
  const header = drawHeader(blContentBox(ctx), config, tag, instructionFor(config))
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
 * The whole list, over as many pages as it needs. No answer page: the only
 * right answer is the reader's own.
 *
 * Measured first, filled second, checked third. The worst-case plan fixes the
 * type size from the trim alone, so the form's note is what prints. The
 * prefetched ideas are validated again here — whatever reached `remoteData` —
 * an idea that would wrap past its row is passed over for a spare, and the
 * list is balanced to the exact count across its headings. Ideas are then
 * numbered once for the whole list and flowed over the pages; the preflight
 * re-proves every page before anything is returned.
 */
function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)
  const instruction = instructionFor(config)
  const count = parseBlCount(config.ideaCount)
  const tag: StudioTag = { templateKey: BL_TEMPLATE_KEY, instanceId: ctx.instanceId, pageRole: 'single' }
  const fail = (message: string) => [errorPage(ctx, config, tag, message)]

  const plan = blWorstCasePlan({ page: ctx, config, instruction, font })
  if (!plan) return fail(BL_PAGE_TOO_SMALL_MESSAGE)

  const sections = cleanBlSections(parseBlPayload(ctx.remoteData))
  if (sections.length === 0) return fail(BL_AI_EMPTY_MESSAGE)
  const fitting = sections.map((section) => ({
    ...section,
    items: section.items.filter((item) => breakIdea(item.idea, plan, font).length <= plan.ideaLines),
  }))
  const chosen = balanceBlSections(fitting, count)
  if (!chosen) return fail(BL_SHORT_MESSAGE)

  const fields = blFields(ctx, config, instruction)
  const usable = usableHeight(plan, fields)
  const numbered = numberBlSections(chosen, plan, font)
  const pages = paginateBucketList(numbered, plan, usable)
  if (!pages) return fail(BL_PAGE_TOO_SMALL_MESSAGE)

  const preflight = runBlKdpPreflight({ sections: numbered, pages, plan, usable, count })
  if (!preflight.ok) return fail(preflight.errors[0] ?? BL_BUILD_FAILED_MESSAGE)

  const content = blContentBox(ctx)
  return pages.map((page, index) => {
    // Every page keeps the title so a reader flipping back knows where they
    // are; only the first repeats the how-to.
    const header = drawHeader(content, config, tag, index === 0 ? instruction : '')
    const objects: StudioFabricObject[] = [...header.objects]
    drawBlPage(objects, { field: header.body, plan, page, font, tag })
    return { pageRole: 'single', objects }
  })
}

export const bucketListTemplate: StudioTemplateDefinition = {
  key: BL_TEMPLATE_KEY,
  label: 'Retirement Bucket List',
  category: 'word',
  description:
    'A big, inspiring list of 50 to 100 numbered ideas for retirement — “Take a scenic train journey”, “Grow a pot of herbs on a windowsill” — grouped under themes like Travel, Learn Something New, Give Back and Everyday Joys, each with a large box to tick once it’s done. Every list mixes free and splurge, home and away, restful and adventurous. Pick how many ideas and the mix; type size and pages are fitted to your trim. Fresh ideas every list, never repeated within your book.',
  pageCount: 1,
  producesAnswerKey: false,
  defaultPageTitle: BL_DEFAULT_TITLE,
  prefetch: bucketListPrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g font-family="serif" font-size="3.6" font-weight="700" fill="currentColor">
      <text x="5" y="7">Travel</text>
      <text x="5" y="26">Everyday Joys</text>
    </g>
    <path d="M5 8.6h54M5 27.6h54" stroke="currentColor" stroke-width="0.6"/>
    <g fill="none" stroke="currentColor" stroke-width="0.6">
      <rect x="5" y="11" width="3" height="3" rx="0.4"/>
      <rect x="5" y="16.5" width="3" height="3" rx="0.4"/>
      <rect x="5" y="30" width="3" height="3" rx="0.4"/>
      <rect x="5" y="35.5" width="3" height="3" rx="0.4"/>
    </g>
    <path d="M5.6 12.6l0.9 0.9 1.6-2" fill="none" stroke="currentColor" stroke-width="0.6" stroke-linecap="round" stroke-linejoin="round"/>
    <g font-family="serif" font-size="2.8" font-weight="700" fill="currentColor">
      <text x="10" y="13.6">1.</text>
      <text x="10" y="19.1">2.</text>
      <text x="10" y="32.6">9.</text>
      <text x="8.7" y="38.1">10.</text>
    </g>
    <g stroke="currentColor" stroke-width="0.7" stroke-linecap="round" opacity="0.65">
      <path d="M14 12.6h30M14 18.1h24M14 31.6h28M14 37.1h20"/>
    </g>
  </svg>`,
  configSchema: BL_CONFIG_SCHEMA,
  generate,
}
