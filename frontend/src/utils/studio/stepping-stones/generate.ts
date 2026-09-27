import type {
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
  StudioTemplateDefinition,
} from '@/types/studio-template.types'
import { STUDIO_BODY_SIZE, STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import { resolveOwnerSalt } from '../_shared/uniqueness'
import { boxCenterX, drawHeader } from '../studio-layout'
import { buildText, type StudioTag } from '../studio-fabric-builders'
import { rememberStudioContent, studioAvoidList, studioVarietyKey } from '../studio-variety'
import { STONES_CONFIG_SCHEMA } from './config'
import {
  STONES_BUILD_FAILED_MESSAGE,
  STONES_DEFAULT_TITLE,
  STONES_TEMPLATE_KEY,
  STONES_WALKS,
  parseStonesBook,
  parseStonesLevel,
  pickStonesWalk,
  stonesInstruction,
  stonesLevelSpec,
  stonesPageLabel,
  stonesPageTooSmallMessage,
  stonesPathRng,
} from './content'
import { buildStonesPuzzle } from './draw'
import { checkStonesDrawnPage, runStonesKdpPreflight } from './kdp-preflight'
import { planStonesPage, stonesContentBox, stonesPanelInBody } from './layout'
import { parseStonesRemoteData, steppingStonesPrefetch } from './prefetch'
import { buildStonesPath } from './puzzle'

/** One ledger for the template: a seller's next book opens at other walks. */
const VARIETY_KEY = studioVarietyKey(STONES_TEMPLATE_KEY, 'walks')
/** Building streams tried before the page gives up and says so. */
const ATTEMPTS = 4

function errorPage(ctx: StudioGenerateContext, config: StudioConfig, tag: StudioTag, message: string, instruction: string): StudioPageOutput {
  const header = drawHeader(stonesContentBox(ctx), config, tag, instruction)
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
 * One Stepping Stones page, and the answer page with the walk traced.
 *
 * Planned, built, proven, drawn, checked. The trim alone fixes how large
 * the stones print, so the form's help line is what prints. The walk's name
 * is dealt against what the book and this seller have already printed; the
 * path and its numbers are built fresh from the seller's salt and the page
 * seed and must pass the preflight (one walk through every stone keeping
 * every printed number, the start and finish printed, finished by the
 * level's own logic on exactly that walk and not by easier steps alone
 * where the level asks for more, large print, on the page, not a repeat)
 * and the drawn check (every stone and printed number in place, every other
 * number waiting on its own stone, the trail along exactly the answer's
 * walk, the start and finish ringed). A path that fails anywhere is set
 * aside and another built; if none passes, the page says so plainly instead
 * of printing a path a reader cannot finish.
 */
function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const level = parseStonesLevel(config.level)
  const spec = stonesLevelSpec(level)
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)
  const instruction = stonesInstruction(config, level)
  const ownerSalt = resolveOwnerSalt(ctx)
  const tag: StudioTag = { templateKey: STONES_TEMPLATE_KEY, instanceId: ctx.instanceId, pageRole: 'single' }
  const fail = (message: string) => [errorPage(ctx, config, tag, message, instruction)]

  const header = drawHeader(stonesContentBox(ctx), config, tag, instruction)
  const panel = stonesPanelInBody(header.body, header.objects.length > 0)
  const plan = planStonesPage(panel, level, font)
  if (!plan) return fail(stonesPageTooSmallMessage(spec))

  const book = parseStonesBook(parseStonesRemoteData(ctx.remoteData).bookLabels)
  // All but a handful of names: a seller's next book opens at walks their
  // last one used least lately, and the list never runs dry.
  const recent = studioAvoidList(VARIETY_KEY, STONES_WALKS.length - 6)
  const walk = pickStonesWalk({ level, seed: ctx.seed, ownerSalt, book, recent })
  const exclude = new Set(book.map((e) => e.signature).filter(Boolean))

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const built = buildStonesPath({ ...spec, rng: stonesPathRng({ level, seed: ctx.seed, ownerSalt, attempt }), exclude })
    if (!built) continue
    exclude.add(built.signature)
    if (!runStonesKdpPreflight({ built, plan, level, walk, panel, font, book }).ok) continue

    const label = stonesPageLabel(walk, level, built.signature)
    const draw = () => buildStonesPuzzle({ built, plan, walk, level, label, tag, font })
    const puzzle = draw()
    if (checkStonesDrawnPage({ puzzle, built, walk }).length > 0) continue

    rememberStudioContent(VARIETY_KEY, [walk.id])
    return [
      {
        pageRole: 'single',
        objects: [...header.objects, puzzle],
        // Drawn afresh for the key, where the puzzle page put it: only the
        // how-to line goes, and the walk is traced.
        answerSourceObjects: [...drawHeader(stonesContentBox(ctx), config, tag, '').objects, draw()],
      },
    ]
  }
  return fail(STONES_BUILD_FAILED_MESSAGE)
}

