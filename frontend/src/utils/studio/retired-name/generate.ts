import type {
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
  StudioTemplateDefinition,
} from '@/types/studio-template.types'
import { STUDIO_BODY_SIZE, STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import { boxCenterX, drawHeader } from '../studio-layout'
import { buildText, type StudioTag } from '../studio-fabric-builders'
import { hugTextBoxWidth } from '../studio-text-metrics'
import { RN_CONFIG_SCHEMA, instructionFor, validateRnConfig } from './config'
import {
  RN_AI_EMPTY_MESSAGE,
  RN_BUILD_FAILED_MESSAGE,
  RN_DEFAULT_TITLE,
  RN_PAGE_TOO_SMALL_MESSAGE,
  RN_TEMPLATE_KEY,
  buildRnTable,
  chooseRnExample,
  parseRnPayload,
  poolsCanFillTable,
} from './content'
import { drawRnPage } from './draw'
import { runRnKdpPreflight } from './kdp-preflight'
import { exampleLines, plainSpec, rnContentBox, rnWorstCasePlan } from './layout'
import { retiredNamePrefetch } from './prefetch'

export { validateRnConfig }

function errorPage(
  ctx: StudioGenerateContext,
  config: StudioConfig,
  tag: StudioTag,
  message: string,
): StudioPageOutput {
  const header = drawHeader(rnContentBox(ctx), config, tag, instructionFor(config))
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
 * One "What's Your Retired Name?" page. No answer page: every reader's answer
 * is their own name.
 *
 * Measured first, filled second, checked third. The worst-case plan fixes the
 * type size, columns and extras from the trim alone, so the form's note is
 * what prints. The prefetched names are validated again here — whatever
 * reached `remoteData` — then held to that plan: a name wider than its column
 * is passed over for a spare. The table is printed whole (26 letters, 12
 * months) or not at all, and the preflight re-proves the page before anything
 * is returned.
 */
function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)
  const instruction = instructionFor(config)
  const tag: StudioTag = {
    templateKey: RN_TEMPLATE_KEY,
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }
  const fail = (message: string) => [errorPage(ctx, config, tag, message)]

  const plan = rnWorstCasePlan({ page: ctx, config, instruction, font })
  if (!plan) return fail(RN_PAGE_TOO_SMALL_MESSAGE)

  const payload = parseRnPayload(ctx.remoteData)
  if (!poolsCanFillTable(payload)) return fail(RN_AI_EMPTY_MESSAGE)

  const plain = plainSpec(font)
  const fitsIn = (width: number) => (name: string) =>
    hugTextBoxWidth(name, plan.metrics.font, Infinity, plain) <= width
  const table = buildRnTable(payload, {
    first: fitsIn(plan.letters.valueW),
    last: fitsIn(plan.months.valueW),
  })
  if (!table) return fail(RN_BUILD_FAILED_MESSAGE)

  const box = plan.example
  const example = box
    ? chooseRnExample(table, plan.monthLabels, (candidate) => {
        const lines = exampleLines(candidate, { metrics: plan.metrics, example: box }, font)
        return lines.lead.length <= box.leadLines && lines.result.length <= box.resultLines
      })
    : null

  const header = drawHeader(rnContentBox(ctx), config, tag, instruction)
  const preflight = runRnKdpPreflight({ table, plan, example, field: header.body, font })
  if (!preflight.ok) return fail(preflight.errors[0] ?? RN_BUILD_FAILED_MESSAGE)

  const objects = [...header.objects]
  drawRnPage(objects, { field: header.body, plan, table, example, font, tag })
  return [{ pageRole: 'single', objects }]
}

export const retiredNameTemplate: StudioTemplateDefinition = {
  key: RN_TEMPLATE_KEY,
  label: 'What’s Your Retired Name?',
  category: 'word',
  description:
    'A party favourite for retirement books: find the first letter of your first name and your birth month to discover a funny retired name — “Captain Hammock Snoozer”. The A–Z and month tables, a worked example and a line to write your new name are sized to your page automatically. Pick a theme; fresh names are written for every page and never repeated within your book.',
  pageCount: 1,
  producesAnswerKey: false,
  defaultPageTitle: RN_DEFAULT_TITLE,
  validateConfig: validateRnConfig,
  prefetch: retiredNamePrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g font-family="serif" font-size="3.2" font-weight="700" fill="currentColor">
      <text x="5" y="6.5">1. Initial</text>
      <text x="35" y="6.5">2. Month</text>
    </g>
    <g fill="currentColor">
      <rect x="5" y="8" width="26" height="0.6"/>
      <rect x="35" y="8" width="24" height="0.6"/>
    </g>
    <g font-family="serif" font-size="2.8" font-weight="700" fill="currentColor">
      <text x="5.2" y="12.4">A</text><text x="5.2" y="16.4">B</text><text x="5.2" y="20.4">C</text><text x="5.2" y="24.4">D</text>
      <text x="18.2" y="12.4">N</text><text x="18.2" y="16.4">O</text><text x="18.2" y="20.4">P</text><text x="18.2" y="24.4">Q</text>
      <text x="35" y="12.4">Jan</text><text x="35" y="16.4">Feb</text><text x="35" y="20.4">Mar</text><text x="35" y="24.4">Apr</text>
    </g>
    <g stroke="currentColor" stroke-width="0.7" stroke-linecap="round" opacity="0.65">
      <path d="M9 11.5h7M9 15.5h5.5M9 19.5h6.5M9 23.5h5"/>
      <path d="M22 11.5h7M22 15.5h6M22 19.5h5M22 23.5h6.5"/>
      <path d="M42 11.5h16M42 15.5h13M42 19.5h15M42 23.5h12"/>
    </g>
    <g stroke="currentColor" stroke-width="0.3" opacity="0.45">
      <path d="M5 13.3h26M5 17.3h26M5 21.3h26M35 13.3h24M35 17.3h24M35 21.3h24"/>
    </g>
    <rect x="5" y="28" width="54" height="8" rx="1.2" fill="none" stroke="currentColor" stroke-width="0.6"/>
    <g stroke="currentColor" stroke-width="0.7" stroke-linecap="round" opacity="0.65">
      <path d="M20 31h24M16 33.6h32"/>
    </g>
  </svg>`,
  configSchema: RN_CONFIG_SCHEMA,
  generate,
}
