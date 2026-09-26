import type {
  StudioConfig,
  StudioFabricObject,
  StudioGenerateContext,
  StudioPageOutput,
  StudioTemplateDefinition,
} from '@/types/studio-template.types'
import { STUDIO_BODY_SIZE, STUDIO_DEFAULT_FONT, STUDIO_DIGIT_FONT } from '@/constants/studio.constants'
import { kickOffFontFamilyLoading } from '@/utils/font-loader'
import { resolveOwnerSalt } from '../_shared/uniqueness'
import { boxCenterX, drawHeader } from '../studio-layout'
import { buildText, type StudioTag } from '../studio-fabric-builders'
import { rememberStudioContent, studioAvoidList, studioVarietyKey } from '../studio-variety'
import { WL_CONFIG_SCHEMA } from './config'
import {
  WL_BUILD_FAILED_MESSAGE,
  WL_DEFAULT_TITLE,
  WL_PAGE_TOO_SMALL_MESSAGE,
  WL_TEMPLATE_KEY,
  parseWlBook,
  parseWlLevel,
  pickWlLadders,
  wlInstruction,
  wlLevelLadders,
  type WlLevel,
} from './content'
import { buildWlLadder } from './draw'
import { checkWlDrawnLadder, runWlKdpPreflight } from './kdp-preflight'
import { placeWlLadders, wlContentBox, wlFieldInBody, wlWorstCasePlan, type WlLadderPlacement, type WlPagePlan } from './layout'
import { parseWlRemoteData, wordLadderPrefetch } from './prefetch'

/** One ledger per level: a seller's next book opens with other ladders. */
const varietyKey = (level: string) => studioVarietyKey(WL_TEMPLATE_KEY, level)
/** Deals tried before the page gives up and says so. */
const ATTEMPTS = 8

function errorPage(ctx: StudioGenerateContext, config: StudioConfig, tag: StudioTag, message: string, instruction: string): StudioPageOutput {
  const header = drawHeader(wlContentBox(ctx), config, tag, instruction)
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

function drawLadders(placements: readonly WlLadderPlacement[], plan: WlPagePlan, level: WlLevel, tag: StudioTag, font: string): StudioFabricObject[] {
  return placements.map((placement) => buildWlLadder({ placement, plan, level, tag, font }))
}

/**
 * One Word Ladder page, and the answer page that fills every rung in.
 *
 * Planned, dealt, proven, drawn, checked. The trim alone fixes how many
 * ladders the page holds and how large they print, so the form's help line
 * is what prints and every page of a run matches. Ladders are dealt against
 * what the book and this seller have already printed, placed, and must
 * pass the preflight (every step one letter, every rung clued, large print,
 * on the page, not a repeat) and the drawn check (given words printed,
 * rung words hidden in their own squares, clues in order). A deal that
 * fails anywhere is set aside and another dealt; if none passes, the page
 * says so plainly instead of printing a ladder a reader cannot climb.
 */
function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const level = parseWlLevel(config.level)
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)
  const instruction = wlInstruction(config, level)
  const ownerSalt = resolveOwnerSalt(ctx)
  void kickOffFontFamilyLoading(STUDIO_DIGIT_FONT)
  const tag: StudioTag = { templateKey: WL_TEMPLATE_KEY, instanceId: ctx.instanceId, pageRole: 'single' }
  const fail = (message: string) => [errorPage(ctx, config, tag, message, instruction)]

  const plan = wlWorstCasePlan({ page: ctx, config, level, font })
  if (!plan) return fail(WL_PAGE_TOO_SMALL_MESSAGE)

  const header = drawHeader(wlContentBox(ctx), config, tag, instruction)
  const field = wlFieldInBody(header.body, header.objects.length > 0)
  const book = parseWlBook(parseWlRemoteData(ctx.remoteData).bookLabels)
  // All but a couple of pages' worth of the level: a seller's next book opens
  // with ladders their last one printed least lately, and a level never runs dry.
  const recent = studioAvoidList(varietyKey(level), Math.max(plan.count, wlLevelLadders(level).length - plan.count * 2))
  const exclude = new Set<string>()

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const deal = pickWlLadders({ level, count: plan.count, seed: ctx.seed, ownerSalt, book, recent, exclude, attempt })
    if (!deal) break
    const placements = placeWlLadders({ field, plan, ladders: deal.ladders, font })
    const setAside = () => deal.ladders.forEach((l) => exclude.add(l.id))
    if (!runWlKdpPreflight({ placements, plan, level, field, book }).ok) {
      setAside()
      continue
    }
    const ladders = drawLadders(placements, plan, level, tag, font)
    if (ladders.some((group, i) => checkWlDrawnLadder({ group, ladder: placements[i]!.ladder, level, index: i }).length > 0)) {
      setAside()
      continue
    }

    rememberStudioContent(varietyKey(level), deal.ladders.map((l) => l.id))
    return [
      {
        pageRole: 'single',
        objects: [...header.objects, ...ladders],
        // Drawn afresh for the key, where the puzzle page put them: only the
        // how-to line goes, and every rung fills in.
        answerSourceObjects: [...drawHeader(wlContentBox(ctx), config, tag, '').objects, ...drawLadders(placements, plan, level, tag, font)],
      },
    ]
  }
  return fail(WL_BUILD_FAILED_MESSAGE)
}

