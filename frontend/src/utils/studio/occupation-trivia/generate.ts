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
import { OT_CONFIG_SCHEMA, instructionFor } from './config'
import {
  OT_AI_EMPTY_MESSAGE,
  OT_BUILD_FAILED_MESSAGE,
  OT_DEFAULT_TITLE,
  OT_MIN_QUESTIONS,
  OT_PAGE_TOO_SMALL_MESSAGE,
  OT_TEMPLATE_KEY,
  parseOtOccupation,
  parseOtPayload,
  selectOtQuestions,
} from './content'
import { drawOtKeyPage, drawOtQuizPage } from './draw'
import { fitOtPack, type OtFields } from './fit'
import { runOtKdpPreflight } from './kdp-preflight'
import { CONTINUE_LINE, otBodyField, otContentBox, otWorstCasePlan } from './layout'
import { occupationTriviaPrefetch } from './prefetch'

function errorPage(
  ctx: StudioGenerateContext,
  config: StudioConfig,
  tag: StudioTag,
  message: string,
): StudioPageOutput {
  const header = drawHeader(otContentBox(ctx), config, tag, instructionFor(config))
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
 * The quiz pages, then — attached to the last of them — the one answer page.
 *
 * Measured first, filled second, checked third. The worst-case plan fixes the
 * type size and the page limit from the trim alone, so the form's note is what
 * prints. The prefetched questions are validated again here, whatever reached
 * `remoteData`, then held to that plan; a question that will not fit is passed
 * over for a spare. The preflight re-proves the pack before anything is
 * returned.
 *
 * Only the last quiz page carries answer objects, and it carries the whole
 * key: the book adds one answer page per page that has answers, so the key
 * lands once, after the quiz — or at the back, by the book's own solutions
 * setting — never between two quiz pages. It is drawn from the very same
 * fitted questions, letters and answers included.
 */
function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)
  const occupation = parseOtOccupation(config.occupation)
  const instruction = instructionFor(config)
  const tag: StudioTag = { templateKey: OT_TEMPLATE_KEY, instanceId: ctx.instanceId, pageRole: 'single' }
  const fail = (message: string) => [errorPage(ctx, config, tag, message)]

  const promised = otWorstCasePlan({ page: ctx, config, instruction, font })
  if (!promised) return fail(OT_PAGE_TOO_SMALL_MESSAGE)

  const payload = parseOtPayload(ctx.remoteData)
  // Questions written for another job never print under this one's name.
  if (payload.occupation !== occupation) return fail(OT_AI_EMPTY_MESSAGE)
  const questions = selectOtQuestions(payload.questions, { occupation, cap: Number.POSITIVE_INFINITY })
  if (questions.length < OT_MIN_QUESTIONS) return fail(OT_AI_EMPTY_MESSAGE)

  const fields: OtFields = {
    first: otBodyField(ctx, config, instruction),
    laterHeight: otBodyField(ctx, config, '').height,
    key: otBodyField(ctx, config, ''),
  }
  const pack = fitOtPack(questions, promised, font, ctx.seed, occupation, fields)
  if (!pack) return fail(OT_BUILD_FAILED_MESSAGE)

  const preflight = runOtKdpPreflight({ pack, occupation, fields })
  if (!preflight.ok) return fail(preflight.errors[0] ?? OT_BUILD_FAILED_MESSAGE)

  const content = otContentBox(ctx)
  const outputs: StudioPageOutput[] = pack.pages.map((indices, page) => {
    const last = page === pack.pages.length - 1
    // Every page keeps the title so a reader flipping back knows where they
    // are; only the first repeats the how-to.
    const header = drawHeader(content, config, tag, page === 0 ? instruction : '')
    const objects: StudioFabricObject[] = [...header.objects]
    drawOtQuizPage(objects, {
      field: header.body,
      plan: pack.plan,
      questions: indices.map((i) => pack.questions[i]!),
      footer: last ? '' : CONTINUE_LINE,
      font,
      tag,
    })
    return { pageRole: 'single', objects }
  })

  const keyHeader = drawHeader(content, config, tag, '')
  const keyObjects: StudioFabricObject[] = [...keyHeader.objects]
  drawOtKeyPage(keyObjects, { field: keyHeader.body, key: pack.key, questions: pack.questions, font, tag })
  outputs[outputs.length - 1] = { ...outputs[outputs.length - 1]!, answerSourceObjects: keyObjects }
  return outputs
}

export const occupationTriviaTemplate: StudioTemplateDefinition = {
  key: OT_TEMPLATE_KEY,
  label: 'Occupation Trivia Pack',
  category: 'word',
  description:
    'Retirement Edition: about ten multiple-choice questions celebrating one job — Teacher, Nurse, Police, Military, Trucker, Engineer, Accountant or Postal. Questions come from the tools, terms, routines, traditions and history of that work, and every answer is fact-checked before it prints. Readers circle a letter; one answer page lists every answer with a short note. Pick an occupation and a level; the type size and pages are fitted to your trim. Fresh questions every pack, never repeated within your book.',
  pageCount: 1,
  producesAnswerKey: true,
  defaultPageTitle: OT_DEFAULT_TITLE,
  prefetch: occupationTriviaPrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g font-family="serif" font-size="4.2" font-weight="700" fill="currentColor">
      <text x="4" y="7">1.</text>
    </g>
    <path d="M11 5.6h38M11 10.4h24" stroke="currentColor" stroke-width="0.9" stroke-linecap="round"/>
    <g fill="none" stroke="currentColor" stroke-width="0.6">
      <circle cx="13.2" cy="17.4" r="2.3"/>
      <circle cx="37.2" cy="17.4" r="2.3"/>
      <circle cx="13.2" cy="24.6" r="2.3"/>
      <circle cx="37.2" cy="24.6" r="2.3"/>
    </g>
    <g font-family="serif" font-size="2.8" font-weight="700" fill="currentColor" text-anchor="middle">
      <text x="13.2" y="18.4">A</text>
      <text x="37.2" y="18.4">B</text>
      <text x="13.2" y="25.6">C</text>
      <text x="37.2" y="25.6">D</text>
    </g>
    <g stroke="currentColor" stroke-width="0.7" stroke-linecap="round" opacity="0.65">
      <path d="M17.5 17.4h13M41.5 17.4h15M17.5 24.6h11M41.5 24.6h13"/>
    </g>
    <path d="M4 31.5h56" stroke="currentColor" stroke-width="0.4" opacity="0.35"/>
    <g font-family="serif" font-size="4.2" font-weight="700" fill="currentColor">
      <text x="4" y="38">2.</text>
    </g>
    <path d="M11 36.6h32" stroke="currentColor" stroke-width="0.9" stroke-linecap="round"/>
  </svg>`,
  configSchema: OT_CONFIG_SCHEMA,
  generate,
}
