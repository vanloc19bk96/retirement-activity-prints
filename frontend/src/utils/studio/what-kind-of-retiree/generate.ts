import type {
  StudioConfig,
  StudioFabricObject,
  StudioGenerateContext,
  StudioPageOutput,
  StudioTemplateDefinition,
} from '@/types/studio-template.types'
import { STUDIO_BODY_SIZE, STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import { boxCenterX, drawHeader, type Box } from '../studio-layout'
import { buildText, type StudioTag } from '../studio-fabric-builders'
import { RQ_CONFIG_SCHEMA, instructionFor, validateRqConfig } from './config'
import {
  MIN_QUESTIONS,
  RQ_AI_EMPTY_MESSAGE,
  RQ_BUILD_FAILED_MESSAGE,
  RQ_CONTINUE_LINE,
  RQ_DEFAULT_TITLE,
  RQ_FINISHED_LINE,
  RQ_PAGE_TOO_SMALL_MESSAGE,
  RQ_STYLES,
  RQ_TEMPLATE_KEY,
  parseRqPayload,
  resolveRqDescriptions,
  selectRqQuestions,
} from './content'
import { drawRqQuizPage, drawRqScoring, drawRqWriteUps } from './draw'
import { fitRqQuestions, rqMeasurable, type FittedRqQuestion } from './fit'
import { runRqKdpPreflight } from './kdp-preflight'
import {
  planRqQuiz,
  planRqResults,
  rqBodyField,
  rqContentBox,
  rqWorstCasePlan,
  type RqQuizPlan,
  type RqResultsPlan,
} from './layout'
import { RQ_REQUEST_COUNT, retireeQuizPrefetch } from './prefetch'

export { validateRqConfig }

function errorPage(
  ctx: StudioGenerateContext,
  config: StudioConfig,
  tag: StudioTag,
  message: string,
): StudioPageOutput {
  const header = drawHeader(rqContentBox(ctx), config, tag, instructionFor(config))
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

/** Left edge of a centred block of `width` in `field`. */
const blockLeft = (field: Box, width: number) => Math.round(field.left + (field.width - width) / 2)

function quizPages(options: {
  config: StudioConfig
  ctx: StudioGenerateContext
  tag: StudioTag
  plan: RqQuizPlan
  questions: readonly FittedRqQuestion[]
  font: string
  instruction: string
}): StudioPageOutput[] {
  const { config, ctx, tag, plan, questions, font, instruction } = options
  const pages: StudioPageOutput[] = []
  for (let page = 0; page < plan.pages; page++) {
    const start = page * plan.perPage
    const slice = questions.slice(start, start + plan.perPage)
    // Every page keeps the title so a reader flipping back knows where they
    // are; only the first repeats the how-to.
    const header = drawHeader(rqContentBox(ctx), config, tag, page === 0 ? instruction : '')
    const objects: StudioFabricObject[] = [...header.objects]
    drawRqQuizPage(objects, {
      field: header.body,
      plan,
      questions: slice,
      firstNumber: start + 1,
      footer: page === plan.pages - 1 ? RQ_FINISHED_LINE : RQ_CONTINUE_LINE,
      font,
      tag,
    })
    pages.push({ pageRole: 'single', objects })
  }
  return pages
}

function resultsPages(options: {
  config: StudioConfig
  ctx: StudioGenerateContext
  tag: StudioTag
  plan: RqResultsPlan
  questions: readonly FittedRqQuestion[]
  font: string
}): StudioPageOutput[] {
  const { config, ctx, tag, plan, questions, font } = options
  const m = plan.metrics
  const page = () => {
    const header = drawHeader(rqContentBox(ctx), config, tag, '')
    return { field: header.body, objects: [...header.objects] as StudioFabricObject[] }
  }
  const usable = (field: Box) => field.height - plan.bottomGuard
  const lead = (slack: number) => Math.round(Math.min(Math.max(0, slack), m.font * 0.8))

  if (plan.onePage) {
    const { field, objects } = page()
    const left = blockLeft(field, plan.blockWidth)
    const slack = usable(field) - plan.scoring.height - m.sectionGap - plan.writeUps.height
    const top = field.top + lead(slack)
    // Whatever white is left after the lead goes between the two halves, up
    // to one more section gap, so the write-ups do not crowd the grid.
    const extra = Math.min(Math.max(0, slack - lead(slack)), m.sectionGap)
    const bottom = drawRqScoring(objects, { plan, questions, left, top, font, tag })
    drawRqWriteUps(objects, { plan, left, top: Math.round(bottom + m.sectionGap + extra), font, tag })
    return [{ pageRole: 'single', objects }]
  }

  const scoring = page()
  const scoringLeft = blockLeft(scoring.field, plan.blockWidth)
  drawRqScoring(scoring.objects, {
    plan,
    questions,
    left: scoringLeft,
    top: scoring.field.top + lead(usable(scoring.field) - plan.scoring.height),
    font,
    tag,
  })
  const writeUps = page()
  const slack = usable(writeUps.field) - plan.writeUps.height
  drawRqWriteUps(writeUps.objects, {
    plan,
    left: blockLeft(writeUps.field, plan.blockWidth),
    top: writeUps.field.top + lead(slack),
    font,
    tag,
    // One share after each write-up, up to one more style gap apiece.
    extraGap: Math.min(Math.max(0, slack - lead(slack)) / RQ_STYLES.length, m.styleGap),
  })
  return [
    { pageRole: 'single', objects: scoring.objects },
    { pageRole: 'single', objects: writeUps.objects },
  ]
}

/**
 * The quiz pages, then the scoring and results pages.
 *
 * Measured first, filled second, checked third. The worst-case plan fixes the
 * question count, type size, questions per page and every question's line
 * budget from the trim alone, so the form's note is what prints. The
 * prefetched questions are validated again here — whatever reached
 * `remoteData` — then held to that plan; a question that will not fit is
 * passed over for a spare, and a quiz that runs long overall is re-planned
 * from its own line counts. Letters are dealt by the seed across the questions
 * that print. The preflight then re-proves the quiz before anything is
 * returned.
 *
 * The scoring grid is drawn from the very same placed questions, so every row
 * can only ever name the letters printed beside that question's answers.
 */
function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)
  const instruction = instructionFor(config)
  const tag: StudioTag = { templateKey: RQ_TEMPLATE_KEY, instanceId: ctx.instanceId, pageRole: 'single' }
  const fail = (message: string) => [errorPage(ctx, config, tag, message)]

  const promised = rqWorstCasePlan({ page: ctx, config, instruction, font })
  if (!promised) return fail(RQ_PAGE_TOO_SMALL_MESSAGE)

  const payload = parseRqPayload(ctx.remoteData)
  const questions = selectRqQuestions(payload.questions, { cap: RQ_REQUEST_COUNT })
  if (questions.length < MIN_QUESTIONS) return fail(RQ_AI_EMPTY_MESSAGE)

  // The promised plan holds a typical quiz. When this one runs long, the page
  // is re-planned from its own line counts rather than refused.
  const fitted =
    fitRqQuestions(questions, promised.quiz, font, ctx.seed) ??
    ((replanned) => (replanned ? fitRqQuestions(questions, replanned, font, ctx.seed) : null))(
      planRqQuiz(rqBodyField(ctx, config, instruction), font, questions.map(rqMeasurable)),
    )
  if (!fitted) return fail(RQ_BUILD_FAILED_MESSAGE)

  const descriptions = resolveRqDescriptions(payload.results, ctx.seed)
  const results = planRqResults({
    field: rqBodyField(ctx, config, ''),
    count: fitted.plan.count,
    descriptions,
    font,
    startSize: fitted.plan.metrics.font,
    promised: promised.results,
  })
  if (!results) return fail(RQ_BUILD_FAILED_MESSAGE)

  const preflight = runRqKdpPreflight({
    questions: fitted.questions,
    quiz: fitted.plan,
    results,
    descriptions,
  })
  if (!preflight.ok) return fail(preflight.errors[0] ?? RQ_BUILD_FAILED_MESSAGE)

  const shared = { config, ctx, tag, questions: fitted.questions, font }
  return [
    ...quizPages({ ...shared, plan: fitted.plan, instruction }),
    ...resultsPages({ ...shared, plan: results }),
  ]
}