export const wordLadderTemplate: StudioTemplateDefinition = {
  key: WL_TEMPLATE_KEY,
  label: 'Word Ladder: Work to Play',
  category: 'word',
  description:
    'Climb from the working week to the good life, one letter at a time: WORK becomes GOLF, DESK becomes REST, BOSS becomes NAPS. Each puzzle is drawn as a real ladder with a clue beside every rung, so there is one right word on each step. Hand-made ladders in everyday words, three levels (Gentle shades the letter that changes), large print, and an answer page that fills every rung in.',
  pageCount: 1,
  producesAnswerKey: true,
  defaultPageTitle: WL_DEFAULT_TITLE,
  prefetch: wordLadderPrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g fill="currentColor">
      <rect x="9" y="2" width="1.4" height="36" rx="0.5"/>
      <rect x="30.6" y="2" width="1.4" height="36" rx="0.5"/>
      <rect x="9" y="10.6" width="23" height="0.9"/><rect x="9" y="19.6" width="23" height="0.9"/><rect x="9" y="28.6" width="23" height="0.9"/>
    </g>
    <g fill="none" stroke="currentColor" stroke-width="0.6">
      <rect x="12" y="4" width="4.2" height="5.4"/><rect x="16.2" y="4" width="4.2" height="5.4"/><rect x="20.4" y="4" width="4.2" height="5.4"/><rect x="24.6" y="4" width="4.2" height="5.4"/>
      <rect x="12" y="13" width="4.2" height="5.4"/><rect x="16.2" y="13" width="4.2" height="5.4"/><rect x="20.4" y="13" width="4.2" height="5.4"/><rect x="24.6" y="13" width="4.2" height="5.4"/>
      <rect x="12" y="22" width="4.2" height="5.4"/><rect x="16.2" y="22" width="4.2" height="5.4"/><rect x="20.4" y="22" width="4.2" height="5.4"/><rect x="24.6" y="22" width="4.2" height="5.4"/>
      <rect x="12" y="31" width="4.2" height="5.4"/><rect x="16.2" y="31" width="4.2" height="5.4"/><rect x="20.4" y="31" width="4.2" height="5.4"/><rect x="24.6" y="31" width="4.2" height="5.4"/>
    </g>
    <g fill="currentColor" font-family="sans-serif" font-size="4" font-weight="700" text-anchor="middle">
      <text x="14.1" y="8.3">W</text><text x="18.3" y="8.3">O</text><text x="22.5" y="8.3">R</text><text x="26.7" y="8.3">K</text>
      <text x="14.1" y="35.3">G</text><text x="18.3" y="35.3">O</text><text x="22.5" y="35.3">L</text><text x="26.7" y="35.3">F</text>
    </g>
    <g stroke="currentColor" stroke-width="0.6" stroke-linecap="round" opacity="0.6">
      <path d="M36 15.7h22M36 24.7h18"/>
    </g>
    <g fill="currentColor" font-family="serif" font-size="3.4" font-style="italic" opacity="0.8">
      <text x="36" y="7.8">Start</text><text x="36" y="34.8">Finish</text>
    </g>
  </svg>`,
  configSchema: WL_CONFIG_SCHEMA,
  generate,
}
