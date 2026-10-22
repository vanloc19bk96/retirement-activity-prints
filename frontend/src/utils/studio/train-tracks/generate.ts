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
import { TT_CONFIG_SCHEMA } from './config'
import {
  TT_BUILD_FAILED_MESSAGE,
  TT_DEFAULT_TITLE,
  TT_LINES,
  TT_TEMPLATE_KEY,
  parseTtBook,
  parseTtLevel,
  pickTtLine,
  ttBoardRng,
  ttInstruction,
  ttLevelSpec,
  ttPageLabel,
  ttPageTooSmallMessage,
} from './content'
import { buildTtPuzzle } from './draw'
import { checkTtDrawnPage, runTtKdpPreflight } from './kdp-preflight'
import { planTtPage, ttContentBox, ttPanelInBody } from './layout'
import { parseTtRemoteData, trainTracksPrefetch } from './prefetch'
import { buildTtBoard } from './puzzle'

/** One ledger for the template: a seller's next book opens on other lines. */
const VARIETY_KEY = studioVarietyKey(TT_TEMPLATE_KEY, 'lines')
/** Board streams tried before the page gives up and says so. */
const ATTEMPTS = 4

function errorPage(ctx: StudioGenerateContext, config: StudioConfig, tag: StudioTag, message: string, instruction: string): StudioPageOutput {
  const header = drawHeader(ttContentBox(ctx), config, tag, instruction)
  return {
    pageRole: 'single',
    buildFailed: message,
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
 * One Train Tracks page, and the answer page with the whole line laid.
 *
 * Planned, built, proven, drawn, checked. The trim alone fixes how large the
 * board prints, so the form's help line is what prints. The line's name is
 * dealt against what the book and this seller have already printed; the
 * route is laid fresh from the seller's salt and the page seed and must
 * pass the preflight (one line end to end, every number and printed piece
 * kept, finished by the level's own logic on exactly that line and not by
 * easier steps alone where the level asks for more, large print, on the
 * page, not a repeat) and the drawn check (every number right, every
 * printed piece its piece, the hidden line on exactly the answer's
 * squares). A board that fails anywhere is set aside and another built; if
 * none passes, the page says so plainly instead of printing a board a
 * reader cannot finish.
 */
function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const level = parseTtLevel(config.level)
  const spec = ttLevelSpec(level)
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)
  const instruction = ttInstruction(config, level)
  const ownerSalt = resolveOwnerSalt(ctx)
  const tag: StudioTag = { templateKey: TT_TEMPLATE_KEY, instanceId: ctx.instanceId, pageRole: 'single' }
  const fail = (message: string) => [errorPage(ctx, config, tag, message, instruction)]

  const header = drawHeader(ttContentBox(ctx), config, tag, instruction)
  const panel = ttPanelInBody(header.body, header.objects.length > 0)
  const plan = planTtPage(panel, level, font)
  if (!plan) return fail(ttPageTooSmallMessage(spec))

  const book = parseTtBook(parseTtRemoteData(ctx.remoteData).bookLabels)
  // All but a handful of lines: a seller's next book opens on lines their
  // last one used least lately, and the list never runs dry.
  const recent = studioAvoidList(VARIETY_KEY, TT_LINES.length - 6)
  const line = pickTtLine({ level, seed: ctx.seed, ownerSalt, book, recent })
  const exclude = new Set(book.map((e) => e.signature).filter(Boolean))

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const built = buildTtBoard({ ...spec, rng: ttBoardRng({ level, seed: ctx.seed, ownerSalt, attempt }), exclude })
    if (!built) continue
    exclude.add(built.signature)
    if (!runTtKdpPreflight({ built, plan, level, line, panel, font, book }).ok) continue

    const label = ttPageLabel(line, level, built.signature)
    const draw = () => buildTtPuzzle({ built, plan, line, level, label, tag, font })
    const puzzle = draw()
    if (checkTtDrawnPage({ puzzle, built, line }).length > 0) continue

    rememberStudioContent(VARIETY_KEY, [line.id])
    return [
      {
        pageRole: 'single',
        objects: [...header.objects, puzzle],
        // Drawn afresh for the key, where the puzzle page put it: only the
        // how-to line goes, and the whole line is laid.
        answerSourceObjects: [...drawHeader(ttContentBox(ctx), config, tag, '').objects, draw()],
      },
    ]
  }
  return fail(TT_BUILD_FAILED_MESSAGE)
}

export const trainTracksTemplate: StudioTemplateDefinition = {
  key: TT_TEMPLATE_KEY,
  label: 'Train Tracks: Lay the Line',
  category: 'logic',
  description:
    'The classic Train Tracks puzzle, a scenic ride for retirement: a railway line enters the board on one side and leaves on another, and the numbers above each column and beside each row tell how many squares of track lie there. The reader lays one track between, square to square, straight or turning, never crossing or branching, through every piece already shown. Every board is built fresh, proven to have one answer reached by logic alone, and signed with a retiree’s scenic line, such as Lakeside Line, Maple Valley Railway or Sunset Junction. Three levels, large print, the six track pieces drawn in the legend, and an answer page with the whole line laid.',
  pageCount: 1,
  producesAnswerKey: true,
  defaultPageTitle: TT_DEFAULT_TITLE,
  prefetch: trainTracksPrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g fill="currentColor" font-family="sans-serif" font-size="3.4" font-weight="700" text-anchor="middle">
      <text x="22.5" y="6.4">2</text><text x="27.5" y="6.4">2</text><text x="32.5" y="6.4">4</text><text x="37.5" y="6.4">3</text><text x="42.5" y="6.4">4</text><text x="47.5" y="6.4">3</text>
      <text x="54.5" y="11.7">1</text><text x="54.5" y="16.7">3</text><text x="54.5" y="21.7">1</text><text x="54.5" y="26.7">4</text><text x="54.5" y="31.7">3</text><text x="54.5" y="36.7">6</text>
    </g>
    <g fill="none" stroke="currentColor">
      <path d="M25 8v30M30 8v30M35 8v30M40 8v30M45 8v30M20 13h30M20 18h30M20 23h30M20 28h30M20 33h30" stroke-width="0.3" opacity="0.6"/>
      <rect x="20" y="8" width="30" height="30" stroke-width="1.2"/>
    </g>
    <g fill="none" stroke-linejoin="round">
      <path d="M42.5 8v7.5h-10v10h15v10h-20v-5h-5v7.5" stroke="currentColor" stroke-width="2.4"/>
      <path d="M42.5 8v7.5h-10v10h15v10h-20v-5h-5v7.5" stroke="#fff" stroke-width="1.2"/>
      <path d="M42.5 8v7.5h-10v10h15v10h-20v-5h-5v7.5" stroke="currentColor" stroke-width="2.8" stroke-dasharray="0.5 1.2"/>
    </g>
  </svg>`,
  configSchema: TT_CONFIG_SCHEMA,
  generate,
}
