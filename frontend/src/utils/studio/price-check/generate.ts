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
import { PC_CONFIG_SCHEMA, instructionFor } from './config'
import {
  PC_BOOK_FULL_MESSAGE,
  PC_BUILD_FAILED_MESSAGE,
  PC_DEFAULT_TITLE,
  PC_PAGE_TOO_SMALL_MESSAGE,
  PC_TEMPLATE_KEY,
  bookFacts,
  parsePcLevel,
} from './content'
import { drawPcPage, type PcDrawMode } from './draw'
import { fitPcQuestions, type FittedPcQuestion } from './fit'
import { runPcKdpPreflight } from './kdp-preflight'
import { pcContentBox, pcWorstCasePlan, type PcPagePlan } from './layout'
import { parsePcRemoteData, priceCheckPrefetch } from './prefetch'

function errorPage(
  ctx: StudioGenerateContext,
  config: StudioConfig,
  tag: StudioTag,
  message: string,
): StudioPageOutput {
  const header = drawHeader(pcContentBox(ctx), config, tag, instructionFor(config))
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
  plan: PcPagePlan
  questions: readonly FittedPcQuestion[]
  font: string
  instruction: string
  mode: PcDrawMode
}): StudioFabricObject[] {
  const { config, ctx, tag, plan, questions, font, instruction, mode } = options
  const header = drawHeader(pcContentBox(ctx), config, tag, instruction)
  const objects = [...header.objects]
  drawPcPage(objects, { field: header.body, plan, questions, font, tag, mode })
  return objects
}

/**
 * One page of Price Check: Then & Now, and its answer page.
 *
 * Measured first, filled second, checked third. The worst-case plan fixes the
 * question count, type size and line budget from the trim alone, so the form's
 * note is what prints and every page of a run matches. Facts are drawn from
 * the bundled, sourced dataset — never ones the book already asks — then built
 * into questions, held to the plan and re-proved by the preflight.
 *
 * The answer page is drawn from the very same questions in the same order, so
 * each letter and price can only print under its own question's number.
 */
function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)
  const level = parsePcLevel(config.level)
  const instruction = instructionFor(config)
  const tag: StudioTag = {
    templateKey: PC_TEMPLATE_KEY,
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }
  const fail = (message: string) => [errorPage(ctx, config, tag, message)]

  const promised = pcWorstCasePlan({ page: ctx, config, instruction, font })
  if (!promised) return fail(PC_PAGE_TOO_SMALL_MESSAGE)

  const book = bookFacts(parsePcRemoteData(ctx.remoteData).bookKeys)
  const fitted = fitPcQuestions({ promised, level, seed: ctx.seed, font, book })
  if (!fitted) return fail(book.length > 0 ? PC_BOOK_FULL_MESSAGE : PC_BUILD_FAILED_MESSAGE)

  const preflight = runPcKdpPreflight({ questions: fitted.questions, plan: fitted.plan, level })
  if (!preflight.ok) return fail(preflight.errors[0] ?? PC_BUILD_FAILED_MESSAGE)

  const shared = { config, ctx, tag, plan: fitted.plan, questions: fitted.questions, font }
  return [
    {
      pageRole: 'single',
      objects: layoutPage({ ...shared, instruction, mode: 'puzzle' }),
      // Same numbers, each with its letter and price. The how-to line is
      // dropped: a reader checking answers has already read it.
      answerSourceObjects: layoutPage({ ...shared, instruction: '', mode: 'answers' }),
    },
  ]
}

export const priceCheckTemplate: StudioTemplateDefinition = {
  key: PC_TEMPLATE_KEY,
  label: 'Price Check: Then & Now',
  category: 'word',
  description:
    'How much was a movie ticket in 1975, or a gallon of gas in 1962? Guess each everyday price from four choices, then check the answer page. Every price is a real U.S. figure from published records — national averages and official postage rates, 1950 to 2000 — never invented. Pick a level; questions per page and type size are fitted to your page. Never repeats an item and year already in your book.',
  pageCount: 1,
  producesAnswerKey: true,
  defaultPageTitle: PC_DEFAULT_TITLE,
  prefetch: priceCheckPrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g font-family="serif" font-size="3.8" font-weight="700" fill="currentColor">
      <text x="5" y="8">1.</text>
      <text x="5" y="25">2.</text>
    </g>
    <g stroke="currentColor" stroke-width="0.7" stroke-linecap="round" opacity="0.65">
      <path d="M12 7h42M12 25h36"/>
    </g>
    <g font-family="serif" font-size="3.6" fill="currentColor">
      <text x="12" y="15"><tspan font-weight="700">A</tspan> 25¢</text>
      <text x="24" y="15"><tspan font-weight="700">B</tspan> 36¢</text>
      <text x="36" y="15"><tspan font-weight="700">C</tspan> 61¢</text>
      <text x="48" y="15"><tspan font-weight="700">D</tspan> 99¢</text>
      <text x="12" y="33"><tspan font-weight="700">A</tspan> $1.10</text>
      <text x="37" y="33"><tspan font-weight="700">B</tspan> $2.03</text>
    </g>
    <circle cx="37.3" cy="13.8" r="2.6" fill="none" stroke="currentColor" stroke-width="0.6"/>
    <g stroke="currentColor" stroke-width="0.4" opacity="0.35">
      <path d="M5 19.5h54"/>
    </g>
  </svg>`,
  configSchema: PC_CONFIG_SCHEMA,
  generate,
}
