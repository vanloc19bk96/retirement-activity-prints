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
import { rememberStudioContent, studioAvoidList, studioVarietyKey } from '../studio-variety'
import { TWM_CONFIG_SCHEMA, instructionFor } from './config'
import {
  TWM_BUILD_FAILED_MESSAGE,
  TWM_DEFAULT_TITLE,
  TWM_PAGE_TOO_SMALL_MESSAGE,
  TWM_TEMPLATE_KEY,
  parseTwmMode,
  pickTwmSections,
  twmBookLabel,
  twmBookNames,
  twmModeSpec,
  twmRecentWindow,
  twmSectionsProblem,
} from './content'
import { drawTwmPage } from './draw'
import { runTwmKdpPreflight } from './kdp-preflight'
import {
  paginateTravelWishMap,
  parseTwmSpace,
  planTravelWishMap,
  twmContentBox,
  twmFields,
  usableHeight,
} from './layout'
import { parseTwmRemoteData, travelWishMapPrefetch } from './prefetch'

function errorPage(
  ctx: StudioGenerateContext,
  config: StudioConfig,
  tag: StudioTag,
  message: string,
): StudioPageOutput {
  const header = drawHeader(twmContentBox(ctx), config, tag, instructionFor(config))
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
 * The whole wish list, over as many pages as it needs. No answer page: the
 * only right answer is the reader's own.
 *
 * Measured first, filled second, checked third. The plan fixes the type size
 * from the trim and the longest name the mode could print, so the form's
 * note is what prints. The list is taken from the bundled data — complete for
 * states and regions, dealt fresh for countries and kinds of places against
 * what the book and this seller have printed — validated, flowed over the
 * pages and re-proved by the preflight before anything is returned.
 */
function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)
  const instruction = instructionFor(config)
  const mode = parseTwmMode(config.destinations)
  const space = parseTwmSpace(config.writingSpace)
  const spec = twmModeSpec(mode)
  const tag: StudioTag = { templateKey: TWM_TEMPLATE_KEY, instanceId: ctx.instanceId, pageRole: 'single' }
  const fail = (message: string) => [errorPage(ctx, config, tag, message)]

  const fields = twmFields(ctx, config, instruction)
  const plan = planTravelWishMap(fields, font, mode, space)
  if (!plan) return fail(TWM_PAGE_TOO_SMALL_MESSAGE)

  const varietyKey = studioVarietyKey(TWM_TEMPLATE_KEY, mode)
  const sections = pickTwmSections({
    mode,
    seed: ctx.seed,
    book: spec.fixed ? undefined : twmBookNames(mode, parseTwmRemoteData(ctx.remoteData).bookLabels),
    recent: spec.fixed ? undefined : studioAvoidList(varietyKey, twmRecentWindow(mode)),
  })
  const listProblem = twmSectionsProblem(mode, sections)
  if (listProblem) return fail(listProblem)

  const usable = usableHeight(plan, fields)
  const pages = paginateTravelWishMap(sections, plan, usable)
  if (!pages) return fail(TWM_PAGE_TOO_SMALL_MESSAGE)

  const preflight = runTwmKdpPreflight({ mode, sections, pages, plan, usable, font })
  if (!preflight.ok) return fail(preflight.errors[0] ?? TWM_BUILD_FAILED_MESSAGE)

  if (!spec.fixed) rememberStudioContent(varietyKey, sections.flatMap((s) => s.names))

  const labelFor = spec.fixed ? null : (name: string) => twmBookLabel(mode, name)
  const content = twmContentBox(ctx)
  return pages.map((page, index) => {
    // Every page keeps the title so a reader flipping back knows where they
    // are; only the first repeats the how-to.
    const header = drawHeader(content, config, tag, index === 0 ? instruction : '')
    const objects: StudioFabricObject[] = [...header.objects]
    drawTwmPage(objects, { field: header.body, plan, page, font, tag, labelFor })
    return { pageRole: 'single', objects }
  })
}

export const travelWishMapTemplate: StudioTemplateDefinition = {
  key: TWM_TEMPLATE_KEY,
  label: 'Travel Wish Map: Retirement Edition',
  category: 'word',
  description:
    'A travel wish list to dream over: check the places you’d love to see someday and jot down why, on roomy writing lines beside each one. Choose all 50 U.S. states, broad world regions, countries from every continent, or kinds of places near or far — a national park, a harbor town, where an old friend lives. Every name comes from fixed, accurate geography; type size and pages are fitted to your trim, with space for places of your own.',
  pageCount: 1,
  producesAnswerKey: false,
  defaultPageTitle: TWM_DEFAULT_TITLE,
  prefetch: travelWishMapPrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g font-family="serif" font-weight="700" fill="currentColor">
      <text x="5" y="7" font-size="3.6">The West</text>
      <text x="11" y="14.2" font-size="3.2">Alaska</text>
      <text x="11" y="29.2" font-size="3.2">Arizona</text>
    </g>
    <path d="M5 8.6h54" stroke="currentColor" stroke-width="0.6"/>
    <g fill="none" stroke="currentColor" stroke-width="0.6">
      <rect x="5" y="11.4" width="3.2" height="3.2" rx="0.4"/>
      <rect x="5" y="26.4" width="3.2" height="3.2" rx="0.4"/>
    </g>
    <path d="M5.6 13.1l1 1 1.7-2.2" fill="none" stroke="currentColor" stroke-width="0.6" stroke-linecap="round" stroke-linejoin="round"/>
    <g font-family="serif" font-size="2.4" fill="currentColor">
      <text x="11" y="19.4">Why I want to go:</text>
      <text x="11" y="34.4">Why I want to go:</text>
    </g>
    <g stroke="currentColor" stroke-width="0.5" stroke-linecap="round" opacity="0.55">
      <path d="M31 19.6h28M11 23.6h48M31 34.6h28M11 38.6h48"/>
    </g>
  </svg>`,
  configSchema: TWM_CONFIG_SCHEMA,
  generate,
}
