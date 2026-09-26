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
import { WKB_CONFIG_SCHEMA, validateWkbConfig } from './config'
import {
  WKB_AI_EMPTY_MESSAGE,
  WKB_BUILD_FAILED_MESSAGE,
  WKB_DEFAULT_TITLE,
  WKB_PAGE_TOO_SMALL_MESSAGE,
  WKB_SHORT_MESSAGE,
  WKB_TEMPLATE_KEY,
  cleanWkbPool,
  numberWkbSet,
  orderWkbSet,
  parseRetireeName,
  parseWkbPayload,
  parseWkbPlayers,
  pickWkbSet,
  whoFor,
  wkbPlayerInstruction,
  wkbTitleFor,
} from './content'
import { drawWkbPage } from './draw'
import { runWkbKdpPreflight, type WkbPreflightSheet } from './kdp-preflight'
import {
  MAX_QUESTION_LINES,
  breakQuestion,
  fitWkbQuestions,
  paginateWkbSheet,
  usableHeight,
  wkbContentBox,
  wkbLayout,
  type WkbSheet,
} from './layout'
import { whoKnowsBestPrefetch } from './prefetch'

function errorPage(
  ctx: StudioGenerateContext,
  config: StudioConfig,
  tag: StudioTag,
  message: string,
): StudioPageOutput {
  const name = parseRetireeName(config.retireeName)
  const instruction = config.showInstructions === false ? '' : wkbPlayerInstruction(name)
  const header = drawHeader(
    wkbContentBox(ctx),
    { ...config, title: wkbTitleFor(config.title, name) },
    tag,
    instruction,
  )
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
 * One answer sheet per player, then the retiree's sheet. No answer key: the
 * only right answers are the retiree's own, written in by hand.
 *
 * Measured first, filled second, checked third. The type size comes from the
 * trim, so the form's note is what prints. The prefetched questions are
 * validated again here — whatever reached `remoteData` — a question that
 * would wrap past three lines is passed over for a spare, the set is picked
 * to exactly twelve balanced questions and put in reading order by seed,
 * numbered once, and flowed over each sheet's pages whole; the preflight
 * re-proves every sheet before anything is returned.
 */
function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)
  const name = parseRetireeName(config.retireeName)
  const players = parseWkbPlayers(config.players)
  const seed = Number(config.seed ?? ctx.seed ?? 1)
  const tag: StudioTag = { templateKey: WKB_TEMPLATE_KEY, instanceId: ctx.instanceId, pageRole: 'single' }
  const fail = (message: string) => [errorPage(ctx, config, tag, message)]

  const layout = wkbLayout({ page: ctx, config, font, name, players })
  if (!layout) return fail(WKB_PAGE_TOO_SMALL_MESSAGE)
  const { plan } = layout

  const pool = cleanWkbPool(parseWkbPayload(ctx.remoteData))
  if (pool.length === 0) return fail(WKB_AI_EMPTY_MESSAGE)
  const { picks } = pickWkbSet(pool, (q) => breakQuestion(q, plan, font).length <= MAX_QUESTION_LINES)
  if (!picks) return fail(WKB_SHORT_MESSAGE)

  const questions = fitWkbQuestions(numberWkbSet(orderWkbSet(picks, seed)), plan, font)
  const paginate = (sheet: WkbSheet) =>
    paginateWkbSheet(questions, plan, usableHeight(plan, sheet.fields), { kind: sheet.kind, players })
  const playerPages = paginate(layout.player)
  const answerPages = paginate(layout.answers)
  if (!playerPages || !answerPages) return fail(WKB_PAGE_TOO_SMALL_MESSAGE)

  // Every player's sheet is the same questions on the same pages.
  const sheets: (WkbPreflightSheet & { spec: WkbSheet; id: string })[] = [
    ...Array.from({ length: players }, (_, i) => ({
      kind: 'player' as const,
      id: `player-${i + 1}`,
      spec: layout.player,
      pages: playerPages,
      usable: usableHeight(plan, layout.player.fields),
    })),
    {
      kind: 'answers' as const,
      id: 'answers',
      spec: layout.answers,
      pages: answerPages,
      usable: usableHeight(plan, layout.answers.fields),
    },
  ]
  const preflight = runWkbKdpPreflight({ questions, sheets, plan, players })
  if (!preflight.ok) return fail(preflight.errors[0] ?? WKB_BUILD_FAILED_MESSAGE)

  const content = wkbContentBox(ctx)
  const who = whoFor(name)
  return sheets.flatMap((sheet) =>
    sheet.pages.map((page, index) => {
      // Every page keeps its sheet's heading so a page handed round is never
      // anonymous; only a sheet's first page repeats the how-to.
      const header = drawHeader(
        content,
        { ...config, title: sheet.spec.title },
        tag,
        index === 0 ? sheet.spec.instruction : '',
      )
      const objects: StudioFabricObject[] = [...header.objects]
      drawWkbPage(objects, { field: header.body, plan, page, font, tag, sheet: sheet.id, kind: sheet.kind, who })
      return { pageRole: 'single' as const, objects }
    }),
  )
}

export const whoKnowsBestTemplate: StudioTemplateDefinition = {
  key: WKB_TEMPLATE_KEY,
  label: 'Who Knows the Retiree Best?',
  category: 'word',
  description:
    'A warm party game for coworkers, friends and family: 12 light questions about the retiree — “What was the very first job they were paid for?”, “Tea, coffee or hot chocolate: which do they reach for first?” — each with room for a handwritten guess and a box to tick. Every player gets their own answer sheet with the same questions; the retiree fills in the real answers on the last sheet, and a scoreboard shows who knows them best. Nothing about the retiree is invented or needed — just an optional name. Pick who’s playing and how many; type size and pages are fitted to your trim. Fresh questions every time, never repeated within your book.',
  pageCount: 1,
  producesAnswerKey: false,
  defaultPageTitle: WKB_DEFAULT_TITLE,
  prefetch: whoKnowsBestPrefetch,
  validateConfig: validateWkbConfig,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g font-family="serif" font-size="3.2" font-weight="700" fill="currentColor">
      <text x="32" y="5.5" text-anchor="middle">Who Knows Them Best?</text>
      <text x="6" y="12">1.</text>
      <text x="6" y="21">2.</text>
      <text x="6" y="30">3.</text>
    </g>
    <g stroke="currentColor" stroke-width="0.7" stroke-linecap="round" opacity="0.75">
      <path d="M10.5 11h34M10.5 20h40M10.5 29h30"/>
    </g>
    <g stroke="currentColor" stroke-width="0.4" opacity="0.45">
      <path d="M10.5 16h20M10.5 25h38M10.5 34h38M10.5 37.5h38"/>
    </g>
    <g fill="none" stroke="currentColor" stroke-width="0.6">
      <rect x="52.5" y="13" width="3.2" height="3.2" rx="0.4"/>
      <rect x="52.5" y="22" width="3.2" height="3.2" rx="0.4"/>
      <rect x="52.5" y="31" width="3.2" height="3.2" rx="0.4"/>
    </g>
  </svg>`,
  configSchema: WKB_CONFIG_SCHEMA,
  generate,
}
