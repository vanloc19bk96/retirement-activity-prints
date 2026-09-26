import type {
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
  StudioTemplateDefinition,
} from '@/types/studio-template.types'
import { STUDIO_BODY_SIZE, STUDIO_DEFAULT_FONT, STUDIO_DIGIT_FONT } from '@/constants/studio.constants'
import { kickOffFontFamilyLoading } from '@/utils/font-loader'
import { resolveOwnerSalt } from '../_shared/uniqueness'
import { boxCenterX, contentBox, drawHeader } from '../studio-layout'
import { buildText, type StudioTag } from '../studio-fabric-builders'
import { rememberStudioContent, studioAvoidList, studioVarietyKey } from '../studio-variety'
import { PL_CONFIG_SCHEMA } from './config'
import {
  PL_BUILD_FAILED_MESSAGE,
  PL_DEFAULT_TITLE,
  PL_TEMPLATE_KEY,
  parsePlBook,
  parsePlLevel,
  pickPlDesign,
  plInstruction,
  plLevelPictures,
  plLevelSpec,
  plPageTooSmallMessage,
} from './content'
import { buildPlPuzzle } from './draw'
import { checkPlDrawnPage, runPlKdpPreflight } from './kdp-preflight'
import { plPanelInBody, plUnfitPictures, planPlPage } from './layout'
import { parsePlRemoteData, pictureLogicPrefetch } from './prefetch'

/** One ledger per level: a seller's next book opens with other pictures. */
const varietyKey = (level: string) => studioVarietyKey(PL_TEMPLATE_KEY, level)
/** Pictures tried before the page gives up and says so. */
const ATTEMPTS = 8

function errorPage(ctx: StudioGenerateContext, config: StudioConfig, tag: StudioTag, message: string, instruction: string): StudioPageOutput {
  const header = drawHeader(contentBox(ctx), config, tag, instruction)
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
 * One Picture Logic page, and the answer page that reveals its picture.
 *
 * Chosen, planned, proven, drawn, checked. The picture is dealt against
 * what the book and this seller have already printed; the page is planned
 * from its clues at the largest squares the trim allows; then the puzzle
 * must pass the preflight (clues re-derived from the picture, solved line
 * by line to exactly that picture, large print, on the page, not a repeat)
 * and the drawn check (every clue printed once in its line, the hidden
 * answer exactly the picture). A picture that fails anywhere is set aside
 * and another dealt; if none passes, the page says so plainly instead of
 * printing a puzzle a reader cannot finish.
 */
function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const level = parsePlLevel(config.level)
  const spec = plLevelSpec(level)
  const ownerSalt = resolveOwnerSalt(ctx)
  const instruction = plInstruction(config)
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)
  void kickOffFontFamilyLoading(STUDIO_DIGIT_FONT)
  const tag: StudioTag = { templateKey: PL_TEMPLATE_KEY, instanceId: ctx.instanceId, pageRole: 'single' }
  const fail = (message: string) => [errorPage(ctx, config, tag, message, instruction)]

  const header = drawHeader(contentBox(ctx), config, tag, instruction)
  const panel = plPanelInBody(header.body, header.objects.length > 0)
  const book = parsePlBook(parsePlRemoteData(ctx.remoteData).bookLabels)
  // All but a few of the level's pictures: a seller's next book opens with
  // the ones their last one printed least lately, and a level never runs dry.
  const recent = studioAvoidList(varietyKey(level), Math.max(1, plLevelPictures(level).length - 3))
  // A picture with long clues may not fit a mid-size trim at this level's
  // large print; it waits for a larger page rather than printing small.
  const unfit = plUnfitPictures(level, panel)
  if (unfit.size === plLevelPictures(level).length) return fail(plPageTooSmallMessage(spec))
  const exclude = new Set<string>(unfit)

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const design = pickPlDesign({ level, seed: ctx.seed, ownerSalt, book, recent, exclude, attempt })
    if (!design) break
    exclude.add(design.picture.id)
    const plan = planPlPage(design, panel, level)
    if (!plan) continue
    if (!runPlKdpPreflight({ design, plan, level, panel, book, unfit }).ok) continue

    const puzzle = buildPlPuzzle({ design, plan, tag, font })
    if (checkPlDrawnPage({ puzzle, design }).length > 0) continue

    rememberStudioContent(varietyKey(level), [design.picture.id])
    return [
      {
        pageRole: 'single',
        objects: [...header.objects, puzzle],
        // Drawn afresh for the key, where the puzzle page put it: only the
        // how-to line goes, and the picture and its name appear.
        answerSourceObjects: [...drawHeader(contentBox(ctx), config, tag, '').objects, buildPlPuzzle({ design, plan, tag, font })],
      },
    ]
  }
  return fail(PL_BUILD_FAILED_MESSAGE)
}

export const pictureLogicTemplate: StudioTemplateDefinition = {
  key: PL_TEMPLATE_KEY,
  label: 'Picture Logic: Retirement Edition',
  category: 'logic',
  description:
    'Nonogram picture puzzles: shade squares to match the number clues and a hand-drawn retirement picture appears — a teacup, a sailboat, a camper van, a typewriter. Every puzzle solves one line at a time with no guessing. Large-print numbers, three grid sizes, and an answer page that reveals the picture.',
  pageCount: 1,
  producesAnswerKey: true,
  defaultPageTitle: PL_DEFAULT_TITLE,
  prefetch: pictureLogicPrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g fill="currentColor" font-family="sans-serif" font-size="3.6" text-anchor="middle">
      <text x="33.5" y="3.6">2</text><text x="41.5" y="3.6">2</text>
      <text x="29.5" y="8">1</text><text x="33.5" y="8">1</text><text x="37.5" y="8">4</text><text x="41.5" y="8">1</text><text x="45.5" y="8">1</text>
    </g>
    <g fill="currentColor" font-family="sans-serif" font-size="3.6" text-anchor="end">
      <text x="25.5" y="13.3">1</text><text x="25.5" y="17.3">3</text><text x="25.5" y="21.3">5</text><text x="25.5" y="25.3">1</text><text x="25.5" y="29.3">1 1</text>
    </g>
    <g fill="currentColor">
      <rect x="35.5" y="10" width="4" height="4"/>
      <rect x="31.5" y="14" width="12" height="4"/>
      <rect x="27.5" y="18" width="20" height="4"/>
      <rect x="35.5" y="22" width="4" height="4"/>
      <rect x="31.5" y="26" width="4" height="4"/><rect x="39.5" y="26" width="4" height="4"/>
    </g>
    <g fill="none" stroke="currentColor">
      <rect x="27.5" y="10" width="20" height="20" stroke-width="1.1"/>
      <path d="M31.5 10v20M35.5 10v20M39.5 10v20M43.5 10v20M27.5 14h20M27.5 18h20M27.5 22h20M27.5 26h20" stroke-width="0.35"/>
    </g>
  </svg>`,
  configSchema: PL_CONFIG_SCHEMA,
  generate,
}