export const steppingStonesTemplate: StudioTemplateDefinition = {
  key: STONES_TEMPLATE_KEY,
  label: 'Stepping Stones: Walk the Path',
  category: 'logic',
  description:
    'The number-path puzzle loved in the Sunday papers, laid out as a retiree’s favorite stroll: write 1 to the last number on the stepping stones so each number sits next to the one before it, across or down, and the walk visits every stone once. Every path is built fresh, proven to have one answer reached by logic alone, and named for a walk worth taking, such as the Rose Garden Path, a Seaside Boardwalk or the Grandkids’ Nature Walk. Three levels, large print, and an answer page where the numbers become a garden trail winding from the start stone to the finish.',
  pageCount: 1,
  producesAnswerKey: true,
  defaultPageTitle: STONES_DEFAULT_TITLE,
  prefetch: steppingStonesPrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <path d="M8 8H20V20H8V32H32V8H56V20H44V32H56" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round" stroke-linecap="round" opacity="0.15"/>
    <g fill="none" stroke="currentColor" stroke-width="0.8" opacity="0.6">
      <rect x="3" y="3" width="10" height="10" rx="2.6"/><rect x="15" y="3" width="10" height="10" rx="2.6"/><rect x="27" y="3" width="10" height="10" rx="2.6"/><rect x="39" y="3" width="10" height="10" rx="2.6"/><rect x="51" y="3" width="10" height="10" rx="2.6"/>
      <rect x="3" y="15" width="10" height="10" rx="2.6"/><rect x="15" y="15" width="10" height="10" rx="2.6"/><rect x="27" y="15" width="10" height="10" rx="2.6"/><rect x="39" y="15" width="10" height="10" rx="2.6"/><rect x="51" y="15" width="10" height="10" rx="2.6"/>
      <rect x="3" y="27" width="10" height="10" rx="2.6"/><rect x="15" y="27" width="10" height="10" rx="2.6"/><rect x="27" y="27" width="10" height="10" rx="2.6"/><rect x="39" y="27" width="10" height="10" rx="2.6"/><rect x="51" y="27" width="10" height="10" rx="2.6"/>
    </g>
    <g fill="none" stroke="currentColor" stroke-width="0.6" opacity="0.8">
      <rect x="4.6" y="4.6" width="6.8" height="6.8" rx="1.4"/><rect x="52.6" y="28.6" width="6.8" height="6.8" rx="1.4"/>
    </g>
    <g fill="currentColor" font-family="sans-serif" font-size="4.6" font-weight="700" text-anchor="middle">
      <text x="8" y="9.6">1</text>
      <text x="8" y="21.6">4</text>
      <text x="32" y="33.6">7</text>
      <text x="32" y="9.6">9</text>
      <text x="56" y="21.6">12</text>
      <text x="56" y="33.6">15</text>
    </g>
  </svg>`,
  configSchema: STONES_CONFIG_SCHEMA,
  generate,
}
