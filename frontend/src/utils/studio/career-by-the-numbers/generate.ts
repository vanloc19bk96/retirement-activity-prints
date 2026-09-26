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
import { CBN_CONFIG_SCHEMA, validateCbnConfig } from './config'
import {
  CBN_AI_EMPTY_MESSAGE,
  CBN_BUILD_FAILED_MESSAGE,
  CBN_DEFAULT_TITLE,
  CBN_INSTRUCTION,
  CBN_PAGE_TOO_SMALL_MESSAGE,
  CBN_SHORT_MESSAGE,
  CBN_TEMPLATE_KEY,
  cbnTitleFor,
  cleanCbnPool,
  numberCbnSet,
  orderCbnSet,
  parseCbnCount,
  parseCbnDistance,
  parseCbnPayload,
  pickCbnSet,
} from './content'
import { drawCbnPage, pickMotifIcons } from './draw'
import { runCbnKdpPreflight } from './kdp-preflight'
import {
  answerLineWidth,
  cbnContentBox,
  cbnLayout,
  fitCbnQuestions,
  fitsRow,
  paginateCbn,
  usableHeight,
} from './layout'
import { careerNumbersPrefetch } from './prefetch'

function errorPage(
  ctx: StudioGenerateContext,
  config: StudioConfig,
  tag: StudioTag,
  message: string,
): StudioPageOutput {
  const name = parseRetireeName(config.retireeName)
  const instruction = config.showInstructions === false ? '' : CBN_INSTRUCTION
  const header = drawHeader(cbnContentBox(ctx), { ...config, title: cbnTitleFor(config.title, name) }, tag, instruction)
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
 * The question pages. No answer key: every number is the retiree's own guess.
 *
 * Measured first, filled second, checked third. The type size comes from the
 * trim, so the form's note is what prints. The prefetched questions are
 * validated again here — whatever reached `remoteData` — a question that
 * would wrap past three lines, or whose unit has no room beside its line, is
 * passed over for a spare, the set is picked whole and balanced and put in
 * reading order by seed, numbered once, and flowed over the pages row by row;
 * the preflight re-proves the set and every page before anything is returned.
 */
function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)
  const name = parseRetireeName(config.retireeName)
  const size = parseCbnCount(config.questions)
  const distance = parseCbnDistance(config.distance)
  const seed = Number(config.seed ?? ctx.seed ?? 1)
  const tag: StudioTag = { templateKey: CBN_TEMPLATE_KEY, instanceId: ctx.instanceId, pageRole: 'single' }
  const fail = (message: string) => [errorPage(ctx, config, tag, message)]

  const layout = cbnLayout({ page: ctx, config, font, name })
  if (!layout) return fail(CBN_PAGE_TOO_SMALL_MESSAGE)
  const { plan } = layout

  const pool = cleanCbnPool(parseCbnPayload(ctx.remoteData), { distance })
  if (pool.length === 0) return fail(CBN_AI_EMPTY_MESSAGE)
  const { picks } = pickCbnSet(pool, size, (q) => fitsRow(q, plan, font))
  if (!picks) return fail(CBN_SHORT_MESSAGE)

  const questions = fitCbnQuestions(numberCbnSet(orderCbnSet(picks, seed)), plan, font)
  const lineW = answerLineWidth(plan, questions.map((q) => q.unit), font)
  const usable = usableHeight(plan, layout.fields)
  const pages = paginateCbn(questions, plan, usable)
  if (!pages) return fail(CBN_PAGE_TOO_SMALL_MESSAGE)

  const content = cbnContentBox(ctx)
  const preflight = runCbnKdpPreflight({
    questions,
    pages,
    plan,
    size,
    distance,
    font,
    lineW,
    columnWidth: content.width,
    usable,
  })
  if (!preflight.ok) return fail(preflight.errors[0] ?? CBN_BUILD_FAILED_MESSAGE)

  const motifIcons = pickMotifIcons(seed)
  return pages.map((page, index) => {
    // Every page keeps the heading so a page handed round is never
    // anonymous; only the first repeats the how-to.
    const header = drawHeader(content, { ...config, title: layout.title }, tag, index === 0 ? layout.instruction : '')
    const objects: StudioFabricObject[] = [...header.objects]
    drawCbnPage(objects, { field: header.body, plan, page, font, tag, lineW, motifIcons })
    return { pageRole: 'single' as const, objects }
  })
}

export const careerNumbersTemplate: StudioTemplateDefinition = {
  key: CBN_TEMPLATE_KEY,
  label: 'Career By the Numbers',
  category: 'word',
  description:
    'Looking back on a working life in numbers: light, nostalgic estimates — “About how many cups of tea or coffee powered your career?”, “On your busiest day, how many phone calls did you answer?” — and the retiree writes a best guess on each line, with the unit printed beside it (“About ______ cups”). Best guesses are the whole point; nothing is looked up and nothing is invented for them. Works for any line of work, never about pay, health or age. Pick the kind of work, how many questions and miles or kilometres; type size and pages are fitted to your trim. Fresh questions every time, never repeated within your book.',
  pageCount: 1,
  producesAnswerKey: false,
  defaultPageTitle: CBN_DEFAULT_TITLE,
  pageTitleHelp:
    'Leave as “Career By the Numbers” — with the retiree’s name set below, it reads “Linda’s Career By the Numbers” — or type your own heading.',
  prefetch: careerNumbersPrefetch,
  validateConfig: validateCbnConfig,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <text x="32" y="5.5" text-anchor="middle" font-family="serif" font-size="3.6" font-weight="700" fill="currentColor">Career By the Numbers</text>
    <g fill="none" stroke="currentColor" stroke-width="0.6">
      <circle cx="8" cy="11.5" r="2.4"/>
      <circle cx="8" cy="22.5" r="2.4"/>
      <circle cx="8" cy="33.5" r="2.4"/>
    </g>
    <g font-family="serif" font-size="2.6" font-weight="700" fill="currentColor" text-anchor="middle">
      <text x="8" y="12.4">1</text>
      <text x="8" y="23.4">2</text>
      <text x="8" y="34.4">3</text>
    </g>
    <g stroke="currentColor" stroke-linecap="round">
      <path d="M13 11.5h40M13 22.5h36M13 33.5h42" stroke-width="1" opacity="0.8"/>
      <path d="M13 16.8h5M13 27.8h5M13 38.8h5" stroke-width="0.6" opacity="0.7"/>
      <path d="M20 17h20M20 28h20M20 39h20" stroke-width="0.4" opacity="0.45"/>
      <path d="M42 16.8h6M42 27.8h9M42 38.8h5" stroke-width="0.6" opacity="0.7"/>
    </g>
  </svg>`,
  configSchema: CBN_CONFIG_SCHEMA,
  generate,
}
