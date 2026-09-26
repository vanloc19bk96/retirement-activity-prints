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
import { WF_CONFIG_SCHEMA, instructionFor } from './config'
import {
  WF_AI_EMPTY_MESSAGE,
  WF_BUILD_FAILED_MESSAGE,
  WF_DEFAULT_TITLE,
  WF_PAGE_TOO_SMALL_MESSAGE,
  WF_SHORT_MESSAGE,
  WF_TEMPLATE_KEY,
  cleanWfAreas,
  numberWfWeeks,
  orderWfYear,
  parseWfPayload,
  pickWfYear,
  wfAreaIdeas,
} from './content'
import { drawWfPage } from './draw'
import { runWfKdpPreflight } from './kdp-preflight'
import {
  breakIdea,
  fitWfWeeks,
  paginateWeeksOfFirsts,
  parseWfSpace,
  usableHeight,
  wfContentBox,
  wfFields,
  wfWorstCasePlan,
} from './layout'
import { weeksOfFirstsPrefetch } from './prefetch'

function errorPage(
  ctx: StudioGenerateContext,
  config: StudioConfig,
  tag: StudioTag,
  message: string,
): StudioPageOutput {
  const header = drawHeader(wfContentBox(ctx), config, tag, instructionFor(config))
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
 * The whole year, over as many pages as it needs. No answer page: the only
 * right answer is the reader's own.
 *
 * Measured first, filled second, checked third. The worst-case plan fixes the
 * type size and the weeks per page from the trim and the writing space alone,
 * so the form's note is what prints. The prefetched ideas are validated again
 * here — whatever reached `remoteData` — an idea that would wrap past its card
 * is passed over for a spare, the year is picked to exactly fifty-two
 * balanced weeks and put in reading order by seed, numbered once, and flowed
 * over the pages whole; the preflight re-proves every page before anything
 * is returned.
 */
function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)
  const instruction = instructionFor(config)
  const space = parseWfSpace(config.writingSpace)
  const seed = Number(config.seed ?? ctx.seed ?? 1)
  const tag: StudioTag = { templateKey: WF_TEMPLATE_KEY, instanceId: ctx.instanceId, pageRole: 'single' }
  const fail = (message: string) => [errorPage(ctx, config, tag, message)]

  const plan = wfWorstCasePlan({ page: ctx, config, instruction, font, space })
  if (!plan) return fail(WF_PAGE_TOO_SMALL_MESSAGE)

  const areas = cleanWfAreas(parseWfPayload(ctx.remoteData))
  if (wfAreaIdeas(areas).length === 0) return fail(WF_AI_EMPTY_MESSAGE)
  const { picks } = pickWfYear(areas, (idea) => breakIdea(idea, plan, font).length <= plan.ideaLines)
  if (!picks) return fail(WF_SHORT_MESSAGE)

  const weeks = fitWfWeeks(numberWfWeeks(orderWfYear(picks, seed)), plan, font)
  const fields = wfFields(ctx, config, instruction)
  const usable = usableHeight(plan, fields)
  const pages = paginateWeeksOfFirsts(weeks, plan, usable)
  if (!pages) return fail(WF_PAGE_TOO_SMALL_MESSAGE)

  const preflight = runWfKdpPreflight({ weeks, pages, plan, usable })
  if (!preflight.ok) return fail(preflight.errors[0] ?? WF_BUILD_FAILED_MESSAGE)

  const content = wfContentBox(ctx)
  return pages.map((page, index) => {
    // Every page keeps the title so a reader flipping back knows where they
    // are; only the first repeats the how-to.
    const header = drawHeader(content, config, tag, index === 0 ? instruction : '')
    const objects: StudioFabricObject[] = [...header.objects]
    drawWfPage(objects, { field: header.body, plan, page, font, tag })
    return { pageRole: 'single', objects }
  })
}

export const weeksOfFirstsTemplate: StudioTemplateDefinition = {
  key: WF_TEMPLATE_KEY,
  label: '52 Weeks of Firsts: Retirement Edition',
  category: 'word',
  description:
    'A year of small firsts: 52 numbered weeks, each with one new thing to try — “Cook a Thai green curry from scratch”, “Learn to recognise one bird by its song” — a line for the date and comfortable lines for notes. Ideas range across food, nature, making, learning, people, culture, quiet pleasures and small adventures, mostly free, nearby and gentle. The weeks are numbered, not dated, so readers can start any time. Pick the mix and the writing space; type size and pages are fitted to your trim. Fresh ideas every year, never repeated within your book.',
  pageCount: 1,
  producesAnswerKey: false,
  defaultPageTitle: WF_DEFAULT_TITLE,
  prefetch: weeksOfFirstsPrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" stroke="currentColor" stroke-width="0.6">
      <rect x="5" y="2.5" width="54" height="16.5" rx="1.4"/>
      <rect x="5" y="21.5" width="54" height="16.5" rx="1.4"/>
    </g>
    <g font-family="serif" font-size="3.2" font-weight="700" fill="currentColor">
      <text x="7.5" y="7">Week 1</text>
      <text x="7.5" y="26">Week 2</text>
    </g>
    <g font-family="serif" font-size="2.4" fill="currentColor">
      <text x="38" y="7">Date:</text>
      <text x="38" y="26">Date:</text>
    </g>
    <path d="M44.5 7.3h12M44.5 26.3h12" stroke="currentColor" stroke-width="0.5"/>
    <g stroke="currentColor" stroke-width="0.7" stroke-linecap="round" opacity="0.75">
      <path d="M7.5 10.2h34M7.5 29.2h28"/>
    </g>
    <g stroke="currentColor" stroke-width="0.4" opacity="0.45">
      <path d="M7.5 13.3h49M7.5 16.3h49M7.5 32.3h49M7.5 35.3h49"/>
    </g>
  </svg>`,
  configSchema: WF_CONFIG_SCHEMA,
  generate,
}