export const retireeQuizTemplate: StudioTemplateDefinition = {
  key: RQ_TEMPLATE_KEY,
  label: 'What Kind of Retiree Are You?',
  category: 'word',
  description:
    'A lighthearted retirement personality quiz: 8 to 10 relatable questions, each with four answers — one for The Explorer, The Tinkerer, The Social Butterfly and The Professional Napper. Readers circle their answers, tally them on an easy scoring grid and read a fun write-up of their retirement style. Every style gets an equal chance, and every question is checked before it prints. Fresh questions every quiz, never repeated within your book; question count and type size are fitted to your page.',
  pageCount: 1,
  producesAnswerKey: false,
  defaultPageTitle: RQ_DEFAULT_TITLE,
  validateConfig: validateRqConfig,
  prefetch: retireeQuizPrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g font-family="serif" font-size="4.2" font-weight="700" fill="currentColor">
      <text x="4" y="7">1.</text>
    </g>
    <g stroke="currentColor" stroke-width="0.9" stroke-linecap="round">
      <path d="M11 5.6h30"/>
    </g>
    <g font-family="serif" font-size="3.6" font-weight="700" fill="currentColor">
      <text x="11" y="15">A</text>
      <text x="11" y="22">B</text>
      <text x="11" y="29">C</text>
      <text x="11" y="36">D</text>
    </g>
    <circle cx="12.3" cy="20.7" r="2.8" fill="none" stroke="currentColor" stroke-width="0.7"/>
    <g stroke="currentColor" stroke-width="0.7" stroke-linecap="round" opacity="0.65">
      <path d="M17 13.8h22M17 20.8h18M17 27.8h24M17 34.8h20"/>
    </g>
    <g fill="none" stroke="currentColor" stroke-width="0.8" stroke-linejoin="round">
      <path d="M54 7.5l1.2 2.5 2.7.3-2 1.8.6 2.7-2.5-1.4-2.5 1.4.6-2.7-2-1.8 2.7-.3z"/>
      <path d="M54 17.5l3 3-3 3-3-3z"/>
      <circle cx="54" cy="29" r="2.6"/>
      <rect x="51.6" y="34" width="4.8" height="4.8"/>
    </g>
  </svg>`,
  configSchema: RQ_CONFIG_SCHEMA,
  generate,
}
