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
import { GN_CONFIG_SCHEMA } from './config'
import {
  GN_BUILD_FAILED_MESSAGE,
  GN_DEFAULT_TITLE,
  GN_NIGHTS,
  GN_TEMPLATE_KEY,
  gnGridRng,
  gnInstruction,
  gnLevelSpec,
  gnPageLabel,
  gnPageTooSmallMessage,
  parseGnBook,
  parseGnLevel,
  pickGnNight,
} from './content'
import { buildGnPuzzle } from './draw'
import { checkGnDrawnPage, runGnKdpPreflight } from './kdp-preflight'
import { gnContentBox, gnPanelInBody, planGnPage } from './layout'
import { gameNightPrefetch, parseGnRemoteData } from './prefetch'
import { buildGnGrid } from './puzzle'

/** One ledger for the template: a seller's next book opens at other nights. */
const VARIETY_KEY = studioVarietyKey(GN_TEMPLATE_KEY, 'nights')
/** Building streams tried before the page gives up and says so. */
const ATTEMPTS = 4

function errorPage(ctx: StudioGenerateContext, config: StudioConfig, tag: StudioTag, message: string, instruction: string): StudioPageOutput {
  const header = drawHeader(gnContentBox(ctx), config, tag, instruction)
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
 * One Game Night page, and the answer page with every square's number
 * written in.
 *
 * Planned, built, proven, drawn, checked. The trim alone fixes how large the
 * squares print, so the form's help line is what prints. The night's name
 * is dealt against what the book and this seller have already printed; the
 * grid and its boxes are built fresh from the seller's salt and the page
 * seed and must pass the preflight (every rule kept; every box one the level
 * prints; finished by the level's own logic on exactly its one answer and
 * not by easier steps alone where the level asks for more; large print; on
 * the page; not a repeat) and the drawn check (every clue in its corner,
 * the answer's numbers waiting hidden in every square). A grid that fails
 * anywhere is set aside and another built; if none passes, the page says so
 * plainly instead of printing a grid a reader cannot finish.
 */
function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const level = parseGnLevel(config.level)
  const spec = gnLevelSpec(level)
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)
  const instruction = gnInstruction(config, level)
  const ownerSalt = resolveOwnerSalt(ctx)
  const tag: StudioTag = { templateKey: GN_TEMPLATE_KEY, instanceId: ctx.instanceId, pageRole: 'single' }
  const fail = (message: string) => [errorPage(ctx, config, tag, message, instruction)]

  const header = drawHeader(gnContentBox(ctx), config, tag, instruction)
  const panel = gnPanelInBody(header.body, header.objects.length > 0)
  const plan = planGnPage(panel, level, font)
  if (!plan) return fail(gnPageTooSmallMessage(spec))

  const book = parseGnBook(parseGnRemoteData(ctx.remoteData).bookLabels)
  // All but a handful of nights: a seller's next book opens at nights their
  // last one used least lately, and the list never runs dry.
  const recent = studioAvoidList(VARIETY_KEY, GN_NIGHTS.length - 6)
  const night = pickGnNight({ level, seed: ctx.seed, ownerSalt, book, recent })
  const exclude = new Set(book.map((e) => e.signature).filter(Boolean))

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const built = buildGnGrid({ ...spec, rng: gnGridRng({ level, seed: ctx.seed, ownerSalt, attempt }), exclude })
    if (!built) continue
    exclude.add(built.signature)
    if (!runGnKdpPreflight({ built, plan, level, night, panel, font, book }).ok) continue

    const label = gnPageLabel(night, level, built.signature)
    const draw = () => buildGnPuzzle({ built, plan, night, level, label, tag, font })
    const puzzle = draw()
    if (checkGnDrawnPage({ puzzle, built, night, level }).length > 0) continue

    rememberStudioContent(VARIETY_KEY, [night.id])
    return [
      {
        pageRole: 'single',
        objects: [...header.objects, puzzle],
        // Drawn afresh for the key, where the puzzle page put it: only the
        // how-to line goes, and every square's number is written in.
        answerSourceObjects: [...drawHeader(gnContentBox(ctx), config, tag, '').objects, draw()],
      },
    ]
  }
  return fail(GN_BUILD_FAILED_MESSAGE)
}

export const gameNightTemplate: StudioTemplateDefinition = {
  key: GN_TEMPLATE_KEY,
  label: 'Game Night: Tally the Scores',
  category: 'logic',
  description:
    'The math-cage number grid puzzle fans can’t put down (known in puzzle books as Calcudoku), set at a retiree’s card table: write 1 to N once in every row and column so the numbers in each bold box make its target with its sign (add, take away, multiply or divide). Every grid is built fresh, proven to have one answer reached by logic alone, and named for a game night worth looking forward to, such as Tuesday Canasta Club, Cribbage on the Porch or Mahjong by the Lake. Three levels from a 5 × 5 of sums to a 7 × 7 with all four signs, a worked legend under every grid, and an answer page with every number written in.',
  pageCount: 1,
  producesAnswerKey: true,
  defaultPageTitle: GN_DEFAULT_TITLE,
  prefetch: gameNightPrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <path d="M21.5 2.5V37.5M28.5 2.5V37.5M35.5 2.5V37.5M42.5 2.5V37.5M14.5 9.5H49.5M14.5 16.5H49.5M14.5 23.5H49.5M14.5 30.5H49.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.45"/>
    <path d="M21.5 9.5V37.5M28.5 2.5V9.5M28.5 16.5V30.5M35.5 2.5V23.5M35.5 30.5V37.5M42.5 9.5V30.5M14.5 9.5H28.5M35.5 9.5H42.5M21.5 16.5H35.5M42.5 16.5H49.5M14.5 23.5H21.5M35.5 23.5H42.5M21.5 30.5H49.5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="square"/>
    <rect x="14.5" y="2.5" width="35" height="35" fill="none" stroke="currentColor" stroke-width="1.4"/>
    <g fill="currentColor" font-family="sans-serif" font-size="3.3" font-weight="700">
      <text x="15.6" y="6.2">5+</text><text x="29.6" y="6.2">12×</text><text x="36.6" y="6.2">8+</text>
      <text x="15.6" y="13.2">2÷</text><text x="36.6" y="13.2">1−</text>
      <text x="22.6" y="20.2">6×</text><text x="29.6" y="20.2">9+</text><text x="43.6" y="20.2">3−</text>
      <text x="15.6" y="27.2">4+</text>
      <text x="22.6" y="34.2">2−</text><text x="36.6" y="34.2">20×</text>
    </g>
  </svg>`,
  configSchema: GN_CONFIG_SCHEMA,
  generate,
}
