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
import { SM_CONFIG_SCHEMA } from './config'
import {
  SM_BUILD_FAILED_MESSAGE,
  SM_DAYS,
  SM_DEFAULT_TITLE,
  SM_TEMPLATE_KEY,
  parseSmBook,
  parseSmLevel,
  pickSmDay,
  smGridRng,
  smInstruction,
  smLevelSpec,
  smPageLabel,
  smPageTooSmallMessage,
} from './content'
import { buildSmPuzzle } from './draw'
import { checkSmDrawnPage, runSmKdpPreflight } from './kdp-preflight'
import { planSmPage, smContentBox, smPanelInBody } from './layout'
import { parseSmRemoteData, sunAndMoonPrefetch } from './prefetch'
import { buildSmGrid } from './puzzle'

/** One ledger for the template: a seller's next book opens at other days. */
const VARIETY_KEY = studioVarietyKey(SM_TEMPLATE_KEY, 'days')
/** Building streams tried before the page gives up and says so. */
const ATTEMPTS = 4

function errorPage(ctx: StudioGenerateContext, config: StudioConfig, tag: StudioTag, message: string, instruction: string): StudioPageOutput {
  const header = drawHeader(smContentBox(ctx), config, tag, instruction)
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
 * One Sun & Moon page, and the answer page with a sun or a moon in every
 * square.
 *
 * Planned, built, proven, drawn, checked. The trim alone fixes how large the
 * squares print, so the form's help line is what prints. The day's name is
 * dealt against what the book and this seller have already printed; the
 * grid, its printed squares and its signs are built fresh from the seller's
 * salt and the page seed and must pass the preflight (every rule kept;
 * finished by the level's own logic on exactly its one answer and not by
 * easier steps alone where the level asks for more; the level's share of
 * clues, both kinds; large print with every sun and moon clear of the
 * signs; on the page; not a repeat) and the drawn check (every printed
 * square tinted and showing, every sign on its own line, every answer
 * waiting hidden in its own square). A grid that fails anywhere is set
 * aside and another built; if none passes, the page says so plainly instead
 * of printing a grid a reader cannot finish.
 */
function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const level = parseSmLevel(config.level)
  const spec = smLevelSpec(level)
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)
  const instruction = smInstruction(config, level)
  const ownerSalt = resolveOwnerSalt(ctx)
  const tag: StudioTag = { templateKey: SM_TEMPLATE_KEY, instanceId: ctx.instanceId, pageRole: 'single' }
  const fail = (message: string) => [errorPage(ctx, config, tag, message, instruction)]

  const header = drawHeader(smContentBox(ctx), config, tag, instruction)
  const panel = smPanelInBody(header.body, header.objects.length > 0)
  const plan = planSmPage(panel, level, font)
  if (!plan) return fail(smPageTooSmallMessage(spec))

  const book = parseSmBook(parseSmRemoteData(ctx.remoteData).bookLabels)
  // All but a handful of days: a seller's next book opens at days their
  // last one used least lately, and the list never runs dry.
  const recent = studioAvoidList(VARIETY_KEY, SM_DAYS.length - 6)
  const day = pickSmDay({ level, seed: ctx.seed, ownerSalt, book, recent })
  const exclude = new Set(book.map((e) => e.signature).filter(Boolean))

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const built = buildSmGrid({ ...spec, rng: smGridRng({ level, seed: ctx.seed, ownerSalt, attempt }), exclude })
    if (!built) continue
    exclude.add(built.signature)
    if (!runSmKdpPreflight({ built, plan, level, day, panel, font, book }).ok) continue

    const label = smPageLabel(day, level, built.signature)
    const draw = () => buildSmPuzzle({ built, plan, day, level, label, tag, font })
    const puzzle = draw()
    if (checkSmDrawnPage({ puzzle, built, day }).length > 0) continue

    rememberStudioContent(VARIETY_KEY, [day.id])
    return [
      {
        pageRole: 'single',
        objects: [...header.objects, puzzle],
        // Drawn afresh for the key, where the puzzle page put it: only the
        // how-to line goes, and every square gets its sun or moon.
        answerSourceObjects: [...drawHeader(smContentBox(ctx), config, tag, '').objects, draw()],
      },
    ]
  }
  return fail(SM_BUILD_FAILED_MESSAGE)
}

export const sunAndMoonTemplate: StudioTemplateDefinition = {
  key: SM_TEMPLATE_KEY,
  label: 'Sun & Moon: Balance the Days',
  category: 'logic',
  description:
    'The sun-and-moon grid everyone is playing on their phone (known in puzzle books as Takuzu, the binary puzzle), printed large for retirement: every row and column holds as many suns as moons, never three alike side by side, and the little = and × signs on the lines say which neighbours match. Every grid is built fresh, proven to have one answer reached by logic alone, and named for a day worth balancing, such as Sunrise at the Lake, the Harvest Moon Hayride or the Grandkids’ Sleepover. Three levels from the famous 6 × 6 to a 10 × 10, and an answer page with every sun and moon in place.',
  pageCount: 1,
  producesAnswerKey: true,
  defaultPageTitle: SM_DEFAULT_TITLE,
  prefetch: sunAndMoonPrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g fill="currentColor" opacity="0.18">
      <rect x="16" y="4" width="8" height="8"/>
      <rect x="40" y="20" width="8" height="8"/>
      <rect x="24" y="28" width="8" height="8"/>
    </g>
    <path d="M24 4V36M32 4V36M40 4V36M16 12H48M16 20H48M16 28H48" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.45"/>
    <rect x="16" y="4" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.4"/>
    <g stroke="currentColor" stroke-width="0.6" fill="#fff">
      <circle cx="20" cy="8" r="1.9"/>
      <circle cx="36" cy="16" r="1.9"/>
      <circle cx="28" cy="32" r="1.9"/>
      <circle cx="44" cy="32" r="1.9"/>
    </g>
    <g stroke="currentColor" stroke-width="0.7" stroke-linecap="round">
      <path d="M20 4.9V5.6M20 10.4V11.1M16.9 8H17.6M22.4 8H23.1"/>
      <path d="M36 12.9V13.6M36 18.4V19.1M32.9 16H33.6M38.4 16H39.1"/>
      <path d="M28 28.9V29.6M28 34.4V35.1M24.9 32H25.6M30.4 32H31.1"/>
      <path d="M44 28.9V29.6M44 34.4V35.1M40.9 32H41.6M46.4 32H47.1"/>
    </g>
    <g fill="currentColor">
      <path d="M30.56 8.85A2.7 2.7 0 1 1 27.61 5.33A2.3 2.3 0 1 0 30.56 8.85Z"/>
      <path d="M46.56 24.85A2.7 2.7 0 1 1 43.61 21.33A2.3 2.3 0 1 0 46.56 24.85Z"/>
      <path d="M22.56 32.85A2.7 2.7 0 1 1 19.61 29.33A2.3 2.3 0 1 0 22.56 32.85Z"/>
      <path d="M22.56 16.85A2.7 2.7 0 1 1 19.61 13.33A2.3 2.3 0 1 0 22.56 16.85Z"/>
    </g>
    <g fill="#fff"><circle cx="40" cy="8" r="1.7"/><circle cx="32" cy="24" r="1.7"/></g>
    <g stroke="currentColor" stroke-width="0.6">
      <path d="M38.9 7.4H41.1M38.9 8.6H41.1"/>
      <path d="M31.1 23.1L32.9 24.9M32.9 23.1L31.1 24.9"/>
    </g>
  </svg>`,
  configSchema: SM_CONFIG_SCHEMA,
  generate,
}
